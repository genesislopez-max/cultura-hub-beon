'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadApp}=require('../test-helpers/load-app');

const ctx=loadApp(['constants.js']);

test('getItemsMap: para Ingreso solo devuelve ítems que aplican al rol o a todos', ()=>{
  const items=ctx.getItemsMap('Ingreso','Engineer');
  assert.ok(items.length>0);
  for(const it of items){
    assert.ok(it.r.includes('todos')||it.r.includes('Engineer'),`ítem "${it.t}" no debería aplicar a Engineer`);
  }
});

test('getItemsMap: Core Team no ve los ítems exclusivos de Engineer', ()=>{
  const items=ctx.getItemsMap('Ingreso','Core Team');
  const soloEngineer=items.filter(it=>it.r.includes('Engineer')&&!it.r.includes('todos')&&!it.r.includes('Core Team'));
  assert.equal(soloEngineer.length,0);
});

test('getItemsMap: Egreso devuelve siempre la misma lista sin importar el rol', ()=>{
  const a=ctx.getItemsMap('Egreso','Engineer');
  const b=ctx.getItemsMap('Egreso','Core Team');
  assert.deepEqual(a.map(i=>i.t),b.map(i=>i.t));
  assert.ok(a.length>0);
});

test('calcularEtapa: con menos de 14 días y nada completado, arranca en la primera etapa', ()=>{
  const rol='Engineer';
  const items=ctx.getItemsMap('Ingreso',rol);
  const chkVacio=Array(items.length).fill(false);
  const hoy=new Date().toISOString().split('T')[0];
  assert.equal(ctx.calcularEtapa('Ingreso',rol,chkVacio,hoy),'Pre-ingreso');
});

test('calcularEtapa: avanza a la siguiente etapa cuando se completan los ítems de la actual', ()=>{
  const rol='Engineer';
  const items=ctx.getItemsMap('Ingreso',rol);
  const chk=items.map(it=>it.e==='Pre-ingreso'); // completa solo Pre-ingreso
  const hoy=new Date().toISOString().split('T')[0];
  assert.equal(ctx.calcularEtapa('Ingreso',rol,chk,hoy),'Primer día');
});

test('calcularEtapa: a partir de 14 días de ingreso, se considera onboarding completo aunque falten ítems', ()=>{
  const rol='Engineer';
  const items=ctx.getItemsMap('Ingreso',rol);
  const chkVacio=Array(items.length).fill(false);
  const hace20dias=new Date(Date.now()-20*86400000).toISOString().split('T')[0];
  assert.equal(ctx.calcularEtapa('Ingreso',rol,chkVacio,hace20dias),'Onboarding completo');
});

test('calcularEtapa: en Egreso, con todos los ítems completados llega a "Offboarding completo"', ()=>{
  const items=ctx.getItemsMap('Egreso','—');
  const chkCompleto=Array(items.length).fill(true);
  assert.equal(ctx.calcularEtapa('Egreso','—',chkCompleto,''),'Offboarding completo');
});
