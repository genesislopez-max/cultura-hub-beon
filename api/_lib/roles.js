// Resuelve el acceso del usuario logueado a partir de su email — sale
// directo del campo "Acceso" en Personas (Single Select). Se llama una sola
// vez, en el login (ver api/session.js), y el resultado queda embebido en
// el token de sesión firmado (api/_lib/session.js) — así el resto de los
// pedidos no necesita volver a consultar Airtable.
//
// Niveles válidos en "Acceso" (de mayor a menor acceso):
// - "Full"   : ve todo, sin restricciones.
// - "HR"     : Inicio + Ingresos/Egresos + Beneficios, pero solo del grupo
//              Core Team (sin Glassdoor, sin Beneficios Engineers).
// - "TEM"    : Inicio + Beneficios (Engineers y Core Team, sin
//              Ingresos/Egresos ni Glassdoor).
// - "Manager": mismo acceso que "TEM".
// - "Equipo" : Inicio + Beneficios de su propio grupo únicamente (según su
//              "Rol en empresa" — un Engineer ve Engineers, un Core Team ve
//              Core Team).
// Si el campo está vacío o tiene un valor que no reconocemos, cae a
// "Equipo" (el nivel más restrictivo) hasta que se cargue bien — fail
// closed, no fail open.
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

const NIVELES_ACCESO=new Set(['full','hr','tem','manager','equipo']);

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
// ambos grupos sin restricción (full/tem/manager).
async function resolverAccesoPorEmail(email,fetchImpl){
  if(EMAILS_ACCESO_FULL.has(String(email||'').toLowerCase())) return {rol:'full',grupoBeneficios:null};

  const persona=await buscarPersonaPorEmail(email,fetchImpl);
  const accesoNormalizado=normalizarValor(persona?.fields?.['Acceso']);
  const rol=NIVELES_ACCESO.has(accesoNormalizado)?accesoNormalizado:'equipo';

  const rolEmpresa=persona?.fields?.['Rol en empresa']||'';
  const grupoBeneficios=
    rol==='hr'?'Core Team':
    rol==='equipo'?grupoDeRolEmpresa(rolEmpresa):
    null;

  return {rol,grupoBeneficios};
}

module.exports={resolverAccesoPorEmail,buscarPersonaPorEmail,grupoDeRolEmpresa};
