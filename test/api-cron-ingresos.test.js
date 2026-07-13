'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

process.env.AIRTABLE_TOKEN='tok123';
process.env.AIRTABLE_BASE='appXXX';
process.env.SLACK_WEBHOOK='https://hooks.slack.test/webhook';
delete process.env.CRON_SECRET;

const handler=require('../api/cron-ingresos');

function fakeRes(){
  const res={statusCode:200,body:null};
  res.status=function(c){this.statusCode=c;return this;};
  res.json=function(obj){this.body=obj;return this;};
  return res;
}

function mockFetch({personas}){
  const calls=[];
  return {
    calls,
    fetchImpl: async(url,opts)=>{
      calls.push({url:String(url),opts});
      if(String(url).includes('api.airtable.com')){
        return {ok:true,json:async()=>({records:personas})};
      }
      if(String(url).includes('hooks.slack.test')){
        return {ok:true,json:async()=>({})};
      }
      throw new Error('fetch inesperado: '+url);
    },
  };
}

test('api/cron-ingresos: avisa a Slack por cada persona que ingresa hoy', async()=>{
  const personas=[{id:'rec1',fields:{Nombre:'Ana Test'}},{id:'rec2',fields:{Nombre:'Bruno Diaz'}}];
  const {calls,fetchImpl}=mockFetch({personas});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.notificados,2);
    const slackCalls=calls.filter(c=>c.url.includes('hooks.slack.test'));
    assert.equal(slackCalls.length,2);
    const textos=slackCalls.map(c=>JSON.parse(c.opts.body).text);
    assert.ok(textos.some(t=>t.includes('Ana Test')));
    assert.ok(textos.some(t=>t.includes('Bruno Diaz')));
    assert.match(textos[0],/Hoy ingresa/);
  }finally{
    global.fetch=original;
  }
});

test('api/cron-ingresos: la consulta a Airtable usa IS_SAME sobre la fecha de hoy', async()=>{
  const {calls,fetchImpl}=mockFetch({personas:[]});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res);
    const airtableCall=calls.find(c=>c.url.includes('api.airtable.com'));
    assert.match(decodeURIComponent(airtableCall.url),/IS_SAME\(\{Fecha de ingreso\}, "\d{4}-\d{2}-\d{2}", 'day'\)/);
    assert.equal(res.body.notificados,0);
  }finally{
    global.fetch=original;
  }
});

test('api/cron-ingresos: sin coincidencias no manda nada a Slack', async()=>{
  const {calls,fetchImpl}=mockFetch({personas:[]});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res);
    assert.equal(calls.filter(c=>c.url.includes('hooks.slack.test')).length,0);
  }finally{
    global.fetch=original;
  }
});

test('api/cron-ingresos: con CRON_SECRET configurado, rechaza sin el header correcto', async()=>{
  process.env.CRON_SECRET='shh-secreto';
  const {fetchImpl}=mockFetch({personas:[]});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res);
    assert.equal(res.statusCode,401);
  }finally{
    global.fetch=original;
    delete process.env.CRON_SECRET;
  }
});

test('api/cron-ingresos: con CRON_SECRET configurado, acepta con el header correcto', async()=>{
  process.env.CRON_SECRET='shh-secreto';
  const personas=[{id:'rec1',fields:{Nombre:'Ana Test'}}];
  const {fetchImpl}=mockFetch({personas});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{authorization:'Bearer shh-secreto'}};
    const res=fakeRes();
    await handler(req,res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.notificados,1);
  }finally{
    global.fetch=original;
    delete process.env.CRON_SECRET;
  }
});

test('api/cron-ingresos: sin SLACK_WEBHOOK configurado, devuelve skipped sin consultar nada', async()=>{
  const originalWebhook=process.env.SLACK_WEBHOOK;
  delete process.env.SLACK_WEBHOOK;
  const calls=[];
  const original=global.fetch;
  global.fetch=async(url)=>{calls.push(String(url));return {ok:true,json:async()=>({records:[]})};};
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.skipped,true);
    assert.equal(calls.length,0);
  }finally{
    global.fetch=original;
    process.env.SLACK_WEBHOOK=originalWebhook;
  }
});

test('api/cron-ingresos: sin AIRTABLE_TOKEN/BASE configurado, devuelve 500', async()=>{
  const originalToken=process.env.AIRTABLE_TOKEN;
  delete process.env.AIRTABLE_TOKEN;
  try{
    const req={headers:{}};
    const res=fakeRes();
    await handler(req,res);
    assert.equal(res.statusCode,500);
  }finally{
    process.env.AIRTABLE_TOKEN=originalToken;
  }
});
