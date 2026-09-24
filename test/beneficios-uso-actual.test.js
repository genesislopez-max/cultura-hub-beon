'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadApp}=require('../test-helpers/load-app');

// personas.js aporta yaEgreso() y normalizarNivel().
function ctxUso(){
  return loadApp(['constants.js','utils.js','state.js','personas.js','beneficios.js']);
}
function sembrar(ctx,cache,datos){
  ctx.__fixture=datos;
  vm.runInContext(`${cache}=__fixture`,ctx);
}

const ANIO_PASADO=`${new Date().getFullYear()-1}-06-30`;
const PERSONAS=[
  {id:'p1',fields:{Nombre:'Ana Eng','Rol en empresa':'Engineer','Nivel Loyalty':'Storm'}},
  {id:'p2',fields:{Nombre:'Beto Eng','Rol en empresa':'Engineer','Nivel Loyalty':'Spark'}},
  {id:'p3',fields:{Nombre:'Caro Eng','Rol en empresa':'Engineer','Nivel Loyalty':'Spark'}},
  {id:'p4',fields:{Nombre:'Dani Core','Rol en empresa':'Manager','Nivel Loyalty':'Ray'}},
  // Ya no está: su asignación sigue cargada pero no puede contar como uso.
  {id:'p5',fields:{Nombre:'Eli Ex','Rol en empresa':'Engineer','Nivel Loyalty':'Storm','Fecha de egreso':ANIO_PASADO}},
];
const BENEFICIOS=[
  {id:'b1',fields:{Beneficio:'Terapia',Estado:'Activo',Grupo:'Ambos'}},
  {id:'b2',fields:{Beneficio:'Hardware Bonus',Estado:'Activo',Grupo:'Engineers'}},
  {id:'b3',fields:{Beneficio:'Coaching',Estado:'Activo',Grupo:'Ambos','Nivel Loyalty':'Storm'}},
  {id:'b4',fields:{Beneficio:'Discontinuado',Estado:'Inactivo',Grupo:'Ambos'}},
];
const asignado=(persona,beneficio,estado)=>({
  id:`${persona}-${beneficio}`,
  fields:{Persona:persona,Beneficio:beneficio,Estado:estado||'Activo'},
});

function conDatos(asignaciones){
  const ctx=ctxUso();
  sembrar(ctx,'cachePersonasRaw',PERSONAS);
  sembrar(ctx,'cacheBeneficiosRaw',BENEFICIOS);
  sembrar(ctx,'cacheBenefAsignados',asignaciones);
  return ctx;
}
const fila=(filas,nombre)=>filas.find(f=>f.nombre===nombre);

test('el porcentaje es sobre quienes pueden tener el beneficio, no sobre todo el equipo', ()=>{
  // Hardware Bonus es solo de Engineers: 1 de los 3 Engineers activos, no 1 de 4.
  const ctx=conDatos([asignado('Ana Eng','Hardware Bonus')]);
  const hw=fila(ctx.usoActualBeneficios(''),'Hardware Bonus');
  assert.equal(hw.usando,1);
  assert.equal(hw.elegibles,3);
  assert.equal(hw.pct,33);
});

test('un beneficio de Ambos se mide contra todo el equipo activo', ()=>{
  const ctx=conDatos([asignado('Ana Eng','Terapia'),asignado('Dani Core','Terapia')]);
  const t=fila(ctx.usoActualBeneficios(''),'Terapia');
  assert.equal(t.usando,2);
  assert.equal(t.elegibles,4); // los 4 activos; Eli Ex no cuenta
  assert.equal(t.pct,50);
});

// El nivel Loyalty también acota: medir un beneficio de Storm contra todo el
// equipo daría un porcentaje bajo que no dice nada.
test('el nivel mínimo Loyalty acota a los elegibles', ()=>{
  const ctx=conDatos([asignado('Ana Eng','Coaching')]);
  const c=fila(ctx.usoActualBeneficios(''),'Coaching');
  assert.equal(c.elegibles,1); // solo Ana llega a Storm
  assert.equal(c.pct,100);
});

// Se dan excepciones: alguien tiene el beneficio sin llegar al nivel. Sin
// contarlo como elegible, el porcentaje pasaba de 100.
test('quien ya lo tiene cuenta como elegible aunque no llegue al nivel', ()=>{
  const ctx=conDatos([asignado('Ana Eng','Coaching'),asignado('Beto Eng','Coaching')]);
  const c=fila(ctx.usoActualBeneficios(''),'Coaching');
  assert.equal(c.usando,2);
  assert.equal(c.elegibles,2);
  assert.equal(c.pct,100);
});

test('quien ya no está en BEON no cuenta como uso', ()=>{
  const ctx=conDatos([asignado('Eli Ex','Terapia')]);
  const t=fila(ctx.usoActualBeneficios(''),'Terapia');
  assert.equal(t.usando,0);
  assert.equal(t.elegibles,4);
  assert.equal(t.pct,0);
});

test('una asignación dada de baja no cuenta como uso', ()=>{
  const ctx=conDatos([asignado('Ana Eng','Terapia','Inactivo'),asignado('Beto Eng','Terapia','En pausa')]);
  assert.equal(fila(ctx.usoActualBeneficios(''),'Terapia').usando,0);
});

test('dos asignaciones de la misma persona son una persona usándolo', ()=>{
  const ctx=conDatos([
    {id:'x1',fields:{Persona:'Ana Eng',Beneficio:'Terapia',Estado:'Activo'}},
    {id:'x2',fields:{Persona:' ana eng ',Beneficio:'Terapia',Estado:'Activo'}},
  ]);
  assert.equal(fila(ctx.usoActualBeneficios(''),'Terapia').usando,1);
});

test('un beneficio inactivo del catálogo no se lista', ()=>{
  const ctx=conDatos([]);
  assert.equal(fila(ctx.usoActualBeneficios(''),'Discontinuado'),undefined);
});

test('el filtro de grupo acota las dos puntas', ()=>{
  const ctx=conDatos([asignado('Ana Eng','Terapia'),asignado('Dani Core','Terapia')]);
  const eng=fila(ctx.usoActualBeneficios('Engineers'),'Terapia');
  assert.equal(eng.usando,1);
  assert.equal(eng.elegibles,3);
  const core=fila(ctx.usoActualBeneficios('Core Team'),'Terapia');
  assert.equal(core.usando,1);
  assert.equal(core.elegibles,1);
  assert.equal(core.pct,100);
  // Hardware Bonus es de Engineers: en Core Team no lo puede tener nadie.
  assert.equal(fila(ctx.usoActualBeneficios('Core Team'),'Hardware Bonus').elegibles,0);
});

test('sin elegibles el porcentaje es 0 y no una división por cero', ()=>{
  const ctx=conDatos([]);
  const hw=fila(ctx.usoActualBeneficios('Core Team'),'Hardware Bonus');
  assert.equal(hw.elegibles,0);
  assert.equal(hw.pct,0);
});

test('ordena por porcentaje de uso, de mayor a menor', ()=>{
  const ctx=conDatos([
    asignado('Ana Eng','Coaching'),                                  // 1 de 1 → 100%
    asignado('Ana Eng','Terapia'),asignado('Dani Core','Terapia'),   // 2 de 4 → 50%
    asignado('Ana Eng','Hardware Bonus'),                            // 1 de 3 → 33%
  ]);
  assert.equal(ctx.usoActualBeneficios('').map(f=>f.nombre).join('|'),'Coaching|Terapia|Hardware Bonus');
});

test('el desglose por grupo cuenta a quienes lo usan', ()=>{
  const ctx=conDatos([asignado('Ana Eng','Terapia'),asignado('Beto Eng','Terapia'),asignado('Dani Core','Terapia')]);
  const t=fila(ctx.usoActualBeneficios(''),'Terapia');
  assert.equal(t.porGrupo.Engineers,2);
  assert.equal(t.porGrupo['Core Team'],1);
  assert.equal(ctx.desgloseGrupoTexto(t.porGrupo),'2 Eng · 1 Core');
});

// Un beneficio que no le corresponde a nadie del grupo elegido no es "nadie lo
// usa": es que ahí no aplica. Va al final de la lista y la fila lo dice.
test('los que no aplican al grupo quedan al final', ()=>{
  const ctx=conDatos([asignado('Dani Core','Terapia')]);
  const nombres=ctx.usoActualBeneficios('Core Team').map(f=>f.nombre);
  assert.equal(nombres[0],'Terapia');                  // 1 de 1
  assert.equal(nombres.includes('Hardware Bonus'),true); // sigue listado
  assert.equal(nombres[nombres.length-1]!=='Terapia',true);
  // Los últimos son los que no tienen elegibles.
  const ultimos=ctx.usoActualBeneficios('Core Team').slice(1);
  assert.equal(ultimos.every(f=>f.elegibles===0),true);
});
