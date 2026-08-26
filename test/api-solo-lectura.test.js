'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

process.env.AIRTABLE_TOKEN='tok123';
process.env.AIRTABLE_BASE='appXXX';
process.env.SESSION_SECRET='test-secret';

const {signSession}=require('../api/_lib/session');
const handler=require('../api/airtable');

function fakeRes(){
  const res={statusCode:200,headers:{},body:null};
  res.status=function(c){this.statusCode=c;return this;};
  res.json=function(o){this.body=o;return this;};
  res.setHeader=function(k,v){this.headers[k]=v;};
  res.send=function(t){this.body=t;return this;};
  return res;
}

// Devuelve {status, llegoAAirtable}
async function pedir({rol,method,tabla,grupoBeneficios=null}){
  const llamadas=[];
  const original=global.fetch;
  global.fetch=async(url,opts)=>{
    llamadas.push(String(url));
    return {ok:true,status:200,headers:{get:()=>'application/json'},text:async()=>'{"records":[]}'};
  };
  const res=fakeRes();
  try{
    await handler({
      method,
      headers:{authorization:'Bearer '+signSession({email:'x@beon.tech',rol,grupoBeneficios})},
      query:{path:tabla},
      body:{records:[{fields:{}}]},
    },res);
  } finally { global.fetch=original; }
  return {status:res.statusCode,llegoAAirtable:llamadas.length>0,body:res.body};
}

const ESCRIBEN=['full','hr'];
const LEEN=['tem','manager','equipo'];
const ESCRITURAS=['POST','PATCH','DELETE'];

test('solo lectura: full y hr siguen pudiendo escribir', async()=>{
  for(const rol of ESCRIBEN){
    for(const method of ESCRITURAS){
      const r=await pedir({rol,method,tabla:'Personas'});
      assert.equal(r.status,200,`${rol} ${method} debería pasar`);
      assert.ok(r.llegoAAirtable,`${rol} ${method} debería llegar a Airtable`);
    }
  }
});

test('solo lectura: tem, manager y equipo no pueden escribir ninguna tabla', async()=>{
  for(const rol of LEEN){
    for(const method of ESCRITURAS){
      for(const tabla of ['Personas','Beneficios','Beneficios Asignados','Proyectos','Tareas','Off Sites','Get Together','Ambassador Week','Asistencia a Actividades','Eventos Feedback','Historial Loyalty']){
        const r=await pedir({rol,method,tabla});
        assert.equal(r.status,403,`${rol} ${method} ${tabla} debería dar 403`);
        assert.equal(r.llegoAAirtable,false,`${rol} ${method} ${tabla} NO debería llegar a Airtable`);
      }
    }
  }
});

test('solo lectura: el 403 explica que es por rol, no un error genérico', async()=>{
  const r=await pedir({rol:'equipo',method:'POST',tabla:'Personas'});
  assert.match(r.body.error.message,/solo lectura/);
  assert.match(r.body.error.message,/People Ops/);
});

test('solo lectura: los roles de lectura SÍ pueden leer', async()=>{
  for(const rol of LEEN){
    const r=await pedir({rol,method:'GET',tabla:'Personas'});
    assert.equal(r.status,200);
    assert.ok(r.llegoAAirtable);
  }
});

// El feedback es el canal para avisar justamente que algo no se puede hacer:
// si se bloqueara, un rol de lectura no tendría forma de reportar nada.
test('solo lectura: cualquiera puede mandar feedback de la plataforma', async()=>{
  for(const rol of [...LEEN,...ESCRIBEN]){
    const r=await pedir({rol,method:'POST',tabla:'Feedback - Plataforma'});
    assert.equal(r.status,200,`${rol} debería poder mandar feedback`);
    assert.ok(r.llegoAAirtable);
  }
});

test('solo lectura: "bloqueado" sigue sin poder ni leer ni escribir', async()=>{
  const escritura=await pedir({rol:'bloqueado',method:'POST',tabla:'Personas'});
  assert.equal(escritura.status,403);
  assert.equal(escritura.llegoAAirtable,false);
  // Ni siquiera el feedback: no entra al Hub
  const fb=await pedir({rol:'bloqueado',method:'POST',tabla:'Feedback - Plataforma'});
  assert.equal(fb.status,403);
  assert.equal(fb.llegoAAirtable,false);
});

test('solo lectura: no rompe el bloqueo previo de Checklist para tem/manager/equipo', async()=>{
  // Antes daba 403 por ser tabla restringida; ahora corta antes por solo
  // lectura — el resultado para el usuario es el mismo.
  const r=await pedir({rol:'tem',method:'POST',tabla:'Checklist'});
  assert.equal(r.status,403);
  assert.equal(r.llegoAAirtable,false);
  // Y el GET sigue degradando a vacío en vez de fallar
  const g=await pedir({rol:'tem',method:'GET',tabla:'Checklist'});
  assert.equal(g.status,200);
  assert.deepEqual(g.body,{records:[]});
});
