'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadApp}=require('../test-helpers/load-app');

const ctx=loadApp(['constants.js','utils.js','state.js','beneficios.js']);

// Una fila de Beneficios Asignados no significa lo mismo en cada beneficio:
// Blogposts genera una por publicación (una persona con 4 posts son 4 altas) y
// Terapia una sola por persona que dura todo el año. El ranking por cantidad de
// filas premia a los que se registran por unidad, no a los más usados.
const asig=(persona,beneficio,extra={})=>({
  id:`${persona}-${beneficio}-${extra.i||0}`,
  createdTime:extra.createdTime,
  fields:{Persona:[persona],Beneficio:[beneficio],'Fecha activación':extra.fecha||'2026-08-01'},
});
const ALTAS=[
  asig('Ana','Blogposts',{i:1}),
  asig('Ana','Blogposts',{i:2}),
  asig('Ana','Blogposts',{i:3}),
  asig('Ana','Blogposts',{i:4}),
  asig('Beto','Terapia'),
  asig('Caro','Terapia'),
  asig('Dani','Terapia'),
];

test('el ranking cuenta altas y personas distintas por separado', ()=>{
  const r=ctx.rankingBenefQ(ALTAS);
  const blog=r.find(x=>x.nombre==='Blogposts');
  const terapia=r.find(x=>x.nombre==='Terapia');
  assert.equal(blog.altas,4);
  assert.equal(blog.personas,1);   // los cuatro posts son de la misma persona
  assert.equal(terapia.altas,3);
  assert.equal(terapia.personas,3);
});

// Es el caso del Hub: Blogposts encabeza por filas, pero lo usa una sola
// persona. "Más usado" tiene que ser el que le llegó a más gente.
test('"más usado" se resuelve por personas, no por filas', ()=>{
  const top=ctx.beneficioMasUsadoQ(ctx.rankingBenefQ(ALTAS));
  assert.equal(top.nombre,'Terapia');
  assert.equal(top.personas,3);
  // El ranking en sí sigue ordenado por altas, que es la columna que encabeza.
  assert.equal(ctx.rankingBenefQ(ALTAS)[0].nombre,'Blogposts');
});

test('sin altas no hay "más usado" y el ranking queda vacío', ()=>{
  assert.equal(ctx.beneficioMasUsadoQ([]),null);
  assert.equal(ctx.beneficioMasUsadoQ(null),null);
  assert.equal(ctx.rankingBenefQ([]).length,0);
  assert.equal(ctx.rankingBenefQ(null).length,0);
});

test('la misma persona escrita distinto no cuenta dos veces', ()=>{
  const r=ctx.rankingBenefQ([
    asig('Ana Test','Terapia',{i:1}),
    {id:'x',fields:{Persona:'  ana test ',Beneficio:'Terapia','Fecha activación':'2026-08-02'}},
  ]);
  assert.equal(r[0].altas,2);
  assert.equal(r[0].personas,1);
  assert.equal(ctx.personasUnicasQ(ALTAS),4); // Ana, Beto, Caro, Dani
});

test('una asignación sin beneficio vinculado no rompe el ranking', ()=>{
  const r=ctx.rankingBenefQ([{id:'x',fields:{Persona:['Ana'],'Fecha activación':'2026-08-01'}}]);
  assert.equal(r.length,0);
});

// ─── Cargas retroactivas ──────────────────────────────────────────────────────
// El trimestre se calcula con la Fecha activación. Subir histórico crea hoy
// registros que declaran fechas de antes: si esa fecha cae en el trimestre que
// se mira, se mezclan con las altas reales sin ninguna marca. createdTime —que
// Airtable ya devuelve y el Hub ignoraba— separa una cosa de la otra.
test('una alta cargada el mismo día no es retroactiva', ()=>{
  const r=asig('Ana','Terapia',{fecha:'2026-08-01',createdTime:'2026-08-01T10:00:00.000Z'});
  assert.equal(ctx.esAltaRetroactiva(r),false);
  assert.equal(ctx.diasEntreActivacionYCarga(r),0);
});

test('unos días de demora tampoco: cargar el beneficio lleva su tiempo', ()=>{
  assert.equal(ctx.esAltaRetroactiva(asig('Ana','Terapia',{fecha:'2026-08-01',createdTime:'2026-08-20T10:00:00.000Z'})),false);
});

test('un registro creado meses después sí es retroactivo', ()=>{
  const r=asig('Ana','Blogposts',{fecha:'2026-08-01',createdTime:'2026-12-15T10:00:00.000Z'});
  assert.equal(ctx.esAltaRetroactiva(r),true);
  assert.equal(ctx.diasEntreActivacionYCarga(r)>100,true);
});

test('sin createdTime no se afirma nada', ()=>{
  // Los registros viejos y los mocks no lo traen: no marcarlos es preferible a
  // contarlos como retroactivos sin saberlo.
  assert.equal(ctx.esAltaRetroactiva(asig('Ana','Terapia',{fecha:'2026-08-01'})),false);
  assert.equal(ctx.diasEntreActivacionYCarga({fields:{}}),null);
  assert.equal(ctx.diasEntreActivacionYCarga(null),null);
  assert.equal(ctx.esAltaRetroactiva({createdTime:'2026-08-01T10:00:00.000Z',fields:{}}),false);
});

test('una fecha ilegible no cuenta como retroactiva', ()=>{
  assert.equal(ctx.esAltaRetroactiva({createdTime:'no-es-fecha',fields:{'Fecha activación':'2026-08-01'}}),false);
});

test('el ranking dice cuántas de cada beneficio son retroactivas', ()=>{
  const r=ctx.rankingBenefQ([
    asig('Ana','Blogposts',{i:1,fecha:'2026-08-01',createdTime:'2026-12-15T10:00:00.000Z'}),
    asig('Beto','Blogposts',{i:2,fecha:'2026-08-05',createdTime:'2026-12-15T10:00:00.000Z'}),
    asig('Caro','Blogposts',{i:3,fecha:'2026-08-10',createdTime:'2026-08-11T10:00:00.000Z'}),
  ]);
  assert.equal(r[0].retroactivas,2);
  assert.equal(r[0].altas,3);
});

test('el aviso no aparece cuando todo se cargó al día', ()=>{
  const alDia=[asig('Ana','Terapia',{fecha:'2026-08-01',createdTime:'2026-08-01T10:00:00.000Z'})];
  assert.equal(ctx.avisoCargasQ(alDia),'');
  assert.equal(ctx.avisoCargasQ([]),'');
});

test('el aviso cuenta las retroactivas', ()=>{
  const aviso=ctx.avisoCargasQ([
    asig('Ana','Terapia',{fecha:'2026-08-01',createdTime:'2026-08-01T10:00:00.000Z'}),
    asig('Beto','Blogposts',{fecha:'2026-08-01',createdTime:'2026-12-15T10:00:00.000Z'}),
  ]);
  assert.match(aviso,/1 de 2 altas/);
  assert.match(aviso,/retroactivamente/);
});

// ─── Cargas en bloque ─────────────────────────────────────────────────────────
// Si la migración puso como Fecha activación el día en que se subió, el
// registro declara una fecha del trimestre Y se creó ese mismo día: la
// distancia entre fechas da cero y no se marca nada, aunque el hecho sea viejo.
// Lo que delata esa carga es que muchas altas se hayan creado el mismo día.
test('detecta la tanda: muchas altas creadas el mismo día', ()=>{
  // El peor caso: la carga puso como Fecha activación el día en que se subió,
  // así que la distancia entre las dos fechas es cero y no hay nada que marcar.
  const tanda=Array.from({length:10},(_,i)=>asig(`P${i}`,'Blogposts',{i,fecha:'2026-09-1'+(i%5+1),createdTime:'2026-09-15T10:00:00.000Z'}));
  const bloque=ctx.mayorCargaEnBloqueQ(tanda);
  assert.equal(bloque.cantidad,10);
  assert.equal(bloque.dia,'2026-09-15');
  // Ninguna es "retroactiva": la fecha que declaran es del mismo mes.
  assert.equal(tanda.filter(r=>ctx.esAltaRetroactiva(r)).length,0);
  assert.match(ctx.avisoCargasQ(tanda),/10 de 10/);
  assert.match(ctx.avisoCargasQ(tanda),/mismo día/);
});

test('un día normal de carga no dispara el aviso', ()=>{
  // Cinco altas cargadas el mismo día, pero sobre veinte del trimestre: es
  // trabajo del día, no una migración.
  const normales=Array.from({length:20},(_,i)=>asig(`P${i}`,'Terapia',{
    i,fecha:'2026-08-01',createdTime:`2026-08-0${(i%5)+1}T10:00:00.000Z`,
  }));
  assert.equal(ctx.mayorCargaEnBloqueQ(normales),null);
  assert.equal(ctx.avisoCargasQ(normales),'');
});

test('con pocas altas en total no se grita "migración"', ()=>{
  const pocas=Array.from({length:4},(_,i)=>asig(`P${i}`,'Terapia',{i,fecha:'2026-08-01',createdTime:'2026-08-01T10:00:00.000Z'}));
  assert.equal(ctx.mayorCargaEnBloqueQ(pocas),null); // no llega al mínimo de 5
  assert.equal(ctx.mayorCargaEnBloqueQ([]),null);
  assert.equal(ctx.mayorCargaEnBloqueQ(null),null);
});

test('sin createdTime no se inventa una tanda', ()=>{
  const sinDato=Array.from({length:10},(_,i)=>asig(`P${i}`,'Terapia',{i,fecha:'2026-08-01'}));
  assert.equal(ctx.mayorCargaEnBloqueQ(sinDato),null);
  assert.equal(ctx.avisoCargasQ(sinDato),'');
});
