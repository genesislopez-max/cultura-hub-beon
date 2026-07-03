'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadApp}=require('../test-helpers/load-app');

const ctx=loadApp(['personas.js']);

// Día fijo en 1 para no depender de si el mes actual tiene ese día (evita
// overflow de mes en fechas cercanas a fin de mes).
function fechaHaceMeses(n){
  const hoy=new Date();
  const d=new Date(hoy.getFullYear(),hoy.getMonth()-n,1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

test('calcAntiguedad: sin fecha devuelve "—"', ()=>{
  assert.equal(ctx.calcAntiguedad(''),'—');
  assert.equal(ctx.calcAntiguedad(null),'—');
});

test('calcAntiguedad: alguien que ingresó hoy muestra "< 1 mes"', ()=>{
  const hoy=new Date();
  const fechaStr=`${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
  assert.equal(ctx.calcAntiguedad(fechaStr),'< 1 mes');
});

test('calcAntiguedad: 3 meses de antigüedad', ()=>{
  assert.equal(ctx.calcAntiguedad(fechaHaceMeses(3)),'3 meses');
});

test('calcAntiguedad: 14 meses de antigüedad se muestran como "1 año y 2 meses"', ()=>{
  assert.equal(ctx.calcAntiguedad(fechaHaceMeses(14)),'1 año y 2 meses');
});

test('calcAntiguedad: 24 meses exactos se muestran como "2 años" (sin "y 0 meses")', ()=>{
  assert.equal(ctx.calcAntiguedad(fechaHaceMeses(24)),'2 años');
});

function fechaOffsetDias(n){
  const d=new Date();
  d.setDate(d.getDate()+n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

test('yaEgreso: sin Fecha de egreso, no está egresado', ()=>{
  assert.equal(ctx.yaEgreso({fields:{}}),false);
});

test('yaEgreso: Fecha de egreso en el pasado, ya está egresado', ()=>{
  assert.equal(ctx.yaEgreso({fields:{'Fecha de egreso':fechaOffsetDias(-1)}}),true);
});

test('yaEgreso: Fecha de egreso es hoy, ya cuenta como egresado', ()=>{
  assert.equal(ctx.yaEgreso({fields:{'Fecha de egreso':fechaOffsetDias(0)}}),true);
});

test('yaEgreso: Fecha de egreso en el futuro, todavía no está egresado', ()=>{
  assert.equal(ctx.yaEgreso({fields:{'Fecha de egreso':fechaOffsetDias(1)}}),false);
});
