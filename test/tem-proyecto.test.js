'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadApp}=require('../test-helpers/load-app');

// El TEM de un proyecto no es un campo de Proyectos: sale del campo "Manager"
// de la gente asignada a él. Por eso cambiarlo es reasignarle el TEM a esas
// personas — si se guardara aparte en Proyectos quedarían dos verdades
// distintas y la tabla de Engineers seguiría mostrando la vieja.

function ctxProyectos(){
  // personas.js aporta yaEgreso(); utils.js, normalizarNombre() y listaTEMs().
  return loadApp(['constants.js','state.js','utils.js','personas.js','proyectos.js'],
    {puedeEscribir:()=>true});
}
function leer(c,expr){ return vm.runInContext(expr,c); }
function sembrar(c,cache,datos){
  c.__fixture=datos;
  vm.runInContext(`${cache}=__fixture`,c);
}

const PERSONAS=[
  {id:'t1',fields:{Nombre:'Tina TEM','Rol en empresa':'TEM'}},
  {id:'t2',fields:{Nombre:'Tito TEM','Rol en empresa':'TEM'}},
  {id:'p1',fields:{Nombre:'Ana Dev','Rol en empresa':'Engineer',Proyecto:'Atlas',Manager:'Tina TEM'}},
  {id:'p2',fields:{Nombre:'Beto Dev','Rol en empresa':'Engineer',Proyecto:'Atlas',Manager:'Tina TEM'}},
  {id:'p3',fields:{Nombre:'Caro Dev','Rol en empresa':'Engineer',Proyecto:' atlas ',Manager:'Tito TEM'}}, // como llega de Airtable
  {id:'p4',fields:{Nombre:'Ex Dev','Rol en empresa':'Engineer',Proyecto:'Atlas',Manager:'Tina TEM','Fecha de egreso':'2024-01-01'}},
  {id:'p5',fields:{Nombre:'Dani Dev','Rol en empresa':'Engineer',Proyecto:'Evvnt',Manager:'Tina TEM'}},
  {id:'p6',fields:{Nombre:'Sin Tem','Rol en empresa':'Engineer',Proyecto:'Evvnt'}},
];

function conPersonas(){
  const c=ctxProyectos();
  sembrar(c,'cachePersonasRaw',PERSONAS);
  return c;
}

test('devsDeProyecto: solo la gente que sigue en BEON, sin importar espacios ni mayúsculas',()=>{
  const c=conPersonas();
  assert.equal(leer(c,'devsDeProyecto("Atlas").map(p=>p.fields.Nombre).join("|")'),'Ana Dev|Beto Dev|Caro Dev');
});

test('temsDeProyecto: lista los TEM distintos de su gente',()=>{
  const c=conPersonas();
  assert.equal(leer(c,'temsDeProyecto("Atlas").join("|")'),'Tina TEM|Tito TEM');
  assert.equal(leer(c,'temsDeProyecto("Evvnt").join("|")'),'Tina TEM'); // Sin Tem no aporta vacío
  assert.equal(leer(c,'temsDeProyecto("Ninguno").length'),0);
});

test('temProyectoTexto: un proyecto sin gente lo dice en vez de mostrar "TEM: "',()=>{
  const c=conPersonas();
  assert.equal(leer(c,'temProyectoTexto("Atlas")'),'TEM: Tina TEM, Tito TEM');
  assert.equal(leer(c,'temProyectoTexto("Vacio")'),'Sin TEM asignado');
});

// Quien ya tiene ese TEM no se toca: así el aviso no promete un cambio que no
// va a pasar, y no se mandan PATCH de más.
test('personasACambiarTem: deja afuera a quien ya tiene ese TEM',()=>{
  const c=conPersonas();
  c.__marcados=new Set(['Ana Dev','Beto Dev','Caro Dev']);
  assert.equal(
    leer(c,'personasACambiarTem("Atlas","Tito TEM",__marcados).map(p=>p.fields.Nombre).join("|")'),
    'Ana Dev|Beto Dev');
});

test('personasACambiarTem: solo toca a los tildados',()=>{
  const c=conPersonas();
  c.__marcados=new Set(['Ana Dev']);
  assert.equal(
    leer(c,'personasACambiarTem("Atlas","Tito TEM",__marcados).map(p=>p.fields.Nombre).join("|")'),
    'Ana Dev');
});

test('personasACambiarTem: sin TEM elegido no se cambia nada',()=>{
  const c=conPersonas();
  c.__marcados=new Set(['Ana Dev','Beto Dev','Caro Dev']);
  assert.equal(leer(c,'personasACambiarTem("Atlas","",__marcados).length'),0);
});

test('personasACambiarTem: no se mete con la gente de otro proyecto ni con quien ya no está',()=>{
  const c=conPersonas();
  // Aunque estuvieran tildados, no son de Atlas (Dani) o ya se fueron (Ex Dev)
  c.__marcados=new Set(['Ana Dev','Dani Dev','Ex Dev']);
  assert.equal(
    leer(c,'personasACambiarTem("Atlas","Tito TEM",__marcados).map(p=>p.fields.Nombre).join("|")'),
    'Ana Dev');
});

test('bloqueTemProyectoHtml: un proyecto sin gente asignada explica por qué no hay nada que elegir',()=>{
  const c=conPersonas();
  const html=leer(c,'bloqueTemProyectoHtml("Vacio")');
  assert.ok(!/id="f-ep-tem"/.test(html),'no debería ofrecer el selector');
  assert.match(html,/se define al asignarle devs/);
});

test('bloqueTemProyectoHtml: con un solo TEM lo deja preseleccionado; con varios, no elige por vos',()=>{
  const c=conPersonas();
  assert.match(leer(c,'bloqueTemProyectoHtml("Evvnt")'),/value="Tina TEM" selected/);
  assert.ok(!/ selected/.test(leer(c,'bloqueTemProyectoHtml("Atlas")')),
    'con dos TEM distintos no puede dar uno por bueno');
});
