async function sendSlack(text){
  if(!SLACK_WEBHOOK) return; // si no está configurado, no hace nada
  try{
    await fetch(SLACK_WEBHOOK,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
  }catch(e){console.error('Slack error:',e.message);}
}
// ─── AIRTABLE ────────────────────────────────────────────────────────────────
async function atGet(table,qs=''){
  // Paginación automática — Airtable devuelve max 100 por request
  let allRecords=[], offset=null;
  do {
    const offsetParam=offset?`&offset=${offset}`:'';
    const r=await fetch(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}?pageSize=100${qs}${offsetParam}`,{headers:HDR});
    if(!r.ok){const e=await r.json();throw new Error(e.error?.message||r.statusText);}
    const data=await r.json();
    allRecords=[...allRecords,...(data.records||[])];
    offset=data.offset||null;
  } while(offset);
  return {records:allRecords};
}
async function atPost(table,fields){
  const r=await fetch(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}`,{method:'POST',headers:HDR,body:JSON.stringify({records:[{fields}]})});
  if(!r.ok){const e=await r.json();throw new Error(e.error?.message||r.statusText);}
  return r.json();
}
async function atPatch(path,fields){
  const r=await fetch(`https://api.airtable.com/v0/${BASE}/${path}`,{method:'PATCH',headers:HDR,body:JSON.stringify({fields})});
  if(!r.ok){const e=await r.json();throw new Error(e.error?.message||r.statusText);}
  return r.json();
}
async function atDelete(table,id){
  const r=await fetch(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}/${id}`,{method:'DELETE',headers:HDR});
  if(!r.ok){const e=await r.json();throw new Error(e.error?.message||r.statusText);}
  return r.json();
}
// Elimina hasta 10 registros de una vez (límite de Airtable)
async function atDeleteBatch(table,ids){
  if(!ids.length) return;
  const chunks=[];
  for(let i=0;i<ids.length;i+=10) chunks.push(ids.slice(i,i+10));
  for(const chunk of chunks){
    const qs=chunk.map(id=>`records[]=${id}`).join('&');
    await fetch(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}?${qs}`,{method:'DELETE',headers:HDR});
  }
}
