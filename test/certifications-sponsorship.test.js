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

// ── Contra qué tope pesa una certificación ──
// Se cubre contra el "Tope anual capacitación", no contra el de beneficios.
// Si contara en los dos, el mismo monto restaría dos topes distintos.

test('una certificación no suma al presupuesto de beneficios',()=>{
  const ctx=ctxCert();
  sembrar(ctx,'cachePersonasRaw',[PERSONA]);
  const asignaciones=[
    benef('bAI','2023-12-29',{Monto:10}),     // mensual: 10 × 12 = 120
    benef('bCe','2023-06-02',{Monto:150}),    // certificación: no cuenta acá
  ];
  assert.equal(ctx.sumarMontosAsignados(asignaciones,CATALOGO),120);
});

test('el resto de los beneficios sigue sumando igual',()=>{
  const ctx=ctxCert();
  sembrar(ctx,'cachePersonasRaw',[PERSONA]);
  assert.equal(ctx.sumarMontosAsignados([benef('bUd','2025-01-01',{Monto:50})],CATALOGO),50);
  assert.equal(ctx.consumeTopeBeneficios('AI Tools'),true);
  assert.equal(ctx.consumeTopeBeneficios('Udemy Courses'),true);
  assert.equal(ctx.consumeTopeBeneficios('Certifications'),false);
});

test('la certificación no aparece en la lista de beneficios',()=>{
  const ctx=ctxCert();
  // El mismo criterio decide las dos cosas: lo que no consume el tope de
  // beneficios sale de esa lista y vive en Certifications Sponsorship. Antes
  // hacía falta una aclaración en la fila de arriba ("cuenta en Certifications
  // Sponsorship") porque el monto se veía ahí sin entrar en el total; ya no,
  // porque esa fila dejó de existir.
  assert.equal(typeof ctx.notaTopeCapacitacion,'undefined');
  assert.equal(ctx.consumeTopeBeneficios('Certifications'),false);
});

test('y sigue sumando en el tope de capacitación, que es el que consume',()=>{
  const ctx=ctxCert();
  sembrar(ctx,'cachePersonasRaw',[PERSONA]);
  const certs=ctx.certificacionesDeCard([],[benef('bCe','2023-06-02',{Monto:150,Comentarios:'AWS'})],CATALOGO);
  assert.equal(certs.filter(c=>c.vigente).reduce((s,c)=>s+c.monto,0),150);
});

// ── Una sola vez en la card ──
// La certificación salió de la lista de beneficios: tiene su propia sección,
// y mostrarla en los dos lados repetía el mismo registro en la misma card.

test('la fila de la sección lleva lo necesario para editarla y borrarla',()=>{
  const ctx=ctxCert();
  sembrar(ctx,'cachePersonasRaw',[PERSONA]);
  const certs=ctx.certificacionesDeCard([],[benef('bCe','2023-06-02',{Monto:150,Comentarios:'AWS'})],CATALOGO);
  assert.equal(certs[0].id,'a2023-06-02');
  assert.equal(certs[0].nombreBeneficio,'Certifications');
});

test('solo tienen botones las que vienen de Beneficios',()=>{
  const ctx=ctxCert();
  const deBenef={origen:'Beneficios',id:'a1',nombreBeneficio:'Certifications'};
  const html=ctx.accionesCertHtml(deBenef,'Raphael Montani','Engineers','Storm');
  assert.match(html,/editarBenefAsignado\('a1','Raphael Montani','Engineers','Storm'\)/);
  assert.match(html,/eliminarBenefAsignado\('a1','Certifications','Raphael Montani'/);
  // Las de Capacitaciones se cargan en esa tabla y nunca tuvieron acciones acá
  assert.equal(ctx.accionesCertHtml({origen:'Capacitaciones'},'Raphael Montani','Engineers','Storm'),'');
  // Sin id no se puede apuntar a ningún registro: mejor sin botón que con uno roto
  assert.equal(ctx.accionesCertHtml({origen:'Beneficios'},'Raphael Montani','Engineers','Storm'),'');
});

test('un apóstrofo en el nombre no rompe el onclick',()=>{
  const ctx=ctxCert();
  const html=ctx.accionesCertHtml({origen:'Beneficios',id:'a1',nombreBeneficio:"O'Reilly Cert"},
    "D'Angelo Pérez",'Engineers','Storm');
  assert.match(html,/editarBenefAsignado\('a1','D\\'Angelo Pérez'/);
  assert.match(html,/eliminarBenefAsignado\('a1','O\\'Reilly Cert'/);
});

test('consumeTopeBeneficios es el mismo criterio que saca la fila de arriba',()=>{
  const ctx=ctxCert();
  // La lista de beneficios filtra con esto, así que lo que se va de arriba es
  // exactamente lo que aparece abajo: no hay registro que caiga en los dos ni
  // en ninguno.
  assert.equal(ctx.consumeTopeBeneficios('Certifications'),false);
  assert.equal(ctx.consumeTopeBeneficios('AI Tools'),true);
  assert.equal(ctx.consumeTopeBeneficios('Udemy Courses'),true);
});
