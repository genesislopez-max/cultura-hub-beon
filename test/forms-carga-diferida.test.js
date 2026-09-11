'use strict';
const test=require('node:test');
const assert=require('node:assert');
const vm=require('node:vm');
const {loadApp}=require('../test-helpers/load-app');

function ctxForms(){
  return loadApp(['constants.js','state.js','utils.js','personas.js','forms.js']);
}
function leer(ctx,expr){ return vm.runInContext(expr,ctx); }
// Los caches se declaran con `let`, así que no son propiedades del sandbox:
// hay que asignarlos desde adentro del contexto.
function sembrar(ctx,cache,datos){
  ctx.__fixture=datos;
  vm.runInContext(`${cache}=__fixture`,ctx);
}

const PERSONAS=[
  {id:'p1',fields:{Nombre:'Beto TEM','Rol en empresa':'TEM'}},
  {id:'p2',fields:{Nombre:'Ana TEM','Rol en empresa':' TEM '}},        // con espacios, como llega de Airtable
  {id:'p3',fields:{Nombre:'Dani Dev','Rol en empresa':'Engineer'}},
  {id:'p4',fields:{Nombre:'Eli Ex','Rol en empresa':'Engineer','Fecha de egreso':'2024-01-31'}},
  {id:'p5',fields:{Nombre:'Ana TEM','Rol en empresa':'TEM'}},          // duplicada
  {id:'p6',fields:{Nombre:'Caro Lead','Rol en empresa':'Lead'}},
  {id:'p7',fields:{Nombre:'Fede TEM','Rol en empresa':'TEM','Fecha de egreso':'2024-06-30'}}, // ya no está
];
const PROYECTOS=[
  {id:'r1',fields:{Proyecto:'Evvnt'}},                       // sin Estado: cuenta como vigente
  {id:'r2',fields:{Proyecto:'Atlas',Estado:'Activo'}},
  {id:'r3',fields:{Proyecto:'Atlas',Estado:'Activo'}},       // duplicado
  {id:'r4',fields:{}},                                        // sin nombre
  {id:'r5',fields:{Proyecto:'Viejo',Estado:'De Baja'}},
  {id:'r6',fields:{Proyecto:'Dormido',Estado:'Inactivo'}},
];

test('con los caches todavía vacíos las listas salen vacías en vez de explotar',()=>{
  const ctx=ctxForms();
  assert.equal(leer(ctx,'nombresPersonas().length'),0);
  assert.equal(leer(ctx,'proyectosDelCache().length'),0);
  // El form se puede armar igual: los selects quedan sin opciones, y es
  // montarFormPersona() quien los completa cuando llegan los datos.
  assert.match(leer(ctx,'buildPersonaCompletaHTML()'),/id="f-per-proyecto"/);
});

test('nombresPersonas ordena, deduplica y aplica el filtro',()=>{
  const ctx=ctxForms();
  sembrar(ctx,'cachePersonasRaw',PERSONAS);
  assert.equal(leer(ctx,'nombresPersonas().join("|")'),'Ana TEM|Beto TEM|Caro Lead|Dani Dev|Eli Ex|Fede TEM');
  assert.equal(leer(ctx,'nombresPersonas(esEngineerActivo).join("|")'),'Dani Dev'); // Eli Ex ya egresó
  assert.equal(leer(ctx,'nombresPersonas(esPersonaActiva).join("|")'),'Ana TEM|Beto TEM|Caro Lead|Dani Dev');
});

test('proyectosDelCache ordena, deduplica y descarta los vacíos',()=>{
  const ctx=ctxForms();
  sembrar(ctx,'cacheProyectosRaw',PROYECTOS);
  assert.equal(leer(ctx,'proyectosDelCache().join("|")'),'Atlas|Evvnt');
});

test('no se ofrecen proyectos dados de baja ni inactivos',()=>{
  const ctx=ctxForms();
  sembrar(ctx,'cacheProyectosRaw',PROYECTOS);
  assert.equal(leer(ctx,'proyectosDelCache().includes("Viejo")'),false);
  assert.equal(leer(ctx,'proyectosDelCache().includes("Dormido")'),false);
  // Pero el que la persona ya tenía cargado se conserva, aunque esté de baja:
  // degradarlo a "Otro (escribir a mano)" al editar haría parecer que está mal cargado.
  assert.equal(leer(ctx,'proyectosDelCache("Viejo").join("|")'),'Atlas|Evvnt|Viejo');
  assert.equal(leer(ctx,'proyectosDelCache("Atlas").join("|")'),'Atlas|Evvnt');
  assert.match(leer(ctx,'buildPersonaCompletaHTML({Proyecto:"Viejo"})'),/<option value="Viejo" selected>/);
});

test('no se ofrecen como Manager personas que ya no están en BEON',()=>{
  const ctx=ctxForms();
  sembrar(ctx,'cachePersonasRaw',PERSONAS);
  // Fede TEM ya pasó su último día: sale de la lista aunque su rol sea TEM.
  assert.equal(leer(ctx,'managersCandidatos("Engineer").join("|")'),'Ana TEM|Beto TEM');
  assert.equal(leer(ctx,'managersCandidatos("Core Team").join("|")'),'Caro Lead');
  // Un rol sin jerarquía definida no sugiere a nadie
  assert.equal(leer(ctx,'managersCandidatos("TEM").length'),0);
});

test('opcionesPersonas arma el placeholder y marca la seleccionada',()=>{
  const ctx=ctxForms();
  sembrar(ctx,'cachePersonasRaw',PERSONAS);
  const html=leer(ctx,'opcionesPersonas(esEngineerActivo,"Dani Dev")');
  assert.match(html,/<option value="">Seleccioná una persona…<\/option>/);
  assert.match(html,/<option value="Dani Dev" selected>/);
  assert.doesNotMatch(html,/Ana TEM/);
});

// Los forms que cargan algo NUEVO no deben ofrecer gente que ya no está en
// BEON. Los de eventos ya vividos (AW, Off Sites, Get Togethers) sí: se
// completan hacia atrás para recolectar info de quienes participaron.
test('los forms de carga nueva solo ofrecen gente que sigue en BEON',()=>{
  const ctx=ctxForms();
  sembrar(ctx,'cachePersonasRaw',PERSONAS);
  const opciones=nombre=>leer(ctx,`FORMS[${JSON.stringify(nombre)}].html()`);
  for(const form of ['egresos','checklist','reviews']){
    assert.doesNotMatch(opciones(form),/Eli Ex|Fede TEM/,
      `el form "${form}" ofrece gente que ya no está en BEON`);
  }
  assert.match(opciones('reviews'),/Dani Dev/);   // el Engineer activo sí
  assert.doesNotMatch(opciones('reviews'),/Ana TEM/); // pero no los que no son Engineer
  assert.match(opciones('checklist'),/Ana TEM/);
});

test('los forms de eventos ya vividos sí ofrecen a quienes ya no están',()=>{
  const ctx=ctxForms();
  sembrar(ctx,'cachePersonasRaw',PERSONAS);
  sembrar(ctx,'cacheAWRaw',[]);
  sembrar(ctx,'cacheGetTogetherRaw',[]);
  for(const form of ['ambassadors','offsites','gettogether']){
    assert.match(leer(ctx,`FORMS[${JSON.stringify(form)}].html()`),/Eli Ex/,
      `el form "${form}" debería listar también a quienes ya no están`);
  }
});

// Regresión del bug: "Nuevo ingreso" se abría con Proyecto y Manager vacíos
// porque el botón ya está clickeable mientras corre la carga inicial, y nadie
// rearmaba los selects cuando los datos llegaban. Cualquier form que arme sus
// opciones desde los caches tiene que declarar onMount para poder recuperarse.
test('todo form que lea los caches declara onMount',()=>{
  const ctx=ctxForms();
  const nombres=leer(ctx,'Object.keys(FORMS)');
  const dependeDeCaches=/cachePersonasRaw|nombresPersonas|opcionesPersonas|proyectosDelCache|buildPersonaCompletaHTML/;
  const sinOnMount=[];
  for(const nombre of nombres){
    const html=leer(ctx,`String(FORMS[${JSON.stringify(nombre)}].html)`);
    if(!dependeDeCaches.test(html)) continue;
    if(leer(ctx,`typeof FORMS[${JSON.stringify(nombre)}].onMount`)!=='function') sinOnMount.push(nombre);
  }
  assert.deepEqual(sinOnMount,[],
    `estos forms arman listas desde los caches pero no las rearman al llegar los datos: ${sinOnMount.join(', ')}`);
});
