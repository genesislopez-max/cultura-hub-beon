// ─── STATE ───────────────────────────────────────────────────────────────────
// Estado global compartido entre módulos (mismo scope global que el resto de los <script>).

// El token de Airtable y el webhook de Slack ya no viven en el navegador —
// quedan como variables de entorno del servidor (ver api/_lib/auth.js y
// api/airtable.js). El login de Google (js/auth.js) es lo único que se
// guarda del lado del cliente.

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
let cacheOtrosReminders=[]; // reminders manuales (Tipo != Glassdoor) — ver js/glassdoor.js
let gdModalId=null;

// Proyectos / Meet our Teams
let cacheMeetByProyecto={};  // { 'NombreProyecto': [{id, fecha, link, notas}] }
let meetProyectoActual=null; // {id: recordId, nombre: string}

// Beneficios
let cacheBenefAsignados=[], cachePresupuestoLoyalty=[];
let benefExpandido=null; // id del beneficio con la card de personas activas desplegada

// Off Sites
let cacheOSRaw=[];
let cacheOSProyMap = {};

// Ambassador Week
let cacheAWRaw=[];

// Panel lateral persona
let cacheCapacitaciones=[], cacheGetTogetherRaw=[];

// Tareas (Kanban + Calendario)
let cacheTareasRaw=[];
let tareasCalMes=null; // Date del primer día del mes mostrado en el calendario; null = mes actual

// Nav / modal de alta de registros
let currentForm=null;
let currentFormFull=null;

// Lazy loading — secciones que ya se cargaron en esta sesión (ver nav.js)
let seccionesCargadas=new Set();
