'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadApp}=require('../test-helpers/load-app');

const ctx=loadApp(['constants.js','beneficios.js']);

test('tieneAccesoBeneficio: sin nivel mínimo o "Todos", cualquier nivel tiene acceso', ()=>{
  assert.equal(ctx.tieneAccesoBeneficio('Spark',''),true);
  assert.equal(ctx.tieneAccesoBeneficio('Spark','Todos'),true);
});

test('tieneAccesoBeneficio: un nivel superior desbloquea los beneficios de niveles inferiores', ()=>{
  assert.equal(ctx.tieneAccesoBeneficio('Storm','Spark'),true);
  assert.equal(ctx.tieneAccesoBeneficio('Thunder','Ray'),true);
});

test('tieneAccesoBeneficio: un nivel inferior NO accede a beneficios de niveles superiores', ()=>{
  assert.equal(ctx.tieneAccesoBeneficio('Spark','Storm'),false);
  assert.equal(ctx.tieneAccesoBeneficio('Ray','Thunder'),false);
});

test('tieneAccesoBeneficio: el mismo nivel siempre tiene acceso', ()=>{
  for(const nivel of ['Spark','Ray','Lightning','Thunder','Storm']){
    assert.equal(ctx.tieneAccesoBeneficio(nivel,nivel),true);
  }
});

// ─── Certifications: comentarios ──────────────────────────────────────────────
// Cada certificación es un caso distinto (cuál es, cuándo la rinde, si el monto
// es estimado), así que no entra en campos estructurados como los de Terapia o
// Udemy: lleva un comentario libre.
test('esBeneficioCertifications: reconoce el beneficio escrito de distintas formas', ()=>{
  assert.equal(ctx.esBeneficioCertifications('Certifications'),true);
  assert.equal(ctx.esBeneficioCertifications('certifications'),true);
  assert.equal(ctx.esBeneficioCertifications('  Certifications  '),true);
  assert.equal(ctx.esBeneficioCertifications('Certification'),true);
  assert.equal(ctx.esBeneficioCertifications('Certificaciones'),true);
});

test('esBeneficioCertifications: no se confunde con otros beneficios', ()=>{
  assert.equal(ctx.esBeneficioCertifications('Udemy'),false);
  assert.equal(ctx.esBeneficioCertifications('Terapia'),false);
  assert.equal(ctx.esBeneficioCertifications('Clases de Inglés'),false);
  assert.equal(ctx.esBeneficioCertifications(''),false);
  assert.equal(ctx.esBeneficioCertifications(undefined),false);
});

// Los campos por beneficio son excluyentes: si se solaparan, el form mostraría
// dos bloques a la vez para el mismo beneficio.
test('los campos por beneficio no se pisan entre sí', ()=>{
  assert.equal(ctx.esBeneficioUdemy('Certifications'),false);
  assert.equal(ctx.esBeneficioTerapia('Certifications'),false);
  assert.equal(ctx.esBeneficioConQuarterAuto('Certifications'),false);
});
