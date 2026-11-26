// Proxy hacia Airtable: valida la sesión del navegador y recién ahí reenvía
// el pedido a Airtable usando el token que vive solo acá (variables de
// entorno de Vercel) — el token nunca se manda al cliente.
//
// La sesión que llega acá es el token propio que emite api/session.js (no el
// ID token de Google directamente) — ver api/_lib/session.js para el porqué.
//
// La tabla/registro de Airtable viaja como query param ?path=... en vez de
// como parte de la URL (ej. antes /api/airtable/Tabla/recXXX, con una función
// catch-all anidada) porque ese ruteo dinámico no terminó de resolver bien en
// este proyecto — Vercel devolvía 404 propio (sin llegar a ejecutar la
// función) para cualquier pedido con más de un segmento de path. Con un
// endpoint fijo + query param no depende de esa resolución de rutas.
const {verifySession}=require('./_lib/session');
const {grupoDeRolEmpresa}=require('./_lib/roles');

// Control de acceso por rol — ver api/_lib/roles.js para cómo se resuelven
// "rol"/"grupoBeneficios" (una sola vez, en el login, embebidos en el token
// de sesión).
//
// - Ingresos/Egresos (tabla Checklist): exclusivo de full/hr.
// - Glassdoor (registros de Tipo "Glassdoor" en Eventos): exclusivo de full.
// - Beneficios/Presupuesto Loyalty/Beneficios Asignados: si el rol tiene
//   grupoBeneficios seteado (hr → fijo "Core Team"; tem → fijo "Engineers";
//   equipo → su propio grupo), solo ve los registros de ese grupo (o
//   "Ambos"/sin grupo). Full y manager no tienen grupoBeneficios — ven los
//   dos grupos.
const TABLAS_INGRESOS_EGRESOS=new Set(['Checklist']);
const ROLES_VEN_INGRESOS_EGRESOS=new Set(['full','hr']);
const TABLAS_GRUPO_BENEFICIOS=new Set(['Beneficios','Presupuesto Loyalty','Beneficios Asignados']);

// Tablas cuyo registro habla de UNA persona, con el nombre del campo que la
// identifica. Para un rol acotado a un grupo, el registro de alguien del otro
// grupo no tiene por qué llegarle: son las secciones del menú "Beneficios"
// (Ambassador Week, Off Sites, Get Together, Asistencia a Actividades).
//
// Se filtra por GRUPO y no bloqueando la tabla entera, porque la card de
// beneficios de cada persona lee estas mismas tablas para mostrar sus viajes
// y sus Get Togethers: bloquearlas rompería la pantalla que el rol sí tiene.
const TABLAS_GRUPO_PERSONA={
  'Ambassador Week':'Persona',
  'Off Sites':'Persona',
  'Get Together':'BEONer',
  'Asistencia a Actividades':'Persona',
};

// Grupo fijo por rol, para los roles cuya restricción NO depende de quién es
// la persona sino de su nivel de acceso. El token ya trae grupoBeneficios
// resuelto en el login, pero una sesión firmada ANTES de que el rol quedara
// restringido lo trae en null, y el proxy le creería: la restricción no
// empezaría a valer hasta que esa persona volviera a loguearse. Derivarlo
// también del rol cierra esa ventana sin obligar a nadie a cerrar sesión.
const GRUPO_BENEFICIOS_POR_ROL={hr:'Core Team',tem:'Engineers'};

// Roles a los que SÍ se les filtran las tablas de personas (ver
// TABLAS_GRUPO_PERSONA más abajo). Es un mapa aparte y no el de arriba a
// propósito: una cosa es qué beneficios se le cubren a cada grupo, y otra
// distinta es a quién se le esconde la vida en común de la empresa.
const GRUPO_PERSONA_POR_ROL={tem:'Engineers'};
function grupoBeneficiosEfectivo(rol,grupoDelToken){
  return GRUPO_BENEFICIOS_POR_ROL[rol]||grupoDelToken||null;
}

// ─── Solo lectura para los equipos ────────────────────────────────────────────
// Hasta acá el rol definía qué se VE, pero casi no qué se puede CAMBIAR: el rol
// "equipo" podía crear personas, beneficios, asignaciones, proyectos y tareas.
// Con varios equipos editando, los cambios se vuelven intrackeables, así que la
// escritura queda para People Ops (full) y HR.
const ROLES_PUEDEN_ESCRIBIR=new Set(['full','hr']);
// Excepción: el feedback de la plataforma lo tiene que poder mandar cualquiera
// — es el canal para avisar justamente que algo no se puede hacer.
const TABLAS_ESCRIBE_CUALQUIERA=new Set(['Feedback - Plataforma']);
const METODOS_LECTURA=new Set(['GET','HEAD','OPTIONS']);

function pasaFiltroGrupo(grupoRecord,grupoPermitido){
  return !grupoRecord||grupoRecord===grupoPermitido||grupoRecord==='Ambos';
}

// Beneficios Asignados no tiene su propio campo Grupo — se resuelve por el
// Beneficio vinculado (linked record → id → Beneficios.Grupo). Fetch directo
// y aparte (tabla chica), solo cuando hace falta filtrar por grupo. Devuelve
// null si Airtable no respondió — el caller falla cerrado en ese caso (no
// dejar pasar registros que no se pudieron verificar).
async function fetchGrupoPorBeneficioId(token,base){
  try{
    const r=await fetch(`https://api.airtable.com/v0/${base}/Beneficios`,{headers:{'Authorization':`Bearer ${token}`}});
    if(!r.ok) return null;
    const data=await r.json();
    const mapa={};
    (data.records||[]).forEach(rec=>{ mapa[rec.id]=rec.fields?.Grupo||''; });
    return mapa;
  }catch(e){
    return null;
  }
}

// Nombre normalizado → grupo, a partir de Personas. Mismo criterio de
// normalización que el cliente (acentos, mayúsculas y espacios de más), porque
// estos registros guardan el nombre escrito a mano y "Jesús" y "Jesus" son la
// misma persona.
async function fetchGrupoPorPersona(token,base){
  try{
    const r=await fetch(`https://api.airtable.com/v0/${base}/Personas`,{headers:{'Authorization':`Bearer ${token}`}});
    if(!r.ok) return null;
    const data=await r.json();
    const mapa={};
    (data.records||[]).forEach(rec=>{
      const nombre=normalizarNombrePersona(rec.fields?.Nombre);
      if(nombre) mapa[nombre]=grupoDeRolEmpresa(rec.fields?.['Rol en empresa']||'');
    });
    return mapa;
  }catch(e){
    return null;
  }
}

function normalizarNombrePersona(valor){
  const v=Array.isArray(valor)?valor[0]:valor;
  return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ').trim().toLowerCase();
}

// Deja solo los registros de gente del grupo permitido. Un nombre que no
// matchea con nadie de Personas NO pasa: no se puede afirmar de qué grupo es,
// y en una restricción de acceso la duda se resuelve del lado seguro.
async function filtrarPorGrupoDePersona(tabla,campo,grupoPermitido,data,token,base){
  const mapa=await fetchGrupoPorPersona(token,base);
  if(!mapa){
    data.records=[]; // fail closed — no se pudo resolver el grupo de nadie
    return data;
  }
  data.records=(data.records||[]).filter(r=>{
    const nombre=normalizarNombrePersona(r.fields?.[campo]);
    return !!nombre&&mapa[nombre]===grupoPermitido;
  });
  return data;
}

async function filtrarPorGrupoBeneficios(tabla,grupoPermitido,data,token,base){
  if(tabla==='Beneficios'||tabla==='Presupuesto Loyalty'){
    data.records=(data.records||[]).filter(r=>pasaFiltroGrupo(r.fields?.Grupo,grupoPermitido));
    return data;
  }
  // tabla==='Beneficios Asignados'
  const mapa=await fetchGrupoPorBeneficioId(token,base);
  if(!mapa){
    data.records=[]; // fail closed — no se pudo resolver el grupo de nadie
    return data;
  }
  data.records=(data.records||[]).filter(r=>{
    const ids=Array.isArray(r.fields?.Beneficio)?r.fields.Beneficio:(r.fields?.Beneficio?[r.fields.Beneficio]:[]);
    if(!ids.length) return true; // sin beneficio vinculado, nada que filtrar
    return ids.some(id=>pasaFiltroGrupo(mapa[id],grupoPermitido));
  });
  return data;
}

function filtrarGlassdoor(data){
  data.records=(data.records||[]).filter(r=>r.fields?.Tipo!=='Glassdoor');
  return data;
}

module.exports=async(req,res)=>{
  const idToken=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const verificado=verifySession(idToken);
  if(!verificado.ok){
    res.status(401).json({error:{message:verificado.error}});
    return;
  }
  // Un token sin rol se trata como el nivel más restrictivo hasta que esa
  // persona vuelva a loguearse. Decía eso mismo pero caía en "equipo", que no
  // es el más restrictivo sino uno que ve 13 de las 17 secciones.
  const rol=verificado.rol||'bloqueado';
  const grupoBeneficios=grupoBeneficiosEfectivo(rol,verificado.grupoBeneficios);

  // "No access" (Acceso="No access" en Personas): bloqueo total, para
  // cualquier tabla — cinturón de seguridad además del bloqueo del lado del
  // cliente (ver js/auth.js), por si alguien llega a este endpoint sin pasar
  // por la pantalla bloqueada.
  if(rol==='bloqueado'){
    if(req.method==='GET') res.status(200).json({records:[]});
    else res.status(403).json({error:{message:'No autorizado.'}});
    return;
  }

  const token=process.env.AIRTABLE_TOKEN;
  const base=process.env.AIRTABLE_BASE;
  if(!token||!base){
    res.status(500).json({error:{message:'El servidor no tiene configurado Airtable (faltan variables de entorno).'}});
    return;
  }

  const {path,...resto}=req.query;
  if(!path){
    res.status(400).json({error:{message:'Falta indicar la tabla de Airtable.'}});
    return;
  }

  const tabla=String(path).split('/')[0];

  // Solo lectura para los roles que no escriben. Va antes de cualquier otro
  // chequeo de tabla porque es transversal: aplica a toda la base, no a una
  // tabla puntual. Se responde 403 con un mensaje explicativo (no el "No
  // autorizado." genérico) para que quien lo reciba entienda que es por rol y
  // no un error de configuración.
  if(!METODOS_LECTURA.has(req.method)&&!ROLES_PUEDEN_ESCRIBIR.has(rol)&&!TABLAS_ESCRIBE_CUALQUIERA.has(tabla)){
    // origen:'hub' marca que el error lo generamos nosotros y no Airtable, para
    // que el cliente lo muestre tal cual (ver atRequest en js/api.js).
    res.status(403).json({error:{origen:'hub',message:'Tu usuario es de solo lectura. Escribile a People Ops para que carguen el cambio.'}});
    return;
  }

  if(TABLAS_INGRESOS_EGRESOS.has(tabla)&&!ROLES_VEN_INGRESOS_EGRESOS.has(rol)){
    if(req.method==='GET'){
      // Degradación silenciosa — sin esto, un Promise.all() en el cliente
      // que pide esta tabla junto con otras rompería la carga entera.
      res.status(200).json({records:[]});
    } else {
      // Escritura a una tabla restringida: la UI ya no debería exponer estos
      // flujos para este rol — esto es un cinturón de seguridad, no el
      // camino esperado.
      res.status(403).json({error:{message:'No autorizado.'}});
    }
    return;
  }

  const qs=new URLSearchParams();
  for(const [key,val] of Object.entries(resto)){
    if(Array.isArray(val)) val.forEach(v=>qs.append(key,v));
    else qs.append(key,val);
  }
  const qsStr=qs.toString();
  const airtableUrl=`https://api.airtable.com/v0/${base}/${path}${qsStr?`?${qsStr}`:''}`;

  let airtableRes;
  try{
    airtableRes=await fetch(airtableUrl,{
      method:req.method,
      headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
      body:(req.method!=='GET'&&req.method!=='DELETE')?JSON.stringify(req.body):undefined,
    });
  }catch(e){
    res.status(502).json({error:{message:'No se pudo conectar con Airtable.'}});
    return;
  }

  const text=await airtableRes.text();

  if(req.method==='GET'&&airtableRes.ok){
    let data=null;
    try{ data=JSON.parse(text); }catch(e){ data=null; }
    if(data){
      if(tabla==='Eventos'&&rol!=='full'){
        res.status(airtableRes.status).json(filtrarGlassdoor(data));
        return;
      }
      if(grupoBeneficios&&TABLAS_GRUPO_BENEFICIOS.has(tabla)){
        const filtrado=await filtrarPorGrupoBeneficios(tabla,grupoBeneficios,data,token,base);
        res.status(airtableRes.status).json(filtrado);
        return;
      }
      // Ojo con el alcance: esto NO va por grupoBeneficios, que lo tienen
      // también "equipo" y "hr".
      //
      // - "equipo": ahí el grupo sale de la ficha de la persona y sirve para
      //   acotar BENEFICIOS, no para partir la vida en común. Off Sites y Get
      //   Together son de toda la empresa: a alguien de Engineers no se le
      //   esconden los viajes de Core Team.
      // - "hr": sigue viendo todo en Asistencia a Actividades, que es la única
      //   de estas cuatro secciones que tiene en el menú.
      //
      // Queda solo el TEM, cuya restricción sí es de acceso: acompaña a los
      // devs y no ve lo de Core Team.
      const grupoFijoDelRol=GRUPO_PERSONA_POR_ROL[rol];
      if(grupoFijoDelRol&&TABLAS_GRUPO_PERSONA[tabla]){
        const filtrado=await filtrarPorGrupoDePersona(
          tabla,TABLAS_GRUPO_PERSONA[tabla],grupoFijoDelRol,data,token,base);
        res.status(airtableRes.status).json(filtrado);
        return;
      }
    }
  }

  res.status(airtableRes.status);
  res.setHeader('Content-Type','application/json');
  res.send(text);
};

module.exports.grupoBeneficiosEfectivo=grupoBeneficiosEfectivo;
module.exports.normalizarNombrePersona=normalizarNombrePersona;
