// Resuelve el rol de acceso del usuario logueado a partir de su email — no
// hay ningún concepto de "rol de acceso" en Airtable. Se llama una sola vez,
// en el login (ver api/session.js), y el resultado queda embebido en el
// token de sesión firmado (api/_lib/session.js) — así el resto de los
// pedidos no necesita volver a consultar Airtable para saber el rol.
//
// - "hr": el email está en la env var HR_EMAILS (no hay ningún campo en
//   Personas que modele "es HR" — agregarlo requeriría tocar el schema).
// - "tem": el email no es HR, pero matchea una Persona activa cuyo
//   "Rol en empresa" es un rol de liderazgo (mismo set LIDER_ROLES que ya
//   usa el cliente en js/constants.js).
// - "equipo": cualquier otro caso (rol no-líder, o no se encontró ninguna
//   Persona con ese Mail).
const LIDER_ROLES=new Set(['TEM','Manager','Lead','Supervisor','COO','Founder']);

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

async function resolverRolAcceso(email,fetchImpl=fetch){
  const hrEmails=(process.env.HR_EMAILS||'').split(',').map(e=>e.trim().toLowerCase()).filter(Boolean);
  if(hrEmails.includes(String(email||'').toLowerCase())) return 'hr';
  const persona=await buscarPersonaPorEmail(email,fetchImpl);
  const rolEmpresa=(persona?.fields?.['Rol en empresa']||'').trim();
  return LIDER_ROLES.has(rolEmpresa)?'tem':'equipo';
}

module.exports={resolverRolAcceso,buscarPersonaPorEmail,LIDER_ROLES};
