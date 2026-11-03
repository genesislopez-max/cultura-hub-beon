// Lo que comparten los checks de navegador: encontrar Playwright y abrir el Hub.
//
// Estos scripts abren el Hub de verdad en Chromium y lo manejan como lo haría
// una persona. Son el complemento de `node --test test/*.test.js`: la suite
// cubre la lógica pura, y acá se verifica lo que solo se rompe en el DOM — que
// un filtro sobreviva a una recarga, que un cartel diga lo que después hace,
// que una card muestre lo que corresponde.
//
// Cada script arma su propio mock de la API, porque lo que necesita mockear
// cambia bastante entre uno y otro (fórmulas de Airtable, errores puntuales,
// escrituras que hay que inspeccionar). Acá vive solo lo que de verdad
// comparten todos; ver README.md en esta misma carpeta.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

const RAIZ=path.resolve(__dirname,'..','..');

// No hay package.json en el repo a propósito (si aparece uno, Vercel cambia
// cómo construye el proyecto), así que Playwright se instala aparte y se lo
// busca: en node_modules como cualquier módulo, o donde diga PLAYWRIGHT_DIR.
// Si no está, el error dice qué hacer en vez de un "Cannot find module" pelado.
function cargarPlaywright(){
  const candidatos=[
    'playwright',
    process.env.PLAYWRIGHT_DIR&&path.join(process.env.PLAYWRIGHT_DIR,'node_modules','playwright'),
  ].filter(Boolean);
  for(const c of candidatos){
    try{ return require(c); }catch(e){ /* probar el siguiente */ }
  }
  console.error(`
No se encontró Playwright, que es lo que abre el navegador.

  mkdir -p ~/pw && cd ~/pw && npm install playwright && npx playwright install chromium

y después, desde la raíz del repo:

  PLAYWRIGHT_DIR=~/pw node test/browser/correr-todos.js

Se instala afuera del repo a propósito: un package.json en la raíz cambia
cómo Vercel construye el proyecto.
`.trim());
  process.exit(2);
}

const {chromium}=cargarPlaywright();

// El binario de Chromium: el de la imagen de este entorno si está, si no el
// que Playwright haya descargado por su cuenta.
async function lanzar(){
  const propio=process.env.PW_CHROMIUM||'/opt/pw-browsers/chromium';
  return fs.existsSync(propio)?chromium.launch({executablePath:propio}):chromium.launch();
}

// El Hub se abre como archivo local: no hace falta levantar ningún servidor.
// Relativo al repo y no a una ruta fija, para que ande en cualquier checkout.
function urlDelHub(){
  return pathToFileURL(path.join(RAIZ,'index.html')).href;
}

module.exports={lanzar,urlDelHub};
