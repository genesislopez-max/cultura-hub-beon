'use strict';
// Un beneficio con fecha anterior al ingreso de la persona no puede estar
// corriendo: ese día todavía no trabajaba acá. Mientras figuraba activo sumaba
// al presupuesto y al monto vigente del beneficio (el caso de la lista de
// accounting: una fecha cargada cuatro años antes del ingreso).
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadApp}=require('../test-helpers/load-app');

function ctxPre(){
  return loadApp(['constants.js','utils.js','state.js','personas.js','beneficios.js','side-panel.js']);
}
function sembrar(ctx,cache,datos){
  ctx.__fixture=datos;
  vm.runInContext(`${cache}=__fixture`,ctx);
}

const INGRESO='2026-06-01';
const ANTES='2022-05-20';     // el error de la lista #23
const VISPERA='2026-05-29';   // tres días antes del primer día
const DESPUES='2026-06-02';

const PERSONA={id:'p1',fields:{Nombre:'Wilfredo Machado','Fecha de ingreso':INGRESO}};
const SIN_INGRESO={id:'p2',fields:{Nombre:'Sin Fecha'}};
const CATALOGO=[{id:'bAI',fields:{Beneficio:'AI Tools',Valor:20}}];
const asig=(persona,fecha,monto)=>({id:'a'+fecha,fields:{Persona:persona,Beneficio:['bAI'],
  Monto:monto,'Fecha activación':fecha,Estado:'Activo'}});

test('un beneficio anterior al ingreso devuelve la fecha de ingreso',()=>{
  const ctx=ctxPre();
  assert.equal(ctx.beneficioAnteriorAlIngreso(PERSONA,ANTES),INGRESO);
  assert.equal(ctx.beneficioAnteriorAlIngreso(PERSONA,VISPERA),INGRESO);
});

test('uno posterior al ingreso no se toca',()=>{
  const ctx=ctxPre();
  assert.equal(ctx.beneficioAnteriorAlIngreso(PERSONA,DESPUES),'');
});

test('el mismo día del ingreso es válido: es su primer día',()=>{
  const ctx=ctxPre();
  assert.equal(ctx.beneficioAnteriorAlIngreso(PERSONA,INGRESO),'');
});

test('sin fecha de ingreso o sin fecha de activación no se decide nada',()=>{
  const ctx=ctxPre();
  assert.equal(ctx.beneficioAnteriorAlIngreso(SIN_INGRESO,ANTES),'');
  assert.equal(ctx.beneficioAnteriorAlIngreso(PERSONA,''),'');
});

test('asignacionVigente deja afuera lo anterior al ingreso',()=>{
  const ctx=ctxPre();
  sembrar(ctx,'cachePersonasRaw',[PERSONA]);
  assert.equal(ctx.asignacionVigente(asig('Wilfredo Machado',ANTES,20)),false);
  assert.equal(ctx.asignacionVigente(asig('Wilfredo Machado',DESPUES,20)),true);
});

test('una persona que no está en el caché no se cierra por las dudas',()=>{
  const ctx=ctxPre();
  sembrar(ctx,'cachePersonasRaw',[]);
  assert.equal(ctx.asignacionVigente(asig('Nadie Conocido',ANTES,20)),true);
});

test('el presupuesto no suma lo anterior al ingreso',()=>{
  const ctx=ctxPre();
  sembrar(ctx,'cachePersonasRaw',[PERSONA]);
  const todas=[asig('Wilfredo Machado',ANTES,20),asig('Wilfredo Machado',DESPUES,20)];
  assert.equal(ctx.sumarMontosAsignados(todas,CATALOGO),480);                        // sin filtrar
  assert.equal(ctx.sumarMontosAsignados(todas.filter(ctx.asignacionVigente),CATALOGO),240);
});

test('asignacionesAnterioresAlIngreso junta las que hay que corregir',()=>{
  const ctx=ctxPre();
  sembrar(ctx,'cachePersonasRaw',[PERSONA,SIN_INGRESO]);
  const fuera=ctx.asignacionesAnterioresAlIngreso([
    asig('Wilfredo Machado',ANTES,20),
    asig('Wilfredo Machado',DESPUES,20),
    asig('Sin Fecha',ANTES,20),
  ]);
  assert.equal(fuera.length,1);
  assert.equal(fuera[0].fields['Fecha activación'],ANTES);
});

// ── Cómo se lee ──

test('la fila muestra las dos fechas, no "Activo desde"',()=>{
  const ctx=ctxPre();
  const texto=ctx.periodoAnteriorAlIngreso({'Fecha activación':ANTES},INGRESO);
  assert.match(texto,/20 de may de 2022/);
  assert.match(texto,/anterior a su ingreso/);
  assert.match(texto,/01 de jun de 2026/);
  assert.doesNotMatch(texto,/Activo desde/);
});

test('el badge dice "Fuera de período", no "Cerrado"',()=>{
  const ctx=ctxPre();
  const b=ctx.badgeAnteriorAlIngreso();
  assert.match(b,/Fuera de período/);
  assert.doesNotMatch(b,/Cerrado/);
  // No se cerró: nunca llegó a correr, y la fecha probablemente esté mal.
  assert.match(b,/mal cargada/);
});

test('el encabezado del grupo no suma lo anterior al ingreso',()=>{
  const ctx=ctxPre();
  const g={nombre:'AI Tools',benef:CATALOGO[0],cerradas:0,preIngreso:1,items:[
    {r:asig('Wilfredo Machado',DESPUES,20),fin:'',preIngreso:''},
    {r:asig('Wilfredo Machado',ANTES,20),fin:'',preIngreso:INGRESO},
  ]};
  assert.match(ctx.montoGrupoBenef(g),/\$20\/mes/);
  assert.doesNotMatch(ctx.montoGrupoBenef(g),/\$40/);
  assert.equal(ctx.resumenGrupoBenef(g,''),'1 vigente · 1 anterior a su ingreso');
});

test('un grupo con las dos cosas las nombra por separado',()=>{
  const ctx=ctxPre();
  const g={nombre:'AI Tools',benef:CATALOGO[0],cerradas:1,preIngreso:1,items:[
    {r:asig('X',DESPUES,20),fin:'',preIngreso:''},
    {r:asig('X',ANTES,20),fin:'',preIngreso:INGRESO},
    {r:asig('X','2024-01-01',20),fin:'2025-02-28',preIngreso:''},
  ]};
  assert.equal(ctx.resumenGrupoBenef(g,''),'1 vigente · 1 de su etapa anterior · 1 anterior a su ingreso');
});

test('agruparBenefAsignados no cuenta como activa una fila anterior al ingreso',()=>{
  const ctx=ctxPre();
  const grupos=ctx.agruparBenefAsignados([
    {r:asig('W',DESPUES,20),benef:CATALOGO[0],nombre:'AI Tools',fin:'',preIngreso:''},
    {r:asig('W',ANTES,20),benef:CATALOGO[0],nombre:'AI Tools',fin:'',preIngreso:INGRESO},
  ]);
  assert.equal(grupos[0].activos,1);
  assert.equal(grupos[0].preIngreso,1);
});

test('fueraDePeriodo cubre los dos motivos',()=>{
  const ctx=ctxPre();
  assert.equal(ctx.fueraDePeriodo({fin:'2025-02-28',preIngreso:''}),true);
  assert.equal(ctx.fueraDePeriodo({fin:'',preIngreso:INGRESO}),true);
  assert.equal(ctx.fueraDePeriodo({fin:'',preIngreso:''}),false);
});
