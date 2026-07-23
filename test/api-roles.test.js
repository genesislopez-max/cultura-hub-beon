'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

process.env.AIRTABLE_TOKEN='tok123';
process.env.AIRTABLE_BASE='appXXX';

const {resolverRolAcceso,buscarPersonaPorEmail}=require('../api/_lib/roles');

function fetchPersonas(records){
  return async(url)=>({ok:true,json:async()=>({records})});
}

test('resolverRolAcceso: email en HR_EMAILS es "hr" sin consultar Airtable', async()=>{
  const original=process.env.HR_EMAILS;
  process.env.HR_EMAILS='hr@beon.tech, Otro@Beon.Tech';
  let llamadas=0;
  const fetchImpl=async()=>{ llamadas++; return {ok:true,json:async()=>({records:[]})}; };
  try{
    assert.equal(await resolverRolAcceso('hr@beon.tech',fetchImpl),'hr');
    // case-insensitive
    assert.equal(await resolverRolAcceso('OTRO@beon.tech',fetchImpl),'hr');
    assert.equal(llamadas,0);
  }finally{
    process.env.HR_EMAILS=original;
  }
});

test('resolverRolAcceso: Persona con Rol en empresa de liderazgo es "tem"', async()=>{
  const original=process.env.HR_EMAILS;
  process.env.HR_EMAILS='';
  try{
    const fetchImpl=fetchPersonas([{id:'rec1',fields:{Nombre:'Vicky',Mail:'vicky@beon.tech','Rol en empresa':'TEM'}}]);
    assert.equal(await resolverRolAcceso('vicky@beon.tech',fetchImpl),'tem');
  }finally{
    process.env.HR_EMAILS=original;
  }
});

test('resolverRolAcceso: Persona sin rol de liderazgo (o no encontrada) es "equipo"', async()=>{
  const original=process.env.HR_EMAILS;
  process.env.HR_EMAILS='';
  try{
    const conEngineer=fetchPersonas([{id:'rec2',fields:{Nombre:'Ana',Mail:'ana@beon.tech','Rol en empresa':'Engineer'}}]);
    assert.equal(await resolverRolAcceso('ana@beon.tech',conEngineer),'equipo');

    const sinMatch=fetchPersonas([]);
    assert.equal(await resolverRolAcceso('nadie@beon.tech',sinMatch),'equipo');
  }finally{
    process.env.HR_EMAILS=original;
  }
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
