'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

process.env.AIRTABLE_TOKEN='tok123';
process.env.AIRTABLE_BASE='appXXX';

const {resolverAccesoPorEmail,buscarPersonaPorEmail,grupoDeRolEmpresa}=require('../api/_lib/roles');

function fetchPersonas(records){
  return async()=>({ok:true,json:async()=>({records})});
}
function personaConRol(rolEmpresa){
  return fetchPersonas([{id:'rec1',fields:{Nombre:'X',Mail:'x@beon.tech','Rol en empresa':rolEmpresa}}]);
}
function personaCon({rolEmpresa,area}){
  return fetchPersonas([{id:'rec1',fields:{Nombre:'X',Mail:'x@beon.tech','Rol en empresa':rolEmpresa||'','Área':area||''}}]);
}

// Reportado por un usuario con Área="People" (el equipo de People en
// general) al que el código anterior buscaba por error en "Rol en empresa"
// y por eso no le daba acceso total.
test('resolverAccesoPorEmail: Área="People" es "full" (ven todo, grupoBeneficios null)', async()=>{
  const r=await resolverAccesoPorEmail('x@beon.tech',personaCon({rolEmpresa:'Core Team',area:'People'}));
  assert.equal(r.rol,'full');
  assert.equal(r.grupoBeneficios,null);
});

test('resolverAccesoPorEmail: COO/Founder (Rol en empresa) son "full" aunque su Área no sea "People"', async()=>{
  for(const rolEmpresa of ['COO','Founder']){
    const r=await resolverAccesoPorEmail('x@beon.tech',personaCon({rolEmpresa,area:'Leadership'}));
    assert.equal(r.rol,'full');
    assert.equal(r.grupoBeneficios,null);
  }
});

// Un Single Select/campo de texto de Airtable tipeado a mano puede no
// coincidir en mayúsculas/espacios con lo que espera el código — no importa
// si la variante está en "Rol en empresa" (COO/Founder) o en "Área" (People).
test('resolverAccesoPorEmail: el match no distingue mayúsculas ni espacios de más', async()=>{
  for(const area of ['people',' People ','PEOPLE','people  ']){
    const r=await resolverAccesoPorEmail('x@beon.tech',personaCon({area}));
    assert.equal(r.rol,'full',`Área="${area}" debería resolver a full`);
  }
  for(const rolEmpresa of ['coo',' Founder ']){
    const r=await resolverAccesoPorEmail('x@beon.tech',personaCon({rolEmpresa}));
    assert.equal(r.rol,'full',`Rol en empresa="${rolEmpresa}" debería resolver a full`);
  }
});

// Alguien de Recruiting puede pertenecer también al Área "People" — pero por
// ser recruiter le corresponde el nivel "hr" (más acotado), no "full".
test('resolverAccesoPorEmail: Recruiting con Área="People" sigue siendo "hr", no "full"', async()=>{
  const r=await resolverAccesoPorEmail('x@beon.tech',personaCon({rolEmpresa:'Recruiting',area:'People'}));
  assert.equal(r.rol,'hr');
  assert.equal(r.grupoBeneficios,'Core Team');
});

test('resolverAccesoPorEmail: Recruiting es "hr" con grupoBeneficios fijo en "Core Team"', async()=>{
  const r=await resolverAccesoPorEmail('x@beon.tech',personaConRol('Recruiting'));
  assert.equal(r.rol,'hr');
  assert.equal(r.grupoBeneficios,'Core Team');
});

test('resolverAccesoPorEmail: TEM es "tem" sin restricción de grupo', async()=>{
  const r=await resolverAccesoPorEmail('x@beon.tech',personaConRol('TEM'));
  assert.equal(r.rol,'tem');
  assert.equal(r.grupoBeneficios,null);
});

test('resolverAccesoPorEmail: Manager/Lead/Supervisor son "manager" sin restricción de grupo', async()=>{
  for(const rolEmpresa of ['Manager','Lead','Supervisor']){
    const r=await resolverAccesoPorEmail('x@beon.tech',personaConRol(rolEmpresa));
    assert.equal(r.rol,'manager');
    assert.equal(r.grupoBeneficios,null);
  }
});

test('resolverAccesoPorEmail: Engineer es "equipo" con grupoBeneficios "Engineers" (su propio grupo)', async()=>{
  const r=await resolverAccesoPorEmail('x@beon.tech',personaConRol('Engineer'));
  assert.equal(r.rol,'equipo');
  assert.equal(r.grupoBeneficios,'Engineers');
});

test('resolverAccesoPorEmail: Core Team raso es "equipo" con grupoBeneficios "Core Team" (su propio grupo)', async()=>{
  const r=await resolverAccesoPorEmail('x@beon.tech',personaConRol('Core Team'));
  assert.equal(r.rol,'equipo');
  assert.equal(r.grupoBeneficios,'Core Team');
});

test('resolverAccesoPorEmail: sin Persona encontrada, cae a "equipo"/"Engineers" (el fallback de grupoDeRolEmpresa)', async()=>{
  const r=await resolverAccesoPorEmail('nadie@beon.tech',fetchPersonas([]));
  assert.equal(r.rol,'equipo');
  assert.equal(r.grupoBeneficios,'Engineers');
});

test('grupoDeRolEmpresa: mismo criterio que getRolGroup() del cliente', ()=>{
  assert.equal(grupoDeRolEmpresa('Engineer'),'Engineers');
  assert.equal(grupoDeRolEmpresa('Core Team'),'Core Team');
  assert.equal(grupoDeRolEmpresa('TEM'),'Core Team');
  assert.equal(grupoDeRolEmpresa('Manager'),'Core Team');
  assert.equal(grupoDeRolEmpresa('Otro'),'Engineers');
});

test('buscarPersonaPorEmail: si Airtable falla, devuelve null en vez de explotar', async()=>{
  const fetchImpl=async()=>{ throw new Error('red caída'); };
  const persona=await buscarPersonaPorEmail('x@beon.tech',fetchImpl);
  assert.equal(persona,null);
});

test('buscarPersonaPorEmail: sin AIRTABLE_TOKEN/BASE configurados, devuelve null', async()=>{
  const t=process.env.AIRTABLE_TOKEN, b=process.env.AIRTABLE_BASE;
  delete process.env.AIRTABLE_TOKEN;
  delete process.env.AIRTABLE_BASE;
  try{
    const persona=await buscarPersonaPorEmail('x@beon.tech',async()=>({ok:true,json:async()=>({records:[]})}));
    assert.equal(persona,null);
  }finally{
    process.env.AIRTABLE_TOKEN=t;
    process.env.AIRTABLE_BASE=b;
  }
});
