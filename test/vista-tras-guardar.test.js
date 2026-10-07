'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadApp}=require('../test-helpers/load-app');

// Guardar una edición recarga datos y vuelve a dibujar las tablas. Antes eso
// te sacaba de donde estabas: se perdían los filtros y la lista saltaba a la
// página 1, así que había que volver a buscar a la persona para seguir.

function leer(ctx,expr){ return vm.runInContext(expr,ctx); }
function sembrar(ctx,cache,datos){
  ctx.__fixture=datos;
  vm.runInContext(`${cache}=__fixture`,ctx);
}

// El stub de load-app devuelve un elemento nuevo en cada getElementById(), así
// que lo que el código escribe en un <select> se pierde. Acá los elementos
// persisten, que es justo lo que hay que poder observar.
function conDomPersistente(ctx){
  const elementos={};
  const nuevo=()=>{
    const el={
      style:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},
      textContent:'',value:'',
      addEventListener(){},appendChild(){},
      querySelectorAll:()=>[],querySelector:()=>null,
    };
    // Rehacer las <option> de un <select> le borra el valor elegido, como en el
    // navegador: es justamente lo que hace que un filtro se pierda si nadie lo
    // vuelve a poner.
    let html='';
    Object.defineProperty(el,'innerHTML',{
      get:()=>html,
      set(v){ html=v; el.value=''; },
    });
    return el;
  };
  ctx.document.getElementById=id=>(elementos[id]||(elementos[id]=nuevo()));
  return ctx.document.getElementById;
}

function personas(cantidad,extra=()=>({})){
  return Array.from({length:cantidad},(_,i)=>({
    id:'p'+i,
    fields:{Nombre:`Persona${String(i+1).padStart(2,'0')}`,'Rol en empresa':'Engineer',
      'Fecha de ingreso':'2021-01-01','Nivel Loyalty':'Ray',...extra(i)},
  }));
}

function ctxPersonas(){
  // Las filas de la tabla preguntan por el rol para decidir si muestran las
  // acciones de edición; acá da igual cuál sea.
  return loadApp(['constants.js','state.js','utils.js','personas.js'],{puedeEscribir:()=>true});
}

test('restaurarVistaPersonas: te deja en la misma página en la que estabas',()=>{
  const ctx=ctxPersonas();
  conDomPersistente(ctx);
  sembrar(ctx,'cachePersonasRaw',personas(70));
  sembrar(ctx,'pagState',{eng:{page:0,data:personas(70),all:personas(70)},core:{page:0,data:[],all:[]}});
  leer(ctx,'restaurarVistaPersonas({eng:1,core:0})');
  assert.equal(leer(ctx,'pagState.eng.page'),1);
});

test('restaurarVistaPersonas: si al filtrar quedan menos páginas, cae en la última y no en una vacía',()=>{
  const ctx=ctxPersonas();
  conDomPersistente(ctx);
  const diez=personas(10);
  sembrar(ctx,'cachePersonasRaw',diez);
  sembrar(ctx,'pagState',{eng:{page:0,data:diez,all:diez},core:{page:0,data:[],all:[]}});
  // Estaba en la página 4 de un listado que ahora entra en una sola
  leer(ctx,'restaurarVistaPersonas({eng:3,core:0})');
  assert.equal(leer(ctx,'pagState.eng.page'),0);
});

test('restaurarVistaPersonas: vuelve a aplicar el filtro que había en pantalla',()=>{
  const ctx=ctxPersonas();
  const el=conDomPersistente(ctx);
  const gente=personas(10,i=>({Proyecto:i<4?'Atlas':'Evvnt'}));
  sembrar(ctx,'cachePersonasRaw',gente);
  sembrar(ctx,'pagState',{eng:{page:0,data:gente,all:gente},core:{page:0,data:[],all:[]}});
  // Lo que el usuario tenía elegido sigue en el select después de recargar
  el('personas-proyecto-eng').value='Atlas';
  leer(ctx,'restaurarVistaPersonas({eng:0,core:0})');
  assert.equal(leer(ctx,'pagState.eng.data.length'),4);
  assert.equal(el('badge-personas-eng').textContent,'4 personas');
});

test('poblarFiltrosPersonas: no borra el filtro de Proyecto ni el de Manager elegidos',()=>{
  const ctx=ctxPersonas();
  const el=conDomPersistente(ctx);
  const gente=[
    ...personas(3,()=>({Proyecto:'Atlas',Manager:'Tina TEM'})),
    {id:'t1',fields:{Nombre:'Tina TEM','Rol en empresa':'TEM','Fecha de ingreso':'2019-01-01'}},
  ];
  sembrar(ctx,'cachePersonasRaw',gente);
  sembrar(ctx,'pagState',{eng:{page:0,data:gente,all:gente},core:{page:0,data:gente,all:gente}});
  el('personas-proyecto-eng').value='Atlas';
  el('personas-manager-eng').value='Tina TEM';
  leer(ctx,'poblarFiltrosPersonas()');
  assert.equal(el('personas-proyecto-eng').value,'Atlas');
  assert.equal(el('personas-manager-eng').value,'Tina TEM');
});

test('poblarFiltrosPersonas: un filtro que ya no existe en los datos se limpia solo',()=>{
  const ctx=ctxPersonas();
  const el=conDomPersistente(ctx);
  const gente=personas(3,()=>({Proyecto:'Evvnt'}));
  sembrar(ctx,'cachePersonasRaw',gente);
  sembrar(ctx,'pagState',{eng:{page:0,data:gente,all:gente},core:{page:0,data:gente,all:gente}});
  // Quedó elegido un proyecto que ya nadie tiene: dejarlo seleccionado
  // mostraría una lista vacía sin motivo visible.
  el('personas-proyecto-eng').value='Proyecto Que Ya No Está';
  leer(ctx,'poblarFiltrosPersonas()');
  assert.equal(el('personas-proyecto-eng').value,'');
});

// loadAll() ya no re-pide todas las tablas: refresca lo que está a la vista y
// marca el resto para recargarse cuando el usuario entre.
function ctxNav(){
  // nav.js arma SECCIONES_LAZY con los loaders de cada sección (que viven en
  // otros archivos) ya al cargarse: alcanza con que existan.
  const globales={};
  ['loadChecklist','loadBeneficios','loadAmbassadors','loadOffsites','loadGetTogether',
   'loadTareas','loadActividadesVirtuales','loadEventos','loadExBeoners']
    .forEach(n=>{globales[n]=async()=>{};});
  // nav.js llama a init() al final: sin sesión se queda en la pantalla de
  // login y no arranca a cargar la app entera.
  globales.checkSesion=()=>false;
  return loadApp(['constants.js','state.js','utils.js','nav.js'],globales);
}

test('seccionAbierta: sin nada guardado es Inicio',()=>{
  const ctx=ctxNav();
  assert.equal(leer(ctx,'seccionAbierta()'),'inicio');
});

test('seccionAbierta: devuelve la sección que el usuario está viendo',()=>{
  const ctx=ctxNav();
  ctx.localStorage.setItem('hub_seccion','beneficios');
  assert.equal(leer(ctx,'seccionAbierta()'),'beneficios');
});

test('loadAll: solo recarga la sección abierta y marca las demás como pendientes',async()=>{
  const ctx=ctxNav();
  const corridos=[];
  ctx.__espia=nombre=>corridos.push(nombre);
  // cargarSeccionesIniciales y los loaders lazy se reemplazan por espías: acá
  // interesa a cuáles se llama, no lo que cada uno hace.
  vm.runInContext(`
    cargarSeccionesIniciales=async()=>{__espia('iniciales');};
    SECCIONES_LAZY.length=0;
    SECCIONES_LAZY.push(['beneficios','Beneficios',async()=>{__espia('beneficios');}]);
    SECCIONES_LAZY.push(['tareas','Tareas',async()=>{__espia('tareas');}]);
    seccionesCargadas=new Set(['beneficios','tareas']);
  `,ctx);
  ctx.localStorage.setItem('hub_seccion','beneficios');
  await leer(ctx,'loadAll()');

  assert.deepEqual(corridos,['iniciales','beneficios']);
  // La abierta queda cargada; la otra, pendiente de pedirse al entrar
  assert.equal(leer(ctx,'seccionesCargadas.has("beneficios")'),true);
  assert.equal(leer(ctx,'seccionesCargadas.has("tareas")'),false);
});

test('loadAll: si la sección abierta no es lazy, no recarga ninguna',async()=>{
  const ctx=ctxNav();
  const corridos=[];
  ctx.__espia=nombre=>corridos.push(nombre);
  vm.runInContext(`
    cargarSeccionesIniciales=async()=>{__espia('iniciales');};
    SECCIONES_LAZY.length=0;
    SECCIONES_LAZY.push(['beneficios','Beneficios',async()=>{__espia('beneficios');}]);
    seccionesCargadas=new Set(['beneficios']);
  `,ctx);
  ctx.localStorage.setItem('hub_seccion','engineers');
  await leer(ctx,'loadAll()');

  assert.deepEqual(corridos,['iniciales']);
  assert.equal(leer(ctx,'seccionesCargadas.has("beneficios")'),false);
});

test('loadAll: si falla la sección abierta queda pendiente, para poder reintentar',async()=>{
  const ctx=ctxNav();
  const avisos=[];
  ctx.__aviso=t=>avisos.push(t);
  vm.runInContext(`
    cargarSeccionesIniciales=async()=>{};
    toast=t=>__aviso(t);
    SECCIONES_LAZY.length=0;
    SECCIONES_LAZY.push(['tareas','Tareas',async()=>{throw new Error('se cayó la red');}]);
    seccionesCargadas=new Set(['tareas']);
  `,ctx);
  ctx.localStorage.setItem('hub_seccion','tareas');
  await leer(ctx,'loadAll()');

  assert.equal(leer(ctx,'seccionesCargadas.has("tareas")'),false);
  assert.match(avisos.join(' '),/Tareas/);
});
