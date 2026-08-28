'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadApp}=require('../test-helpers/load-app');

const ctx=loadApp(['utils.js','api.js','ingresos-egresos.js']);

function mockAirtable(ctx,{checklistRecs=[]}={}){
  const posts=[];
  ctx.atGet=async(table)=>{
    if(table==='Checklist') return {records:checklistRecs};
    return {records:[]};
  };
  ctx.atPost=async(table,fields)=>{ posts.push({table,fields}); return {records:[{id:'recNEW'}]}; };
  ctx.atPatch=async()=>({});
  return posts;
}

test('sincronizarPersonasEnKanban: una carga histórica (con Fecha de egreso) no crea checklist ni Slack', async()=>{
  const posts=mockAirtable(ctx);
  const slackCalls=[];
  ctx.sendSlack=async text=>slackCalls.push(text);
  await ctx.sincronizarPersonasEnKanban([
    {id:'p1',fields:{Nombre:'Vieja Empleada','Fecha de ingreso':'2020-01-01','Fecha de egreso':'2021-01-01'}},
  ]);
  assert.equal(posts.length,0);
  assert.equal(slackCalls.length,0);
});

test('sincronizarPersonasEnKanban: una persona nueva sin Fecha de egreso sí crea checklist y Slack', async()=>{
  const posts=mockAirtable(ctx);
  const slackCalls=[];
  ctx.sendSlack=async text=>slackCalls.push(text);
  await ctx.sincronizarPersonasEnKanban([
    {id:'p2',fields:{Nombre:'Nuevo Ingreso','Fecha de ingreso':'2026-07-14'}},
  ]);
  assert.equal(posts.length,1);
  assert.equal(posts[0].table,'Checklist');
  assert.equal(posts[0].fields.Persona,'Nuevo Ingreso');
  assert.equal(slackCalls.length,1);
  assert.match(slackCalls[0],/Nuevo ingreso registrado/);
});

test('sincronizarPersonasEnKanban: una persona que YA tiene checklist se actualiza en silencio aunque tenga Fecha de egreso (egreso real, no histórico)', async()=>{
  const posts=mockAirtable(ctx,{checklistRecs:[
    {id:'chk1',fields:{Persona:'Ya Egreso Real',Proyecto:''}},
  ]});
  const slackCalls=[];
  ctx.sendSlack=async text=>slackCalls.push(text);
  await ctx.sincronizarPersonasEnKanban([
    {id:'p3',fields:{Nombre:'Ya Egreso Real','Fecha de ingreso':'2022-01-01','Fecha de egreso':'2026-07-01',Proyecto:'Atlas'}},
  ]);
  // No se crea un checklist nuevo (POST a Checklist) porque ya existía
  assert.equal(posts.filter(p=>p.table==='Checklist').length,0);
  assert.equal(slackCalls.length,0);
});

// ─── Último día vs fecha de aviso ─────────────────────────────────────────────
// Un offboarding tiene dos fechas y viven en tablas distintas: el AVISO en el
// campo "Fecha" del registro de Checklist, y el ÚLTIMO DÍA en Personas
// ["Fecha de egreso"]. La tarjeta del Kanban mostraba la de aviso con el label
// "Fecha de salida", así que no coincidía con lo que se había cargado en el
// form (ej. tarjeta 27/08 contra 29/08 cargado).
const vm=require('node:vm');
function setPersonas(personas){
  vm.runInContext('cachePersonasRaw=__p',Object.assign(ctx,{__p:personas}));
}

test('ultimoDiaDeEgreso: toma la Fecha de egreso de Personas, no el aviso del Checklist', ()=>{
  setPersonas([{id:'p1',fields:{Nombre:'Braulio Trigueros','Fecha de egreso':'2026-08-29'}}]);
  const rec={id:'chk1',fields:{Persona:'Braulio Trigueros',Fecha:'2026-08-27'}};
  assert.equal(ctx.ultimoDiaDeEgreso(rec),'2026-08-29');
});

test('ultimoDiaDeEgreso: matchea el nombre ignorando espacios de más', ()=>{
  setPersonas([{id:'p1',fields:{Nombre:'Ana Perez','Fecha de egreso':'2026-05-10'}}]);
  assert.equal(ctx.ultimoDiaDeEgreso({fields:{Persona:'  Ana Perez  ',Fecha:'2026-01-01'}}),'2026-05-10');
});

// Sin fallback, una tarjeta cuya persona no está en Personas ordenaría con ''
// y quedaría siempre al fondo de la columna.
test('ultimoDiaDeEgreso: si la persona no está en Personas, cae al aviso', ()=>{
  setPersonas([]);
  assert.equal(ctx.ultimoDiaDeEgreso({fields:{Persona:'Fantasma',Fecha:'2026-03-03'}}),'2026-03-03');
});

test('ultimoDiaDeEgreso: sin ninguna de las dos fechas devuelve string vacío, no undefined', ()=>{
  setPersonas([{id:'p1',fields:{Nombre:'Sin Fechas'}}]);
  assert.equal(ctx.ultimoDiaDeEgreso({fields:{Persona:'Sin Fechas'}}),'');
});

// El orden de "Offboarding completo" mezcla tarjetas de Checklist con cargas
// históricas. Comparar el aviso de una contra el último día de la otra daba un
// orden mal: acá el aviso de Braulio (enero) es muy anterior a su salida
// (agosto), y sin el arreglo quedaba debajo de la histórica de marzo.
test('ordenar "Offboarding completo": las dos fuentes se comparan por último día', ()=>{
  setPersonas([{id:'p1',fields:{Nombre:'Braulio','Fecha de egreso':'2026-08-29'}}]);
  const deChecklist=[{id:'chk1',fields:{Persona:'Braulio',Fecha:'2026-01-15'}}];
  const historicos=[{id:'p2',fields:{Nombre:'Vieja Historica','Fecha de egreso':'2026-03-01'}}];
  const completos=[
    ...deChecklist.map(r=>({fecha:ctx.ultimoDiaDeEgreso(r),nombre:r.fields.Persona})),
    ...historicos.map(p=>({fecha:p.fields['Fecha de egreso'],nombre:p.fields.Nombre})),
  ].sort((a,b)=>b.fecha.localeCompare(a.fecha));
  assert.deepEqual(completos.map(c=>c.nombre),['Braulio','Vieja Historica']);
});
