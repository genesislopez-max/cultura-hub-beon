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
    // Los errores que genera nuestro propio proxy (ej. el 403 de solo lectura)
    // vienen marcados con origen:'hub' y ya traen un mensaje escrito para el
    // usuario: se muestran tal cual. Envolverlos en la explicación de Airtable
    // dejaba mensajes como "Airtable rechazó el pedido: puede faltar la tabla…
    // (Tu usuario es de solo lectura…)", que mezcla dos causas distintas.
    const delHub=body?.error?.origen==='hub';
    // Airtable devuelve 403 INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND tanto si el
    // token no tiene permiso como si la tabla o un campo no existen, y 422
    // UNKNOWN_FIELD_NAME cuando el campo puntual no está en la tabla. En este
    // proyecto la causa casi siempre es esa: un campo o una tabla que todavía
    // no se creó en la base, así que el mensaje lo dice explícitamente.
    const err=new Error(
      delHub?msg:
      r.status===401?`Tu sesión no es válida — cerrá sesión y volvé a entrar. (${msg})`:
      r.status===403?`Airtable rechazó el pedido: puede faltar la tabla o un campo en la base, o el token no tener permiso. (${msg})`:
      /unknown field name/i.test(msg)?`Falta un campo en Airtable — crealo en la tabla y volvé a intentar. (${msg})`:
      msg);
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
