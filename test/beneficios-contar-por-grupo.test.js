'use strict';
// "29 asignados / 10 disponibles" comparaba dos unidades distintas: el primer
// número contaba cada asignación suelta y el segundo, beneficios distintos.
// Alguien con 12 cursos de Udemy tiene UN beneficio con 12 usos, no 12
// beneficios — y la barra se iba del 100%.
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadApp}=require('../test-helpers/load-app');

function ctxContar(){
  return loadApp(['constants.js','utils.js','state.js','personas.js','beneficios.js','side-panel.js']);
}

const CATALOGO=[
  {id:'bAI',fields:{Beneficio:'AI Tools',Valor:10}},
  {id:'bUd',fields:{Beneficio:'Udemy Courses',Valor:50}},
  {id:'bOR',fields:{Beneficio:"O'Reilly",Valor:200}},
];
const asig=(bId,i)=>({id:'a'+bId+i,fields:{Persona:'Raphael Montani',Beneficio:[bId],
  'Fecha activación':'2024-01-01',Estado:'Activo'}});

test('varias asignaciones del mismo beneficio cuentan una vez',()=>{
  const ctx=ctxContar();
  const asignaciones=[
    asig('bAI',0),
    ...Array.from({length:12},(_,i)=>asig('bUd',i)),   // 12 cursos
    asig('bOR',0),asig('bOR',1),                        // credenciales recompartidas
  ];
  assert.equal(asignaciones.length,15,'quince asignaciones…');
  assert.equal(ctx.beneficiosDistintosAsignados(asignaciones,CATALOGO),3,'…de tres beneficios');
});

test('sin asignaciones da cero',()=>{
  const ctx=ctxContar();
  assert.equal(ctx.beneficiosDistintosAsignados([],CATALOGO),0);
  assert.equal(ctx.beneficiosDistintosAsignados(null,CATALOGO),0);
});

test('el mismo beneficio escrito distinto no cuenta dos veces',()=>{
  const ctx=ctxContar();
  // El registro puede traer el nombre en texto en vez del id del linked
  // record, y con otra capitalización o espacios de más.
  const porTexto=n=>({id:'x'+n,fields:{Persona:'X',Beneficio:n,'Fecha activación':'2024-01-01'}});
  assert.equal(ctx.beneficiosDistintosAsignados(
    [porTexto('AI Tools'),porTexto('ai tools'),porTexto('  AI  Tools  ')],CATALOGO),1);
});

test('un beneficio que no está en el catálogo igual cuenta',()=>{
  const ctx=ctxContar();
  // Se cuenta por el nombre crudo: esconderlo haría que el número no cerrara
  // con la lista, que sí lo muestra.
  const sinCatalogo={id:'z',fields:{Persona:'X',Beneficio:'Beneficio Viejo','Fecha activación':'2024-01-01'}};
  assert.equal(ctx.beneficiosDistintosAsignados([sinCatalogo,asig('bAI',0)],CATALOGO),2);
});

test('es la misma cuenta que hace la lista de la card',()=>{
  const ctx=ctxContar();
  // La card agrupa por beneficio para mostrar las filas: el número de arriba
  // tiene que coincidir con la cantidad de filas de abajo.
  const filas=[
    {r:asig('bAI',0),benef:CATALOGO[0],nombre:'AI Tools',fin:'',preIngreso:''},
    {r:asig('bUd',0),benef:CATALOGO[1],nombre:'Udemy Courses',fin:'',preIngreso:''},
    {r:asig('bUd',1),benef:CATALOGO[1],nombre:'Udemy Courses',fin:'',preIngreso:''},
    {r:asig('bUd',2),benef:CATALOGO[1],nombre:'Udemy Courses',fin:'',preIngreso:''},
  ];
  const grupos=ctx.agruparBenefAsignados(filas);
  assert.equal(grupos.length,2);
  assert.equal(ctx.beneficiosDistintosAsignados(filas.map(f=>f.r),CATALOGO),grupos.length);
});

test('la proporción contra los disponibles ya no se pasa del 100%',()=>{
  const ctx=ctxContar();
  const asignaciones=Array.from({length:12},(_,i)=>asig('bUd',i));
  const distintos=ctx.beneficiosDistintosAsignados(asignaciones,CATALOGO);
  const disponibles=6;
  assert.equal(distintos,1);
  assert.ok(distintos<=disponibles,'nunca puede haber más beneficios asignados que disponibles por este camino');
  assert.equal(Math.round(distintos/disponibles*100),17);
});
