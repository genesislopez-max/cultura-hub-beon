'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

process.env.AIRTABLE_TOKEN='tok123';
process.env.AIRTABLE_BASE='appXXX';
process.env.SLACK_WEBHOOK='https://hooks.slack.test/webhook';
delete process.env.CRON_SECRET;

const handler=require('../api/cron-loyalty-mensual');
const {esUltimoDiaHabilDelMes}=handler;

function fakeRes(){
  const res={statusCode:200,body:null};
  res.status=function(c){this.statusCode=c;return this;};
  res.json=function(obj){this.body=obj;return this;};
  return res;
}

function mockFetch({cambios}){
  const calls=[];
  return {
    calls,
    fetchImpl: async(url,opts)=>{
      calls.push({url:String(url),opts});
      if(String(url).includes('api.airtable.com')){
        return {ok:true,json:async()=>({records:cambios})};
      }
      if(String(url).includes('hooks.slack.test')){
        return {ok:true,json:async()=>({})};
      }
      throw new Error('fetch inesperado: '+url);
    },
  };
}

test('esUltimoDiaHabilDelMes: el último día calendario si cae en día hábil (lunes)', ()=>{
  assert.equal(esUltimoDiaHabilDelMes(new Date(2026,7,31)),true); // 31 ago 2026 = lunes
  assert.equal(esUltimoDiaHabilDelMes(new Date(2026,7,28)),false);
});

test('esUltimoDiaHabilDelMes: retrocede desde sábado al viernes anterior', ()=>{
  assert.equal(esUltimoDiaHabilDelMes(new Date(2026,0,31)),false); // 31 ene 2026 = sábado
  assert.equal(esUltimoDiaHabilDelMes(new Date(2026,0,30)),true);  // 30 ene 2026 = viernes
});

test('esUltimoDiaHabilDelMes: retrocede desde domingo al viernes anterior', ()=>{
  assert.equal(esUltimoDiaHabilDelMes(new Date(2026,4,31)),false); // 31 may 2026 = domingo
  assert.equal(esUltimoDiaHabilDelMes(new Date(2026,4,30)),false); // sábado
  assert.equal(esUltimoDiaHabilDelMes(new Date(2026,4,29)),true);  // viernes
});

test('cron-loyalty-mensual: si no es el último día hábil, no consulta nada', async()=>{
  const {calls,fetchImpl}=mockFetch({cambios:[]});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res,{hoy:new Date(2026,7,28)}); // no es el último hábil de agosto
    assert.equal(res.statusCode,200);
    assert.equal(res.body.skipped,true);
    assert.equal(calls.length,0);
  }finally{
    global.fetch=original;
  }
});

test('cron-loyalty-mensual: en el último día hábil, con cambios, manda un solo resumen a Slack', async()=>{
  const cambios=[
    {id:'r1',fields:{Persona:'Ana Test','Nivel anterior':'Spark','Nivel nuevo':'Ray',Fecha:'2026-08-10'}},
    {id:'r2',fields:{Persona:'Bruno Diaz','Nivel anterior':'Ray','Nivel nuevo':'Lightning',Fecha:'2026-08-20'}},
  ];
  const {calls,fetchImpl}=mockFetch({cambios});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res,{hoy:new Date(2026,7,31)}); // último hábil de agosto
    assert.equal(res.statusCode,200);
    assert.equal(res.body.notificados,2);
    const slackCalls=calls.filter(c=>c.url.includes('hooks.slack.test'));
    assert.equal(slackCalls.length,1);
    const texto=JSON.parse(slackCalls[0].opts.body).text;
    assert.match(texto,/agosto de 2026/);
    assert.ok(texto.includes('Ana Test'));
    assert.ok(texto.includes('Spark → Ray'));
    assert.ok(texto.includes('Bruno Diaz'));
    assert.ok(texto.includes('Ray → Lightning'));
  }finally{
    global.fetch=original;
  }
});

test('cron-loyalty-mensual: en el último día hábil, la consulta usa IS_SAME sobre el mes', async()=>{
  const {calls,fetchImpl}=mockFetch({cambios:[]});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res,{hoy:new Date(2026,7,31)});
    const airtableCall=calls.find(c=>c.url.includes('api.airtable.com'));
    assert.ok(airtableCall.url.includes('Historial%20Loyalty'));
    assert.match(decodeURIComponent(airtableCall.url),/IS_SAME\(\{Fecha\}, "2026-08-31", 'month'\)/);
    assert.equal(res.body.notificados,0);
  }finally{
    global.fetch=original;
  }
});

// Un mes sin movimientos igual manda el resumen: si no llegara nada, sería
// indistinguible de que la automatización esté rota o de que los cambios no se
// estén registrando en "Historial Loyalty".
test('cron-loyalty-mensual: sin cambios en el mes, avisa que no hubo cambios', async()=>{
  const {calls,fetchImpl}=mockFetch({cambios:[]});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res,{hoy:new Date(2026,7,31)});
    const aSlack=calls.filter(c=>c.url.includes('hooks.slack.test'));
    assert.equal(aSlack.length,1);
    const texto=JSON.parse(aSlack[0].opts.body).text;
    assert.match(texto,/Resumen mensual — Cambios de Nivel Loyalty \(agosto de 2026\)/);
    assert.match(texto,/Sin cambios de nivel este mes/);
    assert.equal(res.body.notificados,0);
  }finally{
    global.fetch=original;
  }
});

test('cron-loyalty-mensual: con CRON_SECRET configurado, rechaza sin el header correcto', async()=>{
  process.env.CRON_SECRET='shh-secreto';
  const {fetchImpl}=mockFetch({cambios:[]});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res,{hoy:new Date(2026,7,31)});
    assert.equal(res.statusCode,401);
  }finally{
    global.fetch=original;
    delete process.env.CRON_SECRET;
  }
});

test('cron-loyalty-mensual: con CRON_SECRET configurado, acepta con el header correcto', async()=>{
  process.env.CRON_SECRET='shh-secreto';
  const {fetchImpl}=mockFetch({cambios:[]});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{authorization:'Bearer shh-secreto'}};
    const res=fakeRes();
    await handler(req,res,{hoy:new Date(2026,7,31)});
    assert.equal(res.statusCode,200);
  }finally{
    global.fetch=original;
    delete process.env.CRON_SECRET;
  }
});

test('cron-loyalty-mensual: sin SLACK_WEBHOOK configurado, devuelve skipped sin consultar Airtable', async()=>{
  const originalWebhook=process.env.SLACK_WEBHOOK;
  delete process.env.SLACK_WEBHOOK;
  const calls=[];
  const original=global.fetch;
  global.fetch=async(url)=>{calls.push(String(url));return {ok:true,json:async()=>({records:[]})};};
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res,{hoy:new Date(2026,7,31)});
    assert.equal(res.statusCode,200);
    assert.equal(res.body.skipped,true);
    assert.equal(calls.length,0);
  }finally{
    global.fetch=original;
    process.env.SLACK_WEBHOOK=originalWebhook;
  }
});

test('cron-loyalty-mensual: sin AIRTABLE_TOKEN/BASE configurado, devuelve 500', async()=>{
  const originalToken=process.env.AIRTABLE_TOKEN;
  delete process.env.AIRTABLE_TOKEN;
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res,{hoy:new Date(2026,7,31)});
    assert.equal(res.statusCode,500);
  }finally{
    process.env.AIRTABLE_TOKEN=originalToken;
  }
});

// ─── Cuando no se puede LEER el historial ─────────────────────────────────────
// Airtable puede responder un error (la tabla no existe, el token perdió
// permisos, cambió el nombre de un campo) con status 4xx y un body sin
// records. Antes eso caía en `data.records||[]` y el cron anunciaba "Sin
// cambios de nivel este mes": peor que no decir nada, porque afirma que no
// pasó nada cuando en realidad no pudo leer.
function mockFetchConError({status=422,error='Table not found',tiraExcepcion=false}={}){
  const calls=[];
  return {
    calls,
    fetchImpl: async(url,opts)=>{
      calls.push({url:String(url),opts});
      if(String(url).includes('api.airtable.com')){
        if(tiraExcepcion) throw new Error('getaddrinfo ENOTFOUND');
        return {ok:false,status,json:async()=>({error:{message:error}})};
      }
      if(String(url).includes('hooks.slack.test')) return {ok:true,json:async()=>({})};
      throw new Error('fetch inesperado: '+url);
    },
  };
}

test('cron-loyalty-mensual: si Airtable responde un error, lo dice en vez de anunciar "sin cambios"', async()=>{
  const {calls,fetchImpl}=mockFetchConError();
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const res=fakeRes();
    await handler({headers:{}},res,{hoy:new Date(2026,7,31)});
    const aSlack=calls.filter(c=>c.url.includes('hooks.slack.test'));
    assert.equal(aSlack.length,1,'tiene que avisar igual');
    const texto=JSON.parse(aSlack[0].opts.body).text;
    assert.match(texto,/No se pudo leer la tabla "Historial Loyalty"/);
    assert.match(texto,/Table not found/);
    assert.ok(!/Sin cambios de nivel este mes/.test(texto),'no puede afirmar que no hubo cambios');
    assert.match(texto,/Inicio → Cambios de nivel/,'conviene decir dónde mirarlo igual');
    assert.equal(res.statusCode,200);
    assert.match(res.body.errorLectura,/Table not found/);
  }finally{
    global.fetch=original;
  }
});

test('cron-loyalty-mensual: si la consulta ni siquiera sale, avisa por Slack en vez de morir con 502', async()=>{
  const {calls,fetchImpl}=mockFetchConError({tiraExcepcion:true});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const res=fakeRes();
    await handler({headers:{}},res,{hoy:new Date(2026,7,31)});
    const aSlack=calls.filter(c=>c.url.includes('hooks.slack.test'));
    assert.equal(aSlack.length,1);
    assert.match(JSON.parse(aSlack[0].opts.body).text,/No se pudo leer la tabla/);
    // 200 a propósito: el aviso ya salió, y un 5xx haría que Vercel reintente
    // la corrida y el mes termine con varios mensajes repetidos.
    assert.equal(res.statusCode,200);
    assert.match(res.body.errorLectura,/ENOTFOUND/);
  }finally{
    global.fetch=original;
  }
});

test('cron-loyalty-mensual: una lectura buena no deja errorLectura en la respuesta', async()=>{
  const {fetchImpl}=mockFetch({cambios:[]});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const res=fakeRes();
    await handler({headers:{}},res,{hoy:new Date(2026,7,31)});
    assert.equal(res.body.errorLectura,undefined);
  }finally{
    global.fetch=original;
  }
});
