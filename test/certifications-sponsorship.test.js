'use strict';
// Una certificación puede estar cargada en dos lugares: la tabla
// Capacitaciones, o como una asignación del beneficio "Certifications". La
// sección "Certifications Sponsorship" de la card miraba solo el primero, así
// que alguien con su certificación cargada como beneficio veía el monto arriba
// y "Sin certificaciones registradas" abajo.
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadApp}=require('../test-helpers/load-app');

function ctxCert(){
  return loadApp(['constants.js','utils.js','state.js','personas.js','beneficios.js','side-panel.js']);
}
function sembrar(ctx,cache,datos){
  ctx.__fixture=datos;
  vm.runInContext(`${cache}=__fixture`,ctx);
}

const CATALOGO=[
  {id:'bCe',fields:{Beneficio:'Certifications',Valor:150}},
  {id:'bUd',fields:{Beneficio:'Udemy Courses',Valor:50}},
  {id:'bAI',fields:{Beneficio:'AI Tools',Valor:10}},
];
const PERSONA={id:'p1',fields:{Nombre:'Raphael Montani','Fecha de ingreso':'2022-01-01'}};

const cap=(desc,fecha,monto,url)=>({id:'c'+fecha,fields:{Descripción:desc,Fecha:fecha,Monto:monto,'URL del curso':url}});
const benef=(bId,fecha,extra={})=>({id:'a'+fecha,fields:{Persona:'Raphael Montani',Beneficio:[bId],
  'Fecha activación':fecha,Estado:'Activo',...extra}});

test('una Certifications cargada como beneficio aparece en la sección',()=>{
  const ctx=ctxCert();
  sembrar(ctx,'cachePersonasRaw',[PERSONA]);
  const certs=ctx.certificacionesDeCard([],[benef('bCe','2023-06-02',{Monto:150,Comentarios:'Certificación AWS'})],CATALOGO);
  assert.equal(certs.length,1);
  assert.equal(certs[0].titulo,'Certificación AWS');
  assert.equal(certs[0].fecha,'2023-06-02');
  assert.equal(certs[0].monto,150);
  assert.equal(certs[0].origen,'Beneficios');
  assert.equal(certs[0].vigente,true);
});

test('el campo Curso gana sobre el comentario cuando está cargado',()=>{
  const ctx=ctxCert();
  sembrar(ctx,'cachePersonasRaw',[PERSONA]);
  const certs=ctx.certificacionesDeCard([],[benef('bCe','2023-06-02',
    {Monto:150,Curso:'AWS Solutions Architect',Comentarios:'pedida por el TEM'})],CATALOGO);
  assert.equal(certs[0].titulo,'AWS Solutions Architect');
});

test('sin Curso ni comentario no queda una fila sin nombre',()=>{
  const ctx=ctxCert();
  sembrar(ctx,'cachePersonasRaw',[PERSONA]);
  const certs=ctx.certificacionesDeCard([],[benef('bCe','2023-06-02',{Monto:150})],CATALOGO);
  assert.equal(certs[0].titulo,'Certificación sin descripción');
});

test('sin Monto propio se toma el valor del catálogo',()=>{
  const ctx=ctxCert();
  sembrar(ctx,'cachePersonasRaw',[PERSONA]);
  const certs=ctx.certificacionesDeCard([],[benef('bCe','2023-06-02',{Comentarios:'AWS'})],CATALOGO);
  assert.equal(certs[0].monto,150);
});

test('lo que ya venía de Capacitaciones sigue igual',()=>{
  const ctx=ctxCert();
  sembrar(ctx,'cachePersonasRaw',[PERSONA]);
  const certs=ctx.certificacionesDeCard([cap('CKA','2024-03-01',300,'https://cncf.io/cka')],[],CATALOGO);
  assert.equal(certs.length,1);
  assert.equal(certs[0].titulo,'CKA');
  assert.equal(certs[0].monto,300);
  assert.equal(certs[0].url,'https://cncf.io/cka');
  assert.equal(certs[0].origen,'Capacitaciones');
});

test('los dos orígenes se mezclan, de la más reciente a la más vieja',()=>{
  const ctx=ctxCert();
  sembrar(ctx,'cachePersonasRaw',[PERSONA]);
  const certs=ctx.certificacionesDeCard(
    [cap('CKA','2024-03-01',300)],
    [benef('bCe','2025-01-10',{Monto:150,Comentarios:'Terraform'}),
     benef('bCe','2023-06-02',{Monto:150,Comentarios:'AWS'})],
    CATALOGO);
  assert.equal(certs.map(c=>c.titulo).join('|'),'Terraform|CKA|AWS');
});

test('no se cuela ningún otro beneficio en la sección',()=>{
  const ctx=ctxCert();
  sembrar(ctx,'cachePersonasRaw',[PERSONA]);
  const certs=ctx.certificacionesDeCard([],[
    benef('bUd','2025-01-01',{Monto:50,Curso:'CKAD with Tests'}),
    benef('bAI','2023-12-29',{Monto:10}),
    benef('bCe','2023-06-02',{Monto:150,Comentarios:'AWS'}),
  ],CATALOGO);
  assert.equal(certs.map(c=>c.titulo).join('|'),'AWS');
});

test('una asignación fuera de período se lista pero no cuenta como vigente',()=>{
  const ctx=ctxCert();
  // Se fue el 2024-01-31 y no volvió: su certificación es historial.
  sembrar(ctx,'cachePersonasRaw',[{id:'p2',fields:{Nombre:'Raphael Montani',
    'Fecha de ingreso':'2022-01-01','Fecha de egreso':'2024-01-31'}}]);
  const certs=ctx.certificacionesDeCard([],[benef('bCe','2023-06-02',{Monto:150,Comentarios:'AWS'})],CATALOGO);
  assert.equal(certs.length,1,'se sigue viendo: es parte de su historial');
  assert.equal(certs[0].vigente,false,'pero no consume el tope de hoy');
});

// ── Cómo se arma la fila ──

test('solo se aclara el origen de las que vienen de Beneficios',()=>{
  const ctx=ctxCert();
  assert.equal(ctx.origenCertTexto({origen:'Capacitaciones',vigente:true}),'');
  assert.match(ctx.origenCertTexto({origen:'Beneficios',vigente:true}),/desde Beneficios/);
  assert.match(ctx.origenCertTexto({origen:'Beneficios',vigente:false}),/fuera de período/);
});

test('el link se valida antes de salir como href',()=>{
  const ctx=ctxCert();
  assert.equal(ctx.linkCertHtml(''),'');
  assert.match(ctx.linkCertHtml('https://cncf.io/cka'),/href="https:\/\/cncf\.io\/cka"/);
  const malo=ctx.linkCertHtml('javascript:alert(1)');
  assert.doesNotMatch(malo,/href=/);
  assert.match(malo,/no es una URL válida/);
});

test('el título se escapa: un nombre con comillas no rompe el HTML',()=>{
  const ctx=ctxCert();
  assert.equal(ctx.escaparHtml('AWS "Pro" <beta>'),'AWS &quot;Pro&quot; &lt;beta&gt;');
});
