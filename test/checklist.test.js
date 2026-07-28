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

test('getItemsMap: los ítems de Ingreso dados de baja siguen en el array pero inactivos', ()=>{
  const items=ctx.getItemsMap('Ingreso','Engineer');
  const bajas=['Registrar fecha de ingreso en Hub para bienvenida por #general','Registrar aniversario en Hub (reminder automático)','Registrar 4 meses de ingreso para pedir review Glassdoor','Agendar cumpleaños en Hub (reminder automático)','Agregar a planilla de Beneficios — Engineers'];
  for(const t of bajas){
    const item=items.find(it=>it.t===t);
    assert.ok(item,`el ítem "${t}" debería seguir en el array`);
    assert.equal(item.activo,false,`"${t}" debería estar marcado inactivo`);
  }
});

test('getItemsMap: los ítems de Brevo en Ingreso tienen link a la lista de contactos', ()=>{
  const items=ctx.getItemsMap('Ingreso','Engineer');
  const brevoItems=['Sumar a lista "Todos los BEONers" en Brevo','Sumar a lista latam / core team / brasil en Brevo','Sumar a lista por país en Brevo'];
  for(const t of brevoItems){
    const item=items.find(it=>it.t===t);
    assert.ok(item,`el ítem "${t}" debería existir`);
    assert.equal(item.l,'https://app.brevo.com/contact/list');
  }
});

test('getActiveIndexes: no incluye las posiciones de los ítems inactivos', ()=>{
  const items=ctx.getItemsMap('Ingreso','Engineer');
  const idxsInactivos=items.reduce((a,it,i)=>{if(it.activo===false)a.push(i);return a;},[]);
  assert.ok(idxsInactivos.length>0);
  const activos=ctx.getActiveIndexes('Ingreso','Engineer');
  for(const idx of idxsInactivos) assert.ok(!activos.includes(idx));
  assert.equal(activos.length,items.length-idxsInactivos.length);
});

test('contarProgreso: ítems inactivos marcados true en datos viejos no cuentan ni inflan el total', ()=>{
  const items=ctx.getItemsMap('Ingreso','Engineer');
  const idxsInactivos=items.reduce((a,it,i)=>{if(it.activo===false)a.push(i);return a;},[]);
  const chkSoloInactivos=items.map((_,i)=>idxsInactivos.includes(i)); // solo los inactivos en true
  const {comp,total}=ctx.contarProgreso('Ingreso','Engineer',chkSoloInactivos);
  assert.equal(comp,0);
  assert.equal(total,items.length-idxsInactivos.length);
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
  const bajas=['Fecha de offboarding registrada','Eliminar aniversario en Hub','Eliminar cumpleaños en Hub','Eliminar reminder de review Glassdoor (si aplica)','Sacar de la lista de mails del sheet accounting','Completar sheet métricas offboarding','Sacar de AI Tools','Eliminar de la planilla de Beneficios'];
  for(const t of bajas){
    const item=items.find(it=>it.t===t);
    assert.ok(item,`el ítem "${t}" debería seguir en el array`);
    assert.equal(item.activo,false,`"${t}" debería estar marcado inactivo`);
  }
});

test('getItemsMap: "Sacar del doc de Rewards Program", "Eliminar de Brevo", "Avisar a Billy" y "Eliminar del Hall of Fame" tienen link', ()=>{
  const items=ctx.getItemsMap('Egreso','—');
  const rewards=items.find(it=>it.t==='Sacar del doc de Rewards Program');
  const brevo=items.find(it=>it.t==='Eliminar de Brevo');
  const billy=items.find(it=>it.t==='Avisar a Billy');
  const hof=items.find(it=>it.t==='Eliminar del Hall of Fame');
  assert.equal(rewards.l,'https://docs.google.com/spreadsheets/d/1VzmvwzYDnBwEOfaai40kzZEbY_M311rpRI-YHndTOWc/edit?gid=304848196#gid=304848196');
  assert.equal(brevo.l,'https://app.brevo.com/contact/list');
  assert.equal(billy.l,'https://slack.com/app_redirect?channel=D04RDKVQGNR');
  assert.equal(hof.l,'https://sites.google.com/beon.studio/internalsite/loyalty-program/hall-of-fame?authuser=0');
});

test('getActiveIndexes: en Egreso no incluye las posiciones de los ítems dados de baja', ()=>{
  const items=ctx.getItemsMap('Egreso','—');
  const activos=ctx.getActiveIndexes('Egreso','—');
  const idxsInactivos=items.reduce((a,it,i)=>{if(it.activo===false)a.push(i);return a;},[]);
  assert.ok(idxsInactivos.length>0);
  for(const idx of idxsInactivos) assert.ok(!activos.includes(idx));
  assert.equal(activos.length,items.length-idxsInactivos.length);
});
