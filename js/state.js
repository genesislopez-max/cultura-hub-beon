// ─── STATE ───────────────────────────────────────────────────────────────────
// Estado global compartido entre módulos (mismo scope global que el resto de los <script>).

// Slack Webhook — se guarda en localStorage, nunca en el código
let SLACK_WEBHOOK=localStorage.getItem('slack_webhook')||'';

// Token y Base ID — se guardan en localStorage, nunca en el código
let TOKEN=localStorage.getItem('at_token')||'';
let BASE=localStorage.getItem('at_base')||'';
let HDR={'Authorization':`Bearer ${TOKEN}`,'Content-Type':'application/json'};
function actualizarHDR(){ HDR={'Authorization':`Bearer ${TOKEN}`,'Content-Type':'application/json'}; }

let cachePersonasPorRol={};
let cacheProyectos=[], cacheProyectosRaw=[];
let cachePersonasRaw=[];
let pagState={eng:{page:0,data:[]},core:{page:0,data:[]}};

let cacheBeneficiosRaw=[];
let beneficiosFiltro='Todos';

// Checklist Ingresos/Egresos (Kanban)
const clState={};
const recMeta={};
const cacheChecklistFields={}; // {checklistId: fields del registro} — para mostrar Proyecto/Mail/País en el panel abierto
let dragId=null;

// Glassdoor
let cacheGDRecs=[];
let gdModalId=null;

// Proyectos / Meet our Teams
let cacheMeetByProyecto={};  // { 'NombreProyecto': [{id, fecha, link, notas}] }
let meetProyectoActual=null; // {id: recordId, nombre: string}

// Beneficios
let cacheBenefAsignados=[], cachePresupuestoLoyalty=[];

// Off Sites
let cacheOSRaw=[];
let cacheOSProyMap = {};

// Ambassador Week
let cacheAWRaw=[];

// Panel lateral persona
let cacheCapacitaciones=[], cacheGetTogetherRaw=[];

// Nav / modal de alta de registros
let currentForm=null;
let currentFormFull=null;

// Lazy loading — secciones que ya se cargaron en esta sesión (ver nav.js)
let seccionesCargadas=new Set();
