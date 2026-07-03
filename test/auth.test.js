'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadApp}=require('../test-helpers/load-app');
const {verifyGoogleIdToken,GOOGLE_CLIENT_ID}=require('../api/_lib/auth');

// ─── verifyGoogleIdToken (api/_lib/auth.js) — corre en el servidor ───────────
function fakeFetch(response){
  return async()=>({ok:true,json:async()=>response});
}

test('verifyGoogleIdToken: sin token, rechaza sin llamar a Google', async()=>{
  const r=await verifyGoogleIdToken('',async()=>{throw new Error('no debería llamar a fetch');});
  assert.equal(r.ok,false);
});

test('verifyGoogleIdToken: token válido de @beon.tech pasa', async()=>{
  const r=await verifyGoogleIdToken('tok',fakeFetch({
    aud:GOOGLE_CLIENT_ID,email_verified:'true',email:'gustavo@beon.tech',hd:'beon.tech',name:'Gustavo',
  }));
  assert.equal(r.ok,true);
  assert.equal(r.email,'gustavo@beon.tech');
});

test('verifyGoogleIdToken: aud distinto (token de otra app) se rechaza', async()=>{
  const r=await verifyGoogleIdToken('tok',fakeFetch({
    aud:'otra-app.apps.googleusercontent.com',email_verified:'true',email:'gustavo@beon.tech',hd:'beon.tech',
  }));
  assert.equal(r.ok,false);
});

test('verifyGoogleIdToken: dominio distinto de beon.tech se rechaza', async()=>{
  const r=await verifyGoogleIdToken('tok',fakeFetch({
    aud:GOOGLE_CLIENT_ID,email_verified:'true',email:'alguien@gmail.com',hd:'gmail.com',
  }));
  assert.equal(r.ok,false);
  assert.match(r.error,/beon\.tech/);
});

test('verifyGoogleIdToken: email no verificado se rechaza aunque el dominio sea correcto', async()=>{
  const r=await verifyGoogleIdToken('tok',fakeFetch({
    aud:GOOGLE_CLIENT_ID,email_verified:'false',email:'gustavo@beon.tech',hd:'beon.tech',
  }));
  assert.equal(r.ok,false);
});

test('verifyGoogleIdToken: Google responde no-ok (token vencido) se rechaza', async()=>{
  const r=await verifyGoogleIdToken('tok',async()=>({ok:false}));
  assert.equal(r.ok,false);
});

test('verifyGoogleIdToken: un error de red no explota, devuelve ok:false', async()=>{
  const r=await verifyGoogleIdToken('tok',async()=>{throw new Error('network down');});
  assert.equal(r.ok,false);
});

// ─── decodeJwt (js/auth.js) — corre en el navegador ──────────────────────────
const ctx=loadApp(['auth.js']);

function fakeJwt(payload){
  const b64url=s=>Buffer.from(s).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return `${b64url('{}')}.${b64url(JSON.stringify(payload))}.signature`;
}

test('decodeJwt: decodifica el payload del ID token de Google', ()=>{
  const payload={email:'gustavo@beon.tech',name:'Gustavo',hd:'beon.tech'};
  const decoded=ctx.decodeJwt(fakeJwt(payload));
  // Objeto viene del realm del sandbox (vm) — se comparan los campos, no el objeto entero
  assert.equal(decoded.email,payload.email);
  assert.equal(decoded.name,payload.name);
  assert.equal(decoded.hd,payload.hd);
});
