'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadApp}=require('../test-helpers/load-app');

// El % de asistencia a actividades podía dar más de 100% ("All Hands Meeting
// Q3: 43 asistentes, 102%"). Eran dos causas independientes:
//
//  1. Denominador asimétrico: el numerador contaba a todo asistente del grupo,
//     el denominador solo a los activos según las fechas de ingreso/egreso de
//     Personas. Quien asistió pero cuyas fechas dicen que no estaba sumaba
//     arriba y no abajo.
//  2. Asistentes sin deduplicar: agruparAVPorEvento acumulaba una entrada por
//     registro, y con carga manual es normal que haya dos filas de la misma
//     persona para el mismo evento.
function ctxAV(personas){
  const c=loadApp(['constants.js','state.js','utils.js','personas.js','actividades-virtuales.js']);
  vm.runInContext('cachePersonasRaw=__p',Object.assign(c,{__p:personas}));
  return c;
}

const P=(nombre,extra={})=>({id:'rec'+nombre.replace(/\W/g,''),fields:{Nombre:nombre,'Rol en empresa':'Engineer','Fecha de ingreso':'2020-01-01',...extra}});
const fila=(persona,evento,fecha,grupo)=>({fields:{Persona:persona,Evento:evento,Fecha:fecha,Grupo:grupo||'Engineers & Tech'}});

// ─── Deduplicación ────────────────────────────────────────────────────────────
test('agruparAVPorEvento: dos registros de la misma persona cuentan como un asistente', ()=>{
  const ctx=ctxAV([P('Ana'),P('Beto')]);
  const eventos=ctx.agruparAVPorEvento([
    fila('Ana','All Hands','2026-08-19'),
    fila('Ana','All Hands','2026-08-19'), // duplicado de carga manual
    fila('Beto','All Hands','2026-08-19'),
  ]);
  const e=Object.values(eventos)[0];
  assert.equal(e.asistentes.length,2);
  assert.equal(e.asistentes.join('|'),'Ana|Beto');
});

test('agruparAVPorEvento: el nombre se recorta, así "Ana " y "Ana" no son dos', ()=>{
  const ctx=ctxAV([P('Ana')]);
  const e=Object.values(ctx.agruparAVPorEvento([
    fila('Ana','All Hands','2026-08-19'),
    fila(' Ana ','All Hands','2026-08-19'),
  ]))[0];
  assert.equal(e.asistentes.length,1);
});

test('agruparAVPorEvento: la misma persona en dos eventos distintos cuenta en cada uno', ()=>{
  const ctx=ctxAV([P('Ana')]);
  const eventos=ctx.agruparAVPorEvento([
    fila('Ana','All Hands','2026-08-19'),
    fila('Ana','Retro','2026-09-01'),
  ]);
  assert.equal(Object.keys(eventos).length,2);
  Object.values(eventos).forEach(e=>assert.equal(e.asistentes.length,1));
});

// ─── El caso reportado ────────────────────────────────────────────────────────
// Alguien que asistió pero que ingresó DESPUÉS de la fecha del evento: el dato
// de asistencia es la evidencia fuerte, la fecha cargada a mano puede estar mal.
test('pctPorGrupoAV: quien asistió entra al denominador aunque sus fechas digan que no estaba', ()=>{
  const ctx=ctxAV([
    P('Ana'),
    P('Beto'),
    P('Nueva',{'Fecha de ingreso':'2026-12-01'}), // ingresó después del evento
  ]);
  const e=Object.values(ctx.agruparAVPorEvento([
    fila('Ana','All Hands','2026-08-19'),
    fila('Beto','All Hands','2026-08-19'),
    fila('Nueva','All Hands','2026-08-19'),
  ]))[0];
  // Sin el arreglo: 3 asistentes / 2 activos = 150%
  assert.equal(ctx.pctPorGrupoAV(e,'Engineers & Tech'),100);
});

test('pctPorGrupoAV: quien ya se había ido pero figura como asistente tampoco pasa de 100%', ()=>{
  const ctx=ctxAV([
    P('Ana'),
    P('Ex Beoner',{'Fecha de egreso':'2026-01-01'}),
  ]);
  const e=Object.values(ctx.agruparAVPorEvento([
    fila('Ana','All Hands','2026-08-19'),
    fila('Ex Beoner','All Hands','2026-08-19'),
  ]))[0];
  assert.equal(ctx.pctPorGrupoAV(e,'Engineers & Tech'),100);
});

// La red de seguridad general: ningún dato debe producir más de 100%.
test('pctPorGrupoAV: nunca supera 100%, ni con duplicados y fechas inconsistentes juntos', ()=>{
  const ctx=ctxAV([
    P('Ana'),
    P('Nueva',{'Fecha de ingreso':'2026-12-01'}),
    P('Ex',{'Fecha de egreso':'2026-01-01'}),
  ]);
  const e=Object.values(ctx.agruparAVPorEvento([
    fila('Ana','All Hands','2026-08-19'),
    fila('Ana','All Hands','2026-08-19'),
    fila('Nueva','All Hands','2026-08-19'),
    fila('Ex','All Hands','2026-08-19'),
    fila('Ex','All Hands','2026-08-19'),
  ]))[0];
  const pct=ctx.pctPorGrupoAV(e,'Engineers & Tech');
  assert.ok(pct<=100,`dio ${pct}%`);
  assert.equal(pct,100);
});

// ─── Que siga midiendo de verdad ──────────────────────────────────────────────
// El arreglo no puede degenerar en "siempre 100%": quien no fue tiene que
// seguir bajando el porcentaje.
test('pctPorGrupoAV: los ausentes bajan el porcentaje', ()=>{
  const ctx=ctxAV([P('Ana'),P('Beto'),P('Caro'),P('Dani')]);
  const e=Object.values(ctx.agruparAVPorEvento([
    fila('Ana','All Hands','2026-08-19'),
    fila('Beto','All Hands','2026-08-19'),
  ]))[0];
  assert.equal(ctx.pctPorGrupoAV(e,'Engineers & Tech'),50);
});

test('pctPorGrupoAV: separa por grupo — un evento de Engineers da 0% en Core Team', ()=>{
  const ctx=ctxAV([
    P('Ana'),
    P('Jefa',{'Rol en empresa':'Founder'}),
  ]);
  const e=Object.values(ctx.agruparAVPorEvento([fila('Ana','All Hands','2026-08-19')]))[0];
  assert.equal(ctx.pctPorGrupoAV(e,'Engineers & Tech'),100);
  assert.equal(ctx.pctPorGrupoAV(e,'Core Team'),0);
});

test('pctPorGrupoAV: sin nadie en el grupo devuelve null, no una división por cero', ()=>{
  const ctx=ctxAV([P('Ana')]);
  const e=Object.values(ctx.agruparAVPorEvento([fila('Ana','All Hands','2026-08-19')]))[0];
  assert.equal(ctx.pctPorGrupoAV(e,'Core Team'),null);
});

// Un asistente que no existe en Personas no se puede clasificar por grupo, así
// que no debe mover el porcentaje en ninguna dirección.
test('pctPorGrupoAV: un asistente que no está en Personas no altera el porcentaje', ()=>{
  const ctx=ctxAV([P('Ana'),P('Beto')]);
  const e=Object.values(ctx.agruparAVPorEvento([
    fila('Ana','All Hands','2026-08-19'),
    fila('Fantasma','All Hands','2026-08-19'),
  ]))[0];
  assert.equal(ctx.pctPorGrupoAV(e,'Engineers & Tech'),50); // 1 de 2, no 2 de 2
});

// ─── Porcentaje por persona ───────────────────────────────────────────────────
test('eventosElegiblesAV: un evento al que asistió entra aunque caiga fuera de su período activo', ()=>{
  const ctx=ctxAV([P('Nueva',{'Fecha de ingreso':'2026-12-01'})]);
  const persona=vm.runInContext('cachePersonasRaw[0]',ctx);
  const eventos=[{evento:'All Hands',fecha:'2026-08-19',grupo:'Engineers & Tech'}];
  const asistio=[{evento:'All Hands',fecha:'2026-08-19'}];
  assert.equal(ctx.eventosElegiblesAV(persona,eventos,asistio).length,1);
  // y si no asistió, ese evento no le cuenta como posible
  assert.equal(ctx.eventosElegiblesAV(persona,eventos,[]).length,0);
});

test('eventosElegiblesAV: sin persona en Personas, todos los eventos son elegibles', ()=>{
  const ctx=ctxAV([]);
  const eventos=[{evento:'A',fecha:'2026-01-01',grupo:'Todos'},{evento:'B',fecha:'2026-02-01',grupo:'Todos'}];
  assert.equal(ctx.eventosElegiblesAV(null,eventos,[]).length,2);
});

test('eventosDistintosAV: dos registros del mismo evento cuentan uno', ()=>{
  const ctx=ctxAV([]);
  assert.equal(ctx.eventosDistintosAV([
    {evento:'All Hands',fecha:'2026-08-19'},
    {evento:'All Hands',fecha:'2026-08-19'},
    {evento:'Retro',fecha:'2026-09-01'},
  ]),2);
  assert.equal(ctx.eventosDistintosAV([]),0);
  assert.equal(ctx.eventosDistintosAV(undefined),0);
});

// El % por persona tampoco puede pasar de 100 con registros duplicados.
test('% por persona: duplicados no lo llevan arriba de 100%', ()=>{
  const ctx=ctxAV([P('Ana')]);
  const persona=vm.runInContext('cachePersonasRaw[0]',ctx);
  const eventos=[{evento:'All Hands',fecha:'2026-08-19',grupo:'Engineers & Tech'}];
  const asistio=[{evento:'All Hands',fecha:'2026-08-19'},{evento:'All Hands',fecha:'2026-08-19'}];
  const elegibles=ctx.eventosElegiblesAV(persona,eventos,asistio).length;
  const pct=Math.round(ctx.eventosDistintosAV(asistio)/elegibles*100);
  assert.equal(pct,100);
});
