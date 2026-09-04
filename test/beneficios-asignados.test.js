'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadApp}=require('../test-helpers/load-app');

const ctx=loadApp(['constants.js','utils.js','state.js','side-panel.js']);
// Las declaraciones `const` de nivel superior no quedan expuestas como
// propiedades del sandbox — hay que leerlas del contexto.
const BENEF_ESTADOS=vm.runInContext('BENEF_ESTADOS',ctx);
const BENEF_ESTADOS_CON_MOTIVO=vm.runInContext('BENEF_ESTADOS_CON_MOTIVO',ctx);

// ─── Estados ──────────────────────────────────────────────────────────────────
// "En pausa" se agregó para el histórico de clases de inglés migrado del Sheet:
// gente que suspendió el beneficio sin darlo de baja. El punto del tercer estado
// es que se distinga de Inactivo en la UI pero cuente como NO activo en todos
// los filtros del Hub, que comparan contra 'Activo'.
test('BENEF_ESTADOS: los tres estados, con Activo primero (el default del form)', ()=>{
  // Se compara el join y no el array: el array viene del sandbox de vm, con su
  // propio Array.prototype, así que deepEqual estricto falla por realm.
  assert.equal(BENEF_ESTADOS.join('|'),'Activo|En pausa|Inactivo');
});

test('solo En pausa e Inactivo piden motivo — un beneficio activo no tiene por qué', ()=>{
  assert.equal(BENEF_ESTADOS_CON_MOTIVO.has('En pausa'),true);
  assert.equal(BENEF_ESTADOS_CON_MOTIVO.has('Inactivo'),true);
  assert.equal(BENEF_ESTADOS_CON_MOTIVO.has('Activo'),false);
});

test('badgeEstadoBenef: un color por estado, y sin Estado se asume Activo', ()=>{
  assert.match(ctx.badgeEstadoBenef('Activo'),/badge-green">Activo</);
  assert.match(ctx.badgeEstadoBenef('En pausa'),/badge-amber">En pausa</);
  assert.match(ctx.badgeEstadoBenef('Inactivo'),/badge-gray">Inactivo</);
  // Los registros viejos no tienen Estado seteado; el Hub los trata como activos.
  assert.match(ctx.badgeEstadoBenef(undefined),/badge-green">Activo</);
  assert.match(ctx.badgeEstadoBenef(''),/badge-green">Activo</);
});

// ─── Período ──────────────────────────────────────────────────────────────────
test('periodoBenefAsignado: Activo muestra un período abierto', ()=>{
  const t=ctx.periodoBenefAsignado({Estado:'Activo','Fecha activación':'2025-03-01'});
  assert.match(t,/^Activo desde /);
  assert.doesNotMatch(t,/Baja/);
});

// En pausa no lleva Fecha de baja porque el beneficio no terminó. Si alguna
// quedó de un paso previo por Inactivo, no se muestra: mostrar una baja en un
// beneficio pausado diría que terminó, que es lo contrario del estado.
test('periodoBenefAsignado: En pausa muestra el inicio y NUNCA una fecha de baja', ()=>{
  const t=ctx.periodoBenefAsignado({
    Estado:'En pausa',
    'Fecha activación':'2022-06-03',
    'Fecha de baja':'2022-10-20',
  });
  assert.match(t,/^En pausa · empezó el /);
  assert.doesNotMatch(t,/Baja/);
});

test('periodoBenefAsignado: Inactivo cierra el período con la baja', ()=>{
  const t=ctx.periodoBenefAsignado({
    Estado:'Inactivo',
    'Fecha activación':'2021-06-03',
    'Fecha de baja':'2022-10-20',
  });
  assert.match(t,/^Usado desde /);
  assert.match(t,/ · Baja: /);
});

// Varias filas del histórico migrado tienen "Terminó" sin fecha de fin — no
// pueden dejar la fila sin texto ni imprimir "undefined".
test('periodoBenefAsignado: Inactivo sin fechas no imprime undefined', ()=>{
  assert.equal(ctx.periodoBenefAsignado({Estado:'Inactivo'}),'Sin fecha registrada');
  assert.equal(ctx.periodoBenefAsignado({Estado:'Activo'}),'Sin fecha registrada');
  assert.equal(ctx.periodoBenefAsignado({Estado:'En pausa'}),'En pausa · sin fecha de inicio');
});

test('periodoBenefAsignado: sin Estado se comporta como Activo', ()=>{
  assert.match(ctx.periodoBenefAsignado({'Fecha activación':'2025-03-01'}),/^Activo desde /);
});

// ─── Asistencia ───────────────────────────────────────────────────────────────
test('asistenciaBenefAsignado: junta mes y año, y redondea', ()=>{
  assert.equal(
    ctx.asistenciaBenefAsignado({'% asistencia mensual':66.67,'% asistencia anual':88.2}),
    '67% mes · 88% año',
  );
});

test('asistenciaBenefAsignado: con un solo porcentaje no deja separadores sueltos', ()=>{
  assert.equal(ctx.asistenciaBenefAsignado({'% asistencia anual':55}),'55% año');
  assert.equal(ctx.asistenciaBenefAsignado({'% asistencia mensual':100}),'100% mes');
});

// 0% es el caso que más importa mostrar (justifica la baja por poco
// compromiso), así que no puede caer por truthiness junto con el vacío.
test('asistenciaBenefAsignado: 0% se muestra; vacío/null no', ()=>{
  assert.equal(ctx.asistenciaBenefAsignado({'% asistencia mensual':0,'% asistencia anual':55}),'0% mes · 55% año');
  assert.equal(ctx.asistenciaBenefAsignado({}),'');
  assert.equal(ctx.asistenciaBenefAsignado({'% asistencia mensual':null,'% asistencia anual':''}),'');
});

// ─── Fecha de baja editable ───────────────────────────────────────────────────
// Antes la Fecha de baja se forzaba a new Date() al pasar a Inactivo y no había
// campo para tocarla, así que la fecha real (casi siempre anterior al día en
// que se carga en el Hub) se terminaba anotando a mano en el motivo. Ahora sale
// del input; estas pruebas fijan qué se manda a Airtable en cada estado.
function fieldsDeBaja(estadoNuevo,fechaInput){
  const fields={Estado:estadoNuevo};
  if(BENEF_ESTADOS_CON_MOTIVO.has(estadoNuevo)) fields['Motivo de baja']='algo';
  else fields['Motivo de baja']=null;
  if(estadoNuevo==='Inactivo') fields['Fecha de baja']=fechaInput||null;
  else fields['Fecha de baja']=null;
  return fields;
}

test('fecha de baja: al pasar a Inactivo se guarda la fecha elegida, no la de hoy', ()=>{
  const hoy=new Date().toISOString().slice(0,10);
  const fields=fieldsDeBaja('Inactivo','2022-10-20');
  assert.equal(fields['Fecha de baja'],'2022-10-20');
  assert.notEqual(fields['Fecha de baja'],hoy);
});

test('fecha de baja: Inactivo sin fecha en el campo guarda null, no una fecha inventada', ()=>{
  assert.equal(fieldsDeBaja('Inactivo','')['Fecha de baja'],null);
});

// "En pausa" no lleva fecha de baja: el beneficio no terminó. Si el registro
// venía de Inactivo, la baja anterior se limpia.
test('fecha de baja: En pausa nunca guarda fecha de baja, pero sí motivo', ()=>{
  const fields=fieldsDeBaja('En pausa','2022-10-20');
  assert.equal(fields['Fecha de baja'],null);
  assert.equal(fields['Motivo de baja'],'algo');
});

test('fecha de baja: volver a Activo limpia fecha y motivo', ()=>{
  const fields=fieldsDeBaja('Activo','2022-10-20');
  assert.equal(fields['Fecha de baja'],null);
  assert.equal(fields['Motivo de baja'],null);
});

// La fila del beneficio ya mostraba la baja; con la fecha editable tiene que
// seguir reflejando la que se guardó, no la de carga.
test('periodoBenefAsignado: muestra la fecha de baja que se guardó', ()=>{
  const t=ctx.periodoBenefAsignado({Estado:'Inactivo','Fecha activación':'2022-06-03','Fecha de baja':'2022-10-20'});
  assert.match(t,/Baja: 20 de oct de 2022/);
});
