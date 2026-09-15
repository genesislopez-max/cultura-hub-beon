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

// Un evento dirigido a UN grupo no tiene porcentaje del otro: nadie de ese
// otro grupo estaba invitado. Antes daba 0%, que se lee como "no fue nadie"
// cuando en realidad era "no correspondía" — un All Hands solo para Core Team
// mostraba 0% en Engineers & Tech.
test('pctPorGrupoAV: un evento dirigido a un grupo no tiene % del otro', ()=>{
  const ctx=ctxAV([
    P('Ana'),
    P('Jefa',{'Rol en empresa':'Founder'}),
  ]);
  const e=Object.values(ctx.agruparAVPorEvento([fila('Ana','All Hands','2026-08-19')]))[0];
  assert.equal(e.grupo,'Engineers & Tech');
  assert.equal(ctx.pctPorGrupoAV(e,'Engineers & Tech'),100);
  assert.equal(ctx.pctPorGrupoAV(e,'Core Team'),null);
});

// Pero en un evento abierto a todos, 0% sí significa que no fue nadie de ese
// grupo — ahí el dato es real y se tiene que mostrar.
test('pctPorGrupoAV: en un evento para todos, 0% sigue significando que no fue nadie', ()=>{
  const ctx=ctxAV([
    P('Ana'),
    P('Jefa',{'Rol en empresa':'Founder'}),
  ]);
  const e=Object.values(ctx.agruparAVPorEvento([fila('Ana','All Hands','2026-08-19','Todos')]))[0];
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

// ─── Nombres tipeados distinto ────────────────────────────────────────────────
// El nombre del asistente se carga a mano y no siempre coincide carácter a
// carácter con el de Personas. Antes solo se recortaban los espacios de los
// extremos, así que "ana perez" o "Ana  Perez" no se reconocían: no entraban al
// numerador (el % salía más bajo de lo real) y la misma persona cargada de dos
// formas contaba como dos asistentes.
test('nombreCanonicoAV: resuelve al nombre tal como figura en Personas', ()=>{
  const ctx=ctxAV([P('Ana Perez')]);
  assert.equal(ctx.nombreCanonicoAV('ana perez'),'Ana Perez');
  assert.equal(ctx.nombreCanonicoAV('ANA PEREZ'),'Ana Perez');
  assert.equal(ctx.nombreCanonicoAV('Ana  Perez'),'Ana Perez');
  assert.equal(ctx.nombreCanonicoAV('  Ana Perez  '),'Ana Perez');
  // Quien no está en Personas queda como vino (recortado): no se puede resolver
  assert.equal(ctx.nombreCanonicoAV(' Invitada Externa '),'Invitada Externa');
  assert.equal(ctx.nombreCanonicoAV(''),'');
});

test('un nombre tipeado distinto cuenta igual en el % y no duplica al asistente', ()=>{
  const ctx=ctxAV([P('Ana Perez'),P('Beto Gil'),P('Caro Diaz'),P('Dani Paz')]);
  const e=Object.values(ctx.agruparAVPorEvento([
    fila('ana perez','All Hands','2026-08-19'),
    fila('Ana  Perez','All Hands','2026-08-19'),  // la misma, tipeada distinto
    fila('BETO GIL','All Hands','2026-08-19'),
  ]))[0];
  assert.equal(e.asistentes.join('|'),'Ana Perez|Beto Gil'); // 2 personas, no 3
  assert.equal(ctx.pctPorGrupoAV(e,'Engineers & Tech'),50);  // 2 de 4
});

// ─── El % siempre acompañado del conteo ───────────────────────────────────────
// "31%" solo no se puede interpretar: no dice si fueron 12 de 39 o 60 de 194.
test('asistenciaPorGrupoAV: devuelve cuántos fueron y sobre cuántos', ()=>{
  const ctx=ctxAV([P('Ana'),P('Beto'),P('Caro'),P('Dani')]);
  const e=Object.values(ctx.agruparAVPorEvento([
    fila('Ana','All Hands','2026-08-19'),
    fila('Beto','All Hands','2026-08-19'),
  ]))[0];
  const a=ctx.asistenciaPorGrupoAV(e,'Engineers & Tech');
  assert.equal(a.asistieron,2);
  assert.equal(a.universo,4);
  assert.equal(a.pct,50);
  assert.equal(ctx.textoAsistenciaAV(a),'2 de 4 · 50%');
  assert.equal(ctx.textoAsistenciaAV(null),'—');
});

test('asistenciaPorGrupoAV: el conteo nunca supera el universo', ()=>{
  // Alguien que asistió pero cuyas fechas dicen que no estaba: entra a los dos
  // lados de la fracción, nunca solo al numerador (era la causa del 102%).
  const ctx=ctxAV([P('Ana'),P('Tarde',{'Fecha de ingreso':'2030-01-01'})]);
  const e=Object.values(ctx.agruparAVPorEvento([
    fila('Ana','All Hands','2026-08-19'),
    fila('Tarde','All Hands','2026-08-19'),
  ]))[0];
  const a=ctx.asistenciaPorGrupoAV(e,'Engineers & Tech');
  assert.ok(a.asistieron<=a.universo,`${a.asistieron} de ${a.universo}`);
  assert.equal(a.pct,100);
});
