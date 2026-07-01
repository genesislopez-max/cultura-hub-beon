'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadApp}=require('../test-helpers/load-app');

const ctx=loadApp(['utils.js']);

// Construye "YYYY-MM-DD" para una fecha N meses antes de hoy, fijando el día
// en 1 para no depender del día del mes actual (evita overflow de mes).
function fechaHaceMeses(n){
  const hoy=new Date();
  const d=new Date(hoy.getFullYear(),hoy.getMonth()-n,1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

test('daysTo: sin fecha devuelve 9999 (centinela de "sin datos")', ()=>{
  assert.equal(ctx.daysTo(''),9999);
  assert.equal(ctx.daysTo(null),9999);
  assert.equal(ctx.daysTo(undefined),9999);
});

test('daysTo: para una fecha que cae exactamente N días hacia adelante, devuelve N+1', ()=>{
  // daysTo normaliza la fecha objetivo a mediodía y "hoy" a medianoche, así que
  // el resultado siempre queda un día por encima de la diferencia calendario
  // real — es un comportamiento existente de la app, no algo que inventé yo.
  const hoy=new Date();hoy.setHours(0,0,0,0);
  const en10dias=new Date(hoy);en10dias.setDate(en10dias.getDate()+10);
  const fechaStr=`2019-${String(en10dias.getMonth()+1).padStart(2,'0')}-${String(en10dias.getDate()).padStart(2,'0')}`;
  assert.equal(ctx.daysTo(fechaStr),11);
});

test('getRolGroup: agrupa los roles de conducción en "Core Team"', ()=>{
  for(const rol of ['Core Team','Supervisor','TEM','Lead','Manager','COO','Founder']){
    assert.equal(ctx.getRolGroup(rol),'Core Team',`"${rol}" debería ser Core Team`);
  }
});

test('getRolGroup: Engineer y roles desconocidos/vacíos caen en "Engineers"', ()=>{
  assert.equal(ctx.getRolGroup('Engineer'),'Engineers');
  assert.equal(ctx.getRolGroup(''),'Engineers');
  assert.equal(ctx.getRolGroup('Rol inexistente'),'Engineers');
});
