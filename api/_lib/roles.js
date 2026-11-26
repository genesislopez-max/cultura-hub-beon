// Resuelve el acceso del usuario logueado a partir de su email — sale
// directo del campo "Acceso" en Personas (Single Select). Se llama una sola
// vez, en el login (ver api/session.js), y el resultado queda embebido en
// el token de sesión firmado (api/_lib/session.js) — así el resto de los
// pedidos no necesita volver a consultar Airtable.
//
// Niveles válidos en "Acceso" (de mayor a menor acceso):
// - "Full"     : ve todo, sin restricciones.
// - "HR"       : Inicio + Ingresos/Egresos + Beneficios, pero solo del
//                grupo Core Team (sin Glassdoor, sin Beneficios Engineers).
// - "TEM"      : Inicio + Beneficios (Engineers y Core Team, sin
//                Ingresos/Egresos ni Glassdoor).
// - "Manager"  : mismo acceso que "TEM".
// - "Equipo"   : Inicio + Beneficios de su propio grupo únicamente (según
//                su "Rol en empresa" — un Engineer ve Engineers, un Core
//                Team ve Core Team).
// - "No access": no entra al Hub — ni siquiera Inicio. Ve una pantalla
//                bloqueada en vez del contenido (ver js/auth.js).
// Si el campo está vacío o tiene un valor que no reconocemos, cae a
// "Equipo" (el nivel más restrictivo entre los que SÍ dan acceso) hasta
// que se cargue bien — fail closed, no fail open.
//
// Antes esto se armaba cruzando "Rol en empresa" + "Área", lo que resultó
// frágil (data cargada a mano en campos pensados para otra cosa). Con
// "Acceso" como campo dedicado, todo sale de un solo lugar.
//
// Comparación case-insensitive (y sin espacios de más) — un Single Select
// tipeado a mano puede tener "full"/"Full "/etc.
function normalizarValor(valor){
  return String(valor||'').replace(/\s+/g,' ').trim().toLowerCase();
}

// Seguro aparte, independiente de Airtable: gente que tiene que tener
// acceso total pase lo que pase con el campo Acceso (evita que un dato mal
// cargado o directamente vacío la deje afuera).
const EMAILS_ACCESO_FULL=new Set(['valentina.vellon@beon.tech','victoria.franco@beon.tech']);

// Valor de Airtable (normalizado) → código interno de rol. "No access" se
// mapea a "bloqueado" (nombre interno más claro que repetir el string con
// espacio en todas las comparaciones del resto del código).
const NIVELES_ACCESO=new Map([
  ['full','full'],
  ['hr','hr'],
  ['tem','tem'],
  ['manager','manager'],
  ['equipo','equipo'],
  ['no access','bloqueado'],
]);

// Mismo criterio que getRolGroup() en js/utils.js (cliente) — no se
// reimporta porque este archivo corre en Node (CommonJS), no en el browser.
const ROLES_GRUPO_CORE_TEAM=new Set(['core team','supervisor','tem','lead','manager','coo','founder']);
function grupoDeRolEmpresa(rolEmpresa){
  return ROLES_GRUPO_CORE_TEAM.has(normalizarValor(rolEmpresa))?'Core Team':'Engineers';
}

// Fetch directo a Airtable (no por api/airtable.js) — mismo patrón que ya usa
// api/cron-ingresos.js para llamadas server-side que no vienen de un pedido
// del proxy.
async function buscarPersonaPorEmail(email,fetchImpl){
  const doFetch=fetchImpl||fetch;
  const token=process.env.AIRTABLE_TOKEN;
  const base=process.env.AIRTABLE_BASE;
  if(!token||!base||!email) return null;
  const formula=encodeURIComponent(`LOWER({Mail})="${String(email).toLowerCase().replace(/"/g,'\\"')}"`);
  const url=`https://api.airtable.com/v0/${base}/Personas?filterByFormula=${formula}`;
  try{
    const r=await doFetch(url,{headers:{'Authorization':`Bearer ${token}`}});
    if(!r.ok) return null;
    const data=await r.json();
    return data.records?.[0]||null;
  }catch(e){
    return null;
  }
}

// Devuelve {rol, grupoBeneficios}. grupoBeneficios es el único grupo de
// Beneficios que puede ver ese rol ('Engineers'|'Core Team'), o null si ve
// ambos grupos sin restricción (solo full y manager).
async function resolverAccesoPorEmail(email,fetchImpl){
  if(EMAILS_ACCESO_FULL.has(String(email||'').toLowerCase())) return {rol:'full',grupoBeneficios:null};

  const persona=await buscarPersonaPorEmail(email,fetchImpl);
  const accesoNormalizado=normalizarValor(persona?.fields?.['Acceso']);
  // Sin un nivel explícito y reconocido, no entra. El Hub es interno: lo usan
  // unas pocas personas, no todo BEON, así que el acceso se concede, no se
  // asume.
  //
  // El default anterior era "equipo", y eso dejaba entrar por omisión: a quien
  // tuviera el campo Acceso vacío, a quien lo tuviera con un typo ("Sin
  // acceso" en vez de "No access"), a quien todavía no estuviera cargado en
  // Personas, y a cualquiera si Airtable fallaba justo en el login. Peor aún,
  // "equipo" veía MÁS secciones que un TEM, así que el rol que se recibía por
  // no estar configurado era más amplio que uno configurado a propósito.
  //
  // Esto no puede dejar afuera a People Ops: EMAILS_ACCESO_FULL se resuelve
  // más arriba, antes de tocar Airtable.
  const rol=NIVELES_ACCESO.get(accesoNormalizado)||'bloqueado';

  const rolEmpresa=persona?.fields?.['Rol en empresa']||'';
  // El TEM acompaña a los devs, así que ve los beneficios de Engineers y no
  // los de Core Team — que incluye a Manager, Lead, Supervisor, COO y Founder,
  // porque todos esos roles caen en ese grupo (ver grupoDeRolEmpresa). Es el
  // mismo mecanismo que acota a HR al lado opuesto, y corre en el servidor:
  // con el filtro solo en el cliente, los registros llegarían igual al
  // navegador y se verían desde la consola.
  const grupoBeneficios=
    rol==='hr'?'Core Team':
    rol==='tem'?'Engineers':
    rol==='equipo'?grupoDeRolEmpresa(rolEmpresa):
    null;

  return {rol,grupoBeneficios};
}

module.exports={resolverAccesoPorEmail,buscarPersonaPorEmail,grupoDeRolEmpresa};
