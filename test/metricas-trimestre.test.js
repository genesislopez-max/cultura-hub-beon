'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadApp}=require('../test-helpers/load-app');

const ctx=loadApp(['constants.js','utils.js']);

test('parsearEdicionAW: reconoce "diciembre 2021"', ()=>{
  assert.equal(ctx.parsearEdicionAW('diciembre 2021'),'2021-12-01');
});

test('parsearEdicionAW: reconoce abreviaturas como "dic 2021"', ()=>{
  assert.equal(ctx.parsearEdicionAW('dic 2021'),'2021-12-01');
});

test('parsearEdicionAW: es insensible a mayúsculas', ()=>{
  assert.equal(ctx.parsearEdicionAW('Julio 2026'),'2026-07-01');
});

test('parsearEdicionAW: texto sin mes reconocible devuelve null', ()=>{
  assert.equal(ctx.parsearEdicionAW('Edición especial 2021'),null);
});

test('parsearEdicionAW: vacío devuelve null sin explotar', ()=>{
  assert.equal(ctx.parsearEdicionAW(''),null);
  assert.equal(ctx.parsearEdicionAW(null),null);
});

test('rangoTrimestre: Q1 2026 va del 1 de enero al 31 de marzo', ()=>{
  const {inicio,fin}=ctx.rangoTrimestre(2026,1);
  assert.equal(inicio.getFullYear(),2026);
  assert.equal(inicio.getMonth(),0);
  assert.equal(inicio.getDate(),1);
  assert.equal(fin.getMonth(),2);
  assert.equal(fin.getDate(),31);
});

test('rangoTrimestre: Q3 2026 va del 1 de julio al 30 de septiembre', ()=>{
  const {inicio,fin}=ctx.rangoTrimestre(2026,3);
  assert.equal(inicio.getMonth(),6);
  assert.equal(fin.getMonth(),8);
  assert.equal(fin.getDate(),30);
});
