'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadApp}=require('../test-helpers/load-app');

// La tabla "Historial Loyalty" la escribe cambiarNivel() en cada cambio de
// nivel, pero el único que la leía era el resumen mensual de Slack. Si ese
// mensaje no llegaba, los cambios del mes no se veían en ningún lado.

function leer(c,expr){ return vm.runInContext(expr,c); }
function sembrar(c,cache,datos){
  c.__fixture=datos;
  vm.runInContext(`${cache}=__fixture`,c);
}
function ctxLoyalty(){
  // personas.js aporta normalizarNivel(); utils.js, MESES_ES y los helpers de
  // nombre; state.js, los caches.
  return loadApp(['constants.js','state.js','personas.js','utils.js','loyalty-historial.js'],
    {puedeEscribir:()=>true});
}

const HISTORIAL=[
  {id:'h1',fields:{Persona:'Ana Dev','Nivel anterior':'Spark','Nivel nuevo':'Ray',Fecha:'2026-11-05'}},
  {id:'h2',fields:{Persona:'Jesus Figueroa','Nivel anterior':'Lightning ','Nivel nuevo':'thunder',Fecha:'2026-11-12'}},
  {id:'h3',fields:{Persona:'Otro','Nivel anterior':'Spark','Nivel nuevo':'Ray',Fecha:'2026-10-20'}},
  {id:'h4',fields:{Persona:'Sin fecha','Nivel anterior':'Spark','Nivel nuevo':'Ray'}},
];

test('mesDeFecha: el mes de una fecha de Airtable',()=>{
  const c=ctxLoyalty();
  assert.equal(leer(c,'mesDeFecha("2026-11-05")'),'2026-11');
  assert.equal(leer(c,'mesDeFecha("")'),'');
  assert.equal(leer(c,'mesDeFecha(undefined)'),'');
});

test('etiquetaMesLoyalty: en castellano, y sin romperse con basura',()=>{
  const c=ctxLoyalty();
  assert.equal(leer(c,'etiquetaMesLoyalty("2026-11")'),'noviembre de 2026');
  assert.equal(leer(c,'etiquetaMesLoyalty("2026-01")'),'enero de 2026');
  assert.equal(leer(c,'etiquetaMesLoyalty("")'),'—');
  assert.equal(leer(c,'etiquetaMesLoyalty("2026-99")'),'—');
});

test('cambiosLoyaltyDelMes: solo los del mes pedido',()=>{
  const c=ctxLoyalty();
  sembrar(c,'cacheHistorialLoyaltyRaw',HISTORIAL);
  assert.equal(leer(c,'cambiosLoyaltyDelMes("2026-11").map(r=>r.id).join("|")'),'h1|h2');
  assert.equal(leer(c,'cambiosLoyaltyDelMes("2026-10").map(r=>r.id).join("|")'),'h3');
  assert.equal(leer(c,'cambiosLoyaltyDelMes("2026-09").length'),0);
});

test('mesesConCambiosLoyalty: del más nuevo al más viejo, sin meses vacíos ni registros sin fecha',()=>{
  const c=ctxLoyalty();
  sembrar(c,'cacheHistorialLoyaltyRaw',HISTORIAL);
  assert.equal(leer(c,'mesesConCambiosLoyalty().join("|")'),'2026-11|2026-10');
});

test('mesesConCambiosLoyalty: sin datos devuelve lista vacía en vez de explotar',()=>{
  const c=ctxLoyalty();
  sembrar(c,'cacheHistorialLoyaltyRaw',[]);
  assert.equal(leer(c,'mesesConCambiosLoyalty().length'),0);
});

// Los niveles llegan de Airtable con espacios de más y distinta
// capitalización — mismo motivo por el que existe normalizarNivel().
test('textoCambioLoyalty: normaliza los niveles y tolera los que faltan',()=>{
  const c=ctxLoyalty();
  c.__f={'Nivel anterior':'Lightning ','Nivel nuevo':'thunder'};
  assert.equal(leer(c,'textoCambioLoyalty(__f)'),'Lightning → Thunder');
  c.__f={'Nivel nuevo':'Ray'};
  assert.equal(leer(c,'textoCambioLoyalty(__f)'),'— → Ray');
  assert.equal(leer(c,'textoCambioLoyalty(undefined)'),'— → —');
});

test('mesActualLoyalty: usa los getters locales, igual que cambiarNivel al guardar',()=>{
  const c=ctxLoyalty();
  const hoy=new Date();
  const esperado=`${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
  assert.equal(leer(c,'mesActualLoyalty()'),esperado);
});

// "No hubo cambios" y "no se pudo leer la tabla" se veían igual, y esa
// confusión es justo la que hizo invisible este dato hasta ahora.
test('loadHistorialLoyalty: si la consulta falla, lo deja anotado en vez de mostrar cero',async()=>{
  const c=ctxLoyalty();
  c.atGet=async()=>{throw new Error('Table not found');};
  c.console={...console,error(){}};
  await leer(c,'loadHistorialLoyalty()');
  assert.equal(leer(c,'cacheHistorialLoyaltyRaw.length'),0);
  assert.match(leer(c,'historialLoyaltyError'),/Table not found/);
});

test('loadHistorialLoyalty: una lectura buena limpia el error anterior',async()=>{
  const c=ctxLoyalty();
  sembrar(c,'historialLoyaltyError','algo viejo');
  c.__recs=HISTORIAL;
  c.atGet=async()=>({records:HISTORIAL});
  await leer(c,'loadHistorialLoyalty()');
  assert.equal(leer(c,'historialLoyaltyError'),'');
  assert.equal(leer(c,'cacheHistorialLoyaltyRaw.length'),4);
});

// ─── Que un cambio de nivel no quede sin registrar ────────────────────────────
// El registro en "Historial Loyalty" es lo único que hace que el cambio entre
// al resumen mensual y a la card de Inicio. Antes era un solo intento, y el
// aviso un toast que se va solo: si nadie llegaba a leerlo, el cambio quedaba
// aplicado y fuera de todo registro.
function ctxRegistro(){
  return loadApp(['constants.js','state.js','personas.js','utils.js','loyalty-historial.js'],
    {puedeEscribir:()=>true});
}
const CAMBIO={Persona:'Ana Dev','Nivel anterior':'Spark','Nivel nuevo':'Ray',Fecha:'2026-11-05'};

test('registrarCambioNivel: reintenta una vez antes de darse por vencido',async()=>{
  const c=ctxRegistro();
  let intentos=0;
  c.atPost=async()=>{ intentos++; if(intentos===1) throw new Error('Network error'); return {records:[{id:'recNUEVO'}]}; };
  c.console={...console,error(){}};
  c.__datos=CAMBIO;
  assert.equal(await leer(c,'registrarCambioNivel(__datos)'),true);
  assert.equal(intentos,2);
});

test('registrarCambioNivel: si falla dos veces devuelve false, para que se vea el banner',async()=>{
  const c=ctxRegistro();
  let intentos=0;
  c.atPost=async()=>{ intentos++; throw new Error('Unknown field name: "Nivel nuevo"'); };
  c.console={...console,error(){}};
  c.__datos=CAMBIO;
  assert.equal(await leer(c,'registrarCambioNivel(__datos)'),false);
  assert.equal(intentos,2,'insiste una sola vez, no en loop');
});

test('registrarCambioNivel: al registrarlo, la card de Inicio lo muestra sin recargar la tabla',async()=>{
  const c=ctxRegistro();
  sembrar(c,'cacheHistorialLoyaltyRaw',[]);
  c.atPost=async()=>({records:[{id:'recNUEVO'}]});
  c.__datos=CAMBIO;
  await leer(c,'registrarCambioNivel(__datos)');
  assert.equal(leer(c,'cacheHistorialLoyaltyRaw.length'),1);
  assert.equal(leer(c,'cacheHistorialLoyaltyRaw[0].fields.Persona'),'Ana Dev');
  assert.equal(leer(c,'cacheHistorialLoyaltyRaw[0].id'),'recNUEVO');
  // Y queda contado en el mes de su fecha, no en el de hoy
  assert.equal(leer(c,'cambiosLoyaltyDelMes("2026-11").length'),1);
});

test('registrarCambioNivel: un fallo no ensucia el cache con un registro que no existe',async()=>{
  const c=ctxRegistro();
  sembrar(c,'cacheHistorialLoyaltyRaw',[]);
  c.atPost=async()=>{throw new Error('nope');};
  c.console={...console,error(){}};
  c.__datos=CAMBIO;
  await leer(c,'registrarCambioNivel(__datos)');
  assert.equal(leer(c,'cacheHistorialLoyaltyRaw.length'),0);
});
