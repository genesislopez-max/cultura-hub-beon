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

test('combinarEventos: trae el comentario destacado del feedback cuando está cargado', ()=>{
  const avRows=[
    {fields:{Evento:'Charla de Seguridad',Fecha:'2026-04-01',Grupo:'Todos',Persona:'Ana Test'}},
  ];
  const feedbackRows=[
    {id:'fb1',fields:{Fuente:'Actividades',Evento:'Charla de Seguridad',Fecha:'2026-04-01',Puntaje:4.5,Comentario:'Muy insightful!'}},
  ];
  const lista=ctx.combinarEventos(avRows,[],feedbackRows);
  assert.equal(lista[0].comentario,'Muy insightful!');
});

test('combinarEventos: un evento sin feedback tiene comentario null', ()=>{
  const avRows=[
    {fields:{Evento:'Charla de Seguridad',Fecha:'2026-04-01',Grupo:'Todos',Persona:'Ana Test'}},
  ];
  const lista=ctx.combinarEventos(avRows,[],[]);
  assert.equal(lista[0].comentario,null);
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

// ─── Resumen del trimestre ────────────────────────────────────────────────────
const ctxQ=loadApp(['state.js','utils.js','personas.js','actividades-virtuales.js','eventos.js']);

// Q3 2026 = jul-sep. Se mezclan eventos dentro y fuera del rango a propósito.
const LISTA=[
  {fuente:'Actividades', evento:'Charla julio', fecha:'2026-07-16',asistentes:67,puntaje:4.6,respuestas:28,comentario:'Muy útil'},
  {fuente:'Actividades', evento:'Charla agosto',fecha:'2026-08-30',asistentes:9, puntaje:5,  respuestas:6, comentario:null},
  {fuente:'Get Together',evento:'GT Lima',     fecha:'2026-09-02',asistentes:18,puntaje:null,respuestas:null,comentario:null},
  {fuente:'Actividades', evento:'Fuera de Q',  fecha:'2026-06-30',asistentes:99,puntaje:3,  respuestas:2, comentario:'no cuenta'},
];
// Filas crudas: una por persona por evento. Ana va a dos eventos del Q.
const AV=[
  {fields:{Fecha:'2026-07-16',Persona:'Ana'}},
  {fields:{Fecha:'2026-07-16',Persona:'Bruno'}},
  {fields:{Fecha:'2026-08-30',Persona:'Ana'}},
  {fields:{Fecha:'2026-06-30',Persona:'Carla'}},   // fuera del Q
];
const GT=[{fields:{Fecha:'2026-09-02',BEONer:'Diego'}}];
const PERSONAS=[
  {fields:{Nombre:'Ana',  'Fecha de ingreso':'2020-01-01'}},
  {fields:{Nombre:'Bruno','Fecha de ingreso':'2020-01-01'}},
  {fields:{Nombre:'Carla','Fecha de ingreso':'2020-01-01'}},
  {fields:{Nombre:'Diego','Fecha de ingreso':'2020-01-01'}},
  {fields:{Nombre:'Egresado','Fecha de ingreso':'2020-01-01','Fecha de egreso':'2021-01-01'}},
];
const resumen=()=>ctxQ.resumenTrimestreEventos(LISTA,AV,GT,PERSONAS,2026,3);

test('resumenTrimestreEventos: solo toma los eventos del trimestre pedido', ()=>{
  const r=resumen();
  assert.equal(r.totalEventos,3);
  assert.equal(r.eventos.some(e=>e.evento==='Fuera de Q'),false);
});

test('resumenTrimestreEventos: ordena los eventos cronológicamente', ()=>{
  assert.equal(resumen().eventos.map(e=>e.fecha).join(),'2026-07-16,2026-08-30,2026-09-02');
});

test('resumenTrimestreEventos: asistencias suma por evento, personasUnicas no repite gente', ()=>{
  const r=resumen();
  assert.equal(r.asistencias,67+9+18);
  // Ana fue a dos eventos pero cuenta una vez; Carla quedó fuera del Q
  assert.equal(r.personasUnicas,3); // Ana, Bruno, Diego
});

test('resumenTrimestreEventos: el % de participación excluye a los egresados', ()=>{
  const r=resumen();
  assert.equal(r.activos,4);                 // los 5 menos el egresado
  assert.equal(r.pctParticipacion,75);       // 3 de 4
});

test('resumenTrimestreEventos: promedia solo los eventos con encuesta', ()=>{
  const r=resumen();
  assert.equal(r.conEncuesta,2);
  assert.equal(r.sinEncuesta,1);
  assert.equal(r.promedio,4.8);              // (4.6 + 5) / 2
});

test('resumenTrimestreEventos: destaca el más convocante y el mejor puntuado', ()=>{
  const r=resumen();
  assert.equal(r.masConvocante.evento,'Charla julio');   // 67 asistentes
  assert.equal(r.mejorPuntuado.evento,'Charla agosto');  // 5.0
});

test('resumenTrimestreEventos: desglosa por fuente', ()=>{
  const r=resumen();
  assert.equal(r.porFuente['Actividades'].eventos,2);
  assert.equal(r.porFuente['Get Together'].asistencias,18);
});

test('resumenTrimestreEventos: junta solo los comentarios cargados', ()=>{
  const r=resumen();
  assert.equal(r.comentarios.length,1);
  assert.equal(r.comentarios[0].comentario,'Muy útil');
});

test('resumenTrimestreEventos: un trimestre sin eventos no rompe', ()=>{
  const r=ctxQ.resumenTrimestreEventos(LISTA,AV,GT,PERSONAS,2026,1);
  assert.equal(r.totalEventos,0);
  assert.equal(r.promedio,null);
  assert.equal(r.masConvocante,null);
  assert.equal(r.asistencias,0);
});

test('textoResumenTrimestre: incluye los totales y cada evento con su puntaje', ()=>{
  const txt=ctxQ.textoResumenTrimestre(resumen());
  assert.match(txt,/Eventos Q3 2026/);
  assert.match(txt,/3 eventos · 94 asistencias/);
  assert.match(txt,/Participación: 75% del equipo \(4 activos\)/);
  assert.match(txt,/Satisfacción promedio: 4\.80\/5/);
  assert.match(txt,/Charla julio/);
  assert.match(txt,/"Muy útil"/);
  assert.match(txt,/Queda 1 evento sin encuesta cargada/);
  assert.equal(txt.includes('Fuera de Q'),false);
});

test('textoResumenTrimestre: trimestre vacío devuelve un texto claro, no vacío', ()=>{
  const txt=ctxQ.textoResumenTrimestre(ctxQ.resumenTrimestreEventos([],[],[],PERSONAS,2026,1));
  assert.match(txt,/Sin eventos registrados en este trimestre/);
});
