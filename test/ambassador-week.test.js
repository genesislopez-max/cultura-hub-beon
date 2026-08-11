'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadApp}=require('../test-helpers/load-app');

const ctx=loadApp(['constants.js','ambassador-week.js']);

test('calcPctVuelo: primera vez de una persona de nivel Spark, cubre 50% del vuelo', ()=>{
  assert.equal(ctx.calcPctVuelo('Juan','Spark',[]),50);
});

test('calcPctVuelo: Spark ya usó su única cobertura con vuelo, la próxima es 0%', ()=>{
  const historial=[{fields:{Persona:'Juan'}}];
  assert.equal(ctx.calcPctVuelo('Juan','Spark',historial),0);
});

test('calcPctVuelo: Thunder tiene 2 asistencias con vuelo antes de perder la cobertura', ()=>{
  const unaAsistencia=[{fields:{Persona:'Juan'}}];
  assert.equal(ctx.calcPctVuelo('Juan','Thunder',unaAsistencia),50);
  const dosAsistencias=[{fields:{Persona:'Juan'}},{fields:{Persona:'Juan'}}];
  assert.equal(ctx.calcPctVuelo('Juan','Thunder',dosAsistencias),0);
});

test('calcPctVuelo: Storm siempre cubre 50%, sin importar el historial', ()=>{
  const historialLargo=[{fields:{Persona:'Juan'}},{fields:{Persona:'Juan'}},{fields:{Persona:'Juan'}}];
  assert.equal(ctx.calcPctVuelo('Juan','Storm',historialLargo),50);
});

test('calcPctVuelo: solo cuenta el historial de la misma persona (linked record como array)', ()=>{
  const historial=[{fields:{Persona:['Otra Persona']}}];
  assert.equal(ctx.calcPctVuelo('Juan','Spark',historial),50);
});

test('getEdicionAW: acepta variantes con y sin acento del nombre del campo', ()=>{
  assert.equal(ctx.getEdicionAW({'Edición AW':'diciembre 2021'}),'diciembre 2021');
  assert.equal(ctx.getEdicionAW({'Edicion AW':'marzo 2022'}),'marzo 2022');
  assert.equal(ctx.getEdicionAW({}),'');
});

// ─── Nivel Loyalty sucio (caso reportado) ─────────────────────────────────────
// AW_RULES se indexa por nivel, así que un "Thunder " con un espacio de más —
// como se carga a mano en Airtable — no matcheaba ninguna regla y caía al
// fallback de Spark: la persona figuraba con 1 sola asistencia con vuelo en
// vez de 2 y el Hub le decía "Sin cobertura de vuelo" cuando todavía le tocaba.
const ctxNivel=loadApp(['constants.js','state.js','utils.js','personas.js','ambassador-week.js']);

test('normalizarNivel: limpia espacios y capitalización de "Nivel Loyalty"', ()=>{
  assert.equal(ctxNivel.normalizarNivel('Thunder '),'Thunder');
  assert.equal(ctxNivel.normalizarNivel(' thunder'),'Thunder');
  assert.equal(ctxNivel.normalizarNivel('THUNDER'),'Thunder');
  assert.equal(ctxNivel.normalizarNivel('Thunder'),'Thunder');
});

test('normalizarNivel: un nivel irreconocible o vacío cae en Spark', ()=>{
  assert.equal(ctxNivel.normalizarNivel(''),'Spark');
  assert.equal(ctxNivel.normalizarNivel(undefined),'Spark');
  assert.equal(ctxNivel.normalizarNivel('Tormenta'),'Spark');
});

test('AW_RULES: Thunder normalizado da 2 asistencias con vuelo, sin normalizar ninguna', ()=>{
  // AW_RULES es un const del script, así que no aparece como propiedad del
  // sandbox — hay que evaluarlo adentro del contexto.
  const vm=require('node:vm');
  assert.equal(vm.runInContext(`AW_RULES[normalizarNivel('Thunder ')].asistenciasConVuelo`,ctxNivel),2);
  // La causa del bug: indexar con el valor crudo no encuentra regla
  assert.equal(vm.runInContext(`AW_RULES['Thunder ']===undefined`,ctxNivel),true);
});

test('calcPctVuelo: Thunder con 1 asistencia previa todavía tiene 50% de vuelo', ()=>{
  const historial=[{fields:{Persona:'Thalisson Barbosa'}}];
  assert.equal(ctxNivel.calcPctVuelo('Thalisson Barbosa','Thunder',historial),50);
  // Recién con 2 previas se queda sin cobertura
  assert.equal(ctxNivel.calcPctVuelo('Thalisson Barbosa','Thunder',[...historial,{fields:{Persona:'Thalisson Barbosa'}}]),0);
});

test('calcPctVuelo: con el nivel crudo se pierde la 2da cobertura de Thunder', ()=>{
  const historial=[{fields:{Persona:'Thalisson Barbosa'}}];
  // Deja constancia de por qué el nivel tiene que pasar por normalizarNivel()
  assert.equal(ctxNivel.calcPctVuelo('Thalisson Barbosa','Thunder ',historial),0);
  assert.equal(ctxNivel.calcPctVuelo('Thalisson Barbosa',ctxNivel.normalizarNivel('Thunder '),historial),50);
});
