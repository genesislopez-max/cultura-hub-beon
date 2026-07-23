'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

process.env.SESSION_SECRET='test-secret';
const {signSession,verifySession}=require('../api/_lib/session');

test('signSession + verifySession: un token recién firmado es válido', ()=>{
  const token=signSession({email:'gustavo@beon.tech',name:'Gustavo'});
  const r=verifySession(token);
  assert.equal(r.ok,true);
  assert.equal(r.email,'gustavo@beon.tech');
  assert.equal(r.name,'Gustavo');
});

test('signSession + verifySession: el rol de acceso viaja en el token firmado', ()=>{
  const token=signSession({email:'gustavo@beon.tech',name:'Gustavo',rol:'tem'});
  const r=verifySession(token);
  assert.equal(r.ok,true);
  assert.equal(r.rol,'tem');
});

test('verifySession: un token firmado antes de este cambio (sin rol) no explota', ()=>{
  const token=signSession({email:'gustavo@beon.tech',name:'Gustavo'});
  const r=verifySession(token);
  assert.equal(r.ok,true);
  assert.equal(r.rol,undefined);
});

test('verifySession: un token vencido se rechaza', ()=>{
  const token=signSession({email:'gustavo@beon.tech',name:'Gustavo'},-1000);
  const r=verifySession(token);
  assert.equal(r.ok,false);
  assert.match(r.error,/expiró/);
});

test('verifySession: string vacío o sin formato se rechaza sin explotar', ()=>{
  assert.equal(verifySession('').ok,false);
  assert.equal(verifySession('cualquier-cosa-sin-punto').ok,false);
});

test('verifySession: firma alterada (token de otro secreto) se rechaza', ()=>{
  const token=signSession({email:'gustavo@beon.tech',name:'Gustavo'});
  const [payload]=token.split('.');
  const falsificado=`${payload}.firmaInventada`;
  const r=verifySession(falsificado);
  assert.equal(r.ok,false);
});

test('verifySession: payload manipulado (email cambiado) invalida la firma', ()=>{
  const token=signSession({email:'gustavo@beon.tech',name:'Gustavo'});
  const [,sig]=token.split('.');
  const payloadFalso=Buffer.from(JSON.stringify({email:'otro@beon.tech',name:'Otro',exp:Date.now()+10000}))
    .toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const r=verifySession(`${payloadFalso}.${sig}`);
  assert.equal(r.ok,false);
});

test('signSession: sin SESSION_SECRET configurado, tira un error claro', ()=>{
  const original=process.env.SESSION_SECRET;
  delete process.env.SESSION_SECRET;
  try{
    assert.throws(()=>signSession({email:'x@beon.tech',name:'X'}),/SESSION_SECRET/);
  }finally{
    process.env.SESSION_SECRET=original;
  }
});
