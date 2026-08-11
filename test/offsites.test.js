'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadApp}=require('../test-helpers/load-app');

const ctx=loadApp(['offsites.js']);

test('calcDiasOS: usa el campo "Días" si viene cargado, sin recalcular', ()=>{
  assert.equal(ctx.calcDiasOS({'Días':5,'Fecha inicio':'2024-01-01','Fecha fin':'2024-01-01'}),5);
});

test('calcDiasOS: calcula por fechas cuando no hay campo "Días" (rango inclusivo)', ()=>{
  assert.equal(ctx.calcDiasOS({'Fecha inicio':'2024-01-01','Fecha fin':'2024-01-05'}),5);
  assert.equal(ctx.calcDiasOS({'Fecha inicio':'2024-01-01','Fecha fin':'2024-01-01'}),1);
});

test('calcDiasOS: sin días ni fechas, devuelve 0 en vez de NaN', ()=>{
  assert.equal(ctx.calcDiasOS({}),0);
});

test('calcDiasOS: fecha fin anterior a fecha inicio no da un número negativo', ()=>{
  assert.equal(ctx.calcDiasOS({'Fecha inicio':'2024-01-10','Fecha fin':'2024-01-01'}),0);
});

// ─── Personas egresadas en un registro histórico ──────────────────────────────
// Off Sites es histórico: el viaje pasó de verdad, así que quien ya se fue de
// BEON tiene que seguir listándose (antes personaActiva() lo filtraba y se
// perdían registros pasados enteros al egresar alguien).
const vm=require('node:vm');

function ctxOffsites(){
  const c=loadApp(['state.js','utils.js','personas.js','offsites.js']);
  vm.runInContext(`
    cachePersonasRaw=[
      {id:'recANA',  fields:{Nombre:'Ana Test'}},
      {id:'recBRUNO',fields:{Nombre:'Bruno Diaz','Fecha de egreso':'2020-03-01'}},
    ];
  `,c);
  return c;
}

test('badgeExBeoner: marca a quien ya egresó y deja limpio a quien sigue activo', ()=>{
  const c=ctxOffsites();
  assert.match(vm.runInContext(`badgeExBeoner('Bruno Diaz')`,c),/>ex</);
  assert.equal(vm.runInContext(`badgeExBeoner('Ana Test')`,c),'');
});

test('badgeExBeoner: no marca a alguien que no está en la tabla Personas', ()=>{
  const c=ctxOffsites();
  assert.equal(vm.runInContext(`badgeExBeoner('recBORRADA')`,c),'');
});

test('nombrePersonaHistorico: placeholder explícito en vez de celda vacía', ()=>{
  const c=ctxOffsites();
  assert.match(vm.runInContext(`nombrePersonaHistorico('')`,c),/Sin persona asignada/);
  assert.match(vm.runInContext(`nombrePersonaHistorico(undefined)`,c),/Sin persona asignada/);
});

test('nombrePersonaHistorico: un ID crudo de Airtable no se muestra tal cual', ()=>{
  const c=ctxOffsites();
  // Es lo que queda cuando el linked record apunta a una persona ya borrada
  assert.match(vm.runInContext(`nombrePersonaHistorico('recABCDEFGHIJKLMN')`,c),/Persona no encontrada/);
  // Un nombre real que casualmente empieza con "rec" no debe confundirse
  assert.equal(vm.runInContext(`nombrePersonaHistorico('Recaredo Perez')`,c),'Recaredo Perez');
});

test('buildOSProyMap: incluye a la persona egresada en el proyecto', ()=>{
  const c=ctxOffsites();
  const personas=vm.runInContext(`
    cacheOSRaw=[{id:'os1',fields:{Persona:'Bruno Diaz',Proyecto:'Connectiv',Destino:'Las Vegas','Fecha inicio':'2025-02-10','Fecha fin':'2025-02-14'}}];
    buildOSProyMap();
    JSON.stringify([...cacheOSProyMap['Connectiv'].personas]);
  `,c);
  assert.equal(personas,JSON.stringify(['Bruno Diaz']));
});
