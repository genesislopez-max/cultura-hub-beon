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

// La fecha de fin solo existe mientras el proyecto está inactivo. fechaFinAGuardar
// devuelve undefined cuando no hay nada que cambiar, para no tocar el campo en
// los guardados que no lo necesitan.
function ctxProy(){ return loadApp(['constants.js','state.js','utils.js','proyectos.js']); }

test('la fecha de fin se guarda solo al pasar a Inactivo',()=>{
  const c=ctxProy();
  const f=(estado,valor,previo)=>leer(c,`fechaFinAGuardar(${JSON.stringify(estado)},${JSON.stringify(valor)},${JSON.stringify(previo)})`);
  assert.equal(f('Inactivo','2025-06-30',null),'2025-06-30');   // se registra
  assert.equal(f('Inactivo','2025-06-30','2025-06-30'),undefined); // sin cambios: no se toca
  assert.equal(f('Activo','','2025-06-30'),null);                // vuelve a activo: se limpia
  assert.equal(f('Activo','',null),undefined);                   // activo de siempre: no se toca
  assert.equal(f('Inactivo','',null),undefined);                 // inactivo sin fecha: tampoco
  assert.equal(f('Inactivo','2025-07-01','2025-06-30'),'2025-07-01'); // se corrige
});

test('el campo de fecha de fin arranca visible solo si está inactivo',()=>{
  const c=ctxProy();
  assert.match(leer(c,'campoFechaFinProyecto("f-ep","Inactivo","2025-06-30")'),/display:block/);
  assert.match(leer(c,'campoFechaFinProyecto("f-ep","De Baja","")'),/display:block/); // heredado
  assert.match(leer(c,'campoFechaFinProyecto("f-ep","Activo","")'),/display:none/);
  assert.match(leer(c,'campoFechaFinProyecto("f-ep","Inactivo","2025-06-30")'),/value="2025-06-30"/);
});
