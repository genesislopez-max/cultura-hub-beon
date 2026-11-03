// Corre todos los checks de navegador, uno por uno, y resume al final.
//
//   PLAYWRIGHT_DIR=~/pw node test/browser/correr-todos.js
//   PLAYWRIGHT_DIR=~/pw node test/browser/correr-todos.js loyalty   # solo los que matcheen
//
// Van de a uno y no en paralelo a propósito: cada uno abre su propio Chromium,
// y en paralelo el output se entrevera y cuesta más leer qué falló.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

const filtro=(process.argv[2]||'').toLowerCase();
const scripts=fs.readdirSync(__dirname)
  .filter(f=>f.startsWith('probar-')&&f.endsWith('.js'))
  .filter(f=>!filtro||f.toLowerCase().includes(filtro))
  .sort();

if(!scripts.length){
  console.error(filtro?`Ningún check matchea "${filtro}".`:'No hay checks en test/browser/.');
  process.exit(2);
}

const fallaron=[];
for(const s of scripts){
  process.stdout.write(`  ${s.padEnd(38)}`);
  const r=spawnSync(process.execPath,[path.join(__dirname,s)],{encoding:'utf8'});
  if(r.status===0){
    console.log('✅');
  }else{
    console.log('❌');
    fallaron.push({script:s,salida:(r.stdout||'')+(r.stderr||'')});
  }
}

if(fallaron.length){
  fallaron.forEach(({script,salida})=>{
    console.log(`\n${'─'.repeat(70)}\n${script}\n${'─'.repeat(70)}\n${salida.trim()}`);
  });
}
console.log(`\n${scripts.length} checks · ${scripts.length-fallaron.length} pasan · ${fallaron.length} fallan`);
process.exit(fallaron.length?1:0);
