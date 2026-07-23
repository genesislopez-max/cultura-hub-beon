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

// ─── Control de acceso por rol ───────────────────────────────────────────────
const TOKEN_EQUIPO=signSession({email:'ana@beon.tech',name:'Ana',rol:'equipo'});
const TOKEN_TEM=signSession({email:'vicky@beon.tech',name:'Vicky',rol:'tem'});
const TOKEN_HR=signSession({email:'hr@beon.tech',name:'HR',rol:'hr'});
// Sesión firmada antes de este cambio — sin rol en el payload.
const TOKEN_SIN_ROL=signSession({email:'viejo@beon.tech',name:'Viejo'});

test('api/airtable: Checklist (Ingresos/Egresos) — 200 con records vacíos para equipo/tem, sin llamar a Airtable', async()=>{
  for(const token of [TOKEN_EQUIPO,TOKEN_TEM,TOKEN_SIN_ROL]){
    const {calls,fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:[{id:'rec1'}]})});
    const original=global.fetch;
    global.fetch=fetchImpl;
    try{
      const req={headers:{authorization:`Bearer ${token}`},method:'GET',query:{path:'Checklist'}};
      const res=fakeRes();
      await handler(req,res);
      assert.equal(res.statusCode,200);
      assert.deepEqual(res.body,{records:[]});
      assert.equal(calls.length,0);
    }finally{
      global.fetch=original;
    }
  }
});

test('api/airtable: Checklist — HR ve los datos reales', async()=>{
  const {calls,fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:[{id:'rec1'}]})});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{authorization:`Bearer ${TOKEN_HR}`},method:'GET',query:{path:'Checklist'}};
    const res=fakeRes();
    await handler(req,res);
    assert.equal(res.statusCode,200);
    assert.deepEqual(JSON.parse(res.body),{records:[{id:'rec1'}]});
    assert.equal(calls.length,1);
  }finally{
    global.fetch=original;
  }
});

test('api/airtable: escribir en Checklist sin ser HR devuelve 403 (no 200 silencioso)', async()=>{
  const {calls,fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:[]})});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{authorization:`Bearer ${TOKEN_EQUIPO}`},method:'PATCH',query:{path:'Checklist/rec1'},body:{fields:{}}};
    const res=fakeRes();
    await handler(req,res);
    assert.equal(res.statusCode,403);
    assert.equal(calls.length,0);
  }finally{
    global.fetch=original;
  }
});

test('api/airtable: Presupuesto Loyalty — oculto para equipo, visible para tem y hr', async()=>{
  for(const [token,esperaVacio] of [[TOKEN_EQUIPO,true],[TOKEN_TEM,false],[TOKEN_HR,false]]){
    const {fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:[{id:'recP'}]})});
    const original=global.fetch;
    global.fetch=fetchImpl;
    try{
      const req={headers:{authorization:`Bearer ${token}`},method:'GET',query:{path:'Presupuesto Loyalty'}};
      const res=fakeRes();
      await handler(req,res);
      assert.equal(res.statusCode,200);
      const body=typeof res.body==='string'?JSON.parse(res.body):res.body;
      assert.equal(body.records.length,esperaVacio?0:1);
    }finally{
      global.fetch=original;
    }
  }
});

test('api/airtable: Eventos — a equipo/tem les saca los registros de Glassdoor pero conserva el resto', async()=>{
  const eventos=[
    {id:'e1',fields:{Tipo:'Glassdoor',Evento:'Glassdoor — Fulano'}},
    {id:'e2',fields:{Tipo:'Cumpleaños',Evento:'Cumple de Fulano'}},
  ];
  const {fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:eventos})});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{authorization:`Bearer ${TOKEN_EQUIPO}`},method:'GET',query:{path:'Eventos'}};
    const res=fakeRes();
    await handler(req,res);
    assert.deepEqual(res.body.records.map(r=>r.id),['e2']);
  }finally{
    global.fetch=original;
  }
});

test('api/airtable: Eventos — HR ve todo, incluido Glassdoor', async()=>{
  const eventos=[
    {id:'e1',fields:{Tipo:'Glassdoor',Evento:'Glassdoor — Fulano'}},
    {id:'e2',fields:{Tipo:'Cumpleaños',Evento:'Cumple de Fulano'}},
  ];
  const {fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:eventos})});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{authorization:`Bearer ${TOKEN_HR}`},method:'GET',query:{path:'Eventos'}};
    const res=fakeRes();
    await handler(req,res);
    const body=typeof res.body==='string'?JSON.parse(res.body):res.body;
    assert.equal(body.records.length,2);
  }finally{
    global.fetch=original;
  }
});

test('api/airtable: Beneficios — a equipo le saca el campo Valor, tem/hr lo conservan', async()=>{
  for(const [token,esperaValor] of [[TOKEN_EQUIPO,false],[TOKEN_TEM,true],[TOKEN_HR,true]]){
    const {fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:[{id:'b1',fields:{Beneficio:'Gimnasio',Valor:50000}}]})});
    const original=global.fetch;
    global.fetch=fetchImpl;
    try{
      const req={headers:{authorization:`Bearer ${token}`},method:'GET',query:{path:'Beneficios'}};
      const res=fakeRes();
      await handler(req,res);
      const body=typeof res.body==='string'?JSON.parse(res.body):res.body;
      assert.equal('Valor' in body.records[0].fields,esperaValor);
      assert.equal(body.records[0].fields.Beneficio,'Gimnasio'); // el resto de los campos no se toca
    }finally{
      global.fetch=original;
    }
  }
});

test('api/airtable: Beneficios Asignados — a equipo le saca el campo Monto, tem/hr lo conservan', async()=>{
  for(const [token,esperaMonto] of [[TOKEN_EQUIPO,false],[TOKEN_TEM,true]]){
    const {fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:[{id:'a1',fields:{Persona:'Ana',Monto:30000}}]})});
    const original=global.fetch;
    global.fetch=fetchImpl;
    try{
      const req={headers:{authorization:`Bearer ${token}`},method:'GET',query:{path:'Beneficios Asignados'}};
      const res=fakeRes();
      await handler(req,res);
      const body=typeof res.body==='string'?JSON.parse(res.body):res.body;
      assert.equal('Monto' in body.records[0].fields,esperaMonto);
    }finally{
      global.fetch=original;
    }
  }
});
