// Los archivos en js/ son <script> clásicos hechos para el navegador: se
// declaran en global scope y varios asumen que existen `document`/`window`/
// `localStorage`. Este helper carga uno o más de esos archivos dentro de un
// mismo sandbox de Node (vm), tal como el navegador los carga en un mismo
// scope global vía múltiples <script src>, con stubs mínimos de DOM para que
// las declaraciones de nivel superior no exploten al cargarse.
//
// Solo sirve para testear funciones puras/de lógica de negocio — no ejecuta
// nada que dependa de verdad de un DOM real (para eso hace falta un browser).
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const JS_DIR=path.join(__dirname,'..','js');

function localStorageStub(){
  const store={};
  return {
    getItem:k=>(k in store?store[k]:null),
    setItem:(k,v)=>{store[k]=String(v);},
    removeItem:k=>{delete store[k];},
  };
}

function elementStub(){
  return {
    style:{},
    classList:{add(){},remove(){},contains(){return false;}},
    textContent:'',
    innerHTML:'',
    value:'',
    addEventListener(){},
    appendChild(){},
    querySelectorAll(){return [];},
    querySelector(){return null;},
  };
}

function documentStub(){
  return {
    addEventListener(){},
    getElementById(){return elementStub();},
    querySelectorAll(){return [];},
    querySelector(){return null;},
    createElement(){return elementStub();},
    body:elementStub(),
  };
}

function loadApp(files){
  const sandbox={console};
  sandbox.localStorage=localStorageStub();
  sandbox.sessionStorage=localStorageStub();
  sandbox.document=documentStub();
  sandbox.window={addEventListener(){}};
  sandbox.navigator={};
  sandbox.fetch=async()=>{throw new Error('fetch no disponible en tests unitarios');};
  sandbox.atob=globalThis.atob;
  const context=vm.createContext(sandbox);
  for(const file of files){
    const code=fs.readFileSync(path.join(JS_DIR,file),'utf8');
    vm.runInContext(code,context,{filename:file});
  }
  return context;
}

module.exports={loadApp};
