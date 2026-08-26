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

// Los errores que genera nuestro propio proxy (el 403 de solo lectura) vienen
// marcados con origen:'hub' y ya traen un mensaje para el usuario. Sin esto se
// mostraban envueltos en la explicación de Airtable, mezclando dos causas:
// "Airtable rechazó el pedido: puede faltar la tabla… (Tu usuario es de solo
// lectura…)".
test('atRequest: un error propio del Hub se muestra tal cual, sin prefijo de Airtable', async ()=>{
  ctx.fetch=async()=>({
    ok:false,status:403,statusText:'Forbidden',
    json:async()=>({error:{origen:'hub',message:'Tu usuario es de solo lectura. Escribile a People Ops.'}}),
  });
  await assert.rejects(
    ctx.atRequest('/api/airtable?path=Personas',{}),
    err=>{
      assert.equal(err.message,'Tu usuario es de solo lectura. Escribile a People Ops.');
      assert.doesNotMatch(err.message,/Airtable rechazó/);
      return true;
    },
  );
});

// Tercera vez en este proyecto que un campo/tabla que falta en Airtable se
// presenta como otra cosa, así que el mensaje dice qué hacer.
test('atRequest: un 422 por campo inexistente dice que hay que crearlo en Airtable', async ()=>{
  ctx.fetch=async()=>({
    ok:false,status:422,statusText:'Unprocessable Entity',
    json:async()=>({error:{type:'UNKNOWN_FIELD_NAME',message:'Unknown field name: "Fecha de baja"'}}),
  });
  await assert.rejects(
    ctx.atRequest('/api/airtable?path=Beneficios%20Asignados/rec1',{}),
    err=>{
      assert.match(err.message,/Falta un campo en Airtable/);
      assert.match(err.message,/Fecha de baja/); // conserva el nombre del campo
      return true;
    },
  );
});
