'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadApp}=require('../test-helpers/load-app');

// state.js aporta clState/recMeta/cachePersonasRaw, que deleteIngreso limpia.
const ctx=loadApp(['constants.js','state.js','utils.js','api.js','ingresos-egresos.js']);

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

// ─── Protección al borrar un ingreso ──────────────────────────────────────────
// El botón de la papelera en una tarjeta de Ingreso está pensado para cancelar
// un alta cargada por error, y por eso borra también el registro de Personas.
// Pero el mismo botón se puede apretar sobre alguien que sí trabajó en BEON:
// pasó, y una persona con su offboarding completo desapareció de Personas,
// dejando su tarjeta de Egreso huérfana (sin correo, país ni último día).
function mockBorrado(ctx,{personas=[],checklistEgreso=[],fallaConsulta=false}={}){
  const borrados=[];
  vm.runInContext('cachePersonasRaw=__p',Object.assign(ctx,{__p:personas}));
  ctx.atGet=async(table,qs)=>{
    if(table==='Checklist'){
      if(fallaConsulta) throw new Error('Airtable caído');
      return {records:checklistEgreso};
    }
    if(table==='Personas') return {records:personas};
    return {records:[]};
  };
  ctx.atDelete=async(table,id)=>{ borrados.push({table,id}); };
  ctx.atDeleteBatch=async(table,ids)=>{ ids.forEach(id=>borrados.push({table,id})); };
  ctx.toast=()=>{};
  ctx.loadAll=async()=>{};
  return borrados;
}

test('deleteIngreso: un alta cancelada (sin historial) sí borra a la persona', async()=>{
  const borrados=mockBorrado(ctx,{personas:[{id:'pNUEVO',fields:{Nombre:'Alta Erronea'}}]});
  await ctx.deleteIngreso('chk1','Alta Erronea');
  assert.ok(borrados.some(b=>b.table==='Checklist'&&b.id==='chk1'));
  assert.ok(borrados.some(b=>b.table==='Personas'&&b.id==='pNUEVO'));
});

// El caso real: tenía offboarding cargado, así que trabajó en BEON.
test('deleteIngreso: con un Checklist de Egreso, NO borra a la persona', async()=>{
  const borrados=mockBorrado(ctx,{
    personas:[{id:'pREAL',fields:{Nombre:'Cesar Welchez'}}],
    checklistEgreso:[{id:'chkEgreso',fields:{Persona:'Cesar Welchez',Tipo:'Egreso'}}],
  });
  await ctx.deleteIngreso('chk1','Cesar Welchez');
  assert.ok(borrados.some(b=>b.table==='Checklist'&&b.id==='chk1')); // la tarjeta sí
  assert.equal(borrados.filter(b=>b.table==='Personas').length,0);   // la persona no
  assert.equal(borrados.filter(b=>b.table==='Eventos').length,0);    // sus eventos tampoco
});

test('deleteIngreso: con Fecha de egreso cargada, NO borra a la persona', async()=>{
  const borrados=mockBorrado(ctx,{
    personas:[{id:'pREAL',fields:{Nombre:'Ya Se Va','Fecha de egreso':'2026-12-01'}}],
  });
  await ctx.deleteIngreso('chk1','Ya Se Va');
  assert.equal(borrados.filter(b=>b.table==='Personas').length,0);
});

// Ante la duda no se borra: recuperar un registro perdido cuesta mucho más que
// volver a borrarlo si de verdad hacía falta.
test('deleteIngreso: si no se puede verificar el historial, no borra a la persona', async()=>{
  const borrados=mockBorrado(ctx,{
    personas:[{id:'pX',fields:{Nombre:'Dudoso'}}],
    fallaConsulta:true,
  });
  await ctx.deleteIngreso('chk1','Dudoso');
  assert.equal(borrados.filter(b=>b.table==='Personas').length,0);
});

test('tieneHistorialEnBeon: el nombre matchea sin importar mayúsculas ni espacios', async()=>{
  mockBorrado(ctx,{checklistEgreso:[{id:'c',fields:{Persona:'Cesar Welchez',Tipo:'Egreso'}}]});
  assert.equal(await ctx.tieneHistorialEnBeon('  Cesar Welchez  ',null),true);
});
