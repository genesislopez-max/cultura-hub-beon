'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadApp}=require('../test-helpers/load-app');

// Get Together es un registro histórico: el encuentro pasó de verdad, así que
// quien fue tiene que seguir apareciendo aunque ya no trabaje en BEON. Antes
// renderGTPersona() y renderGTHistorial() filtraban con personaActiva() y esos
// encuentros desaparecían enteros al egresar alguien — el mismo problema que ya
// se había corregido en Off Sites.
function ctxGT(){
  const c=loadApp(['constants.js','state.js','utils.js','personas.js','get-together.js']);
  vm.runInContext(`
    cachePersonasRaw=[
      {id:'recCESAR', fields:{Nombre:'Cesar Bonilla'}},
      {id:'recVIEJA', fields:{Nombre:'Vieja Beoner','Fecha de egreso':'2025-01-15'}},
    ];
  `,c);
  return c;
}

const ctx=ctxGT();

test('badgeExBeoner: marca a quien ya no está en BEON y no a quien sigue', ()=>{
  assert.match(ctx.badgeExBeoner('Vieja Beoner'),/badge/);
  assert.equal(ctx.badgeExBeoner('Cesar Bonilla'),'');
});

// El linked record puede quedar vacío (nadie cargado) o apuntando a un record
// borrado, y ahí Airtable nos deja solo el ID crudo. Un "—" pelado no distingue
// los dos casos y se lee como un bug de la app.
test('nombrePersonaHistorico: un registro sin persona dice qué le falta', ()=>{
  assert.match(ctx.nombrePersonaHistorico(''),/Sin persona asignada/);
  assert.match(ctx.nombrePersonaHistorico(undefined),/Sin persona asignada/);
  assert.match(ctx.nombrePersonaHistorico('recAbCdEfGhIjKlMn'),/Persona no encontrada/);
  assert.equal(ctx.nombrePersonaHistorico('Cesar Bonilla'),'Cesar Bonilla');
});

// El modal de ciudad contaba los BEONers con un Set sobre `BEONer||''`, así que
// un registro sin persona cargada entraba como '' y sumaba uno: el encabezado
// decía "2 BEONers distintos" listando una sola persona y una fila en blanco.
function contarBeoners(recs){
  return new Set(recs.map(r=>r.fields.BEONer||'').filter(Boolean)).size;
}

test('conteo de BEONers: un registro sin persona no cuenta como persona', ()=>{
  const recs=[
    {fields:{BEONer:'Cesar Bonilla'}},
    {fields:{BEONer:'Vieja Beoner'}},
    {fields:{BEONer:''}},
  ];
  assert.equal(contarBeoners(recs),2);
});

test('conteo de BEONers: la misma persona en dos registros cuenta una vez', ()=>{
  const recs=[
    {fields:{BEONer:'Cesar Bonilla'}},
    {fields:{BEONer:'Cesar Bonilla'}},
  ];
  assert.equal(contarBeoners(recs),1);
});

test('conteo de BEONers: los egresados sí cuentan — el encuentro pasó', ()=>{
  const recs=[
    {fields:{BEONer:'Cesar Bonilla'}},
    {fields:{BEONer:'Vieja Beoner'}},
  ];
  assert.equal(contarBeoners(recs),2);
  // y ninguna de las dos se filtra por estar egresada
  assert.equal(ctx.personaActiva('Vieja Beoner'),false); // sigue siendo ex…
  assert.match(ctx.nombrePersonaHistorico('Vieja Beoner'),/Vieja Beoner/); // …pero se muestra
});
