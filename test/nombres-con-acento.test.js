'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadApp}=require('../test-helpers/load-app');

// El mismo nombre convive escrito de dos formas en tablas distintas: "Jesús
// Figueroa" en Personas y "Jesus Figueroa" en Ambassador Week, porque ahí se
// tipea a mano. Comparándolo caracter a caracter, la persona no se reconocía:
// su registro desaparecía del historial de AW, su ficha decía "Sin registros",
// y el Hub le ofrecía cobertura de vuelo que ya había usado.

function leer(c,expr){ return vm.runInContext(expr,c); }
function sembrar(c,cache,datos){
  c.__fixture=datos;
  vm.runInContext(`${cache}=__fixture`,c);
}
function ctxUtils(){
  return loadApp(['constants.js','state.js','personas.js','utils.js']);
}

const PERSONAS=[
  {id:'p1',fields:{Nombre:'Jesús Figueroa','Rol en empresa':'Engineer',Manager:'Tina TEM'}},
  {id:'p2',fields:{Nombre:'Ana Dev','Rol en empresa':'Engineer'}},
  {id:'p3',fields:{Nombre:'Ana María Dev','Rol en empresa':'Engineer'}},
  {id:'p4',fields:{Nombre:'Ex Dev','Rol en empresa':'Engineer','Fecha de egreso':'2024-01-01'}},
];

test('normalizarNombre: el acento deja de ser una diferencia',()=>{
  const c=ctxUtils();
  assert.equal(leer(c,'normalizarNombre("Jesús Figueroa")'),leer(c,'normalizarNombre("Jesus Figueroa")'));
  assert.equal(leer(c,'normalizarNombre("  JESÚS   FIGUEROA ")'),'jesus figueroa');
  assert.equal(leer(c,'normalizarNombre("Muñoz Peña")'),'munoz pena');
  // Y sigue sin mezclar a dos personas distintas
  assert.notEqual(leer(c,'normalizarNombre("Ana Dev")'),leer(c,'normalizarNombre("Ana María Dev")'));
});

test('personaConocida: separa "no está en Personas" de "ya no está en BEON"',()=>{
  const c=ctxUtils();
  sembrar(c,'cachePersonasRaw',PERSONAS);
  assert.equal(leer(c,'personaConocida("Jesus Figueroa")'),true);   // sin acento
  assert.equal(leer(c,'personaConocida("Ex Dev")'),true);           // está, pero se fue
  assert.equal(leer(c,'personaActiva("Ex Dev")'),false);
  assert.equal(leer(c,'personaConocida("Nadie Conocido")'),false);
});

test('nombreDePersonaRef: resuelve el id de un linked record contra Personas',()=>{
  const c=ctxUtils();
  sembrar(c,'cachePersonasRaw',PERSONAS);
  assert.equal(leer(c,'nombreDePersonaRef(["p1"])'),'p1');            // no tiene forma de id de Airtable
  assert.equal(leer(c,'nombreDePersonaRef("Ana Dev")'),'Ana Dev');
  assert.equal(leer(c,'nombreDePersonaRef(["Ana Dev"])'),'Ana Dev');
  assert.equal(leer(c,'nombreDePersonaRef(null)'),'');
  sembrar(c,'cachePersonasRaw',[{id:'recABCDEFGHIJKLMN',fields:{Nombre:'Jesús Figueroa'}}]);
  assert.equal(leer(c,'nombreDePersonaRef(["recABCDEFGHIJKLMN"])'),'Jesús Figueroa');
  // Un id que ya no existe se devuelve tal cual, en vez de perderse
  assert.equal(leer(c,'nombreDePersonaRef(["recZZZZZZZZZZZZZZ"])'),'recZZZZZZZZZZZZZZ');
});

// ─── pedirPorPersona ──────────────────────────────────────────────────────────
// Imita a Airtable: FIND() compara caracter a caracter, y LOWER()/SUBSTITUTE()
// solo se aplican si la fórmula los usa.
function conAirtable(c,registros,{rechazaFormula=false}={}){
  const pedidos=[];
  c.atGet=async(tabla,qs='')=>{
    pedidos.push(qs);
    const formula=decodeURIComponent((qs.match(/filterByFormula=(.*?)(?:&sort|$)/)||[])[1]||'');
    if(rechazaFormula&&/SUBSTITUTE/.test(formula)) throw new Error('Invalid formula');
    const m=formula.match(/FIND\("([^"]*)"/);
    if(!m) return {records:registros};
    const buscado=m[1];
    const normaliza=s=>{
      let v=String(s||'');
      if(/LOWER\(/.test(formula)) v=v.toLowerCase();
      if(/SUBSTITUTE\(/.test(formula)) v=v.normalize('NFD').replace(/[̀-ͯ]/g,'');
      return v;
    };
    return {records:registros.filter(r=>normaliza(r.fields.Persona).includes(buscado))};
  };
  return pedidos;
}

const AW=[
  {id:'aw1',fields:{Persona:'Jesus Figueroa','Edición AW':'AW 2025'}},   // sin acento
  {id:'aw2',fields:{Persona:'Ana Dev','Edición AW':'AW 2025'}},
  {id:'aw3',fields:{Persona:'Ana María Dev','Edición AW':'AW 2024'}},
];

test('pedirPorPersona: encuentra a la persona aunque el acento no coincida',async()=>{
  const c=ctxUtils();
  sembrar(c,'cachePersonasRaw',PERSONAS);
  conAirtable(c,AW);
  c.__nombre='Jesús Figueroa';
  const recs=await leer(c,'pedirPorPersona("Ambassador Week","Persona",__nombre)');
  assert.equal(recs.length,1);
  assert.equal(recs[0].id,'aw1');
});

// FIND() matchea por pedazo: "Ana Dev" estaba trayendo también las filas de
// "Ana María Dev"… y al revés, el nombre de otra persona dentro del propio.
test('pedirPorPersona: no se trae las filas de otra persona con un nombre parecido',async()=>{
  const c=ctxUtils();
  sembrar(c,'cachePersonasRaw',PERSONAS);
  conAirtable(c,AW);
  c.__nombre='Ana Dev';
  const recs=await leer(c,'pedirPorPersona("Ambassador Week","Persona",__nombre)');
  assert.equal(recs.map(r=>r.id).join('|'),'aw2');
});

test('pedirPorPersona: si Airtable rechaza la fórmula, reintenta con el nombre tal cual',async()=>{
  const c=ctxUtils();
  sembrar(c,'cachePersonasRaw',PERSONAS);
  const pedidos=conAirtable(c,AW,{rechazaFormula:true});
  c.console={...console,warn(){}};
  c.__nombre='Ana Dev';
  const recs=await leer(c,'pedirPorPersona("Ambassador Week","Persona",__nombre)');
  assert.equal(pedidos.length,2);                 // la que falló y el reintento
  assert.equal(recs.map(r=>r.id).join('|'),'aw2'); // y el resultado sigue siendo el correcto
});

test('pedirPorPersona: conserva el orden pedido y no inventa filas si no hay nada',async()=>{
  const c=ctxUtils();
  sembrar(c,'cachePersonasRaw',PERSONAS);
  const pedidos=conAirtable(c,AW);
  c.__nombre='Nadie Conocido';
  const recs=await leer(c,'pedirPorPersona("Ambassador Week","Persona",__nombre,"&sort[0][field]=Fecha")');
  assert.equal(recs.length,0);
  assert.match(pedidos[0],/sort\[0\]\[field\]=Fecha/);
});
