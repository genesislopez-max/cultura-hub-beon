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
];
const PROYECTOS=[
  {id:'r1',fields:{Proyecto:'Evvnt'}},
  {id:'r2',fields:{Proyecto:'Atlas'}},
  {id:'r3',fields:{Proyecto:'Atlas'}},
  {id:'r4',fields:{}},
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
  assert.equal(leer(ctx,'nombresPersonas().join("|")'),'Ana TEM|Beto TEM|Dani Dev|Eli Ex');
  assert.equal(leer(ctx,'nombresPersonas(esEngineer).join("|")'),'Dani Dev|Eli Ex');
  assert.equal(leer(ctx,'nombresPersonas(p=>!yaEgreso(p)).join("|")'),'Ana TEM|Beto TEM|Dani Dev');
});

test('proyectosDelCache ordena, deduplica y descarta los vacíos',()=>{
  const ctx=ctxForms();
  sembrar(ctx,'cacheProyectosRaw',PROYECTOS);
  assert.equal(leer(ctx,'proyectosDelCache().join("|")'),'Atlas|Evvnt');
});

test('opcionesPersonas arma el placeholder y marca la seleccionada',()=>{
  const ctx=ctxForms();
  sembrar(ctx,'cachePersonasRaw',PERSONAS);
  const html=leer(ctx,'opcionesPersonas(esEngineer,"Dani Dev")');
  assert.match(html,/<option value="">Seleccioná una persona…<\/option>/);
  assert.match(html,/<option value="Dani Dev" selected>/);
  assert.doesNotMatch(html,/Ana TEM/);
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
