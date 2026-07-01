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
