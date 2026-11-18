'use strict';
// Cuando alguien deja BEON sus beneficios dejan de correr. Para quien se fue y
// no volvió eso ya se resolvía cerrando la card entera. Lo que faltaba es el
// caso de quien se fue y VOLVIÓ: su registro vuelve a contar como activo, y lo
// que se le había dado en la etapa anterior —y ya no se le cubre— reaparecía
// como vigente hoy, sumando al presupuesto y al conteo de beneficios.
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadApp}=require('../test-helpers/load-app');

function ctxEtapa(){
  return loadApp(['constants.js','utils.js','state.js','personas.js','beneficios.js','side-panel.js']);
}
function sembrar(ctx,cache,datos){
  ctx.__fixture=datos;
  vm.runInContext(`${cache}=__fixture`,ctx);
}

const ANIO=new Date().getFullYear();
const VIEJO=`${ANIO-4}-10-18`;        // cuando se le dio el beneficio la primera vez
const EGRESO=`${ANIO-2}-02-28`;       // cuando se fue
const REINGRESO=`${ANIO-1}-09-01`;    // cuando volvió
const NUEVO=`${ANIO-1}-10-05`;        // lo que se le dio al volver
const FUTURO=`${ANIO+1}-06-30`;

const VOLVIO={id:'p1',fields:{Nombre:'Oscar Ortiz','Fecha de ingreso':`${ANIO-5}-05-01`,
  'Fecha de egreso':EGRESO,'Fecha de reingreso':REINGRESO}};
const SE_FUE={id:'p2',fields:{Nombre:'Se Fue','Fecha de ingreso':`${ANIO-5}-05-01`,
  'Fecha de egreso':EGRESO}};
const SIEMPRE={id:'p3',fields:{Nombre:'Siempre Acá','Fecha de ingreso':`${ANIO-5}-05-01`}};
const CATALOGO=[{id:'bAI',fields:{Beneficio:'AI Tools',Valor:10}}];

const asig=(persona,fecha,monto)=>({id:'a'+fecha,fields:{Persona:persona,Beneficio:['bAI'],
  Monto:monto,'Fecha activación':fecha,Estado:'Activo'}});

// ── finEtapaDeBeneficio: de qué etapa viene cada beneficio ──

test('quien nunca se fue tiene todo abierto',()=>{
  const ctx=ctxEtapa();
  assert.equal(ctx.finEtapaDeBeneficio(SIEMPRE,VIEJO),'');
});

test('quien se fue y no volvió tiene todo cerrado a su fecha de egreso',()=>{
  const ctx=ctxEtapa();
  assert.equal(ctx.finEtapaDeBeneficio(SE_FUE,VIEJO),EGRESO);
  assert.equal(ctx.finEtapaDeBeneficio(SE_FUE,''),EGRESO);
});

test('quien volvió: lo de antes del egreso se cierra, lo de después sigue',()=>{
  const ctx=ctxEtapa();
  assert.equal(ctx.finEtapaDeBeneficio(VOLVIO,VIEJO),EGRESO);
  assert.equal(ctx.finEtapaDeBeneficio(VOLVIO,NUEVO),'');
  // El día del egreso todavía es parte de la etapa que terminó.
  assert.equal(ctx.finEtapaDeBeneficio(VOLVIO,EGRESO),EGRESO);
});

test('quien volvió, sin fecha de activación: no se cierra lo que no se puede fechar',()=>{
  const ctx=ctxEtapa();
  assert.equal(ctx.finEtapaDeBeneficio(VOLVIO,''),'');
});

test('un egreso futuro no cierra nada: la persona todavía está',()=>{
  const ctx=ctxEtapa();
  const saliendo={id:'p4',fields:{Nombre:'Se Va','Fecha de ingreso':`${ANIO-3}-01-01`,
    'Fecha de egreso':FUTURO}};
  assert.equal(ctx.finEtapaDeBeneficio(saliendo,VIEJO),'');
});

// ── asignacionVigente: el criterio único de "lo que hoy se le cubre" ──

test('asignacionVigente deja afuera lo de la etapa anterior y conserva lo nuevo',()=>{
  const ctx=ctxEtapa();
  sembrar(ctx,'cachePersonasRaw',[VOLVIO]);
  assert.equal(ctx.asignacionVigente(asig('Oscar Ortiz',VIEJO,10)),false);
  assert.equal(ctx.asignacionVigente(asig('Oscar Ortiz',NUEVO,100)),true);
});

test('asignacionVigente respeta el Estado cargado a mano',()=>{
  const ctx=ctxEtapa();
  sembrar(ctx,'cachePersonasRaw',[SIEMPRE]);
  const a=asig('Siempre Acá',VIEJO,10);
  a.fields.Estado='Inactivo';
  assert.equal(ctx.asignacionVigente(a),false);
});

test('asignacionVigente no cambia nada para quien nunca se fue',()=>{
  const ctx=ctxEtapa();
  sembrar(ctx,'cachePersonasRaw',[SIEMPRE]);
  assert.equal(ctx.asignacionVigente(asig('Siempre Acá',VIEJO,10)),true);
});

test('una persona que no está en el caché no se cierra por las dudas',()=>{
  const ctx=ctxEtapa();
  sembrar(ctx,'cachePersonasRaw',[]);
  assert.equal(ctx.asignacionVigente(asig('Nadie Conocido',VIEJO,10)),true);
});

test('el nombre matchea con acentos y mayúsculas distintas',()=>{
  const ctx=ctxEtapa();
  sembrar(ctx,'cachePersonasRaw',[{...VOLVIO,fields:{...VOLVIO.fields,Nombre:'Jesús Figueroa'}}]);
  assert.equal(ctx.asignacionVigente(asig('jesus  figueroa',VIEJO,10)),false);
});

// ── El presupuesto, que es el número que se reportó mal ──

test('el presupuesto no suma lo de la etapa anterior',()=>{
  const ctx=ctxEtapa();
  sembrar(ctx,'cachePersonasRaw',[VOLVIO]);
  const todas=[asig('Oscar Ortiz',VIEJO,20),asig('Oscar Ortiz',NUEVO,100)];
  // Sin filtrar, AI Tools es mensual: (20+100)×12 = $1.440
  assert.equal(ctx.sumarMontosAsignados(todas,CATALOGO),1440);
  // Filtrando por lo vigente queda solo lo que se le cubre hoy: 100×12
  assert.equal(ctx.sumarMontosAsignados(todas.filter(ctx.asignacionVigente),CATALOGO),1200);
});

// ── Cómo se lee en la card ──

test('finEtapaPreviaDe da la fecha de corte solo para quien volvió',()=>{
  const ctx=ctxEtapa();
  sembrar(ctx,'cachePersonasRaw',[VOLVIO,SE_FUE,SIEMPRE]);
  assert.equal(ctx.finEtapaPreviaDe('Oscar Ortiz'),EGRESO);
  assert.equal(ctx.finEtapaPreviaDe('Se Fue'),'');        // lo cubre finEnBeonDe
  assert.equal(ctx.finEtapaPreviaDe('Siempre Acá'),'');
  assert.equal(ctx.finEnBeonDe('Oscar Ortiz'),'');        // hoy está en BEON
  assert.equal(ctx.finEnBeonDe('Se Fue'),EGRESO);
});

test('la fila cerrada dice hasta cuándo corrió, no "Activo desde"',()=>{
  const ctx=ctxEtapa();
  const texto=ctx.periodoBenefAsignado({Estado:'Activo','Fecha activación':VIEJO},'AI Tools',EGRESO);
  assert.match(texto,/hasta su salida/);
  assert.doesNotMatch(texto,/Activo desde/);
  assert.match(ctx.badgeEstadoBenefHistorico('Activo',EGRESO),/Cerrado/);
  // Y la que sigue corriendo no cambia
  assert.match(ctx.periodoBenefAsignado({Estado:'Activo','Fecha activación':NUEVO},'AI Tools',''),/Activo desde/);
});

test('el encabezado del grupo muestra el monto vigente, no la suma de las dos etapas',()=>{
  const ctx=ctxEtapa();
  const g={nombre:'AI Tools',benef:CATALOGO[0],cerradas:1,items:[
    {r:asig('Henry',NUEVO,100),fin:''},
    {r:asig('Henry',VIEJO,20),fin:EGRESO},
  ]};
  assert.match(ctx.montoGrupoBenef(g),/\$100\/mes/);
  assert.doesNotMatch(ctx.montoGrupoBenef(g),/120/);
  assert.equal(ctx.resumenGrupoBenef(g,''),'1 vigente · 1 de su etapa anterior');
});

test('si NO quedó nada vigente, el encabezado sigue sumando el histórico',()=>{
  const ctx=ctxEtapa();
  const g={nombre:'AI Tools',benef:CATALOGO[0],cerradas:2,items:[
    {r:asig('Se Fue',NUEVO,20),fin:EGRESO},
    {r:asig('Se Fue',VIEJO,10),fin:EGRESO},
  ]};
  assert.match(ctx.montoGrupoBenef(g),/\$30\/mes/);
});

test('agruparBenefAsignados no cuenta como activa una asignación cerrada',()=>{
  const ctx=ctxEtapa();
  const grupos=ctx.agruparBenefAsignados([
    {r:asig('Henry',NUEVO,100),benef:CATALOGO[0],nombre:'AI Tools',fin:''},
    {r:asig('Henry',VIEJO,20),benef:CATALOGO[0],nombre:'AI Tools',fin:EGRESO},
  ]);
  assert.equal(grupos.length,1);
  assert.equal(grupos[0].activos,1);
  assert.equal(grupos[0].cerradas,1);
});
