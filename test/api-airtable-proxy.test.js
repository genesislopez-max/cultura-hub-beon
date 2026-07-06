'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

process.env.AIRTABLE_TOKEN='tok123';
process.env.AIRTABLE_BASE='appXXX';
process.env.SESSION_SECRET='test-secret';

const {signSession}=require('../api/_lib/session');
const handler=require('../api/airtable');

const TOKEN=signSession({email:'gustavo@beon.tech',name:'Gustavo'});

function fakeRes(){
  const res={statusCode:200,headers:{},body:null};
  res.status=function(c){this.statusCode=c;return this;};
  res.json=function(obj){this.body=obj;return this;};
  res.setHeader=function(k,v){this.headers[k]=v;};
  res.send=function(text){this.body=text;return this;};
  return res;
}

function fakeAirtable(airtableRespuesta){
  const calls=[];
  const fetchImpl=async(url,opts)=>{
    calls.push({url,opts});
    return airtableRespuesta;
  };
  return {calls,fetchImpl};
}

test('api/airtable: reconstruye la URL de Airtable a partir del query param path (con record ID)', async()=>{
  const {calls,fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({ok:true})});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{authorization:`Bearer ${TOKEN}`},method:'PATCH',query:{path:'Personas/rec123'},body:{fields:{Mail:'x@beon.tech'}}};
    const res=fakeRes();
    await handler(req,res);
    assert.equal(res.statusCode,200);
    const airtableCall=calls.find(c=>String(c.url).includes('api.airtable.com'));
    assert.equal(airtableCall.url,'https://api.airtable.com/v0/appXXX/Personas/rec123');
    assert.equal(airtableCall.opts.method,'PATCH');
  }finally{
    global.fetch=original;
  }
});

test('api/airtable: reconstruye query params extra (ej. sort[0][field]) preservando corchetes', async()=>{
  const {calls,fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:[]})});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{authorization:`Bearer ${TOKEN}`},method:'GET',query:{path:'Personas',pageSize:'100','sort[0][field]':'Nombre','sort[0][direction]':'asc'}};
    const res=fakeRes();
    await handler(req,res);
    const airtableCall=calls.find(c=>String(c.url).includes('api.airtable.com'));
    assert.match(airtableCall.url,/^https:\/\/api\.airtable\.com\/v0\/appXXX\/Personas\?/);
    const qs=new URL(airtableCall.url).searchParams;
    assert.equal(qs.get('pageSize'),'100');
    assert.equal(qs.get('sort[0][field]'),'Nombre');
  }finally{
    global.fetch=original;
  }
});

test('api/airtable: sin sesión válida devuelve 401 sin llamar a Airtable', async()=>{
  const calls=[];
  const original=global.fetch;
  global.fetch=async(url)=>{calls.push(String(url));return {ok:false};};
  try{
    const req={headers:{},method:'GET',query:{path:'Personas'}};
    const res=fakeRes();
    await handler(req,res);
    assert.equal(res.statusCode,401);
    assert.ok(!calls.some(u=>u.includes('api.airtable.com')));
  }finally{
    global.fetch=original;
  }
});

test('api/airtable: un token de sesión vencido devuelve 401', async()=>{
  const vencido=signSession({email:'gustavo@beon.tech',name:'Gustavo'},-1000);
  const req={headers:{authorization:`Bearer ${vencido}`},method:'GET',query:{path:'Personas'}};
  const res=fakeRes();
  await handler(req,res);
  assert.equal(res.statusCode,401);
});
