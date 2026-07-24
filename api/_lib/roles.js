// Resuelve el acceso del usuario logueado a partir de su email — todo sale
// del campo "Rol en empresa" en Personas (no hace falta ninguna lista de
// emails aparte). Se llama una sola vez, en el login (ver api/session.js), y
// el resultado queda embebido en el token de sesión firmado
// (api/_lib/session.js) — así el resto de los pedidos no necesita volver a
// consultar Airtable.
//
// Niveles (de mayor a menor acceso):
// - "full"  : People, COO, Founder — ven todo, sin restricciones.
// - "hr"    : Recruiting — Inicio + Ingresos/Egresos + Beneficios, pero solo
//             del grupo Core Team (sin Glassdoor, sin Beneficios Engineers).
// - "tem"   : TEM — Inicio + Beneficios (Engineers y Core Team, sin
//             Ingresos/Egresos ni Glassdoor).
// - "manager": Manager, Lead, Supervisor — mismo acceso que "tem".
// - "equipo": cualquier otro rol (Engineer, Core Team, Otro, etc.) — Inicio +
//             Beneficios de su propio grupo únicamente (un Engineer ve
//             Engineers, un Core Team ve Core Team).
const ROLES_ACCESO_FULL=new Set(['People','COO','Founder']);
const ROLES_ACCESO_HR=new Set(['Recruiting']);
const ROLES_ACCESO_TEM=new Set(['TEM']);
const ROLES_ACCESO_MANAGER=new Set(['Manager','Lead','Supervisor']);

// Mismo criterio que getRolGroup() en js/utils.js (cliente) — no se
// reimporta porque este archivo corre en Node (CommonJS), no en el browser.
const ROLES_GRUPO_CORE_TEAM=new Set(['Core Team','Supervisor','TEM','Lead','Manager','COO','Founder']);
function grupoDeRolEmpresa(rolEmpresa){
  return ROLES_GRUPO_CORE_TEAM.has(rolEmpresa)?'Core Team':'Engineers';
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
// ambos grupos sin restricción (full/tem/manager).
async function resolverAccesoPorEmail(email,fetchImpl){
  const persona=await buscarPersonaPorEmail(email,fetchImpl);
  const rolEmpresa=(persona?.fields?.['Rol en empresa']||'').trim();

  let rol;
  if(ROLES_ACCESO_FULL.has(rolEmpresa)) rol='full';
  else if(ROLES_ACCESO_HR.has(rolEmpresa)) rol='hr';
  else if(ROLES_ACCESO_TEM.has(rolEmpresa)) rol='tem';
  else if(ROLES_ACCESO_MANAGER.has(rolEmpresa)) rol='manager';
  else rol='equipo';

  const grupoBeneficios=
    rol==='hr'?'Core Team':
    rol==='equipo'?grupoDeRolEmpresa(rolEmpresa):
    null;

  return {rol,grupoBeneficios};
}

module.exports={resolverAccesoPorEmail,buscarPersonaPorEmail,grupoDeRolEmpresa};
