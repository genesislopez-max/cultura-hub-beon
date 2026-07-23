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

// Control de acceso por rol — ver api/_lib/roles.js para cómo se resuelve
// "rol" (una sola vez, en el login, embebido en el token de sesión).
// Ingresos/Egresos (tabla Checklist) y Glassdoor (registros de Tipo
// "Glassdoor" en Eventos) son exclusivos de People/HR; los montos/
// presupuesto de Beneficios (Presupuesto Loyalty, y los campos
// Valor/Monto en Beneficios/Beneficios Asignados) son exclusivos de
// People/HR y TEM/Manager — el resto del equipo no los ve.
const TABLAS_SOLO_HR=new Set(['Checklist']);
const TABLAS_MONTO_SOLO_HR_TEM=new Set(['Presupuesto Loyalty']);
const TABLAS_REDACTABLES=new Set(['Eventos','Beneficios','Beneficios Asignados']);

function estaBloqueadaDelTodo(tabla,rol){
  return (TABLAS_SOLO_HR.has(tabla)&&rol!=='hr')||(TABLAS_MONTO_SOLO_HR_TEM.has(tabla)&&rol==='equipo');
}

// Filtra/redacta la respuesta de Airtable ya obtenida — solo aplica en GET,
// para no romper Promise.all()s del cliente que asumen que estas lecturas
// siempre resuelven (ej. loadBeneficios() en js/beneficios.js pide Beneficios
// + Beneficios Asignados + Presupuesto Loyalty juntos).
function redactarSegunRol(tabla,rol,data){
  if(rol==='hr') return data;
  if(tabla==='Eventos'){
    data.records=(data.records||[]).filter(r=>r.fields?.Tipo!=='Glassdoor');
  } else if(rol==='equipo'&&tabla==='Beneficios'){
    data.records=(data.records||[]).map(r=>{
      const fields={...r.fields};
      delete fields.Valor;
      return {...r,fields};
    });
  } else if(rol==='equipo'&&tabla==='Beneficios Asignados'){
    data.records=(data.records||[]).map(r=>{
      const fields={...r.fields};
      delete fields.Monto;
      return {...r,fields};
    });
  }
  return data;
}

module.exports=async(req,res)=>{
  const idToken=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const verificado=verifySession(idToken);
  if(!verificado.ok){
    res.status(401).json({error:{message:verificado.error}});
    return;
  }
  // Sesiones firmadas antes de este cambio no tienen rol — se tratan como el
  // nivel más restrictivo hasta que esa persona vuelva a loguearse.
  const rol=verificado.rol||'equipo';

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
  if(estaBloqueadaDelTodo(tabla,rol)){
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

  if(req.method==='GET'&&airtableRes.ok&&rol!=='hr'&&TABLAS_REDACTABLES.has(tabla)){
    let data;
    try{ data=JSON.parse(text); }catch(e){ data=null; }
    if(data){
      res.status(airtableRes.status).json(redactarSegunRol(tabla,rol,data));
      return;
    }
  }

  res.status(airtableRes.status);
  res.setHeader('Content-Type','application/json');
  res.send(text);
};
