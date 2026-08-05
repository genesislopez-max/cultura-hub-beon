'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadApp}=require('../test-helpers/load-app');

const ctx=loadApp(['actividades-virtuales.js','eventos.js']);

test('agruparGTPorEncuentro: agrupa por Ciudad+Fecha y sintetiza el nombre del evento', ()=>{
  const rows=[
    {fields:{BEONer:'Ana Test',Ciudad:'Buenos Aires','País':'Argentina',Fecha:'2026-03-10'}},
    {fields:{BEONer:'Bruno Diaz',Ciudad:'Buenos Aires','País':'Argentina',Fecha:'2026-03-10'}},
    {fields:{BEONer:'Carla Ruiz',Ciudad:'San Pablo','País':'Brasil',Fecha:'2026-05-01'}},
  ];
  const mapa=ctx.agruparGTPorEncuentro(rows);
  const keys=Object.keys(mapa);
  assert.equal(keys.length,2);
  const ba=mapa['Buenos Aires|2026-03-10'];
  assert.equal(ba.evento,'Get Together — Buenos Aires');
  assert.equal(ba.asistentes.length,2);
  const sp=mapa['San Pablo|2026-05-01'];
  assert.equal(sp.evento,'Get Together — San Pablo');
  assert.equal(sp.asistentes.length,1);
});

test('combinarEventos: un evento de Actividades sin feedback cargado tiene puntaje null', ()=>{
  const avRows=[
    {fields:{Evento:'Charla de Seguridad',Fecha:'2026-04-01',Grupo:'Todos',Persona:'Ana Test'}},
  ];
  const lista=ctx.combinarEventos(avRows,[],[]);
  assert.equal(lista.length,1);
  assert.equal(lista[0].fuente,'Actividades');
  assert.equal(lista[0].evento,'Charla de Seguridad');
  assert.equal(lista[0].asistentes,1);
  assert.equal(lista[0].puntaje,null);
});

test('combinarEventos: un evento de Get Together con feedback matcheando Fuente+Evento+Fecha trae el puntaje', ()=>{
  const gtRows=[
    {fields:{BEONer:'Ana Test',Ciudad:'Buenos Aires','País':'Argentina',Fecha:'2026-03-10'}},
    {fields:{BEONer:'Bruno Diaz',Ciudad:'Buenos Aires','País':'Argentina',Fecha:'2026-03-10'}},
  ];
  const feedbackRows=[
    {id:'fb1',fields:{Fuente:'Get Together',Evento:'Get Together — Buenos Aires',Fecha:'2026-03-10',Puntaje:4.5,Respuestas:6}},
  ];
  const lista=ctx.combinarEventos([],gtRows,feedbackRows);
  assert.equal(lista.length,1);
  assert.equal(lista[0].fuente,'Get Together');
  assert.equal(lista[0].asistentes,2);
  assert.equal(lista[0].puntaje,4.5);
  assert.equal(lista[0].respuestas,6);
});

test('combinarEventos: un feedback que no matchea ningún evento agrupado no genera un evento fantasma', ()=>{
  const avRows=[
    {fields:{Evento:'Charla de Seguridad',Fecha:'2026-04-01',Grupo:'Todos',Persona:'Ana Test'}},
  ];
  const feedbackRows=[
    {id:'fb1',fields:{Fuente:'Actividades',Evento:'Evento que ya no existe',Fecha:'2020-01-01',Puntaje:3}},
  ];
  const lista=ctx.combinarEventos(avRows,[],feedbackRows);
  assert.equal(lista.length,1);
  assert.equal(lista[0].evento,'Charla de Seguridad');
  assert.equal(lista[0].puntaje,null);
});

test('combinarEventos: no cruza feedback entre fuentes distintas aunque coincidan Evento+Fecha', ()=>{
  const avRows=[
    {fields:{Evento:'Get Together — Buenos Aires',Fecha:'2026-03-10',Grupo:'Todos',Persona:'Ana Test'}},
  ];
  const feedbackRows=[
    {id:'fb1',fields:{Fuente:'Get Together',Evento:'Get Together — Buenos Aires',Fecha:'2026-03-10',Puntaje:5}},
  ];
  const lista=ctx.combinarEventos(avRows,[],feedbackRows);
  assert.equal(lista.length,1);
  assert.equal(lista[0].fuente,'Actividades');
  assert.equal(lista[0].puntaje,null);
});

test('combinarEventos: ordena la lista final por Fecha descendente, mezclando ambas fuentes', ()=>{
  const avRows=[
    {fields:{Evento:'Charla vieja',Fecha:'2025-01-01',Grupo:'Todos',Persona:'Ana Test'}},
    {fields:{Evento:'Charla nueva',Fecha:'2026-06-01',Grupo:'Todos',Persona:'Ana Test'}},
  ];
  const gtRows=[
    {fields:{BEONer:'Bruno Diaz',Ciudad:'Lima','País':'Perú',Fecha:'2025-12-01'}},
  ];
  const lista=ctx.combinarEventos(avRows,gtRows,[]);
  // Comparado como JSON (no deepEqual) porque el array que devuelve ctx.*
  // se crea en el realm del sandbox de loadApp() — deepStrictEqual lo trata
  // como "no reference-equal" contra un array literal del realm del test
  // aunque el contenido sea idéntico.
  assert.equal(JSON.stringify(lista.map(e=>e.fecha)),JSON.stringify(['2026-06-01','2025-12-01','2025-01-01']));
});
