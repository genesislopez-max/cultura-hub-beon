# Checks de navegador

Estos scripts abren el Hub de verdad en Chromium y lo manejan como lo haría una
persona: entran a una sección, escriben en un filtro, aprietan Guardar, miran
qué quedó en pantalla y qué se mandó a Airtable.

Son el complemento de la suite unitaria, no su reemplazo:

| | `node --test test/*.test.js` | `node test/browser/correr-todos.js` |
|---|---|---|
| Qué cubre | la lógica pura (fechas, criterios, normalizaciones) | lo que solo se rompe en el DOM |
| Cuánto tarda | segundos | ~1 minuto |
| Necesita | nada | Playwright + Chromium |

Lo que se verifica acá es justamente lo que la suite no puede ver: que un filtro
sobreviva a una recarga, que un cartel de confirmación diga lo que después
realmente hace, que una card muestre el dato que corresponde.

## Cómo se corren

```bash
node test/browser/correr-todos.js            # todos
node test/browser/correr-todos.js loyalty    # solo los que matcheen
node test/browser/probar-card-loyalty.js     # uno suelto, con todo su detalle
```

El runner muestra ✅/❌ por script y, si algo falla, imprime la salida completa
de los que fallaron. Sale con código 1 si hay alguno en rojo.

Cada script suelto imprime lo que vio antes de juzgarlo, así que cuando algo
falla se entiende qué pasó sin tener que leer el código.

## Playwright

En el entorno de Claude Code ya viene instalado y los scripts lo encuentran
solos. En otra máquina:

```bash
mkdir -p ~/pw && cd ~/pw && npm install playwright && npx playwright install chromium
cd /ruta/al/repo && PLAYWRIGHT_DIR=~/pw node test/browser/correr-todos.js
```

**Se instala afuera del repo a propósito**: este proyecto no tiene
`package.json`, y si aparece uno en la raíz, Vercel cambia cómo construye el
proyecto. Por eso `_comun.js` busca Playwright en varios lados en vez de
declararlo como dependencia.

Variables opcionales:

- `PLAYWRIGHT_DIR` — carpeta donde está instalado Playwright.
- `PW_CHROMIUM` — ruta a un binario de Chromium puntual. Si no está, se usa
  `/opt/pw-browsers/chromium` cuando existe, y si no el que Playwright bajó.

## Qué cubre cada uno

| Script | Qué verifica |
|---|---|
| `probar-guardar-sin-perder-vista.js` | guardar no te borra la búsqueda, los filtros ni la página |
| `probar-filtro-offboarding.js` | el board de Offboarding no reaparece entero al recargarse |
| `probar-ingreso-fantasma.js` | no se le inventa una tarjeta de ingreso a quien hace años trabaja acá |
| `probar-cartel-eliminar.js` | el cartel de borrar dice qué va a pasar con esa persona, y es lo que hace |
| `probar-tem-proyecto.js` | cambiar el TEM de un proyecto toca solo a quien corresponde |
| `probar-renombrar-proyecto.js` | renombrar un proyecto se lleva con él a su gente |
| `probar-aw-acentos.js` | un nombre con o sin acento se reconoce igual (ficha, historial y cobertura) |
| `probar-udemy-detalle.js` | las filas de Udemy se leen todas igual |
| `probar-aw-historial.js` | el filtro "sin ficha" de Ambassador Week |
| `probar-sin-ficha-os-gt.js` | ídem en Off Sites y Get Together |
| `probar-card-loyalty.js` | la card "Cambios de nivel" de Inicio y su selector de mes |
| `probar-historial-pendiente.js` | un cambio de nivel que no se pudo registrar queda a la vista |

## Cómo escribir uno nuevo

Lo más rápido es copiar el que más se parezca a lo que querés probar. De
`_comun.js` salen solo dos cosas, que es lo único que comparten todos:
`lanzar()` (abre Chromium) y `urlDelHub()` (la ruta al `index.html` del repo).

El mock de la API lo arma cada script por su cuenta, a propósito: lo que hay que
simular cambia bastante entre uno y otro — fórmulas de Airtable, un error
puntual en una tabla, escrituras que hay que inspeccionar después.

Dos costumbres que vale la pena mantener:

1. **Imprimir lo observado antes de juzgarlo.** La mitad del valor de estos
   checks es leer la salida cuando algo cambia.
2. **Correrlo contra el código SIN el arreglo** antes de darlo por bueno. Varias
   veces el check pasaba porque la aserción estaba mal escrita, no porque el
   producto anduviera: `git stash push js/archivo.js`, correrlo, `git stash pop`.
