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

test('getItemsMap: el ítem de accounting da de baja queda marcado inactivo, no eliminado', ()=>{
  const items=ctx.getItemsMap('Ingreso','Engineer');
  const item=items.find(it=>it.t.includes('sheet accounting'));
  assert.ok(item,'el ítem debería seguir en el array (para no correr los índices ya guardados)');
  assert.equal(item.activo,false);
});

test('getActiveIndexes: no incluye la posición del ítem inactivo', ()=>{
  const items=ctx.getItemsMap('Ingreso','Engineer');
  const idxInactivo=items.findIndex(it=>it.activo===false);
  const activos=ctx.getActiveIndexes('Ingreso','Engineer');
  assert.ok(!activos.includes(idxInactivo));
  assert.equal(activos.length,items.length-1);
});

test('contarProgreso: un ítem inactivo marcado true en datos viejos no cuenta ni infla el total', ()=>{
  const items=ctx.getItemsMap('Ingreso','Engineer');
  const idxInactivo=items.findIndex(it=>it.activo===false);
  const chkTodoFalseMenosInactivo=items.map((_,i)=>i===idxInactivo); // solo el inactivo en true
  const {comp,total}=ctx.contarProgreso('Ingreso','Engineer',chkTodoFalseMenosInactivo);
  assert.equal(comp,0);
  assert.equal(total,items.length-1);
});

test('contarProgreso: da 100% cuando todos los ítems activos están en true, sin depender del inactivo', ()=>{
  const items=ctx.getItemsMap('Ingreso','Engineer');
  const activos=ctx.getActiveIndexes('Ingreso','Engineer');
  const chk=items.map((_,i)=>activos.includes(i)); // activos en true, inactivo queda en false
  const {pct}=ctx.contarProgreso('Ingreso','Engineer',chk);
  assert.equal(pct,100);
});

test('calcularEtapa: el ítem inactivo no bloquea el avance de etapa aunque esté sin marcar', ()=>{
  const rol='Engineer';
  const items=ctx.getItemsMap('Ingreso',rol);
  // Marca como completos todos los de Pre-ingreso EXCEPTO el inactivo (que queda sin marcar)
  const chk=items.map(it=>it.e==='Pre-ingreso'&&it.activo!==false);
  const hoy=new Date().toISOString().split('T')[0];
  assert.equal(ctx.calcularEtapa('Ingreso',rol,chk,hoy),'Primer día');
});

// Ítems de Egreso dados de baja: ya automáticos en el Hub (Cumpleaños/
// Aniversarios/Glassdoor) o procesos que ya no se usan (sheet de accounting,
// métricas de offboarding). Quedan en el array (activo:false) para no correr
// los índices de checklists de Egreso ya guardados.
test('getItemsMap: los ítems de Egreso dados de baja siguen en el array pero inactivos', ()=>{
  const items=ctx.getItemsMap('Egreso','—');
  const bajas=['Eliminar aniversario en Hub','Eliminar cumpleaños en Hub','Eliminar reminder de review Glassdoor (si aplica)','Sacar de la lista de mails del sheet accounting','Completar sheet métricas offboarding'];
  for(const t of bajas){
    const item=items.find(it=>it.t===t);
    assert.ok(item,`el ítem "${t}" debería seguir en el array`);
    assert.equal(item.activo,false,`"${t}" debería estar marcado inactivo`);
  }
});

test('getActiveIndexes: en Egreso no incluye las posiciones de los ítems dados de baja', ()=>{
  const items=ctx.getItemsMap('Egreso','—');
  const activos=ctx.getActiveIndexes('Egreso','—');
  const idxsInactivos=items.reduce((a,it,i)=>{if(it.activo===false)a.push(i);return a;},[]);
  assert.ok(idxsInactivos.length>0);
  for(const idx of idxsInactivos) assert.ok(!activos.includes(idx));
  assert.equal(activos.length,items.length-idxsInactivos.length);
});
