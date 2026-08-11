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

// Reportado en Engineers & Tech/Core Team: a un par de días de cumplir el
// aniversario, la cuenta de meses no puede ignorar el día del mes — antes
// (hoy.mes - ingreso.mes) daba 0 con el mes ya igualado, mostrando "1 año"
// en vez de "1 año y 11 meses" (Aniversarios sí calculaba bien).
test('calcAntiguedad: a 2 días de cumplir 2 años, muestra "1 año y 11 meses" (no "1 año")', ()=>{
  assert.equal(ctx.calcAntiguedad('2024-08-05',new Date(2026,7,3)),'1 año y 11 meses');
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

// ─── Filtros de País / Ciudad ─────────────────────────────────────────────────
// Los dos campos se cargan a mano en Airtable, así que llegan con espacios de
// más y mayúsculas inconsistentes; algunas bases además los tienen como linked
// record (array). El <select> no debe mostrar la misma ciudad dos veces.
test('valorUbicacion: recorta espacios y desenvuelve linked records', ()=>{
  assert.equal(ctx.valorUbicacion(' Buenos Aires '),'Buenos Aires');
  assert.equal(ctx.valorUbicacion(['Bogotá']),'Bogotá');
  assert.equal(ctx.valorUbicacion([]),'');
  assert.equal(ctx.valorUbicacion(undefined),'');
  assert.equal(ctx.valorUbicacion(null),'');
});

test('opcionesUnicas: dedup case-insensitive preservando la primera forma vista', ()=>{
  const opts=ctx.opcionesUnicas(['Buenos Aires','buenos aires','BUENOS AIRES','Córdoba']);
  assert.equal(JSON.stringify(opts),JSON.stringify(['Buenos Aires','Córdoba']));
});

test('opcionesUnicas: descarta vacíos y ordena alfabéticamente en español', ()=>{
  const opts=ctx.opcionesUnicas(['Uruguay','','Argentina',null,'Brasil',undefined]);
  assert.equal(JSON.stringify(opts),JSON.stringify(['Argentina','Brasil','Uruguay']));
});

test('opcionesUnicas: ordena con acentos como corresponde en español', ()=>{
  // Con el orden por código de carácter, "Ávila" caería después de "Zamora"
  const opts=ctx.opcionesUnicas(['Zamora','Ávila','Bogotá']);
  assert.equal(JSON.stringify(opts),JSON.stringify(['Ávila','Bogotá','Zamora']));
});
