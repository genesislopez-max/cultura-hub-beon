'use strict';
const test=require('node:test');
const assert=require('node:assert');
const vm=require('node:vm');
const {loadApp}=require('../test-helpers/load-app');

function ctx(){ return loadApp(['constants.js']); }
function leer(c,expr){ return vm.runInContext(expr,c); }

// Los proyectos tienen dos estados: Activo e Inactivo. "De Baja" era un tercero
// que significaba lo mismo que Inactivo — ya no se ofrece al cargar, pero se
// sigue reconociendo al leer mientras queden registros con ese valor en
// Airtable, para que no pasen por activos.
test('solo se ofrecen dos estados',()=>{
  assert.equal(leer(ctx(),'PROYECTO_ESTADOS.join("|")'),'Activo|Inactivo');
});

test('"De Baja" se lee como Inactivo',()=>{
  const c=ctx();
  assert.equal(leer(c,'normalizarEstadoProyecto("De Baja")'),'Inactivo');
  assert.equal(leer(c,'normalizarEstadoProyecto("Inactivo")'),'Inactivo');
  assert.equal(leer(c,'normalizarEstadoProyecto("Activo")'),'Activo');
  // Un proyecto sin estado cargado cuenta como activo, igual que antes
  assert.equal(leer(c,'normalizarEstadoProyecto("")'),'Activo');
  assert.equal(leer(c,'normalizarEstadoProyecto(undefined)'),'Activo');
});

test('proyectoVigente deja afuera tanto Inactivo como De Baja',()=>{
  const c=ctx();
  assert.equal(leer(c,'proyectoVigente({fields:{Estado:"Activo"}})'),true);
  assert.equal(leer(c,'proyectoVigente({fields:{}})'),true);
  assert.equal(leer(c,'proyectoVigente({fields:{Estado:"Inactivo"}})'),false);
  assert.equal(leer(c,'proyectoVigente({fields:{Estado:"De Baja"}})'),false);
});
