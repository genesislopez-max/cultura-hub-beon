'use strict';
// Qué ve un TEM. El TEM acompaña a los devs: Inicio, Engineers & Tech,
// Cumpleaños, Aniversarios, Ex BEONers y todo el grupo "Beneficios" del menú
// —Beneficios, Ambassador Week, Off Sites, Get Together y Asistencia a
// Actividades— pero siempre solo lo de Engineers.
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
const TEM_VE=new Set(['inicio','engineers','cumpleanos','aniversarios','exbeoners',
  // el grupo "Beneficios" del menú, completo
  'beneficios','ambassadors','offsites','gettogether','actividades']);

test('el TEM ve exactamente las secciones que le corresponden',()=>{
  const ctx=ctxTem();
  const mapa=permisos(ctx);
  const ve=s=>{ const p=mapa[s]; return p?p.has('tem'):true; };   // sin entrada = la ven todos
  // Ordenado, para que el test hable de QUÉ ve y no del orden del menú.
  const visibles=SECCIONES.filter(ve).sort().join(', ');
  assert.equal(visibles,[...TEM_VE].sort().join(', '));
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

test('darle entrada a actividades y eventos históricos no se las saca a los demás',()=>{
  const ctx=ctxTem();
  const mapa=permisos(ctx);
  // Antes no tenían entrada en la lista blanca, así que las veía todo el
  // mundo: al agregarla hay que dejar adentro a todos los que ya las veían.
  ['actividades','eventoshist'].forEach(s=>{
    ['full','hr','manager','equipo'].forEach(rol=>
      assert.equal(mapa[s].has(rol),true,`${rol} seguía viendo ${s}`));
  });
  // Asistencia a Actividades es del grupo Beneficios: el TEM la ve.
  assert.equal(mapa.actividades.has('tem'),true);
  // Eventos históricos no está en ese grupo: no la ve.
  assert.equal(mapa.eventoshist.has('tem'),false);
});

test('el grupo "Beneficios" del menú lo ve entero',()=>{
  const ctx=ctxTem();
  const mapa=permisos(ctx);
  ['beneficios','ambassadors','offsites','gettogether','actividades'].forEach(s=>{
    const p=mapa[s];
    assert.equal(p?p.has('tem'):true,true,`el TEM debería ver ${s}`);
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

test('ver Ex BEONers no le abre al TEM los beneficios de Core Team',()=>{
  const ctx=ctxTem();
  // El histórico incluye a todo el mundo, Core Team incluido. Lo que lo acota
  // no es la sección sino el grupo, que aplica el servidor: al abrir la card
  // de un ex BEONer de Core Team no le llega ninguna asignación.
  // (El filtro en sí se verifica en test/api-airtable-proxy.test.js.)
  assert.equal(permisos(ctx).exbeoners.has('tem'),true);
  assert.equal(vm.runInContext('GRUPO_BENEFICIOS_FIJO',ctx).tem,'Engineers');
});
