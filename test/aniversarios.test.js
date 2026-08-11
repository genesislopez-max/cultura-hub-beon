'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadApp}=require('../test-helpers/load-app');

const ctx=loadApp(['utils.js','aniversarios.js']);

// Caso reportado: en agosto de 2026 la lista mostraba los "en X días" saltando
// (15, 17, hoy, hoy, 2, 14) porque dentro de un mismo mes ordenaba por años
// descendente en vez de por día.
const HOY=new Date('2026-08-11T00:00:00');
const FILAS=[
  {nombre:'Dos años A', fecha:'2024-08-26',años:2,days:15},
  {nombre:'Dos años B', fecha:'2024-08-28',años:2,days:17},
  {nombre:'Un año hoy A',fecha:'2025-08-11',años:1,days:0},
  {nombre:'Un año hoy B',fecha:'2025-08-11',años:1,days:0},
  {nombre:'Un año +2',  fecha:'2025-08-13',años:1,days:2},
  {nombre:'Un año +14', fecha:'2025-08-25',años:1,days:14},
];

test('ordenarAnivPorFecha: ordena cronológico por día dentro del mismo mes', ()=>{
  const orden=ctx.ordenarAnivPorFecha(FILAS,HOY).map(r=>r.fecha);
  assert.equal(JSON.stringify(orden),JSON.stringify([
    '2025-08-11','2025-08-11','2025-08-13','2025-08-25','2024-08-26','2024-08-28',
  ]));
});

test('ordenarAnivPorFecha: los "días restantes" quedan en aumento (no se mezclan)', ()=>{
  const dias=ctx.ordenarAnivPorFecha(FILAS,HOY).map(r=>r.days);
  assert.equal(JSON.stringify(dias),JSON.stringify([0,0,2,14,15,17]));
  // La propiedad que fallaba antes: la secuencia nunca baja
  dias.forEach((d,i)=>{ if(i) assert.ok(d>=dias[i-1],`${d} vino después de ${dias[i-1]}`); });
});

test('ordenarAnivPorFecha: a igual fecha, primero quien cumple más años', ()=>{
  const filas=[
    {nombre:'Cumple 1',fecha:'2025-09-03',años:1,days:23},
    {nombre:'Cumple 5',fecha:'2021-09-03',años:5,days:23},
  ];
  assert.equal(ctx.ordenarAnivPorFecha(filas,HOY).map(r=>r.años).join(),'5,1');
});

test('ordenarAnivPorFecha: un aniversario ya pasado este año va al final (cuenta el del año que viene)', ()=>{
  const filas=[
    {nombre:'Ya pasó (marzo)',fecha:'2020-03-05',años:7,days:206},
    {nombre:'Este mes',       fecha:'2025-08-25',años:1,days:14},
  ];
  assert.equal(ctx.ordenarAnivPorFecha(filas,HOY).map(r=>r.nombre).join(),'Este mes,Ya pasó (marzo)');
});

test('ordenarAnivPorFecha: no muta el array que recibe', ()=>{
  const copia=[...FILAS];
  ctx.ordenarAnivPorFecha(FILAS,HOY);
  assert.equal(JSON.stringify(FILAS),JSON.stringify(copia));
});
