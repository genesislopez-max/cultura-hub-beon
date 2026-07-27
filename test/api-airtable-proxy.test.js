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
// Niveles: full (People/COO/Founder) > hr (Recruiting, grupoBeneficios fijo
// "Core Team") > tem/manager (sin restricción de grupo) > equipo (su propio
// grupo). Ver api/_lib/roles.js.
const TOKEN_FULL=signSession({email:'people@beon.tech',name:'People',rol:'full'});
const TOKEN_HR=signSession({email:'hr@beon.tech',name:'HR',rol:'hr',grupoBeneficios:'Core Team'});
const TOKEN_TEM=signSession({email:'vicky@beon.tech',name:'Vicky',rol:'tem'});
const TOKEN_MANAGER=signSession({email:'lead@beon.tech',name:'Lead',rol:'manager'});
const TOKEN_EQUIPO_ENG=signSession({email:'ana@beon.tech',name:'Ana',rol:'equipo',grupoBeneficios:'Engineers'});
const TOKEN_EQUIPO_CORE=signSession({email:'beto@beon.tech',name:'Beto',rol:'equipo',grupoBeneficios:'Core Team'});
// Sesión firmada antes de este cambio — sin rol/grupoBeneficios en el payload.
const TOKEN_SIN_ROL=signSession({email:'viejo@beon.tech',name:'Viejo'});
const TOKEN_BLOQUEADO=signSession({email:'sinacceso@beon.tech',name:'Sin Acceso',rol:'bloqueado'});

test('api/airtable: rol "bloqueado" (Acceso="No access") — bloqueo total para cualquier tabla, sin llamar a Airtable', async()=>{
  const {calls,fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:[{id:'rec1'}]})});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const reqGet={headers:{authorization:`Bearer ${TOKEN_BLOQUEADO}`},method:'GET',query:{path:'Personas'}};
    const resGet=fakeRes();
    await handler(reqGet,resGet);
    assert.equal(resGet.statusCode,200);
    assert.deepEqual(resGet.body,{records:[]});

    const reqPost={headers:{authorization:`Bearer ${TOKEN_BLOQUEADO}`},method:'POST',query:{path:'Personas'},body:{fields:{}}};
    const resPost=fakeRes();
    await handler(reqPost,resPost);
    assert.equal(resPost.statusCode,403);

    assert.equal(calls.length,0,'no debería haber llamado a Airtable en ningún caso');
  }finally{
    global.fetch=original;
  }
});

test('api/airtable: Checklist (Ingresos/Egresos) — 200 con records vacíos para tem/manager/equipo, sin llamar a Airtable', async()=>{
  for(const token of [TOKEN_TEM,TOKEN_MANAGER,TOKEN_EQUIPO_ENG,TOKEN_SIN_ROL]){
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

test('api/airtable: Checklist — full y hr ven los datos reales', async()=>{
  for(const token of [TOKEN_FULL,TOKEN_HR]){
    const {calls,fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:[{id:'rec1'}]})});
    const original=global.fetch;
    global.fetch=fetchImpl;
    try{
      const req={headers:{authorization:`Bearer ${token}`},method:'GET',query:{path:'Checklist'}};
      const res=fakeRes();
      await handler(req,res);
      assert.equal(res.statusCode,200);
      assert.deepEqual(JSON.parse(res.body),{records:[{id:'rec1'}]});
      assert.equal(calls.length,1);
    }finally{
      global.fetch=original;
    }
  }
});

test('api/airtable: escribir en Checklist sin ser full/hr devuelve 403 (no 200 silencioso)', async()=>{
  const {calls,fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:[]})});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{authorization:`Bearer ${TOKEN_EQUIPO_ENG}`},method:'PATCH',query:{path:'Checklist/rec1'},body:{fields:{}}};
    const res=fakeRes();
    await handler(req,res);
    assert.equal(res.statusCode,403);
    assert.equal(calls.length,0);
  }finally{
    global.fetch=original;
  }
});

test('api/airtable: Eventos — Glassdoor es exclusivo de "full", el resto de los roles lo pierde pero conserva otros Tipo', async()=>{
  const eventos=[
    {id:'e1',fields:{Tipo:'Glassdoor',Evento:'Glassdoor — Fulano'}},
    {id:'e2',fields:{Tipo:'Cumpleaños',Evento:'Cumple de Fulano'}},
  ];
  for(const token of [TOKEN_HR,TOKEN_TEM,TOKEN_MANAGER,TOKEN_EQUIPO_ENG]){
    const {fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:eventos})});
    const original=global.fetch;
    global.fetch=fetchImpl;
    try{
      const req={headers:{authorization:`Bearer ${token}`},method:'GET',query:{path:'Eventos'}};
      const res=fakeRes();
      await handler(req,res);
      assert.deepEqual(res.body.records.map(r=>r.id),['e2']);
    }finally{
      global.fetch=original;
    }
  }
});

test('api/airtable: Eventos — "full" ve todo, incluido Glassdoor', async()=>{
  const eventos=[
    {id:'e1',fields:{Tipo:'Glassdoor',Evento:'Glassdoor — Fulano'}},
    {id:'e2',fields:{Tipo:'Cumpleaños',Evento:'Cumple de Fulano'}},
  ];
  const {fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:eventos})});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{authorization:`Bearer ${TOKEN_FULL}`},method:'GET',query:{path:'Eventos'}};
    const res=fakeRes();
    await handler(req,res);
    const body=typeof res.body==='string'?JSON.parse(res.body):res.body;
    assert.equal(body.records.length,2);
  }finally{
    global.fetch=original;
  }
});

test('api/airtable: Beneficios — full/tem/manager ven los 2 grupos; hr y equipo solo el suyo (+ "Ambos")', async()=>{
  const registros=[
    {id:'b1',fields:{Beneficio:'Gimnasio Core',Grupo:'Core Team'}},
    {id:'b2',fields:{Beneficio:'Curso técnico',Grupo:'Engineers'}},
    {id:'b3',fields:{Beneficio:'Día libre cumpleaños',Grupo:'Ambos'}},
  ];
  const casos=[
    [TOKEN_FULL,['b1','b2','b3']],
    [TOKEN_TEM,['b1','b2','b3']],
    [TOKEN_MANAGER,['b1','b2','b3']],
    [TOKEN_HR,['b1','b3']],
    [TOKEN_EQUIPO_CORE,['b1','b3']],
    [TOKEN_EQUIPO_ENG,['b2','b3']],
  ];
  for(const [token,idsEsperados] of casos){
    const {fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:registros})});
    const original=global.fetch;
    global.fetch=fetchImpl;
    try{
      const req={headers:{authorization:`Bearer ${token}`},method:'GET',query:{path:'Beneficios'}};
      const res=fakeRes();
      await handler(req,res);
      const body=typeof res.body==='string'?JSON.parse(res.body):res.body;
      assert.deepEqual(body.records.map(r=>r.id).sort(),idsEsperados.sort());
    }finally{
      global.fetch=original;
    }
  }
});

test('api/airtable: Presupuesto Loyalty — mismo filtro por grupo que Beneficios', async()=>{
  const registros=[
    {id:'p1',fields:{Grupo:'Core Team',Nivel:'Spark'}},
    {id:'p2',fields:{Grupo:'Engineers',Nivel:'Spark'}},
  ];
  const {fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:registros})});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{authorization:`Bearer ${TOKEN_EQUIPO_ENG}`},method:'GET',query:{path:'Presupuesto Loyalty'}};
    const res=fakeRes();
    await handler(req,res);
    const body=typeof res.body==='string'?JSON.parse(res.body):res.body;
    assert.deepEqual(body.records.map(r=>r.id),['p2']);
  }finally{
    global.fetch=original;
  }
});

// Beneficios Asignados no tiene su propio campo Grupo — se resuelve por el
// Beneficio vinculado, que implica una segunda llamada interna a Airtable
// (GET Beneficios) para armar el mapa id→Grupo. Mock que distingue por tabla.
function fakeAirtableDual(porTabla){
  const calls=[];
  const fetchImpl=async(url,opts)=>{
    calls.push({url,opts});
    const urlStr=String(url);
    for(const [tabla,respuesta] of Object.entries(porTabla)){
      if(urlStr.includes(encodeURIComponent(tabla))||urlStr.includes(tabla.replace(/ /g,'%20'))||urlStr.includes(tabla)){
        return respuesta;
      }
    }
    return {ok:false,status:404,text:async()=>'not found'};
  };
  return {calls,fetchImpl};
}

test('api/airtable: Beneficios Asignados — se filtra por el Grupo del Beneficio vinculado', async()=>{
  const asignados=[
    {id:'a1',fields:{Persona:'Beto',Beneficio:['b1']}}, // b1 = Core Team
    {id:'a2',fields:{Persona:'Ana',Beneficio:['b2']}},  // b2 = Engineers
    {id:'a3',fields:{Persona:'Cami',Beneficio:['b3']}}, // b3 = Ambos
  ];
  const catalogo=[
    {id:'b1',fields:{Beneficio:'Gimnasio Core',Grupo:'Core Team'}},
    {id:'b2',fields:{Beneficio:'Curso técnico',Grupo:'Engineers'}},
    {id:'b3',fields:{Beneficio:'Día libre cumpleaños',Grupo:'Ambos'}},
  ];
  const {fetchImpl}=fakeAirtableDual({
    'Beneficios Asignados':{ok:true,status:200,text:async()=>JSON.stringify({records:asignados})},
    'Beneficios':{ok:true,status:200,json:async()=>({records:catalogo}),text:async()=>JSON.stringify({records:catalogo})},
  });
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{authorization:`Bearer ${TOKEN_EQUIPO_ENG}`},method:'GET',query:{path:'Beneficios Asignados'}};
    const res=fakeRes();
    await handler(req,res);
    const body=typeof res.body==='string'?JSON.parse(res.body):res.body;
    assert.deepEqual(body.records.map(r=>r.id).sort(),['a2','a3']);
  }finally{
    global.fetch=original;
  }
});

test('api/airtable: Beneficios Asignados — full/tem/manager no filtran (ven todo, sin la llamada extra a Beneficios)', async()=>{
  const asignados=[
    {id:'a1',fields:{Persona:'Beto',Beneficio:['b1']}},
    {id:'a2',fields:{Persona:'Ana',Beneficio:['b2']}},
  ];
  const {calls,fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:asignados})});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{authorization:`Bearer ${TOKEN_TEM}`},method:'GET',query:{path:'Beneficios Asignados'}};
    const res=fakeRes();
    await handler(req,res);
    const body=typeof res.body==='string'?JSON.parse(res.body):res.body;
    assert.equal(body.records.length,2);
    assert.equal(calls.length,1); // ninguna llamada extra a Beneficios
  }finally{
    global.fetch=original;
  }
});

test('api/airtable: Beneficios Asignados — si falla la resolución del catálogo, falla cerrado (records vacíos)', async()=>{
  const asignados=[{id:'a1',fields:{Persona:'Beto',Beneficio:['b1']}}];
  const {fetchImpl}=fakeAirtableDual({
    'Beneficios Asignados':{ok:true,status:200,text:async()=>JSON.stringify({records:asignados})},
    'Beneficios':{ok:false,status:500,json:async()=>({}),text:async()=>'error'},
  });
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{authorization:`Bearer ${TOKEN_EQUIPO_ENG}`},method:'GET',query:{path:'Beneficios Asignados'}};
    const res=fakeRes();
    await handler(req,res);
    const body=typeof res.body==='string'?JSON.parse(res.body):res.body;
    assert.deepEqual(body.records,[]);
  }finally{
    global.fetch=original;
  }
});
