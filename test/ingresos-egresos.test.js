'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadApp}=require('../test-helpers/load-app');

const ctx=loadApp(['utils.js','api.js','ingresos-egresos.js']);

function mockAirtable(ctx,{checklistRecs=[]}={}){
  const posts=[];
  ctx.atGet=async(table)=>{
    if(table==='Checklist') return {records:checklistRecs};
    return {records:[]};
  };
  ctx.atPost=async(table,fields)=>{ posts.push({table,fields}); return {records:[{id:'recNEW'}]}; };
  ctx.atPatch=async()=>({});
  return posts;
}

test('sincronizarPersonasEnKanban: una carga histórica (con Fecha de egreso) no crea checklist ni Slack', async()=>{
  const posts=mockAirtable(ctx);
  const slackCalls=[];
  ctx.sendSlack=async text=>slackCalls.push(text);
  await ctx.sincronizarPersonasEnKanban([
    {id:'p1',fields:{Nombre:'Vieja Empleada','Fecha de ingreso':'2020-01-01','Fecha de egreso':'2021-01-01'}},
  ]);
  assert.equal(posts.length,0);
  assert.equal(slackCalls.length,0);
});

test('sincronizarPersonasEnKanban: una persona nueva sin Fecha de egreso sí crea checklist y Slack', async()=>{
  const posts=mockAirtable(ctx);
  const slackCalls=[];
  ctx.sendSlack=async text=>slackCalls.push(text);
  await ctx.sincronizarPersonasEnKanban([
    {id:'p2',fields:{Nombre:'Nuevo Ingreso','Fecha de ingreso':'2026-07-14'}},
  ]);
  assert.equal(posts.length,1);
  assert.equal(posts[0].table,'Checklist');
  assert.equal(posts[0].fields.Persona,'Nuevo Ingreso');
  assert.equal(slackCalls.length,1);
  assert.match(slackCalls[0],/Nuevo ingreso registrado/);
});

test('sincronizarPersonasEnKanban: una persona que YA tiene checklist se actualiza en silencio aunque tenga Fecha de egreso (egreso real, no histórico)', async()=>{
  const posts=mockAirtable(ctx,{checklistRecs:[
    {id:'chk1',fields:{Persona:'Ya Egreso Real',Proyecto:''}},
  ]});
  const slackCalls=[];
  ctx.sendSlack=async text=>slackCalls.push(text);
  await ctx.sincronizarPersonasEnKanban([
    {id:'p3',fields:{Nombre:'Ya Egreso Real','Fecha de ingreso':'2022-01-01','Fecha de egreso':'2026-07-01',Proyecto:'Atlas'}},
  ]);
  // No se crea un checklist nuevo (POST a Checklist) porque ya existía
  assert.equal(posts.filter(p=>p.table==='Checklist').length,0);
  assert.equal(slackCalls.length,0);
});
