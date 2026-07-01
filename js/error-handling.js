// ─── ERROR HANDLING GLOBAL ────────────────────────────────────────────────────
// Red de seguridad para errores que no fueron capturados por un try/catch
// puntual (bugs, promesas de un onclick sin await, etc). No reemplaza el
// manejo de errores específico de cada acción — es el último recurso para
// que el usuario vea algo en vez de que el Hub se quede colgado en silencio.
let lastGlobalErrorAt=0;
function reportError(context,err){
  console.error(`[${context}]`,err);
  const now=Date.now();
  if(now-lastGlobalErrorAt<1500) return; // evita spam si fallan varias cosas juntas
  lastGlobalErrorAt=now;
  const msg=err?.message||String(err||'Error desconocido');
  toast(`⚠️ ${context}: ${msg}`,true);
}

window.addEventListener('error',e=>{
  reportError('Error inesperado',e.error||e.message);
});
window.addEventListener('unhandledrejection',e=>{
  reportError('Error inesperado',e.reason);
});
