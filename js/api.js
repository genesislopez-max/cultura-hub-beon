// `canal` es opcional: 'general' (default) o 'feedback'. El server lo mapea
// contra una lista fija de webhooks (ver api/slack.js), así que acá solo se
// pasa la etiqueta. Nunca tira: un aviso de Slack no debe hacer fallar el
// guardado que lo disparó.
async function sendSlack(text,canal){
  try{
    await fetch('/api/slack',{method:'POST',headers:authHeaders(),body:JSON.stringify({text,canal:canal||'general'})});
  }catch(e){console.error('Slack error:',e.message);}
}
// ─── AIRTABLE ────────────────────────────────────────────────────────────────
// Todas las llamadas van a nuestro proxy serverless (/api/airtable), que
// valida la sesión de Google y recién ahí habla con Airtable usando el token
// que vive solo en el servidor. Ver api/airtable.js.
//
// La tabla/registro va como query param (?path=Tabla/recXXX) en vez de como
// parte de la URL — un endpoint fijo + query param no depende del ruteo
// dinámico de Vercel para sub-rutas anidadas, que no resultó confiable acá.
function authHeaders(){
  return {'Authorization':`Bearer ${getIdToken()}`,'Content-Type':'application/json'};
}

function apiUrl(path,qs=''){
  return `/api/airtable?path=${encodeURIComponent(path)}${qs}`;
}

// Wrapper único para todas las llamadas al proxy: normaliza errores de red
// (fetch caído) y de la API (respuesta no-ok) en un solo Error con mensaje legible.
async function atRequest(url,options){
  let r;
  try{
    r=await fetch(url,options);
  }catch(networkErr){
    throw new Error('Sin conexión — revisá tu internet.');
  }
  if(!r.ok){
    const body=await r.json().catch(()=>null);
    const msg=body?.error?.message||r.statusText||`Error ${r.status}`;
    const err=new Error(r.status===401||r.status===403?`Token inválido o sin permisos (${msg})`:msg);
    err.status=r.status;
    throw err;
  }
  return r;
}

async function atGet(table,qs=''){
  // Paginación automática — Airtable devuelve max 100 por request
  let allRecords=[], offset=null;
  do {
    const offsetParam=offset?`&offset=${offset}`:'';
    const r=await atRequest(apiUrl(table,`&pageSize=100${qs}${offsetParam}`),{headers:authHeaders()});
    const data=await r.json();
    allRecords=[...allRecords,...(data.records||[])];
    offset=data.offset||null;
  } while(offset);
  return {records:allRecords};
}
// typecast:true le pide a Airtable que autocomplete lo que pueda en vez de
// rechazar el pedido — por ejemplo, agregar sola una opción nueva a un campo
// Single Select que todavía no la tenía cargada (causa típica de 422 acá,
// ya que el Hub no conoce de antemano qué opciones existen en cada campo).
async function atPost(table,fields){
  const r=await atRequest(apiUrl(table),{method:'POST',headers:authHeaders(),body:JSON.stringify({records:[{fields}],typecast:true})});
  return r.json();
}
async function atPatch(path,fields){
  const r=await atRequest(apiUrl(path),{method:'PATCH',headers:authHeaders(),body:JSON.stringify({fields,typecast:true})});
  return r.json();
}
async function atDelete(table,id){
  const r=await atRequest(apiUrl(`${table}/${id}`),{method:'DELETE',headers:authHeaders()});
  return r.json();
}
// Elimina hasta 10 registros de una vez (límite de Airtable)
async function atDeleteBatch(table,ids){
  if(!ids.length) return;
  const chunks=[];
  for(let i=0;i<ids.length;i+=10) chunks.push(ids.slice(i,i+10));
  for(const chunk of chunks){
    const recordsQs=chunk.map(id=>`&records[]=${id}`).join('');
    await atRequest(apiUrl(table,recordsQs),{method:'DELETE',headers:authHeaders()});
  }
}
