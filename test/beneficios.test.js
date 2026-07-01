'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadApp}=require('../test-helpers/load-app');

const ctx=loadApp(['constants.js','beneficios.js']);

test('tieneAccesoBeneficio: sin nivel mínimo o "Todos", cualquier nivel tiene acceso', ()=>{
  assert.equal(ctx.tieneAccesoBeneficio('Spark',''),true);
  assert.equal(ctx.tieneAccesoBeneficio('Spark','Todos'),true);
});

test('tieneAccesoBeneficio: un nivel superior desbloquea los beneficios de niveles inferiores', ()=>{
  assert.equal(ctx.tieneAccesoBeneficio('Storm','Spark'),true);
  assert.equal(ctx.tieneAccesoBeneficio('Thunder','Ray'),true);
});

test('tieneAccesoBeneficio: un nivel inferior NO accede a beneficios de niveles superiores', ()=>{
  assert.equal(ctx.tieneAccesoBeneficio('Spark','Storm'),false);
  assert.equal(ctx.tieneAccesoBeneficio('Ray','Thunder'),false);
});

test('tieneAccesoBeneficio: el mismo nivel siempre tiene acceso', ()=>{
  for(const nivel of ['Spark','Ray','Lightning','Thunder','Storm']){
    assert.equal(ctx.tieneAccesoBeneficio(nivel,nivel),true);
  }
});
