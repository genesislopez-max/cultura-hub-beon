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

test('atRequest: un 401 marca err.status=401 y manda a volver a iniciar sesión', async ()=>{
  ctx.fetch=async()=>({
    ok:false,status:401,statusText:'Unauthorized',
    json:async()=>({error:{message:'Invalid authentication token'}}),
  });
  await assert.rejects(
    ctx.atRequest('https://api.airtable.com/v0/x/Personas',{}),
    err=>{
      assert.equal(err.status,401);
      assert.match(err.message,/sesión no es válida/);
      return true;
    },
  );
});

// Airtable usa el mismo 403 para "no tenés permiso" y para "la tabla/campo no
// existe" (INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND). El mensaje tiene que
// nombrar las dos causas: cuando decía solo "Token inválido o sin permisos",
// una tabla que faltaba en la base se leía como un problema de permisos del
// usuario y mandaba a buscar el problema donde no estaba.
test('atRequest: un 403 nombra la tabla/campo faltante, no solo los permisos', async ()=>{
  ctx.fetch=async()=>({
    ok:false,status:403,statusText:'Forbidden',
    json:async()=>({error:{type:'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND',message:'Invalid permissions, or the requested model was not found.'}}),
  });
  await assert.rejects(
    ctx.atRequest('https://api.airtable.com/v0/x/Feedback',{}),
    err=>{
      assert.equal(err.status,403);
      assert.match(err.message,/puede faltar la tabla o un campo/);
      // y conserva el texto original de Airtable, que es el que da la pista
      assert.match(err.message,/model was not found/);
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
