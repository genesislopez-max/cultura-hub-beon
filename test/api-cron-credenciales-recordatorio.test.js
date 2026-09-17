'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

process.env.AIRTABLE_TOKEN='tok123';
process.env.AIRTABLE_BASE='appXXX';
process.env.SLACK_WEBHOOK_FEEDBACK='https://hooks.slack.test/it-culture-hub';
delete process.env.SLACK_WEBHOOK;
delete process.env.CRON_SECRET;

const handler=require('../api/cron-credenciales-recordatorio');
const {tocaRecordatorio,sumarMeses,ultimaCompartidaPorPersona,esCredencial}=handler;

function fakeRes(){
  const res={statusCode:200,body:null};
  res.status=function(c){this.statusCode=c;return this;};
  res.json=function(obj){this.body=obj;return this;};
  return res;
}

function mockFetch({asignados=[],catalogo=[],personas=[]}={}){
  const enviados=[];
  return {
    enviados,
    fetchImpl: async(url,opts)=>{
      const u=String(url);
      if(u.includes('hooks.slack.test')){
        enviados.push(JSON.parse(opts.body).text);
        return {ok:true,json:async()=>({})};
      }
      if(u.includes('Beneficios%20Asignados')) return {ok:true,json:async()=>({records:asignados})};
      if(u.includes('/Beneficios')) return {ok:true,json:async()=>({records:catalogo})};
      if(u.includes('/Personas')) return {ok:true,json:async()=>({records:personas})};
      throw new Error('fetch inesperado: '+u);
    },
  };
}

// ─── Sumar meses ──────────────────────────────────────────────────────────────
// setMonth desborda: 31 de agosto + 6 meses cae en marzo porque febrero no
// tiene 31 días. "Seis meses después" del 31 de agosto es el 28/29 de febrero.
test('sumarMeses recorta al último día del mes en vez de desbordar', ()=>{
  assert.equal(sumarMeses('2025-08-31',6),'2026-02-28');
  assert.equal(sumarMeses('2024-08-31',6),'2025-02-28');
  assert.equal(sumarMeses('2025-01-31',1),'2025-02-28');
  assert.equal(sumarMeses('2024-01-31',1),'2024-02-29'); // bisiesto
  assert.equal(sumarMeses('2025-07-11',6),'2026-01-11');
  assert.equal(sumarMeses('2025-07-11',12),'2026-07-11');
});

// ─── Cuándo toca recordar ─────────────────────────────────────────────────────
// Mirar solo "tiene más de 6 meses" avisaría el mismo acceso todas las semanas
// para siempre; mirar la fecha exacta lo perdería si el cron no corre ese día.
// La ventana avisa una vez por hito: a los 6 meses, a los 12, a los 18…
test('avisa al cumplir 6 meses, no antes', ()=>{
  assert.equal(tocaRecordatorio('2026-01-11','2026-07-11',7),6);   // el día del hito
  assert.equal(tocaRecordatorio('2026-01-11','2026-07-15',7),6);   // dentro de la ventana
  assert.equal(tocaRecordatorio('2026-01-11','2026-07-10',7),null); // un día antes: todavía no
  assert.equal(tocaRecordatorio('2026-01-11','2026-07-18',7),null); // ventana pasada: ya se avisó
});

test('vuelve a avisar a los 12 y 18 meses', ()=>{
  assert.equal(tocaRecordatorio('2025-07-11','2026-07-11',7),12);
  assert.equal(tocaRecordatorio('2025-01-11','2026-07-11',7),18);
  assert.equal(tocaRecordatorio('2024-07-11','2026-07-11',7),24);
});

test('un acceso reciente no genera recordatorio', ()=>{
  assert.equal(tocaRecordatorio('2026-07-01','2026-07-11',7),null);
  assert.equal(tocaRecordatorio('2026-09-01','2026-07-11',7),null); // fecha futura
  assert.equal(tocaRecordatorio('','2026-07-11',7),null);
});

// ─── Qué accesos entran ───────────────────────────────────────────────────────
test('solo O\'Reilly y Pluralsight', ()=>{
  assert.equal(esCredencial("O'Reilly"),true);
  assert.equal(esCredencial('OReilly'),true);
  assert.equal(esCredencial('Pluralsight'),true);
  assert.equal(esCredencial('Udemy'),false);
  assert.equal(esCredencial('Terapia'),false);
  assert.equal(esCredencial('Clases de Inglés'),false);
});

// Si se recompartieron hace poco, el acceso está fresco: no corresponde
// recordar nada aunque la primera vez fuera hace años.
test('cuenta desde la ÚLTIMA vez que se compartieron, no la primera', ()=>{
  const asignados=[
    {id:'a1',fields:{Persona:['p1'],Beneficio:["O'Reilly"],'Fecha activación':'2024-07-26'}},
    {id:'a2',fields:{Persona:['p1'],Beneficio:["O'Reilly"],'Fecha activación':'2026-07-11'}},
  ];
  const accesos=ultimaCompartidaPorPersona(asignados,r=>r.fields.Beneficio[0],()=>'Nicolas');
  assert.equal(accesos.length,1);
  assert.equal(accesos[0].fecha,'2026-07-11');
});

test('accesos de personas distintas no se mezclan', ()=>{
  const asignados=[
    {id:'a1',fields:{Persona:['p1'],Beneficio:["O'Reilly"],'Fecha activación':'2024-07-26'}},
    {id:'a2',fields:{Persona:['p2'],Beneficio:["O'Reilly"],'Fecha activación':'2026-07-11'}},
  ];
  const nombres={p1:'Nicolas',p2:'Ana'};
  const accesos=ultimaCompartidaPorPersona(asignados,r=>r.fields.Beneficio[0],r=>nombres[r.fields.Persona[0]]);
  assert.equal(accesos.length,2);
});

// ─── El cron de punta a punta ─────────────────────────────────────────────────
test('cron-credenciales: avisa a #it-culture-hub los accesos que cumplen 6 meses', async()=>{
  const catalogo=[
    {id:'bO',fields:{Beneficio:"O'Reilly"}},
    {id:'bU',fields:{Beneficio:'Udemy'}},
  ];
  const asignados=[
    {id:'a1',fields:{Persona:['p1'],Beneficio:['bO'],'Fecha activación':'2026-01-11'}}, // cumple 6 meses
    {id:'a2',fields:{Persona:['p2'],Beneficio:['bO'],'Fecha activación':'2026-07-01'}}, // reciente
    {id:'a3',fields:{Persona:['p3'],Beneficio:['bU'],'Fecha activación':'2026-01-11'}}, // Udemy: no aplica
  ];
  const personas=[
    {id:'p1',fields:{Nombre:'Nicolas Michels'}},
    {id:'p2',fields:{Nombre:'Ana Test'}},
    {id:'p3',fields:{Nombre:'Carlos Varela'}},
  ];
  const {enviados,fetchImpl}=mockFetch({asignados,catalogo,personas});
  const orig=global.fetch; global.fetch=fetchImpl;
  const res=fakeRes();
  try{
    await handler({headers:{}},res,{hoy:new Date('2026-07-11T12:00:00Z')});
  } finally { global.fetch=orig; }

  assert.equal(res.statusCode,200);
  assert.equal(res.body.notificados,1);
  assert.equal(enviados.length,1); // un solo mensaje con todo, no uno por persona
  assert.match(enviados[0],/Nicolas Michels/);
  assert.match(enviados[0],/O'Reilly/);
  assert.match(enviados[0],/11 de ene de 2026/);
  assert.doesNotMatch(enviados[0],/Ana Test/);      // acceso reciente
  assert.doesNotMatch(enviados[0],/Carlos Varela/); // Udemy no es credencial
  assert.doesNotMatch(enviados[0],/SLACK_WEBHOOK_FEEDBACK/); // el canal está bien configurado
});

test('cron-credenciales: sin nada que recordar no manda mensaje', async()=>{
  const catalogo=[{id:'bO',fields:{Beneficio:"O'Reilly"}}];
  const asignados=[{id:'a1',fields:{Persona:['p1'],Beneficio:['bO'],'Fecha activación':'2026-07-01'}}];
  const {enviados,fetchImpl}=mockFetch({asignados,catalogo,personas:[{id:'p1',fields:{Nombre:'Ana'}}]});
  const orig=global.fetch; global.fetch=fetchImpl;
  const res=fakeRes();
  try{
    await handler({headers:{}},res,{hoy:new Date('2026-07-11T12:00:00Z')});
  } finally { global.fetch=orig; }
  assert.equal(res.body.notificados,0);
  assert.equal(enviados.length,0);
});

test('cron-credenciales: si falta el webhook del canal, el mensaje lo dice', async()=>{
  delete process.env.SLACK_WEBHOOK_FEEDBACK;
  process.env.SLACK_WEBHOOK='https://hooks.slack.test/general';
  const catalogo=[{id:'bO',fields:{Beneficio:'Pluralsight'}}];
  const asignados=[{id:'a1',fields:{Persona:['p1'],Beneficio:['bO'],'Fecha activación':'2026-01-11'}}];
  const {enviados,fetchImpl}=mockFetch({asignados,catalogo,personas:[{id:'p1',fields:{Nombre:'Ana'}}]});
  const orig=global.fetch; global.fetch=fetchImpl;
  const res=fakeRes();
  try{
    await handler({headers:{}},res,{hoy:new Date('2026-07-11T12:00:00Z')});
  } finally {
    global.fetch=orig;
    process.env.SLACK_WEBHOOK_FEEDBACK='https://hooks.slack.test/it-culture-hub';
    delete process.env.SLACK_WEBHOOK;
  }
  assert.match(enviados[0],/SLACK_WEBHOOK_FEEDBACK/);
  assert.match(enviados[0],/#it-culture-hub/);
});

test('cron-credenciales: rechaza sin el secreto cuando está configurado', async()=>{
  process.env.CRON_SECRET='s3cr3t';
  const res=fakeRes();
  try{
    await handler({headers:{}},res,{});
  } finally { delete process.env.CRON_SECRET; }
  assert.equal(res.statusCode,401);
});
