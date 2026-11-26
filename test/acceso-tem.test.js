'use strict';
// Qué ve un TEM. El TEM acompaña a los devs: Inicio, Engineers & Tech,
// Cumpleaños, Aniversarios y Beneficios —solo los de Engineers— y nada más.
//
// La parte de Beneficios se verifica en el servidor (ver
// test/api-airtable-proxy.test.js): el menú del cliente esconde secciones,
// pero lo que protege los datos es que el proxy no los mande.
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadApp}=require('../test-helpers/load-app');

function ctxTem(){
  return loadApp(['constants.js','utils.js','state.js','auth.js','beneficios.js']);
}
function permisos(ctx){ return vm.runInContext('SECCION_ROLES_PERMITIDOS',ctx); }

// Todas las secciones del Hub. Si mañana se agrega una y no se la pone acá, el
// test de abajo la detecta: una sección sin entrada en la lista blanca la ve
// TODO el mundo, que es el modo en que este permiso se rompería en silencio.
const SECCIONES=['inicio','engineers','cumpleanos','aniversarios','beneficios',
  'coreteam','proyectos','tareas','ingresos','egresos','exbeoners','reviews',
  'ambassadors','offsites','gettogether','actividades','eventoshist'];
const TEM_VE=new Set(['inicio','engineers','cumpleanos','aniversarios','beneficios']);

test('el TEM ve exactamente las cinco secciones que le corresponden',()=>{
  const ctx=ctxTem();
  const mapa=permisos(ctx);
  const ve=s=>{ const p=mapa[s]; return p?p.has('tem'):true; };   // sin entrada = la ven todos
  const visibles=SECCIONES.filter(ve).join(', ');
  assert.equal(visibles,[...TEM_VE].join(', '));
});

test('las secciones del Hub están todas contempladas en este test',()=>{
  // Si se agrega una sección al index.html y no se la agrega acá, este test no
  // la mira y el permiso se podría romper sin que nadie se entere.
  const fs=require('fs');
  const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
  const enHtml=[...new Set([...html.matchAll(/showSection\('([a-z]+)'/g)].map(m=>m[1]))];
  const faltan=enHtml.filter(s=>!SECCIONES.includes(s));
  assert.equal(faltan.join(', '),'','secciones del HTML que este test no contempla');
});

test('darle Cumpleaños y Aniversarios al TEM no se las saca a nadie',()=>{
  const ctx=ctxTem();
  const mapa=permisos(ctx);
  ['cumpleanos','aniversarios'].forEach(s=>{
    assert.equal(mapa[s].has('full'),true,s);
    assert.equal(mapa[s].has('equipo'),true,s);
    assert.equal(mapa[s].has('tem'),true,s);
  });
});

test('restringir actividades y eventos históricos no se las saca a los demás',()=>{
  const ctx=ctxTem();
  const mapa=permisos(ctx);
  // Antes no tenían entrada, así que las veía todo el mundo: al agregarla hay
  // que dejar adentro a todos los que ya las veían, menos el TEM.
  ['actividades','eventoshist'].forEach(s=>{
    ['full','hr','manager','equipo'].forEach(rol=>
      assert.equal(mapa[s].has(rol),true,`${rol} seguía viendo ${s}`));
    assert.equal(mapa[s].has('tem'),false,s);
  });
});

test('el selector de grupo de Beneficios queda fijo para quien ve un solo grupo',()=>{
  const ctx=ctxTem();
  const fijo=vm.runInContext('GRUPO_BENEFICIOS_FIJO',ctx);
  assert.equal(fijo.tem,'Engineers');
  assert.equal(fijo.hr,'Core Team');
  // Los que ven los dos grupos no tienen el selector fijado
  assert.equal(fijo.full,undefined);
  assert.equal(fijo.manager,undefined);
  assert.equal(fijo.equipo,undefined);
});

test('el TEM sigue sin poder escribir',()=>{
  const ctx=ctxTem();
  const escritura=vm.runInContext('ROLES_ESCRITURA',ctx);
  assert.equal(escritura.has('tem'),false);
  assert.equal(escritura.has('full'),true);
  assert.equal(escritura.has('hr'),true);
});
