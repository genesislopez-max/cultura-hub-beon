'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadApp}=require('../test-helpers/load-app');

function ctxRe(){
  return loadApp(['constants.js','utils.js','state.js','personas.js','ingresos-egresos.js']);
}
function sembrar(ctx,cache,datos){
  ctx.__fixture=datos;
  vm.runInContext(`${cache}=__fixture`,ctx);
}

const ANIO=new Date().getFullYear();
const AYER=`${ANIO-1}-06-30`;
const ANTEAYER=`${ANIO-3}-01-01`;
const MANANA=`${ANIO+1}-06-30`;
const persona=(fields)=>({id:'p1',fields:{Nombre:'Vuelta Atrás','Rol en empresa':'Engineer',...fields}});

// La idea de todo esto: alguien que vuelve no empieza de cero y su paso
// anterior por BEON no se borra. Por eso la fecha de egreso se conserva y lo
// que decide es si hay un reingreso posterior y ya cumplido.
test('sin fecha de reingreso, un egreso vencido sigue siendo egreso', ()=>{
  const ctx=ctxRe();
  const p=persona({'Fecha de ingreso':ANTEAYER,'Fecha de egreso':AYER});
  assert.equal(ctx.reingresoVigente(p),false);
  assert.equal(ctx.yaEgreso(p),true);
});

test('un reingreso posterior y ya cumplido la devuelve al equipo', ()=>{
  const ctx=ctxRe();
  const p=persona({'Fecha de ingreso':ANTEAYER,'Fecha de egreso':AYER,'Fecha de reingreso':`${ANIO}-01-15`});
  assert.equal(ctx.reingresoVigente(p),true);
  assert.equal(ctx.yaEgreso(p),false);
  // Y la fecha de egreso sigue ahí: es su historia, no se borró nada.
  assert.equal(p.fields['Fecha de egreso'],AYER);
});

// Un reingreso ya acordado pero que todavía no empezó no la reactiva: hasta
// ese día sigue afuera, y tiene que seguir apareciendo en Ex BEONers.
test('un reingreso a futuro todavía no la reactiva', ()=>{
  const ctx=ctxRe();
  const p=persona({'Fecha de ingreso':ANTEAYER,'Fecha de egreso':AYER,'Fecha de reingreso':MANANA});
  assert.equal(ctx.reingresoVigente(p),false);
  assert.equal(ctx.yaEgreso(p),true);
});

test('un reingreso anterior al egreso es del ciclo viejo y no cuenta', ()=>{
  const ctx=ctxRe();
  // Volvió en 2024, se fue de nuevo el año pasado: hoy está afuera.
  const p=persona({'Fecha de ingreso':ANTEAYER,'Fecha de reingreso':`${ANIO-2}-03-01`,'Fecha de egreso':AYER});
  assert.equal(ctx.reingresoVigente(p),false);
  assert.equal(ctx.yaEgreso(p),true);
});

test('quien nunca se fue no se ve afectado', ()=>{
  const ctx=ctxRe();
  const p=persona({'Fecha de ingreso':ANTEAYER});
  assert.equal(ctx.reingresoVigente(p),false);
  assert.equal(ctx.yaEgreso(p),false);
  assert.equal(ctx.egresoRegistrado(p),false);
});

// Cumpleaños y Aniversarios usan egresoRegistrado(): saludar a alguien en pleno
// offboarding es lo que hay que evitar, pero a quien volvió hay que saludarlo.
test('a quien volvió se lo vuelve a saludar', ()=>{
  const ctx=ctxRe();
  const volvio=persona({'Fecha de egreso':AYER,'Fecha de reingreso':`${ANIO}-01-15`});
  assert.equal(ctx.egresoRegistrado(volvio),false);
  const saliendo=persona({'Fecha de egreso':MANANA});
  assert.equal(ctx.egresoRegistrado(saliendo),true);
});

// ─── La ficha ─────────────────────────────────────────────────────────────────
test('la ficha muestra los dos hitos, no una fecha de egreso suelta', ()=>{
  const ctx=ctxRe();
  const texto=ctx.periodosEnBeonTexto({'Fecha de egreso':AYER,'Fecha de reingreso':`${ANIO}-01-15`});
  assert.match(texto,/^Hasta /);
  assert.match(texto,/reingresó el /);
});

test('con un reingreso a futuro la ficha avisa cuándo vuelve', ()=>{
  const ctx=ctxRe();
  assert.match(ctx.periodosEnBeonTexto({'Fecha de egreso':AYER,'Fecha de reingreso':MANANA}),/vuelve el /);
});

test('sin reingreso, la ficha muestra la fecha de egreso de siempre', ()=>{
  const ctx=ctxRe();
  const texto=ctx.periodosEnBeonTexto({'Fecha de egreso':AYER});
  assert.doesNotMatch(texto,/reingres/);
  assert.equal(ctx.periodosEnBeonTexto({}),'');
});

// ─── El Kanban de Offboarding ─────────────────────────────────────────────────
// La tarjeta no se borra —el offboarding ocurrió— pero sale del tablero: ver
// en Offboarding a alguien que está trabajando hoy sería un error.
test('la tarjeta de quien volvió sale del tablero', ()=>{
  const ctx=ctxRe();
  sembrar(ctx,'cachePersonasRaw',[
    {id:'p1',fields:{Nombre:'Vuelta Atrás','Fecha de egreso':AYER,'Fecha de reingreso':`${ANIO}-01-15`}},
    {id:'p2',fields:{Nombre:'Se Fue','Fecha de egreso':AYER}},
  ]);
  assert.equal(ctx.volvioABeon('Vuelta Atrás'),true);
  assert.equal(ctx.volvioABeon(' vuelta atrás '),true); // mismo criterio de nombre que el resto del Hub
  assert.equal(ctx.volvioABeon('Se Fue'),false);
});

test('un nombre que no está en el caché no saca la tarjeta del tablero', ()=>{
  const ctx=ctxRe();
  sembrar(ctx,'cachePersonasRaw',[]);
  assert.equal(ctx.volvioABeon('Quien Sea'),false);
  assert.equal(ctx.volvioABeon(''),false);
  assert.equal(ctx.volvioABeon(null),false);
});

// El tablero de Offboarding arma sus tarjetas por dos caminos: las de Checklist
// y las "cargas históricas" (gente con Fecha de egreso y sin tarjeta). Quien
// volvió tiene que salir por los dos, o sigue figurando como offboarding
// mientras trabaja.
test('las cargas históricas de quien volvió tampoco entran al tablero', ()=>{
  const ctx=ctxRe();
  const gente=[
    {id:'p1',fields:{Nombre:'Vuelve Pérez','Fecha de ingreso':'2019-03-01','Fecha de egreso':AYER,'Fecha de reingreso':`${ANIO}-01-15`}},
    {id:'p2',fields:{Nombre:'Se Fue','Fecha de ingreso':'2019-03-01','Fecha de egreso':AYER}},
    {id:'p3',fields:{Nombre:'Sigue Acá','Fecha de ingreso':'2019-03-01'}},
  ];
  const historicos=gente.filter(p=>p.fields['Fecha de egreso']&&!ctx.reingresoVigente(p));
  assert.equal(historicos.map(p=>p.fields.Nombre).join('|'),'Se Fue');
});

// ─── El equipo se cuenta desde el día que entra ───────────────────────────────
// Alguien que ingresa la semana que viene ya está cargado (y tiene que estar en
// el Kanban de Ingresos, en Pre-ingreso), pero contarlo en Engineers & Tech
// infla el tamaño del equipo antes de que la persona empiece.
test('quien todavía no empezó no cuenta en el equipo', ()=>{
  const ctx=ctxRe();
  const futuro=persona({'Fecha de ingreso':MANANA});
  assert.equal(ctx.todaviaNoIngreso(futuro),true);
  assert.equal(ctx.estaEnElEquipo(futuro),false);
  assert.equal(ctx.yaEgreso(futuro),false); // no se fue: simplemente no llegó
});

test('quien ya empezó y no se fue cuenta', ()=>{
  const ctx=ctxRe();
  assert.equal(ctx.estaEnElEquipo(persona({'Fecha de ingreso':ANTEAYER})),true);
});

test('un registro sin fecha de ingreso cuenta como que ya está', ()=>{
  const ctx=ctxRe();
  // Cargas viejas a las que nunca se les completó el campo: esconderlas del
  // directorio sería peor que contarlas.
  assert.equal(ctx.todaviaNoIngreso(persona({})),false);
  assert.equal(ctx.estaEnElEquipo(persona({})),true);
});

test('quien se fue no cuenta, aunque haya ingresado hace años', ()=>{
  const ctx=ctxRe();
  assert.equal(ctx.estaEnElEquipo(persona({'Fecha de ingreso':ANTEAYER,'Fecha de egreso':AYER})),false);
});

test('quien volvió sí cuenta', ()=>{
  const ctx=ctxRe();
  const p=persona({'Fecha de ingreso':ANTEAYER,'Fecha de egreso':AYER,'Fecha de reingreso':`${ANIO}-01-15`});
  assert.equal(ctx.estaEnElEquipo(p),true);
});

// ─── "Quién estaba el día X" ──────────────────────────────────────────────────
// Lo usan Off Sites y Asistencia a Actividades. Sin contemplar el reingreso,
// alguien que volvió figuraba como no activo para cualquier fecha posterior a
// su egreso, incluido hoy.
test('personaActivaEnFecha contempla el reingreso', ()=>{
  const ctx=ctxRe();
  const p=persona({'Fecha de ingreso':'2019-03-01','Fecha de egreso':'2025-06-30','Fecha de reingreso':'2026-01-15'});
  assert.equal(ctx.personaActivaEnFecha(p,'2024-05-01'),true);  // primera etapa
  assert.equal(ctx.personaActivaEnFecha(p,'2025-09-01'),false); // afuera
  assert.equal(ctx.personaActivaEnFecha(p,'2026-03-01'),true);  // ya volvió
  assert.equal(ctx.personaActivaEnFecha(p,'2018-01-01'),false); // antes de entrar
});

test('personaActivaEnFecha sin reingreso se comporta igual que antes', ()=>{
  const ctx=ctxRe();
  const p=persona({'Fecha de ingreso':'2019-03-01','Fecha de egreso':'2025-06-30'});
  assert.equal(ctx.personaActivaEnFecha(p,'2024-05-01'),true);
  assert.equal(ctx.personaActivaEnFecha(p,'2025-09-01'),false);
});

// ─── El perfil del checklist ──────────────────────────────────────────────────
// Lo usan los dos lugares que crean tarjetas de ingreso: la sincro automática
// y el reingreso.
test('perfilChecklistDeRol traduce el rol al perfil del checklist', ()=>{
  const ctx=ctxRe();
  assert.equal(ctx.perfilChecklistDeRol('Engineer'),'Engineer');
  assert.equal(ctx.perfilChecklistDeRol('Core Team'),'Core Team');
  assert.equal(ctx.perfilChecklistDeRol('Manager'),'Core Team');
  assert.equal(ctx.perfilChecklistDeRol('Lead'),'Core Team');
  assert.equal(ctx.perfilChecklistDeRol('TEM'),'Otro');
  assert.equal(ctx.perfilChecklistDeRol(''),'Otro');
});

// ─── La tarjeta de ingreso de quien volvió ────────────────────────────────────
// Dos ramas de sincronizarPersonasEnKanban dejaban afuera a quien reingresó:
// "ya tiene tarjeta" daba por buena la del paso anterior, y el corte por Fecha
// de egreso aplica a quien volvió, porque esa fecha se conserva a propósito.
// Resultado: la tarjeta no aparecía nunca.
test('se reconoce la tarjeta de esta vuelta y no la del paso anterior', ()=>{
  const ctx=ctxRe();
  sembrar(ctx,'cachePersonasRaw',[
    {id:'p1',fields:{Nombre:'Vuelve Pérez','Fecha de ingreso':'2019-03-01','Fecha de egreso':'2025-06-30','Fecha de reingreso':'2026-01-15'}},
  ]);
  const vieja={fields:{Persona:'Vuelve Pérez',Tipo:'Ingreso',Fecha:'2019-03-01'}};
  const nueva={fields:{Persona:'Vuelve Pérez',Tipo:'Ingreso',Fecha:'2026-01-15'}};
  assert.equal(ctx.esTarjetaDeReingreso(vieja),false);
  assert.equal(ctx.esTarjetaDeReingreso(nueva),true);
});

test('la tarjeta de alguien que nunca se fue no es de reingreso', ()=>{
  const ctx=ctxRe();
  sembrar(ctx,'cachePersonasRaw',[{id:'p2',fields:{Nombre:'Sigue Acá','Fecha de ingreso':'2019-03-01'}}]);
  assert.equal(ctx.esTarjetaDeReingreso({fields:{Persona:'Sigue Acá',Fecha:'2019-03-01'}}),false);
  assert.equal(ctx.esTarjetaDeReingreso({fields:{Persona:'Quien Sea',Fecha:'2026-01-15'}}),false);
  assert.equal(ctx.esTarjetaDeReingreso({fields:{}}),false);
  assert.equal(ctx.esTarjetaDeReingreso(null),false);
});

// El avance automático marca como completo lo que tiene 15 días o más. Para un
// reingreso cargado con fecha pasada eso tacha los 14 pasos de un saque, que es
// lo contrario de para qué se crea la tarjeta.
test('una tarjeta de reingreso vieja no se autocompleta', ()=>{
  const ctx=ctxRe();
  sembrar(ctx,'cachePersonasRaw',[
    {id:'p1',fields:{Nombre:'Volvió Hace Un Mes','Fecha de ingreso':'2019-03-01','Fecha de egreso':'2025-06-30','Fecha de reingreso':`${ANIO}-01-15`}},
  ]);
  const tarjeta={fields:{Persona:'Volvió Hace Un Mes',Tipo:'Ingreso',Fecha:`${ANIO}-01-15`}};
  const dias=Math.floor((new Date()-new Date(tarjeta.fields.Fecha+'T12:00:00'))/86400000);
  assert.equal(dias>=15,true); // la fecha ya es vieja
  assert.equal(dias>=15&&!ctx.esTarjetaDeReingreso(tarjeta),false); // y aun así no se autocompleta
});
