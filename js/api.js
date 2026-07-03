async function sendSlack(text){
  try{
    await fetch('/api/slack',{method:'POST',headers:authHeaders(),body:JSON.stringify({text})});
  }catch(e){console.error('Slack error:',e.message);}
}
// ─── AIRTABLE ────────────────────────────────────────────────────────────────
// Todas las llamadas van a nuestro proxy serverless (/api/airtable/...), que
// valida la sesión de Google y recién ahí habla con Airtable usando el token
// que vive solo en el servidor. Ver api/airtable/[...path].js.
function authHeaders(){
  return {'Authorization':`Bearer ${getIdToken()}`,'Content-Type':'application/json'};
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
    const r=await atRequest(`/api/airtable/${encodeURIComponent(table)}?pageSize=100${qs}${offsetParam}`,{headers:authHeaders()});
    const data=await r.json();
    allRecords=[...allRecords,...(data.records||[])];
    offset=data.offset||null;
  } while(offset);
  return {records:allRecords};
}
async function atPost(table,fields){
  const r=await atRequest(`/api/airtable/${encodeURIComponent(table)}`,{method:'POST',headers:authHeaders(),body:JSON.stringify({records:[{fields}]})});
  return r.json();
}
async function atPatch(path,fields){
  const r=await atRequest(`/api/airtable/${path}`,{method:'PATCH',headers:authHeaders(),body:JSON.stringify({fields})});
  return r.json();
}
async function atDelete(table,id){
  const r=await atRequest(`/api/airtable/${encodeURIComponent(table)}/${id}`,{method:'DELETE',headers:authHeaders()});
  return r.json();
}
// Elimina hasta 10 registros de una vez (límite de Airtable)
async function atDeleteBatch(table,ids){
  if(!ids.length) return;
  const chunks=[];
  for(let i=0;i<ids.length;i+=10) chunks.push(ids.slice(i,i+10));
  for(const chunk of chunks){
    const qs=chunk.map(id=>`records[]=${id}`).join('&');
    await atRequest(`/api/airtable/${encodeURIComponent(table)}?${qs}`,{method:'DELETE',headers:authHeaders()});
  }
}
