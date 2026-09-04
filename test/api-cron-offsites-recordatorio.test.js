'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

process.env.AIRTABLE_TOKEN='tok123';
process.env.AIRTABLE_BASE='appXXX';
process.env.SLACK_WEBHOOK='https://hooks.slack.test/webhook';
delete process.env.CRON_SECRET;

const handler=require('../api/cron-offsites-recordatorio');

function fakeRes(){
  const res={statusCode:200,body:null};
  res.status=function(c){this.statusCode=c;return this;};
  res.json=function(obj){this.body=obj;return this;};
  return res;
}

function mockFetch({offsites,personas=[]}){
  const calls=[];
  return {
    calls,
    fetchImpl: async(url)=>{
      calls.push({url:String(url)});
      const u=String(url);
      if(u.includes('/Off%20Sites')){
        return {ok:true,json:async()=>({records:offsites})};
      }
      if(u.includes('/Personas')){
        return {ok:true,json:async()=>({records:personas})};
      }
      if(u.includes('hooks.slack.test')){
        return {ok:true,json:async()=>({})};
      }
      throw new Error('fetch inesperado: '+u);
    },
  };
}

test('cron-offsites-recordatorio: avisa por Slack un viaje que arranca en exactamente 7 días (Persona como texto)', async()=>{
  const offsites=[
    {id:'o1',fields:{Persona:'Ana Test',Destino:'Bariloche','Fecha inicio':'2026-08-04','Fecha fin':'2026-08-08'}},
    {id:'o2',fields:{Persona:'Bruno Diaz',Destino:'Bariloche','Fecha inicio':'2026-08-04','Fecha fin':'2026-08-08'}},
  ];
  const {calls,fetchImpl}=mockFetch({offsites});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res,{hoy:new Date(2026,6,28)}); // 28 jul + 7 = 4 ago
    assert.equal(res.statusCode,200);
    assert.equal(res.body.notificados,1); // un solo viaje, dos personas
    const slackCalls=calls.filter(c=>c.url.includes('hooks.slack.test'));
    assert.equal(slackCalls.length,1);
  }finally{
    global.fetch=original;
  }
});

test('cron-offsites-recordatorio: el mensaje incluye destino, rango de fechas y las personas', async()=>{
  const offsites=[
    {id:'o1',fields:{Persona:'Ana Test',Destino:'Bariloche','Fecha inicio':'2026-08-04','Fecha fin':'2026-08-08'}},
  ];
  const posts=[];
  const original=global.fetch;
  global.fetch=async(url,opts)=>{
    const u=String(url);
    if(u.includes('/Off%20Sites')) return {ok:true,json:async()=>({records:offsites})};
    if(u.includes('hooks.slack.test')){ posts.push(JSON.parse(opts.body).text); return {ok:true,json:async()=>({})}; }
    throw new Error('fetch inesperado: '+u);
  };
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res,{hoy:new Date(2026,6,28)});
    assert.equal(posts.length,1);
    assert.match(posts[0],/Bariloche/);
    assert.match(posts[0],/04 de ago de 2026/);
    assert.match(posts[0],/08 de ago de 2026/);
    assert.match(posts[0],/Ana Test/);
    assert.match(posts[0],/En una semana empieza/);
  }finally{
    global.fetch=original;
  }
});

test('cron-offsites-recordatorio: resuelve Persona como linked record contra Personas', async()=>{
  const offsites=[
    {id:'o1',fields:{Persona:['recPersona1'],Destino:'Mendoza','Fecha inicio':'2026-08-04','Fecha fin':'2026-08-06'}},
  ];
  const personas=[{id:'recPersona1',fields:{Nombre:'Carla Diaz'}}];
  const posts=[];
  const original=global.fetch;
  global.fetch=async(url,opts)=>{
    const u=String(url);
    if(u.includes('/Off%20Sites')) return {ok:true,json:async()=>({records:offsites})};
    if(u.includes('/Personas')) return {ok:true,json:async()=>({records:personas})};
    if(u.includes('hooks.slack.test')){ posts.push(JSON.parse(opts.body).text); return {ok:true,json:async()=>({})}; }
    throw new Error('fetch inesperado: '+u);
  };
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res,{hoy:new Date(2026,6,28)});
    assert.equal(posts.length,1);
    assert.match(posts[0],/Carla Diaz/);
    assert.doesNotMatch(posts[0],/recPersona1/);
  }finally{
    global.fetch=original;
  }
});

test('cron-offsites-recordatorio: sin viajes en 7 días, no manda nada a Slack', async()=>{
  const {calls,fetchImpl}=mockFetch({offsites:[]});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res,{hoy:new Date(2026,6,28)});
    assert.equal(res.body.notificados,0);
    assert.equal(calls.filter(c=>c.url.includes('hooks.slack.test')).length,0);
  }finally{
    global.fetch=original;
  }
});

// La consulta pide las dos fechas juntas (hoy y hoy+7) en un solo request: el
// handler resuelve personas y agrupa viajes una sola vez para las dos.
test('cron-offsites-recordatorio: una sola consulta pide hoy y hoy+7', async()=>{
  const {calls,fetchImpl}=mockFetch({offsites:[]});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res,{hoy:new Date(2026,6,28)});
    const airtableCalls=calls.filter(c=>c.url.includes('/Off%20Sites'));
    assert.equal(airtableCalls.length,1);
    const formula=decodeURIComponent(airtableCalls[0].url);
    assert.match(formula,/IS_SAME\(\{Fecha inicio\}, "2026-07-28", 'day'\)/); // hoy
    assert.match(formula,/IS_SAME\(\{Fecha inicio\}, "2026-08-04", 'day'\)/); // hoy+7
    assert.match(formula,/^.*OR\(/);
  }finally{
    global.fetch=original;
  }
});

// ─── Aviso del día que arranca ────────────────────────────────────────────────
// Antes solo avisaba 7 días antes; el día del viaje no llegaba nada.
test('cron-offsites-recordatorio: avisa el día que empieza el Off Site', async()=>{
  const offsites=[
    {id:'o1',fields:{Persona:'Ana Test',Destino:'Cariló','Fecha inicio':'2026-07-28','Fecha fin':'2026-07-31'}},
  ];
  const posts=[];
  const original=global.fetch;
  global.fetch=async(url,opts)=>{
    const u=String(url);
    if(u.includes('/Off%20Sites')) return {ok:true,json:async()=>({records:offsites})};
    if(u.includes('hooks.slack.test')){ posts.push(JSON.parse(opts.body).text); return {ok:true,json:async()=>({})}; }
    throw new Error('fetch inesperado: '+u);
  };
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res,{hoy:new Date(2026,6,28)}); // el viaje arranca hoy
    assert.equal(posts.length,1);
    assert.match(posts[0],/Hoy empieza/);
    assert.doesNotMatch(posts[0],/En una semana/);
    assert.match(posts[0],/Cariló/);
    assert.match(posts[0],/28 de jul de 2026/);
    assert.match(posts[0],/Ana Test/);
  }finally{
    global.fetch=original;
  }
});

test('cron-offsites-recordatorio: los dos avisos conviven, cada uno con su texto', async()=>{
  const offsites=[
    {id:'o1',fields:{Persona:'Ana Test',Destino:'Cariló','Fecha inicio':'2026-07-28','Fecha fin':'2026-07-31'}},
    {id:'o2',fields:{Persona:'Bruno Diaz',Destino:'Bariloche','Fecha inicio':'2026-08-04','Fecha fin':'2026-08-08'}},
  ];
  const posts=[];
  const original=global.fetch;
  global.fetch=async(url,opts)=>{
    const u=String(url);
    if(u.includes('/Off%20Sites')) return {ok:true,json:async()=>({records:offsites})};
    if(u.includes('hooks.slack.test')){ posts.push(JSON.parse(opts.body).text); return {ok:true,json:async()=>({})}; }
    throw new Error('fetch inesperado: '+u);
  };
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res,{hoy:new Date(2026,6,28)});
    assert.equal(res.body.notificados,2);
    assert.equal(posts.length,2);
    // El que arranca hoy va primero: es el aviso más urgente.
    assert.match(posts[0],/Hoy empieza.*Cariló/);
    assert.match(posts[1],/En una semana empieza.*Bariloche/);
  }finally{
    global.fetch=original;
  }
});

// Fecha inicio entra en la clave de agrupación. Sin eso, dos viajes al mismo
// destino que terminan el mismo día (uno arranca hoy, el otro en una semana)
// se mezclaban en un solo aviso con la fecha de uno de los dos.
test('cron-offsites-recordatorio: dos viajes al mismo destino y fin no se mezclan si arrancan distinto', async()=>{
  const offsites=[
    {id:'o1',fields:{Persona:'Ana Test',Destino:'Bariloche','Fecha inicio':'2026-07-28','Fecha fin':'2026-08-10'}},
    {id:'o2',fields:{Persona:'Bruno Diaz',Destino:'Bariloche','Fecha inicio':'2026-08-04','Fecha fin':'2026-08-10'}},
  ];
  const posts=[];
  const original=global.fetch;
  global.fetch=async(url,opts)=>{
    const u=String(url);
    if(u.includes('/Off%20Sites')) return {ok:true,json:async()=>({records:offsites})};
    if(u.includes('hooks.slack.test')){ posts.push(JSON.parse(opts.body).text); return {ok:true,json:async()=>({})}; }
    throw new Error('fetch inesperado: '+u);
  };
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res,{hoy:new Date(2026,6,28)});
    assert.equal(res.body.notificados,2);
    assert.match(posts[0],/Hoy empieza/);
    assert.match(posts[0],/Ana Test/);
    assert.doesNotMatch(posts[0],/Bruno Diaz/);
    assert.match(posts[1],/En una semana/);
    assert.match(posts[1],/Bruno Diaz/);
  }finally{
    global.fetch=original;
  }
});

// Un viaje que arranca mañana (o cualquier otro día) no debe generar aviso: son
// dos momentos puntuales, no un rango.
test('cron-offsites-recordatorio: un viaje que arranca mañana no dispara aviso', async()=>{
  const offsites=[]; // el filtro de Airtable ya no lo traería; se refleja acá
  const {calls,fetchImpl}=mockFetch({offsites});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res,{hoy:new Date(2026,6,28)});
    assert.equal(res.body.notificados,0);
    assert.equal(calls.filter(c=>c.url.includes('hooks.slack.test')).length,0);
  }finally{
    global.fetch=original;
  }
});

test('cron-offsites-recordatorio: con CRON_SECRET configurado, rechaza sin el header correcto', async()=>{
  process.env.CRON_SECRET='shh-secreto';
  const {fetchImpl}=mockFetch({offsites:[]});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res,{hoy:new Date(2026,6,28)});
    assert.equal(res.statusCode,401);
  }finally{
    global.fetch=original;
    delete process.env.CRON_SECRET;
  }
});

test('cron-offsites-recordatorio: con CRON_SECRET configurado, acepta con el header correcto', async()=>{
  process.env.CRON_SECRET='shh-secreto';
  const {fetchImpl}=mockFetch({offsites:[]});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{authorization:'Bearer shh-secreto'}};
    const res=fakeRes();
    await handler(req,res,{hoy:new Date(2026,6,28)});
    assert.equal(res.statusCode,200);
  }finally{
    global.fetch=original;
    delete process.env.CRON_SECRET;
  }
});

test('cron-offsites-recordatorio: sin SLACK_WEBHOOK configurado, devuelve skipped sin consultar nada', async()=>{
  const originalWebhook=process.env.SLACK_WEBHOOK;
  delete process.env.SLACK_WEBHOOK;
  const calls=[];
  const original=global.fetch;
  global.fetch=async(url)=>{calls.push(String(url));return {ok:true,json:async()=>({records:[]})};};
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res,{hoy:new Date(2026,6,28)});
    assert.equal(res.statusCode,200);
    assert.equal(res.body.skipped,true);
    assert.equal(calls.length,0);
  }finally{
    global.fetch=original;
    process.env.SLACK_WEBHOOK=originalWebhook;
  }
});

test('cron-offsites-recordatorio: sin AIRTABLE_TOKEN/BASE configurado, devuelve 500', async()=>{
  const originalToken=process.env.AIRTABLE_TOKEN;
  delete process.env.AIRTABLE_TOKEN;
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res,{hoy:new Date(2026,6,28)});
    assert.equal(res.statusCode,500);
  }finally{
    process.env.AIRTABLE_TOKEN=originalToken;
  }
});
