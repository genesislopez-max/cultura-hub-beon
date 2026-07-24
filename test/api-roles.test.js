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

test('resolverAccesoPorEmail: People/COO/Founder son "full" (ven todo, grupoBeneficios null)', async()=>{
  for(const rolEmpresa of ['People','COO','Founder']){
    const r=await resolverAccesoPorEmail('x@beon.tech',personaConRol(rolEmpresa));
    assert.equal(r.rol,'full');
    assert.equal(r.grupoBeneficios,null);
  }
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
