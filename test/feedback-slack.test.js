'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadApp}=require('../test-helpers/load-app');

// ─── Texto del aviso ──────────────────────────────────────────────────────────
const ctx=loadApp(['constants.js','utils.js','forms.js']);

test('textoFeedbackSlack: incluye categoría, quién lo mandó y el mensaje citado', ()=>{
  const t=ctx.textoFeedbackSlack('Bug',{nombre:'Ana Test',email:'ana@beon.tech'},'El filtro no anda');
  assert.match(t,/🐛 \*Nuevo feedback en el Hub — Bug\*/);
  assert.match(t,/Ana Test · ana@beon\.tech/);
  assert.match(t,/^> El filtro no anda$/m);
});

test('textoFeedbackSlack: un ícono distinto por categoría', ()=>{
  assert.match(ctx.textoFeedbackSlack('Sugerencia',{},'x'),/^💡/);
  assert.match(ctx.textoFeedbackSlack('Bug',{},'x'),/^🐛/);
  assert.match(ctx.textoFeedbackSlack('Otro',{},'x'),/^💬/);
  // Una categoría nueva en Airtable no debe romper el aviso
  assert.match(ctx.textoFeedbackSlack('Categoría inventada',{},'x'),/^💬 \*Nuevo feedback en el Hub — Categoría inventada\*/);
});

test('textoFeedbackSlack: cita TODAS las líneas de un mensaje multilínea', ()=>{
  const t=ctx.textoFeedbackSlack('Otro',{nombre:'Ana'},'Primera línea\nSegunda línea\nTercera');
  // Sin esto, Slack citaba solo la primera y el resto quedaba como texto suelto
  assert.equal(t.split('\n').filter(l=>l.startsWith('> ')).length,3);
});

test('textoFeedbackSlack: sin nombre ni mail no queda un aviso anónimo raro', ()=>{
  assert.match(ctx.textoFeedbackSlack('Otro',{},'x'),/Alguien del equipo/);
  assert.match(ctx.textoFeedbackSlack('Otro',null,'x'),/Alguien del equipo/);
  // Con uno solo de los dos, se usa el que haya
  assert.match(ctx.textoFeedbackSlack('Otro',{email:'a@beon.tech'},'x'),/^a@beon\.tech$/m);
});

// ─── Endpoint /api/slack ──────────────────────────────────────────────────────
process.env.SESSION_SECRET='secreto-de-test';
const {signSession}=require('../api/_lib/session');
const handler=require('../api/slack');

function fakeRes(){
  const res={statusCode:200,body:null};
  res.status=function(c){this.statusCode=c;return this;};
  res.json=function(o){this.body=o;return this;};
  return res;
}
const tokenValido=()=>signSession({email:'ana@beon.tech',rol:'full'});

async function postSlack(body,env={}){
  const previo={...process.env};
  Object.assign(process.env,env);
  const enviados=[];
  const fetchOriginal=global.fetch;
  global.fetch=async(url,opts)=>{ enviados.push({url:String(url),body:JSON.parse(opts.body)}); return {ok:true}; };
  const res=fakeRes();
  try{
    await handler({method:'POST',headers:{authorization:'Bearer '+tokenValido()},body},res);
  } finally {
    global.fetch=fetchOriginal;
    for(const k of Object.keys(env)) delete process.env[k];
    Object.assign(process.env,previo);
  }
  return {res,enviados};
}

test('api/slack: el canal "feedback" usa SLACK_WEBHOOK_FEEDBACK cuando está configurado', async()=>{
  const {res,enviados}=await postSlack({text:'hola',canal:'feedback'},
    {SLACK_WEBHOOK:'https://hooks.slack.test/general',SLACK_WEBHOOK_FEEDBACK:'https://hooks.slack.test/privado'});
  assert.equal(res.statusCode,200);
  assert.equal(enviados.length,1);
  assert.equal(enviados[0].url,'https://hooks.slack.test/privado');
  assert.equal(enviados[0].body.text,'hola');
});

test('api/slack: sin SLACK_WEBHOOK_FEEDBACK, el feedback cae en el canal general', async()=>{
  const {enviados}=await postSlack({text:'hola',canal:'feedback'},
    {SLACK_WEBHOOK:'https://hooks.slack.test/general'});
  assert.equal(enviados[0].url,'https://hooks.slack.test/general');
});

test('api/slack: los avisos sin canal siguen yendo al general (no cambia lo de antes)', async()=>{
  const {enviados}=await postSlack({text:'ingreso'},
    {SLACK_WEBHOOK:'https://hooks.slack.test/general',SLACK_WEBHOOK_FEEDBACK:'https://hooks.slack.test/privado'});
  assert.equal(enviados[0].url,'https://hooks.slack.test/general');
});

test('api/slack: un canal inventado en el body no lee otras env vars ni rompe', async()=>{
  // El canal lo manda el cliente: si se usara para armar el nombre de la env
  // var, esto filtraría secretos del server.
  const {res,enviados}=await postSlack({text:'x',canal:'AIRTABLE_TOKEN'},
    {SLACK_WEBHOOK:'https://hooks.slack.test/general',AIRTABLE_TOKEN:'secreto'});
  assert.equal(res.statusCode,200);
  assert.equal(enviados[0].url,'https://hooks.slack.test/general');
});

test('api/slack: sin ningún webhook configurado responde skipped y no manda nada', async()=>{
  const previo=process.env.SLACK_WEBHOOK;
  delete process.env.SLACK_WEBHOOK;
  const {res,enviados}=await postSlack({text:'x',canal:'feedback'});
  if(previo!==undefined) process.env.SLACK_WEBHOOK=previo;
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.body,{skipped:true});
  assert.equal(enviados.length,0);
});

test('api/slack: sin sesión válida no manda nada', async()=>{
  const enviados=[];
  const fetchOriginal=global.fetch;
  global.fetch=async(u,o)=>{ enviados.push(String(u)); return {ok:true}; };
  process.env.SLACK_WEBHOOK='https://hooks.slack.test/general';
  const res=fakeRes();
  await handler({method:'POST',headers:{authorization:'Bearer token-falso'},body:{text:'x',canal:'feedback'}},res);
  global.fetch=fetchOriginal;
  assert.equal(res.statusCode,401);
  assert.equal(enviados.length,0);
});

// ─── Nombre de la tabla ───────────────────────────────────────────────────────
// Estuvo apuntando a "Feedback" mientras en Airtable la tabla se llama
// "Feedback - Plataforma", y Airtable respondía 403
// INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND — un error que se lee como problema de
// permisos y no de nombre, así que costó bastante encontrarlo. Este test fija
// el nombre exacto para que un cambio accidental se note acá y no en producción.
// TABLA_FEEDBACK es un const del script, así que no aparece como propiedad del
// sandbox — hay que leerlo evaluando adentro del contexto.
const tablaFeedback=()=>require('node:vm').runInContext('TABLA_FEEDBACK',ctx);

test('TABLA_FEEDBACK: es exactamente el nombre de la tabla en Airtable', ()=>{
  assert.equal(tablaFeedback(),'Feedback - Plataforma');
});

test('TABLA_FEEDBACK: no se confunde con "Eventos Feedback", que es otra tabla', ()=>{
  // "Eventos Feedback" guarda el puntaje de satisfacción de cada evento
  assert.notEqual(tablaFeedback(),'Eventos Feedback');
  assert.notEqual(tablaFeedback(),'Feedback');
});
