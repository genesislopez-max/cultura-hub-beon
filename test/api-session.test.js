'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

process.env.SESSION_SECRET='test-secret';

const {GOOGLE_CLIENT_ID}=require('../api/_lib/auth');
const {verifySession}=require('../api/_lib/session');
const handler=require('../api/session');

function fakeRes(){
  const res={statusCode:200,body:null};
  res.status=function(c){this.statusCode=c;return this;};
  res.json=function(obj){this.body=obj;return this;};
  return res;
}

function fakeGoogleFetch(response){
  return async()=>({ok:true,json:async()=>response});
}

// api/session.js llama a Google (tokeninfo) y, para resolver el rol, también
// a Airtable (Personas) — ambos por el mismo global.fetch. Este mock elige la
// respuesta según la URL.
function fakeGoogleYPersonas(googleResponse,personasRecords){
  return async(url)=>{
    if(String(url).includes('api.airtable.com')){
      return {ok:true,json:async()=>({records:personasRecords||[]})};
    }
    return {ok:true,json:async()=>googleResponse};
  };
}

test('api/session: intercambia un ID token de Google válido por un token de sesión propio', async()=>{
  const original=global.fetch;
  global.fetch=fakeGoogleFetch({aud:GOOGLE_CLIENT_ID,email_verified:'true',email:'gustavo@beon.tech',hd:'beon.tech',name:'Gustavo'});
  try{
    const req={method:'POST',body:{idToken:'google-id-token'}};
    const res=fakeRes();
    await handler(req,res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.email,'gustavo@beon.tech');
    const verificado=verifySession(res.body.token);
    assert.equal(verificado.ok,true);
    assert.equal(verificado.email,'gustavo@beon.tech');
  }finally{
    global.fetch=original;
  }
});

test('api/session: resuelve y devuelve el rol de acceso (vía Acceso en Personas)', async()=>{
  const original=global.fetch;
  process.env.AIRTABLE_TOKEN='tok123';
  process.env.AIRTABLE_BASE='appXXX';
  global.fetch=fakeGoogleYPersonas(
    {aud:GOOGLE_CLIENT_ID,email_verified:'true',email:'gustavo@beon.tech',hd:'beon.tech',name:'Gustavo'},
    [{id:'rec1',fields:{Nombre:'Gustavo',Mail:'gustavo@beon.tech',Acceso:'HR'}}],
  );
  try{
    const req={method:'POST',body:{idToken:'google-id-token'}};
    const res=fakeRes();
    await handler(req,res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.rol,'hr');
    assert.equal(res.body.grupoBeneficios,'Core Team');
    const verificado=verifySession(res.body.token);
    assert.equal(verificado.rol,'hr');
    assert.equal(verificado.grupoBeneficios,'Core Team');
  }finally{
    global.fetch=original;
  }
});

test('api/session: ID token inválido no emite sesión', async()=>{
  const original=global.fetch;
  global.fetch=async()=>({ok:false});
  try{
    const req={method:'POST',body:{idToken:'lo-que-sea'}};
    const res=fakeRes();
    await handler(req,res);
    assert.equal(res.statusCode,401);
    assert.equal(res.body.token,undefined);
  }finally{
    global.fetch=original;
  }
});

test('api/session: método distinto de POST se rechaza', async()=>{
  const req={method:'GET',body:{}};
  const res=fakeRes();
  await handler(req,res);
  assert.equal(res.statusCode,405);
});
