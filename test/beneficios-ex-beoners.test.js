'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadApp}=require('../test-helpers/load-app');

// personas.js aporta yaEgreso(), que es el criterio de "ya no está en BEON";
// side-panel.js, los helpers de presentación de la card.
function ctxBenef(){
  return loadApp(['constants.js','utils.js','state.js','personas.js','beneficios.js','side-panel.js']);
}
// Los caches se declaran con `let`: no son propiedades del sandbox.
function sembrar(ctx,cache,datos){
  ctx.__fixture=datos;
  vm.runInContext(`${cache}=__fixture`,ctx);
}

const HOY=new Date();
const ANIO_PASADO=`${HOY.getFullYear()-1}-06-30`;
const ANIO_QUE_VIENE=`${HOY.getFullYear()+1}-06-30`;

const PERSONAS=[
  {id:'p1',fields:{Nombre:'Ana Activa','Rol en empresa':'Engineer'}},
  {id:'p2',fields:{Nombre:'Cesar Welchez','Rol en empresa':'Engineer','Fecha de egreso':ANIO_PASADO}},
  {id:'p3',fields:{Nombre:'Cesar Bonel','Rol en empresa':'Engineer','Fecha de egreso':ANIO_PASADO}},
  // Offboarding cargado pero con el último día todavía por delante: sigue
  // trabajando, así que no es ex BEONer (mismo criterio que el directorio).
  {id:'p4',fields:{Nombre:'Beto Saliendo','Rol en empresa':'Engineer','Fecha de egreso':ANIO_QUE_VIENE}},
];

// ─── Quién entra en la tabla "Por persona" ────────────────────────────────────
// El pedido era ver el histórico de quienes ya no están, SIN cambiarle la vista
// a quien entra a trabajar todos los días. Por eso es un filtro opt-in y el
// valor por defecto ('') deja la lista exactamente como estaba.
test('por defecto la lista sigue siendo el equipo de hoy', ()=>{
  const ctx=ctxBenef();
  const visibles=PERSONAS.filter(p=>ctx.coincideEstadoBenefPersona(p,''));
  assert.equal(visibles.map(p=>p.fields.Nombre).join('|'),'Ana Activa|Beto Saliendo');
});

test('"Ex BEONers" muestra solo a quienes ya terminaron', ()=>{
  const ctx=ctxBenef();
  const visibles=PERSONAS.filter(p=>ctx.coincideEstadoBenefPersona(p,'ex'));
  assert.equal(visibles.map(p=>p.fields.Nombre).join('|'),'Cesar Welchez|Cesar Bonel');
});

test('"Todos (histórico)" no deja a nadie afuera', ()=>{
  const ctx=ctxBenef();
  assert.equal(PERSONAS.filter(p=>ctx.coincideEstadoBenefPersona(p,'todos')).length,PERSONAS.length);
});

// ─── El chip de la tabla ──────────────────────────────────────────────────────
test('badgeExBeonerHtml: chip con la fecha de fin para el ex BEONer, nada para el activo', ()=>{
  const ctx=ctxBenef();
  const chip=ctx.badgeExBeonerHtml(PERSONAS[1]);
  assert.match(chip,/Ex BEONer/);
  assert.match(chip,/hasta /);
  assert.equal(ctx.badgeExBeonerHtml(PERSONAS[0]),'');
  assert.equal(ctx.badgeExBeonerHtml(PERSONAS[3]),''); // todavía trabajando
});

test('badgeExBeonerHtml: sin fecha de egreso no hay chip', ()=>{
  const ctx=ctxBenef();
  // El criterio es yaEgreso(), que sin fecha da false: la persona cuenta como
  // activa. Un registro sin ese campo no debe romper el render de la fila.
  assert.equal(ctx.badgeExBeonerHtml({fields:{Nombre:'X'}}),'');
});

// ─── El vacío que confundía ───────────────────────────────────────────────────
// Buscar a alguien que ya no está devolvía "Sin resultados" a secas, y eso se
// leyó como "no se migró el histórico" cuando el dato estaba cargado.
test('el vacío avisa cuántos aparecen en el histórico', ()=>{
  const ctx=ctxBenef();
  sembrar(ctx,'cachePersonasRaw',PERSONAS);
  const soloCesar=p=>(p.fields.Nombre||'').toLowerCase().includes('cesar');
  const texto=ctx.textoVacioBenefPersonas('',soloCesar);
  assert.match(texto,/2 personas/);
  assert.match(texto,/histórico/);
});

test('con una sola coincidencia el aviso va en singular', ()=>{
  const ctx=ctxBenef();
  sembrar(ctx,'cachePersonasRaw',PERSONAS);
  const soloBonel=p=>(p.fields.Nombre||'')==='Cesar Bonel';
  assert.match(ctx.textoVacioBenefPersonas('',soloBonel),/1 persona que coincide/);
});

test('si tampoco hay nadie en el histórico, el vacío queda como antes', ()=>{
  const ctx=ctxBenef();
  sembrar(ctx,'cachePersonasRaw',PERSONAS);
  assert.equal(ctx.textoVacioBenefPersonas('',()=>false),'Sin resultados');
  // Viendo ya el histórico completo no hay nada más que ofrecer.
  assert.equal(ctx.textoVacioBenefPersonas('todos',()=>true),'Sin resultados');
});

// ─── El chip de la card ───────────────────────────────────────────────────────
test('pillExBeonerHtml: la card de un ex BEONer avisa hasta cuándo estuvo', ()=>{
  const ctx=ctxBenef();
  sembrar(ctx,'cachePersonasRaw',PERSONAS);
  assert.match(ctx.pillExBeonerHtml('Cesar Welchez'),/Ex BEONer · hasta /);
  assert.equal(ctx.pillExBeonerHtml('Ana Activa'),'');
  // Nombre que no está en el caché: la card se abre igual, sin chip.
  assert.equal(ctx.pillExBeonerHtml('Alguien Que No Está'),'');
});

// ─── Nombres del catálogo ─────────────────────────────────────────────────────
// El histórico trae los mismos beneficios escritos de varias formas. Si el
// nombre no matchea, el beneficio vuelve a mostrarse como anual y con
// "Activo desde", que es justo lo que se pidió sacar.
test('Certifications matchea sus variantes, incluida "Courses/Certifications"', ()=>{
  const ctx=ctxBenef();
  assert.equal(ctx.esBeneficioCertifications('Certifications'),true);
  assert.equal(ctx.esBeneficioCertifications('Courses/Certifications'),true);
  assert.equal(ctx.esBeneficioCertifications('Cursos y Certificaciones'),true);
  assert.equal(ctx.esBeneficioCertifications('Courses'),true);
  assert.equal(ctx.esBeneficioCertifications('Terapia'),false);
  // "Udemy Courses" es otro beneficio, con su propia etiqueta.
  assert.equal(ctx.esBeneficioCertifications('Udemy Courses'),false);
});

test('Udemy matchea aunque el registro diga "Udemy Courses"', ()=>{
  const ctx=ctxBenef();
  assert.equal(ctx.esBeneficioUdemy('Udemy'),true);
  assert.equal(ctx.esBeneficioUdemy('Udemy Courses'),true);
  assert.equal(ctx.esBeneficioUdemy('Terapia'),false);
});

// ─── Fecha de cada registro ───────────────────────────────────────────────────
test('Certifications dice "Solicitado el" y no "Activo desde"', ()=>{
  const ctx=ctxBenef();
  const t=ctx.periodoBenefAsignado({Estado:'Activo','Fecha activación':'2025-03-01'},'Courses/Certifications');
  assert.match(t,/^Solicitado el /);
  assert.doesNotMatch(t,/Activo desde/);
});

test('"Udemy Courses" también deja de decir "Activo desde"', ()=>{
  const ctx=ctxBenef();
  const t=ctx.periodoBenefAsignado({Estado:'Activo','Fecha activación':'2025-03-01'},'Udemy Courses');
  assert.match(t,/^Solicitado el /);
});

test('un beneficio anual conserva "Activo desde"', ()=>{
  const ctx=ctxBenef();
  assert.match(ctx.periodoBenefAsignado({Estado:'Activo','Fecha activación':'2025-03-01'},'Terapia'),/^Activo desde /);
});

// ─── Lo que quedó abierto en el histórico ─────────────────────────────────────
// Los registros de quien ya no está casi nunca tienen la baja cargada: el
// beneficio terminó cuando terminó la relación, no hubo un trámite aparte. Sin
// esto, la card de alguien que se fue en 2024 dice que hoy tiene Terapia activa.
test('un anual sin baja se cierra con la salida de BEON', ()=>{
  const ctx=ctxBenef();
  const t=ctx.periodoBenefAsignado({Estado:'Activo','Fecha activación':'2023-01-05'},'Terapia','2025-06-30');
  assert.match(t,/hasta su salida/);
  assert.doesNotMatch(t,/Activo desde/);
});

test('sin fecha de inicio igual se dice hasta cuándo llegó', ()=>{
  const ctx=ctxBenef();
  const t=ctx.periodoBenefAsignado({Estado:'Activo'},'Terapia','2025-06-30');
  assert.match(t,/^Hasta su salida /);
});

test('una baja cargada de verdad manda sobre la salida', ()=>{
  const ctx=ctxBenef();
  const t=ctx.periodoBenefAsignado({Estado:'Inactivo','Fecha activación':'2023-01-05','Fecha de baja':'2024-02-01'},'Terapia','2025-06-30');
  assert.match(t,/Baja: /);
  assert.doesNotMatch(t,/hasta su salida/);
});

test('los puntuales no cambian: la fecha del hecho es la misma se haya ido o no', ()=>{
  const ctx=ctxBenef();
  const conSalida=ctx.periodoBenefAsignado({Estado:'Activo','Fecha activación':'2024-05-10'},'Courses/Certifications','2025-06-30');
  const sinSalida=ctx.periodoBenefAsignado({Estado:'Activo','Fecha activación':'2024-05-10'},'Courses/Certifications','');
  assert.equal(conSalida,sinSalida);
  assert.match(conSalida,/^Solicitado el /);
});

test('badgeEstadoBenefHistorico: verde "Activo" solo para quien sigue en BEON', ()=>{
  const ctx=ctxBenef();
  assert.match(ctx.badgeEstadoBenefHistorico('Activo',''),/badge-green">Activo</);
  assert.match(ctx.badgeEstadoBenefHistorico('Activo','2025-06-30'),/badge-gray.*>Cerrado</);
  // Un estado ya cerrado en Airtable se respeta tal cual: el dato real gana.
  assert.match(ctx.badgeEstadoBenefHistorico('Inactivo','2025-06-30'),/badge-gray">Inactivo</);
  assert.match(ctx.badgeEstadoBenefHistorico('En pausa','2025-06-30'),/badge-amber">En pausa</);
});

test('el encabezado de un grupo no cuenta "activas" en el histórico', ()=>{
  const ctx=ctxBenef();
  const g={nombre:'Udemy Courses',activos:2,items:[{r:{fields:{}}},{r:{fields:{}}}]};
  assert.match(ctx.resumenGrupoBenef(g,'2025-06-30'),/2 registros en su histórico/);
  assert.match(ctx.resumenGrupoBenef(g,''),/2 asignaciones · 2 activas/);
});

// ─── Monto de cada registro ───────────────────────────────────────────────────
test('lo que se paga por unidad no lleva "/año"', ()=>{
  const ctx=ctxBenef();
  assert.equal(ctx.montoBenefAsignado({Monto:300},null,'Courses/Certifications'),'$300');
  assert.equal(ctx.montoBenefAsignado({Monto:40},null,'Udemy Courses'),'$40');
  assert.equal(ctx.montoBenefAsignado({Monto:600},null,'Terapia'),'$600/año');
});

// ─── El catálogo ──────────────────────────────────────────────────────────────
// La tarjeta del catálogo escribía "/mes" para todos: Terapia ($600 al año) se
// leía como $600 por mes, y el Hardware Bonus ($500 de tope por única vez)
// como un gasto mensual.
test('cada tarjeta del catálogo dice en qué unidad está su valor', ()=>{
  const ctx=ctxBenef();
  assert.equal(ctx.montoCatalogoBenef({Beneficio:'AI Tools',Valor:20}),'$20/mes');
  assert.equal(ctx.montoCatalogoBenef({Beneficio:'Terapia',Valor:600}),'$600/año');
  assert.equal(ctx.montoCatalogoBenef({Beneficio:'Hardware Bonus',Valor:500}),'$500 de tope');
  assert.equal(ctx.montoCatalogoBenef({Beneficio:'Udemy Courses',Valor:50}),'$50 c/u');
  assert.equal(ctx.montoCatalogoBenef({Beneficio:'Courses/Certifications',Valor:400}),'$400 c/u');
  // Sin valor cargado no se inventa nada.
  assert.equal(ctx.montoCatalogoBenef({Beneficio:'Terapia'}),'');
  assert.equal(ctx.montoCatalogoBenef({Beneficio:'Terapia',Valor:0}),'');
});

// Con una sola card de AI Tools en el catálogo, cuál herramienta usa cada uno
// deja de estar en el nombre del beneficio: el lugar para eso es el comentario.
test('AI Tools admite comentario, igual que Certifications y Hardware Bonus', ()=>{
  const ctx=ctxBenef();
  assert.equal(ctx.esBeneficioConComentario('AI Tools'),true);
  assert.equal(ctx.esBeneficioConComentario('AI Tools – Claude'),true);
  assert.equal(ctx.esBeneficioConComentario('Hardware Bonus'),true);
  assert.equal(ctx.esBeneficioConComentario('Courses/Certifications'),true);
  assert.equal(ctx.esBeneficioConComentario('Terapia'),false);
  assert.equal(ctx.esBeneficioConComentario('Udemy'),false);
});
