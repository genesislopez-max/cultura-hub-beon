'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadApp}=require('../test-helpers/load-app');

const ctx=loadApp(['api.js']);

test('atRequest: un fallo de red se traduce a un mensaje legible en vez de un TypeError crudo', async ()=>{
  ctx.fetch=async()=>{throw new TypeError('Failed to fetch');};
  await assert.rejects(
    ctx.atRequest('https://api.airtable.com/v0/x/Personas',{}),
    /Sin conexión/,
  );
});

test('atRequest: una respuesta 401 marca err.status=401 y avisa que el token es inválido', async ()=>{
  ctx.fetch=async()=>({
    ok:false,status:401,statusText:'Unauthorized',
    json:async()=>({error:{message:'Invalid authentication token'}}),
  });
  await assert.rejects(
    ctx.atRequest('https://api.airtable.com/v0/x/Personas',{}),
    err=>{
      assert.equal(err.status,401);
      assert.match(err.message,/Token inválido/);
      return true;
    },
  );
});

test('atRequest: si el error de Airtable no viene en JSON válido, no explota — usa statusText', async ()=>{
  ctx.fetch=async()=>({
    ok:false,status:500,statusText:'Internal Server Error',
    json:async()=>{throw new Error('body no es JSON');},
  });
  await assert.rejects(
    ctx.atRequest('https://api.airtable.com/v0/x/Personas',{}),
    /Internal Server Error/,
  );
});

test('atRequest: una respuesta ok se devuelve tal cual', async ()=>{
  ctx.fetch=async()=>({ok:true,status:200,json:async()=>({records:[]})});
  const r=await ctx.atRequest('https://api.airtable.com/v0/x/Personas',{});
  assert.equal(r.ok,true);
});
