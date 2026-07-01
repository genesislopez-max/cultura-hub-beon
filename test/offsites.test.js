'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadApp}=require('../test-helpers/load-app');

const ctx=loadApp(['offsites.js']);

test('calcDiasOS: usa el campo "Días" si viene cargado, sin recalcular', ()=>{
  assert.equal(ctx.calcDiasOS({'Días':5,'Fecha inicio':'2024-01-01','Fecha fin':'2024-01-01'}),5);
});

test('calcDiasOS: calcula por fechas cuando no hay campo "Días" (rango inclusivo)', ()=>{
  assert.equal(ctx.calcDiasOS({'Fecha inicio':'2024-01-01','Fecha fin':'2024-01-05'}),5);
  assert.equal(ctx.calcDiasOS({'Fecha inicio':'2024-01-01','Fecha fin':'2024-01-01'}),1);
});

test('calcDiasOS: sin días ni fechas, devuelve 0 en vez de NaN', ()=>{
  assert.equal(ctx.calcDiasOS({}),0);
});

test('calcDiasOS: fecha fin anterior a fecha inicio no da un número negativo', ()=>{
  assert.equal(ctx.calcDiasOS({'Fecha inicio':'2024-01-10','Fecha fin':'2024-01-01'}),0);
});
