'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadApp}=require('../test-helpers/load-app');

// personas.js aporta yaEgreso() y calcAntiguedad(); utils.js, getRolGroup().
function ctxEx(){
  return loadApp(['constants.js','utils.js','state.js','personas.js','beneficios.js','ex-beoners.js']);
}
function sembrar(ctx,cache,datos){
  ctx.__fixture=datos;
  vm.runInContext(`${cache}=__fixture`,ctx);
}

const ANIO=new Date().getFullYear();
const PERSONAS=[
  {id:'p1',fields:{Nombre:'Ana Activa','Rol en empresa':'Engineer','Fecha de ingreso':'2020-01-01'}},
  {id:'p2',fields:{Nombre:'Cesar Welchez','Rol en empresa':'Engineer','Fecha de ingreso':'2019-01-01','Fecha de egreso':`${ANIO-1}-06-30`}},
  {id:'p3',fields:{Nombre:'Cesar Bonel','Rol en empresa':'Engineer','Fecha de ingreso':'2018-01-01','Fecha de egreso':`${ANIO-2}-03-15`}},
  {id:'p4',fields:{Nombre:'Vale Core','Rol en empresa':'Manager','Fecha de ingreso':'2021-02-01','Fecha de egreso':`${ANIO}-01-31`}},
  // Offboarding cargado con el último día todavía por delante: sigue
  // trabajando, así que no entra al histórico (mismo criterio que el
  // directorio y el Kanban de Offboarding).
  {id:'p5',fields:{Nombre:'Beto Saliendo','Rol en empresa':'Engineer','Fecha de ingreso':'2022-01-01','Fecha de egreso':`${ANIO+1}-06-30`}},
];

// El histórico tiene datos de gente que ya no está: lo ven People Ops y los
// TEMs (que necesitan consultar el paso por BEON de quienes tuvieron a cargo).
// El resto del equipo no. El bloqueo de los datos está en el servidor; esto
// controla qué aparece en el menú y a dónde deja navegar showSection().
test('Ex BEONers: lo ven full, HR y TEM; manager y el resto del equipo no', ()=>{
  const ctx=ctxEx();
  const roles=vm.runInContext('SECCION_ROLES_PERMITIDOS',ctx).exbeoners;
  ['full','hr','tem'].forEach(rol=>assert.equal(roles.has(rol),true,`${rol} debería ver la sección`));
  ['manager','equipo','bloqueado'].forEach(rol=>assert.equal(roles.has(rol),false,`${rol} no debería ver la sección`));
});

test('la lista son los que ya terminaron, no los que están saliendo', ()=>{
  const ctx=ctxEx();
  sembrar(ctx,'cachePersonasRaw',PERSONAS);
  const nombres=ctx.exBeoners().map(p=>p.fields.Nombre);
  assert.equal(nombres.includes('Ana Activa'),false);
  assert.equal(nombres.includes('Beto Saliendo'),false);
  assert.equal(nombres.length,3);
});

// Se busca "el que se fue hace poco", no por orden alfabético.
test('ordena por salida más reciente primero', ()=>{
  const ctx=ctxEx();
  sembrar(ctx,'cachePersonasRaw',PERSONAS);
  assert.equal(ctx.exBeoners().map(p=>p.fields.Nombre).join('|'),'Vale Core|Cesar Welchez|Cesar Bonel');
});

test('sin nadie egresado la lista queda vacía, no rompe', ()=>{
  const ctx=ctxEx();
  sembrar(ctx,'cachePersonasRaw',[PERSONAS[0]]);
  assert.equal(ctx.exBeoners().length,0);
});

// calcAntiguedad() por defecto cuenta hasta hoy: para alguien que se fue en
// 2024 seguiría creciendo para siempre y diría cualquier cosa.
test('el tiempo en BEON se cuenta hasta la salida, no hasta hoy', ()=>{
  const ctx=ctxEx();
  assert.equal(ctx.tiempoEnBeon({'Fecha de ingreso':'2019-01-01','Fecha de egreso':'2025-06-30'}),'6 años y 5 meses');
  assert.equal(ctx.tiempoEnBeon({'Fecha de ingreso':'2021-02-01','Fecha de egreso':'2026-01-31'}),'4 años y 11 meses');
  assert.equal(ctx.tiempoEnBeon({'Fecha de egreso':'2025-06-30'}),'—'); // sin ingreso cargado
});

test('mesesEnBeon: necesita las dos fechas', ()=>{
  const ctx=ctxEx();
  assert.equal(ctx.mesesEnBeon({'Fecha de ingreso':'2024-01-01','Fecha de egreso':'2025-01-01'}),12);
  assert.equal(ctx.mesesEnBeon({'Fecha de ingreso':'2024-01-15','Fecha de egreso':'2024-03-14'}),1); // no llegó al día
  assert.equal(ctx.mesesEnBeon({'Fecha de ingreso':'2024-01-01'}),null);
  assert.equal(ctx.mesesEnBeon({'Fecha de egreso':'2024-01-01'}),null);
});

test('textoMeses no abrevia: "5 a 10 m" se leía como un rango', ()=>{
  const ctx=ctxEx();
  assert.equal(ctx.textoMeses(70),'5 años 10 meses');
  assert.equal(ctx.textoMeses(24),'2 años');
  assert.equal(ctx.textoMeses(13),'1 año 1 mes');
  assert.equal(ctx.textoMeses(5),'5 meses');
  assert.equal(ctx.textoMeses(1),'1 mes');
});

test('anioDeSalida sale de la fecha, sin parsear a Date', ()=>{
  const ctx=ctxEx();
  assert.equal(ctx.anioDeSalida({'Fecha de egreso':'2025-06-30'}),'2025');
  assert.equal(ctx.anioDeSalida({}),'');
});

// El conteo de beneficios sale del cache de Beneficios, que es lazy. Vacío
// significa "todavía no lo tengo", que no es lo mismo que "no tiene ninguno":
// mostrar 0 ahí sería afirmar algo falso.
test('sin el cache de beneficios la columna dice "no sé", no 0', ()=>{
  const ctx=ctxEx();
  sembrar(ctx,'cacheBenefAsignados',[]);
  assert.equal(ctx.beneficiosDeExBeoner('Cesar Welchez'),null);
});

test('cuenta los registros de cada persona y no los mezcla', ()=>{
  const ctx=ctxEx();
  sembrar(ctx,'cacheBenefAsignados',[
    {id:'a1',fields:{Persona:'Cesar Welchez',Beneficio:'Terapia'}},
    {id:'a2',fields:{Persona:['Cesar Welchez'],Beneficio:'Udemy'}},  // linked record sin resolver
    {id:'a3',fields:{Persona:'Cesar Bonel',Beneficio:'Udemy'}},
  ]);
  assert.equal(ctx.beneficiosDeExBeoner('Cesar Welchez'),2);
  assert.equal(ctx.beneficiosDeExBeoner('Cesar Bonel'),1);
  assert.equal(ctx.beneficiosDeExBeoner('Ana Activa'),0);
});
