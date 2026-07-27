'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

process.env.AIRTABLE_TOKEN='tok123';
process.env.AIRTABLE_BASE='appXXX';

const {resolverAccesoPorEmail,buscarPersonaPorEmail,grupoDeRolEmpresa}=require('../api/_lib/roles');

function fetchPersonas(records){
  return async()=>({ok:true,json:async()=>({records})});
}
function personaCon({acceso,rolEmpresa}){
  return fetchPersonas([{id:'rec1',fields:{Nombre:'X',Mail:'x@beon.tech',Acceso:acceso||'','Rol en empresa':rolEmpresa||''}}]);
}

test('resolverAccesoPorEmail: emails de la lista fija son "full" sin importar Personas', async()=>{
  for(const email of ['valentina.vellon@beon.tech','VICTORIA.FRANCO@beon.tech']){
    const r=await resolverAccesoPorEmail(email,fetchPersonas([]));
    assert.equal(r.rol,'full',`${email} debería resolver a full`);
    assert.equal(r.grupoBeneficios,null);
  }
});

test('resolverAccesoPorEmail: toma el nivel directo del campo Acceso', async()=>{
  const casos=[
    {acceso:'Full',rolEsperado:'full',grupoEsperado:null},
    {acceso:'HR',rolEsperado:'hr',grupoEsperado:'Core Team'},
    {acceso:'TEM',rolEsperado:'tem',grupoEsperado:null},
    {acceso:'Manager',rolEsperado:'manager',grupoEsperado:null},
  ];
  for(const {acceso,rolEsperado,grupoEsperado} of casos){
    const r=await resolverAccesoPorEmail('x@beon.tech',personaCon({acceso}));
    assert.equal(r.rol,rolEsperado,`Acceso="${acceso}" debería resolver a "${rolEsperado}"`);
    assert.equal(r.grupoBeneficios,grupoEsperado);
  }
});

test('resolverAccesoPorEmail: "Equipo" usa su propio grupo (según Rol en empresa) para Beneficios', async()=>{
  const rEngineer=await resolverAccesoPorEmail('x@beon.tech',personaCon({acceso:'Equipo',rolEmpresa:'Engineer'}));
  assert.equal(rEngineer.rol,'equipo');
  assert.equal(rEngineer.grupoBeneficios,'Engineers');

  const rCoreTeam=await resolverAccesoPorEmail('x@beon.tech',personaCon({acceso:'Equipo',rolEmpresa:'Core Team'}));
  assert.equal(rCoreTeam.rol,'equipo');
  assert.equal(rCoreTeam.grupoBeneficios,'Core Team');
});

// El match no distingue mayúsculas ni espacios de más — un Single Select
// tipeado a mano puede tener "full"/"Full "/etc.
test('resolverAccesoPorEmail: el match de Acceso no distingue mayúsculas ni espacios de más', async()=>{
  for(const acceso of ['full',' Full ','FULL','full  ']){
    const r=await resolverAccesoPorEmail('x@beon.tech',personaCon({acceso}));
    assert.equal(r.rol,'full',`Acceso="${acceso}" debería resolver a full`);
  }
});

test('resolverAccesoPorEmail: sin Acceso cargado, cae a "equipo" (fail closed)', async()=>{
  const r=await resolverAccesoPorEmail('x@beon.tech',personaCon({rolEmpresa:'Engineer'}));
  assert.equal(r.rol,'equipo');
  assert.equal(r.grupoBeneficios,'Engineers');
});

test('resolverAccesoPorEmail: un valor de Acceso no reconocido cae a "equipo"', async()=>{
  const r=await resolverAccesoPorEmail('x@beon.tech',personaCon({acceso:'Lo que sea',rolEmpresa:'Engineer'}));
  assert.equal(r.rol,'equipo');
});

test('resolverAccesoPorEmail: sin Persona encontrada, cae a "equipo"/"Engineers"', async()=>{
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
