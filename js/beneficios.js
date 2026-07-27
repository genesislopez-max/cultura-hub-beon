// ─── BENEFICIOS con filtro por grupo ─────────────────────────────────────────
// ── CACHE BENEFICIOS COMPLETO ────────────────────────────────────────────────
async function loadBeneficios(){
  const [dBenef, dAsig, dPres] = await Promise.all([
    atGet('Beneficios','&sort[0][field]=Beneficio&sort[0][direction]=asc'),
    atGet('Beneficios Asignados'),
    atGet('Presupuesto Loyalty')
  ]);
  cacheBeneficiosRaw=dBenef.records||[];
  cachePresupuestoLoyalty=dPres.records||[];

  // Resolver linked records en Beneficios Asignados
  cacheBenefAsignados=(dAsig.records||[]).map(r=>{
    const f={...r.fields};
    // Persona: si es linked record (array de IDs), resolver a nombre
    if(Array.isArray(f.Persona)){
      const id=f.Persona[0];
      const match=cachePersonasRaw.find(p=>p.id===id);
      f.Persona=match?match.fields.Nombre:id;
    }
    // Beneficio: si es linked record (array de IDs), resolver a nombre
    if(Array.isArray(f.Beneficio)){
      const id=f.Beneficio[0];
      const match=cacheBeneficiosRaw.find(b=>b.id===id);
      f.Beneficio=match?match.fields.Beneficio:id;
    }
    return {...r, fields:f};
  });
  const tabCount=document.getElementById('benef-tab-count-catalogo');
  if(tabCount) tabCount.textContent=cacheBeneficiosRaw.length;
  poblarFiltroBeneficioNombre();
  poblarSelectorTEM('benef-persona-tem');
  renderBenefCatalogo();
  renderBenefPersonas();
  renderBenefMetricas();
}

function poblarFiltroBeneficioNombre(){
  const sel=document.getElementById('benef-nombre');
  if(!sel) return;
  const actual=sel.value;
  const nombres=[...new Set(cacheBeneficiosRaw.map(b=>b.fields.Beneficio).filter(Boolean))].sort();
  sel.innerHTML='<option value="">Todos los beneficios</option>'+nombres.map(n=>`<option value="${n}"${n===actual?' selected':''}>${n}</option>`).join('');
}

// El botón "+" de arriba abre un form distinto según el tab activo: alta de
// beneficio al catálogo en "Catálogo", o asignación de un beneficio a una
// persona puntual en "Por persona" (FORMS['beneficios-asignados'] ya existía
// pero no estaba conectado a ningún botón).
// HR y Manager no ven la pestaña de Métricas (cinturón de seguridad además
// de ocultar el botón — por si algo la dispara directamente).
const BENEF_ROLES_SIN_METRICAS=new Set(['hr','manager']);

// Se llama al arrancar (ver aplicarRestriccionesDeAcceso() en nav.js) —
// oculta/fija controles de Beneficios según el rol. Los elementos ya están
// en el DOM desde que carga index.html, así que no hace falta esperar a
// loadBeneficios() (que recién corre cuando el usuario entra a la sección).
function aplicarRestriccionesBeneficios(){
  const rol=rolUsuarioActual();
  if(BENEF_ROLES_SIN_METRICAS.has(rol)){
    document.querySelector('.benef-tab[onclick*="metricas"]')?.style.setProperty('display','none');
  }
  if(rol==='hr'){
    const sel=document.getElementById('benef-persona-grupo');
    if(sel){ sel.value='Core Team'; sel.disabled=true; }
  }
}

function switchBenefTab(tab, btn){
  if(tab==='metricas'&&BENEF_ROLES_SIN_METRICAS.has(rolUsuarioActual())){
    tab='catalogo';
    btn=document.querySelector('.benef-tab[onclick*="catalogo"]');
  }
  document.querySelectorAll('.benef-tab').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  document.getElementById('benef-tab-catalogo').style.display=tab==='catalogo'?'':'none';
  document.getElementById('benef-tab-personas').style.display=tab==='personas'?'':'none';
  const tabMetricas=document.getElementById('benef-tab-metricas');
  if(tabMetricas) tabMetricas.style.display=tab==='metricas'?'':'none';
  const ab=document.getElementById('btn-add');
  if(ab) ab.style.display=tab==='metricas'?'none':'flex';
  if(tab==='metricas'){
    poblarAnioBenefQ();
    if(!benefMetricasInicializado){
      const hoy=new Date();
      const selAnio=document.getElementById('benefq-anio');
      if(selAnio) selAnio.value=String(hoy.getFullYear());
      document.getElementById('benefq-trimestre').value=String(Math.floor(hoy.getMonth()/3)+1);
      benefMetricasInicializado=true;
    }
    renderBenefMetricasQ();
    return;
  }
  const formKey=tab==='personas'?'beneficios-asignados':'beneficios';
  currentForm=FORMS[formKey];
  const lbl=document.getElementById('btn-label');
  if(lbl) lbl.textContent=LABELS[formKey];
}

// ─── MÉTRICAS POR TRIMESTRE ───────────────────────────────────────────────────
// "Alta" = una asignación (Beneficios Asignados) cuya Fecha de activación cae
// dentro del trimestre elegido — mide cuánto se usó cada beneficio en ese
// período, más allá de si sigue activo hoy.
function poblarAnioBenefQ(){
  const sel=document.getElementById('benefq-anio');
  if(!sel) return;
  const anios=new Set([new Date().getFullYear()]);
  cacheBenefAsignados.forEach(r=>{
    const f=r.fields['Fecha activación'];
    if(f) anios.add(new Date(f+'T12:00:00').getFullYear());
  });
  const actual=sel.value;
  sel.innerHTML=[...anios].sort((a,b)=>b-a).map(a=>`<option value="${a}"${String(a)===actual?' selected':''}>${a}</option>`).join('');
}

function renderBenefMetricasQ(){
  const anio=Number(document.getElementById('benefq-anio')?.value)||new Date().getFullYear();
  const q=Number(document.getElementById('benefq-trimestre')?.value)||1;
  const mesInicio=(q-1)*3;
  const inicio=new Date(anio,mesInicio,1);
  const fin=new Date(anio,mesInicio+3,0); // último día del 3er mes del trimestre

  const conFecha=cacheBenefAsignados.filter(r=>r.fields['Fecha activación']);
  document.getElementById('bq-sinfecha').textContent=cacheBenefAsignados.length-conFecha.length;

  const altasQ=conFecha.filter(r=>{
    const f=new Date(r.fields['Fecha activación']+'T12:00:00');
    return f>=inicio&&f<=fin;
  });
  document.getElementById('bq-altas').textContent=altasQ.length;
  document.getElementById('bq-altas-sub').textContent=`Q${q} ${anio}`;

  const personasUnicas=new Set(altasQ.map(r=>typeof r.fields.Persona==='string'?r.fields.Persona:(Array.isArray(r.fields.Persona)?r.fields.Persona[0]:'')).filter(Boolean));
  document.getElementById('bq-personas').textContent=personasUnicas.size;

  const conteo={};
  altasQ.forEach(r=>{
    const bNombre=typeof r.fields.Beneficio==='string'?r.fields.Beneficio:(Array.isArray(r.fields.Beneficio)?r.fields.Beneficio[0]:'');
    if(!bNombre) return;
    conteo[bNombre]=(conteo[bNombre]||0)+1;
  });
  const ranking=Object.entries(conteo).sort((a,b)=>b[1]-a[1]);
  const top=ranking[0];
  document.getElementById('bq-top').textContent=top?top[0]:'—';
  document.getElementById('bq-top-sub').textContent=top?`${top[1]} alta${top[1]!==1?'s':''} en el Q`:'Sin altas en este período';

  const cont=document.getElementById('benefq-ranking-container');
  if(!cont) return;
  if(!ranking.length){
    cont.innerHTML='<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px;">Sin altas registradas en este trimestre.</div>';
    return;
  }
  const totalAltas=altasQ.length;
  cont.innerHTML=`<table class="data-table"><thead><tr><th>Beneficio</th><th>Altas en el Q</th><th>% del total</th></tr></thead><tbody>
    ${ranking.map(([bNombre,cant])=>{
      const pct=totalAltas?Math.round(cant/totalAltas*100):0;
      return`<tr><td>${bNombre}</td><td style="font-weight:600">${cant}</td><td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;max-width:140px;height:6px;background:var(--border);border-radius:3px;overflow:hidden"><div style="width:${pct}%;height:100%;background:var(--blue);border-radius:3px"></div></div>
          <span style="font-size:12px;color:var(--text2)">${pct}%</span>
        </div>
      </td></tr>`;
    }).join('')}
  </tbody></table>`;
}

function renderBenefMetricas(){
  const activos=cacheBeneficiosRaw.filter(r=>(r.fields.Estado||'Activo')==='Activo').length;
  document.getElementById('mb-activos').textContent=activos;

  // Presupuesto total usado = suma de valores de beneficios asignados activos
  let totalUsado=0;
  cacheBenefAsignados.filter(a=>(a.fields.Estado||'Activo')==='Activo').forEach(a=>{
    if(a.fields.Monto){
      totalUsado+=Number(a.fields.Monto)||0;
    } else {
      const bNombre=typeof a.fields.Beneficio==='string'?a.fields.Beneficio:(Array.isArray(a.fields.Beneficio)?a.fields.Beneficio[0]:'');
      const benef=cacheBeneficiosRaw.find(b=>b.fields.Beneficio===bNombre);
      if(benef?.fields.Valor) totalUsado+=Number(benef.fields.Valor)||0;
    }
  });
  // "Resto del equipo", HR y Manager ven el catálogo/asignaciones de su
  // grupo, pero no el agregado de gasto total — se oculta la tarjeta entera
  // (no solo el número) para no dejar la etiqueta sin nada al lado. TEM y
  // Full sí lo ven.
  const presupuestoEl=document.getElementById('mb-presupuesto');
  const presupuestoCard=presupuestoEl?.closest('.metric');
  if(['equipo','hr','manager'].includes(rolUsuarioActual())){
    if(presupuestoCard) presupuestoCard.style.display='none';
  } else {
    if(presupuestoCard) presupuestoCard.style.display='';
    if(presupuestoEl) presupuestoEl.textContent=totalUsado>0?`$${totalUsado.toLocaleString('es-AR')}`:'—';
  }

  // Personas con/sin beneficios — solo sobre el equipo activo hoy, igual
  // criterio (yaEgreso) que el resto de las vistas de Beneficios.
  const nombresActivos=new Set(cachePersonasRaw.filter(p=>!yaEgreso(p)).map(p=>(p.fields.Nombre||'').trim()));
  const personasConBenef=new Set(cacheBenefAsignados.filter(a=>(a.fields.Estado||'Activo')==='Activo').map(a=>{
    const nombre=Array.isArray(a.fields.Persona)?a.fields.Persona[0]:a.fields.Persona;
    return (nombre||'').trim();
  }).filter(nombre=>nombresActivos.has(nombre)));
  const totalPersonas=nombresActivos.size;
  document.getElementById('mb-personas').textContent=personasConBenef.size;
  document.getElementById('mb-personas-sub').textContent=`de ${totalPersonas} en el equipo`;
  document.getElementById('mb-sinbenef').textContent=Math.max(0,totalPersonas-personasConBenef.size);
}


// Niveles Loyalty en orden
function tieneAccesoBeneficio(nivelPersona, nivelBeneficio){
  if(!nivelBeneficio||nivelBeneficio==='Todos') return true;
  const idxPersona=LOYALTY_ORDER.indexOf(nivelPersona);
  const idxBenef=LOYALTY_ORDER.indexOf(nivelBeneficio);
  return idxPersona>=idxBenef;
}
// Color + ícono por categoría, para que las tarjetas del catálogo se
// distingan de un vistazo (ver diseño "Catálogo de beneficios" en
// claude.ai/design). "Otro" usa un tinte neutro fijo porque no tiene un par
// de variables temáticas propio como el resto.
const CATEGORIA_ESTILO={
  'Salud':{tinte:'var(--tinte-eng)',accent:'var(--blue)',icon:'ti-heart'},
  'Bienestar':{tinte:'var(--tinte-core)',accent:'var(--purple)',icon:'ti-brain'},
  'Aprendizaje':{tinte:'var(--tinte-teal)',accent:'var(--text-teal-accent)',icon:'ti-school'},
  'Tiempo':{tinte:'var(--tinte-pink)',accent:'var(--text-pink-accent)',icon:'ti-beach'},
};
const CATEGORIA_OTRO={tinte:'rgba(139,147,167,0.14)',accent:'var(--text3)',icon:'ti-package'};
function estiloCategoria(cat){ return CATEGORIA_ESTILO[cat]||CATEGORIA_OTRO; }

function filtrarBeneficios(){
  renderBenefCatalogo();
}

// Limpiar un filtro puntual desde su chip, o todos de una con "Limpiar todo"
// (no toca el buscador de texto libre ni el filtro de "Beneficio" puntual,
// que ya dejan el catálogo reducido por su cuenta).
function limpiarFiltroBenefCatalogo(campo){
  const el=document.getElementById(`benef-${campo}`);
  if(el) el.value='';
  renderBenefCatalogo();
}
function limpiarTodosFiltrosBenefCatalogo(){
  ['grupo','cat','loyalty','estado'].forEach(campo=>{
    const el=document.getElementById(`benef-${campo}`);
    if(el) el.value='';
  });
  renderBenefCatalogo();
}

function renderBenefCatalogo(){
  const q=(document.getElementById('benef-search')?.value||'').toLowerCase();
  const nombreFil=document.getElementById('benef-nombre')?.value||'';
  const grupo=document.getElementById('benef-grupo')?.value||'';
  const cat=document.getElementById('benef-cat')?.value||'';
  const loyalty=document.getElementById('benef-loyalty')?.value||'';
  const estado=document.getElementById('benef-estado')?.value||'';

  let recs=cacheBeneficiosRaw.filter(r=>{
    const f=r.fields;
    const g=f.Grupo||'Ambos';
    const matchQ=!q||(f.Beneficio||'').toLowerCase().includes(q)||(f.Descripción||'').toLowerCase().includes(q);
    const matchNombre=!nombreFil||f.Beneficio===nombreFil;
    const matchG=!grupo||g===grupo||g==='Ambos';
    const matchC=!cat||(f.Categoría||'')=== cat;
    // Filtro loyalty: mostrar beneficios accesibles desde ese nivel o superiores
    const matchL=!loyalty||tieneAccesoBeneficio(loyalty, f['Nivel Loyalty']||'Todos');
    const matchE=!estado||(f.Estado||'Activo')===estado;
    return matchQ&&matchNombre&&matchG&&matchC&&matchL&&matchE;
  });

  document.getElementById('badge-beneficios-h').textContent=`${recs.length} beneficios`;

  const chipsCont=document.getElementById('benef-chips-container');
  if(chipsCont){
    const chips=[];
    if(grupo) chips.push({campo:'grupo',label:grupo});
    if(cat) chips.push({campo:'cat',label:cat});
    if(loyalty) chips.push({campo:'loyalty',label:`Nivel: ${loyalty}`});
    if(estado) chips.push({campo:'estado',label:estado});
    if(chips.length){
      chipsCont.style.display='flex';
      chipsCont.innerHTML=`<span style="font-size:12px;color:var(--text3);font-weight:500">Filtros activos:</span>`
        +chips.map(c=>`<button onclick="limpiarFiltroBenefCatalogo('${c.campo}')" style="display:flex;align-items:center;gap:6px;padding:5px 8px 5px 12px;border-radius:999px;border:1px solid var(--chip-eng);background:var(--tinte-eng);color:var(--text-eng-accent);font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:600;cursor:pointer;">${c.label}<i class="ti ti-x" style="font-size:12px"></i></button>`).join('')
        +`<button onclick="limpiarTodosFiltrosBenefCatalogo()" style="background:none;border:none;color:var(--text3);font-size:12px;font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:2px;">Limpiar todo</button>`;
    } else {
      chipsCont.style.display='none';
      chipsCont.innerHTML='';
    }
  }

  // Agrupar por grupo para render dividido
  const engineers=recs.filter(r=>{const g=r.fields.Grupo||'Ambos';return g==='Engineers'||g==='Ambos';});
  const coreTeam=recs.filter(r=>{const g=r.fields.Grupo||'Ambos';return g==='Core Team'||g==='Ambos';});

  // seccionGrupo es el grupo de la sección donde se está pintando esta
  // tarjeta (Engineers o Core Team) — un beneficio "Ambos" aparece en las
  // dos secciones, así que el modal de "quién lo tiene" de cada una se
  // acota a su propio grupo (si no, mostraría los dos grupos mezclados).
  function benefCard(r,seccionGrupo){
    const f=r.fields;
    const g=f.Grupo||'Ambos';
    const nivel=f['Nivel Loyalty']||'';
    const valor=f.Valor?`$${Number(f.Valor).toLocaleString('es-AR')}/mes`:'';
    const activo=(f.Estado||'Activo')==='Activo';
    const est=estiloCategoria(f.Categoría);
    const statusBg=activo?'var(--chip-green-bg)':'var(--chip-amber-bg)';
    const statusFg=activo?'var(--chip-green-text)':'var(--chip-amber-text)';
    const statusDot=activo?'var(--green)':'var(--amber)';
    return`<div class="tr-clickable" onclick="abrirBenefDetalleModal('${r.id}','${seccionGrupo}')" style="position:relative;background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:16px;overflow:hidden;">
      <div style="position:absolute;inset:0 auto 0 0;width:3px;background:${est.accent}"></div>
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px">
        <div style="width:40px;height:40px;border-radius:11px;display:flex;align-items:center;justify-content:center;background:${est.tinte}">
          <i class="ti ${est.icon}" style="font-size:19px;color:${est.accent}"></i>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:600;background:${statusBg};color:${statusFg}">
            <span style="width:6px;height:6px;border-radius:999px;background:${statusDot}"></span>${activo?'Activo':'Inactivo'}
          </span>
          <button onclick="event.stopPropagation();editarBeneficio('${r.id}')" title="Editar beneficio" style="background:none;border:none;cursor:pointer;color:var(--text3);padding:2px;line-height:1;flex-shrink:0;"><i class="ti ti-pencil" style="font-size:15px"></i></button>
        </div>
      </div>
      <div style="font-size:14.5px;font-weight:700;color:var(--text);margin-bottom:4px">${f.Beneficio||'—'}</div>
      <div style="font-size:12px;line-height:1.5;color:var(--text3);margin-bottom:12px;min-height:32px">${f.Descripción||''}</div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding-top:12px;border-top:1px solid var(--border)">
        <span style="font-size:11px;font-weight:600;color:${est.accent};padding:3px 8px;border-radius:6px;background:${est.tinte}">${f.Categoría||'—'}</span>
        <span style="font-size:11px;font-weight:500;color:var(--text2);padding:3px 8px;border-radius:6px;background:var(--bg)">${(!nivel||nivel==='Todos')?'Todos los niveles':`desde ${nivel}`}</span>
        <span style="font-size:11px;font-weight:500;color:var(--text2);padding:3px 8px;border-radius:6px;background:var(--bg)">${g}</span>
        ${valor?`<span style="margin-left:auto;font-size:12px;font-weight:600;color:var(--text2)">${valor}</span>`:''}
      </div>
    </div>`;
  }

  const container=document.getElementById('benef-catalogo-container');
  if(!recs.length){
    container.innerHTML='<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px;">Sin resultados</div>';
    return;
  }

  const gridOpen='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;padding:16px 18px">';

  // Mismo tratamiento visual (tarjeta redondeada + header en degradado) que
  // ya usan los grupos de mes en Cumpleaños/Aniversarios — adentro, en vez de
  // una tabla, ahora va una grilla de tarjetas de beneficio.
  let html='';
  if(engineers.length){
    html+=`<div style="border-radius:10px;overflow:hidden;border:1px solid var(--border);margin:14px 14px 22px;">
      <div style="padding:14px 18px;background:linear-gradient(90deg,var(--tinte-eng) 0%,var(--bg2) 100%);border-left:3px solid var(--blue);display:flex;align-items:center;gap:12px;">
        <span style="font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:var(--blue)">Engineers & Tech</span>
        <span style="flex:1;height:1px;background:var(--border)"></span>
        <span class="badge badge-blue">${engineers.length} beneficio${engineers.length!==1?'s':''}</span>
      </div>
      ${gridOpen}${engineers.map(r=>benefCard(r,'Engineers')).join('')}</div>
    </div>`;
  }
  if(coreTeam.length){
    html+=`<div style="border-radius:10px;overflow:hidden;border:1px solid var(--border);margin:0 14px 14px;">
      <div style="padding:14px 18px;background:linear-gradient(90deg,var(--tinte-core) 0%,var(--bg2) 100%);border-left:3px solid var(--purple);display:flex;align-items:center;gap:12px;">
        <span style="font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:var(--purple)">Core Team</span>
        <span style="flex:1;height:1px;background:var(--border)"></span>
        <span class="badge badge-purple">${coreTeam.length} beneficio${coreTeam.length!==1?'s':''}</span>
      </div>
      ${gridOpen}${coreTeam.map(r=>benefCard(r,'Core Team')).join('')}</div>
    </div>`;
  }
  container.innerHTML=html;
}

// grupoFiltro acota la lista de personas a Engineers/Core Team — clave para
// un beneficio "Ambos" (ej. clase de inglés), donde el catálogo tiene una
// sola tarjeta por grupo pero conviene poder ver solo quiénes de cada uno
// lo usan.
function personasActivasBeneficio(nombreBeneficio,grupoFiltro,temFiltro){
  return cacheBenefAsignados.filter(a=>{
    const bNombre=typeof a.fields.Beneficio==='string'?a.fields.Beneficio:(Array.isArray(a.fields.Beneficio)?a.fields.Beneficio[0]:'');
    if(bNombre!==nombreBeneficio||(a.fields.Estado||'Activo')!=='Activo') return false;
    const nombrePersona=typeof a.fields.Persona==='string'?a.fields.Persona:(Array.isArray(a.fields.Persona)?a.fields.Persona[0]:'');
    if(!personaActiva(nombrePersona)) return false;
    if(grupoFiltro==='Engineers'||grupoFiltro==='Core Team'){
      const persona=(cachePersonasRaw||[]).find(p=>(p.fields.Nombre||'').trim()===(nombrePersona||'').trim());
      if(!persona||getRolGroup(persona.fields['Rol en empresa']||'')!==grupoFiltro) return false;
    }
    if(temFiltro&&managerDePersona(nombrePersona)!==temFiltro) return false;
    return true;
  });
}

// Clickear una tarjeta del catálogo abre este modal con la lista de personas
// que tienen ese beneficio activo (Beneficios Asignados) — reemplaza el
// expand-inline que tenía la vista de tabla, que no tiene dónde "empujar"
// contenido en una grilla de tarjetas.
function abrirBenefDetalleModal(id,seccionGrupo){
  const r=cacheBeneficiosRaw.find(b=>b.id===id);
  if(!r) return;
  benefDetalleActual={r,grupoFiltro:seccionGrupo};
  document.getElementById('benef-detalle-titulo').textContent=r.fields.Beneficio||'—';
  poblarSelectorTEM('benef-detalle-tem');
  document.getElementById('benef-detalle-tem').value='';
  document.getElementById('benef-detalle-body').innerHTML=contenidoBenefDetalle(r,seccionGrupo,'');
  document.getElementById('benef-detalle-overlay').style.display='flex';
}
function cerrarBenefDetalleModal(){
  document.getElementById('benef-detalle-overlay').style.display='none';
  benefDetalleActual=null;
}
// Re-renderiza el detalle abierto cuando se cambia el select de TEM, sin
// volver a abrir el modal (benefDetalleActual guarda el beneficio/grupo vigente).
function filtrarBenefDetalle(){
  if(!benefDetalleActual) return;
  const temFiltro=document.getElementById('benef-detalle-tem')?.value||'';
  document.getElementById('benef-detalle-body').innerHTML=
    contenidoBenefDetalle(benefDetalleActual.r,benefDetalleActual.grupoFiltro,temFiltro);
}
function contenidoBenefDetalle(r,grupoFiltro,temFiltro){
  const activos=personasActivasBeneficio(r.fields.Beneficio,grupoFiltro,temFiltro);
  if(!activos.length){
    const sufijoGrupo=(grupoFiltro==='Engineers'||grupoFiltro==='Core Team')?` de ${grupoFiltro}`:'';
    return `<div style="color:var(--text3);font-size:12px;">Nadie${sufijoGrupo} tiene este beneficio activo en este momento.</div>`;
  }
  const items=activos.map(a=>{
    const nombre=typeof a.fields.Persona==='string'?a.fields.Persona:(Array.isArray(a.fields.Persona)?a.fields.Persona[0]:'—');
    const monto=a.fields.Monto?`$${Number(a.fields.Monto).toLocaleString('es-AR')}`:'';
    const extra=[a.fields.Frecuencia,a.fields['Profesional Asignado'],a.fields.Curso,a.fields.Quarter].filter(Boolean).join(' · ');
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">${avH(nombre)}<span style="font-size:13px">${nombre}</span>${extra?`<span style="font-size:11px;color:var(--text3)">(${extra})</span>`:''}${monto?`<span style="margin-left:auto;font-size:12px;color:var(--text3)">${monto}</span>`:''}</div>`;
  }).join('');
  return `<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text3);margin-bottom:8px;">${activos.length} persona${activos.length!==1?'s':''} usando este beneficio</div>${items}`;
}

// Editar un beneficio ya existente en el catálogo (no una asignación puntual
// a una persona — para eso está editarBenefAsignado en side-panel.js). Mismos
// campos que "Nuevo beneficio" (FORMS['beneficios']) más el Estado, que ahí
// se fuerza a "Activo" al crear y acá sí se puede pasar a "Inactivo".
function editarBeneficio(id){
  const r=cacheBeneficiosRaw.find(b=>b.id===id);
  if(!r) return;
  const f=r.fields;
  _openFormModal({
    title:`Editar — ${f.Beneficio||'beneficio'}`,
    html:()=>`
<div class="field-group"><label class="field-label">Nombre *</label><input class="field-input" id="f-eb-nombre" value="${(f.Beneficio||'').replace(/"/g,'&quot;')}"></div>
<div class="field-group"><label class="field-label">Grupo</label>
  <select class="field-input" id="f-eb-grupo">
    <option value="Ambos"${(f.Grupo||'Ambos')==='Ambos'?' selected':''}>Ambos grupos</option>
    <option value="Engineers"${f.Grupo==='Engineers'?' selected':''}>Engineers</option>
    <option value="Core Team"${f.Grupo==='Core Team'?' selected':''}>Core Team</option>
  </select>
</div>
<div class="field-group"><label class="field-label">Categoría</label>
  <select class="field-input" id="f-eb-cat">
    ${['Salud','Bienestar','Aprendizaje','Tiempo','Equipamiento','Otro'].map(c=>`<option${f.Categoría===c?' selected':''}>${c}</option>`).join('')}
  </select>
</div>
<div class="field-group"><label class="field-label">Nivel mínimo Loyalty</label>
  <select class="field-input" id="f-eb-loyalty">
    <option value=""${!f['Nivel Loyalty']||f['Nivel Loyalty']==='Todos'?' selected':''}>Todos los niveles</option>
    <option value="Spark"${f['Nivel Loyalty']==='Spark'?' selected':''}>⚡ Spark</option>
    <option value="Ray"${f['Nivel Loyalty']==='Ray'?' selected':''}>☀️ Ray</option>
    <option value="Lightning"${f['Nivel Loyalty']==='Lightning'?' selected':''}>🌩 Lightning</option>
    <option value="Thunder"${f['Nivel Loyalty']==='Thunder'?' selected':''}>🌪 Thunder</option>
    <option value="Storm"${f['Nivel Loyalty']==='Storm'?' selected':''}>🌊 Storm</option>
  </select>
</div>
<div class="field-group"><label class="field-label">Valor mensual ($)</label><input class="field-input" id="f-eb-valor" type="number" min="0" value="${f.Valor||''}" placeholder="Dejá vacío si no tiene valor fijo"></div>
<div class="field-group"><label class="field-label">Descripción</label><textarea class="field-input" id="f-eb-desc" placeholder="Breve descripción del beneficio">${f.Descripción||''}</textarea></div>
<div class="field-group"><label class="field-label">Estado</label>
  <select class="field-input" id="f-eb-estado">
    <option value="Activo"${(f.Estado||'Activo')==='Activo'?' selected':''}>Activo</option>
    <option value="Inactivo"${f.Estado==='Inactivo'?' selected':''}>Inactivo</option>
  </select>
</div>`,
    save:async()=>{
      const v=id2=>document.getElementById(id2)?.value||'';
      if(!v('f-eb-nombre')){toast('El nombre es obligatorio',true);return false;}
      const fields={
        Beneficio:v('f-eb-nombre'),
        Grupo:v('f-eb-grupo'),
        Categoría:v('f-eb-cat'),
        Descripción:v('f-eb-desc'),
        Estado:v('f-eb-estado')||'Activo',
        'Nivel Loyalty':v('f-eb-loyalty')||null,
        Valor:v('f-eb-valor')?Number(v('f-eb-valor')):null,
      };
      await atPatch(`Beneficios/${id}`,fields);
      return true;
    },
  });
}

// Filtra en vivo el select de Persona del form de asignación a medida que se
// tipea en el buscador — evita tener que scrollear una lista larga.
function filtrarPersonaAsignacion(){
  const q=(document.getElementById('f-ba-persona-buscar')?.value||'').toLowerCase();
  const sel=document.getElementById('f-ba-persona');
  if(!sel) return;
  const actual=sel.value;
  const nombres=[...new Set((cachePersonasRaw||[]).map(p=>p.fields.Nombre||'').filter(Boolean))].sort();
  const filtrados=q?nombres.filter(n=>n.toLowerCase().includes(q)):nombres;
  sel.innerHTML='<option value="">Seleccioná una persona…</option>'+filtrados.map(n=>`<option value="${n}"${n===actual?' selected':''}>${n}</option>`).join('');
  if(!filtrados.includes(actual)) actualizarBeneficiosPorPersona();
}

// Filtra el select de Beneficio según el grupo (Engineers/Core Team) de la
// persona elegida en el form de asignación — así no se ofrecen beneficios
// que no le corresponden a su grupo.
function actualizarBeneficiosPorPersona(){
  const nombrePersona=document.getElementById('f-ba-persona')?.value||'';
  const persona=cachePersonasRaw.find(p=>(p.fields.Nombre||'').trim()===nombrePersona.trim());
  const grupo=persona?getRolGroup(persona.fields['Rol en empresa']||''):null;
  const activos=cacheBeneficiosRaw.filter(b=>(b.fields.Estado||'Activo')==='Activo');
  const filtrados=grupo?activos.filter(b=>{const g=b.fields.Grupo||'Ambos';return g==='Ambos'||g===grupo;}):activos;
  const nombres=filtrados.map(b=>b.fields.Beneficio||'').filter(Boolean).sort();
  const sel=document.getElementById('f-ba-beneficio');
  if(!sel) return;
  const actual=sel.value;
  sel.innerHTML='<option value="">Seleccioná un beneficio…</option>'+nombres.map(n=>`<option value="${n}"${n===actual?' selected':''}>${n}</option>`).join('');
  const hint=document.getElementById('f-ba-beneficio-hint');
  if(hint) hint.textContent=grupo?`Mostrando beneficios de ${grupo}`:'Elegí una persona para filtrar por su grupo';
  if(!nombres.includes(actual)){ actualizarMontoBenef(); toggleCamposTerapia(); toggleCamposLink(); }
}

// Terapia es el único beneficio que hoy necesita datos extra al asignarlo
// (Frecuencia y Profesional asignado) — se identifica por nombre en vez de
// por un campo aparte en el catálogo, ya que es un caso puntual.
function esBeneficioTerapia(nombreBeneficio){
  return (nombreBeneficio||'').trim().toLowerCase()==='terapia';
}
function toggleCamposTerapia(){
  const nombre=document.getElementById('f-ba-beneficio')?.value||'';
  const fg=document.getElementById('fg-ba-terapia');
  if(fg) fg.style.display=esBeneficioTerapia(nombre)?'block':'none';
}
// Udemy necesita Curso y Link al asignarlo — O'Reilly y Pluralsight en la
// práctica nunca cargan un link, así que no se les pide (piden Enterprise:
// no hay nada individual que enlazar). El Quarter de los tres se calcula
// solo a partir de la Fecha activación (ver quarterLabel en utils.js), sin
// tipearlo, aunque no tengan campos propios en el formulario.
function normalizarBeneficioKey(nombreBeneficio){
  return (nombreBeneficio||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
}
function esBeneficioUdemy(nombreBeneficio){
  return normalizarBeneficioKey(nombreBeneficio)==='udemy';
}
function esBeneficioConQuarterAuto(nombreBeneficio){
  const k=normalizarBeneficioKey(nombreBeneficio);
  return k==='udemy'||k==='oreilly'||k==='pluralsight';
}
function toggleCamposLink(){
  const nombre=document.getElementById('f-ba-beneficio')?.value||'';
  const fg=document.getElementById('fg-ba-link');
  if(fg) fg.style.display=esBeneficioUdemy(nombre)?'block':'none';
}
function actualizarMontoBenef(){
  const sel=document.getElementById('f-ba-beneficio');
  if(!sel) return;
  const nombre=sel.value;
  const benef=cacheBeneficiosRaw.find(b=>b.fields.Beneficio===nombre);
  const montoInput=document.getElementById('f-ba-monto');
  if(montoInput&&benef?.fields.Valor){
    montoInput.value=Number(benef.fields.Valor);
    montoInput.placeholder='Valor del catálogo (podés modificarlo)';
  } else if(montoInput){
    montoInput.value='';
    montoInput.placeholder='Ingresá el monto para esta persona';
  }
}

// Atajo desde la tabla "Por persona" — abre el mismo form de "Asignar
// beneficio" pero con la persona ya elegida (y el select de Beneficio ya
// filtrado por su grupo), para no tener que volver a buscarla ahí.
function abrirAsignarBeneficioPara(nombre){
  _openFormModal({
    ...FORMS['beneficios-asignados'],
    onMount:()=>{
      filtrarPersonaAsignacion();
      const sel=document.getElementById('f-ba-persona');
      if(sel) sel.value=nombre;
      actualizarBeneficiosPorPersona();
    },
  });
}

// Mismos atajos que abrirAsignarBeneficioPara — se usan desde los estados
// vacíos de la tarjeta de detalle de persona (ver verBenefPersona() en
// side-panel.js) para no tener que volver a buscar a la persona ahí.
function abrirRegistrarAWPara(nombre){
  _openFormModal({...FORMS['ambassadors'], onMount:()=>{
    const sel=document.getElementById('f-aw-persona');
    if(sel) sel.value=nombre;
  }});
}
function abrirRegistrarOffSitePara(nombre){
  _openFormModal({...FORMS['offsites'], onMount:()=>{
    const sel=document.getElementById('f-os-persona');
    if(sel) sel.value=nombre;
  }});
}
function abrirRegistrarGetTogetherPara(nombre){
  _openFormModal({...FORMS['gettogether'], onMount:()=>{
    const sel=document.getElementById('f-gt-persona');
    if(sel) sel.value=nombre;
  }});
}

function filtrarBenefPersonas(){ pagBenefPersonas.page=0; renderBenefPersonas(); }

function cambiarPaginaBenefPersonas(dir){
  pagBenefPersonas.page=Math.max(0,pagBenefPersonas.page+dir);
  renderBenefPersonas();
  document.getElementById('benef-tab-personas')?.scrollIntoView({behavior:'smooth',block:'start'});
}

function renderBenefPersonas(){
  const q=(document.getElementById('benef-persona-search')?.value||'').toLowerCase();
  // HR solo puede ver Core Team acá — se fuerza el filtro sin importar lo
  // que diga el selector (que además queda deshabilitado, ver
  // aplicarRestriccionesBeneficios()).
  const grupoFil=rolUsuarioActual()==='hr'?'Core Team':(document.getElementById('benef-persona-grupo')?.value||'');
  const loyaltyFil=document.getElementById('benef-persona-loyalty')?.value||'';
  const temFil=document.getElementById('benef-persona-tem')?.value||'';

  // Construir mapa de topes por grupo+nivel desde cachePresupuestoLoyalty
  const topeMap={};
  cachePresupuestoLoyalty.forEach(r=>{
    const g=r.fields.Grupo||'', n=r.fields.Nivel||'', t=Number(r.fields['Tope anual beneficios']||0);
    topeMap[`${g}|${n}`]=t;
  });

  const personas=cachePersonasRaw.filter(p=>{
    const nombre=(p.fields.Nombre||'').toLowerCase();
    const grupo=getRolGroup(p.fields['Rol en empresa']||'');
    const nivel=p.fields['Nivel Loyalty']||'Spark';
    const matchQ=!q||nombre.includes(q);
    const matchG=!grupoFil||grupo===grupoFil;
    const matchL=!loyaltyFil||nivel===loyaltyFil;
    const matchTem=!temFil||(p.fields.Manager||'')===temFil;
    return !yaEgreso(p)&&matchQ&&matchG&&matchL&&matchTem;
  });

  document.getElementById('badge-benef-personas').textContent=`${personas.length} personas`;

  const bar=document.getElementById('pag-bar-benef-personas');
  const tb=document.getElementById('tbody-benef-personas');
  if(!personas.length){
    tb.innerHTML='<tr class="empty-row"><td colspan="6">Sin resultados</td></tr>';
    if(bar) bar.style.display='none';
    return;
  }

  // Con el historial cargado, "Por persona" puede tener cientos de filas —
  // se pagina de a PAG_SIZE, mismo criterio que Engineers & Tech/Core Team.
  const totalPags=Math.ceil(personas.length/PAG_SIZE);
  if(pagBenefPersonas.page>=totalPags) pagBenefPersonas.page=totalPags-1;
  const inicio=pagBenefPersonas.page*PAG_SIZE, fin=Math.min(inicio+PAG_SIZE,personas.length);
  const personasPagina=personas.slice(inicio,fin);

  if(totalPags>1){
    if(bar) bar.style.display='flex';
    const info=document.getElementById('pag-info-benef-personas');
    if(info) info.textContent=`${inicio+1}–${fin} de ${personas.length} personas`;
    const btnPrev=document.getElementById('pag-prev-benef-personas');
    const btnNext=document.getElementById('pag-next-benef-personas');
    if(btnPrev) btnPrev.disabled=pagBenefPersonas.page===0;
    if(btnNext) btnNext.disabled=pagBenefPersonas.page>=totalPags-1;
  } else {
    if(bar) bar.style.display='none';
  }

  tb.innerHTML=personasPagina.map((p,idx)=>{
    const f=p.fields;
    const nombre=f.Nombre||'—';
    const grupo=getRolGroup(f['Rol en empresa']||'');
    const nivel=f['Nivel Loyalty']||'Spark';
    const tope=topeMap[`${grupo}|${nivel}`]||0;

    // Beneficios accesibles según nivel + asignados activos
    const beneficiosAccesibles=cacheBeneficiosRaw.filter(b=>{
      const g=b.fields.Grupo||'Ambos';
      const grupoOk=g===grupo||g==='Ambos';
      const nivelOk=tieneAccesoBeneficio(nivel, b.fields['Nivel Loyalty']||'Todos');
      return grupoOk&&nivelOk&&(b.fields.Estado||'Activo')==='Activo';
    });
    // Beneficios asignados activos para esta persona
    const asignados=cacheBenefAsignados.filter(a=>{
      const pNombre=typeof a.fields.Persona==='string'?a.fields.Persona:(Array.isArray(a.fields.Persona)?a.fields.Persona[0]:'');
      return pNombre.trim()===nombre.trim()&&(a.fields.Estado||'Activo')==='Activo';
    });

    // Sumar valor: usa Monto del asignado si existe, sino Valor del catálogo
    let usado=0;
    asignados.forEach(a=>{
      if(a.fields.Monto){
        usado+=Number(a.fields.Monto)||0;
      } else {
        // Beneficio ya resuelto a nombre en loadBeneficios
        const bNombre=typeof a.fields.Beneficio==='string'?a.fields.Beneficio:(Array.isArray(a.fields.Beneficio)?a.fields.Beneficio[0]:'');
        const benef=cacheBeneficiosRaw.find(b=>b.fields.Beneficio===bNombre);
        if(benef?.fields.Valor) usado+=Number(benef.fields.Valor)||0;
      }
    });

    const pct=tope>0?Math.min(100,Math.round((usado/tope)*100)):0;
    const barColor=pct>=90?'var(--critical)':pct>=70?'var(--warning)':'var(--blue)';
    const usadoStr=usado>0?`$${usado.toLocaleString('es-AR')}`:'$0';
    const topeStr=tope>0?`$${tope.toLocaleString('es-AR')}`:'Sin tope';

    const grupoBadge=grupo==='Engineers'?'badge-blue':'badge-purple';
    const nivelColors={'Spark':'badge-nivel-Spark','Ray':'badge-nivel-Ray','Lightning':'badge-nivel-Lightning','Thunder':'badge-nivel-Thunder','Storm':'badge-nivel-Storm'};
    const bg=idx%2===0?'background:var(--bg2)':'';
    const activeW=beneficiosAccesibles.length?Math.round(asignados.length/beneficiosAccesibles.length*100):0;

    return`<tr class="tr-clickable benef-per-tr" style="${bg}" onclick="verBenefPersona('${nombre.replace(/'/g,"\\'")}','${grupo}','${nivel}')">
      <td>${avH(nombre)}${nombre}</td>
      <td><span class="badge ${grupoBadge}">${grupo}</span></td>
      <td><span class="badge ${nivelColors[nivel]||'badge-gray'} benef-per-nivel-badge"><i class="ti ${NIVEL_ICONS[nivel]||'ti-award'}"></i>${nivel}</span></td>
      <td style="font-size:13px">
        <span style="font-weight:600">${asignados.length}</span>
        <span style="color:var(--text3);font-size:11px"> asignados / ${beneficiosAccesibles.length} disponibles</span>
        <div class="benef-per-bar-track"><div class="benef-per-bar-fill" style="width:${activeW}%"></div></div>
      </td>
      <td style="min-width:180px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:5px;background:var(--border);border-radius:3px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${barColor};border-radius:3px;transition:width 0.3s"></div>
          </div>
          <span style="font-size:12px;color:${pct>=90?'var(--critical)':pct>=70?'var(--warning)':'var(--text2)'};font-weight:${pct>=70?'600':'400'};white-space:nowrap">${usadoStr} / ${topeStr}</span>
        </div>
      </td>
      <td style="white-space:nowrap">
        <div class="benef-per-actions">
          <button class="benef-per-ver-btn" onclick="event.stopPropagation();verBenefPersona('${nombre.replace(/'/g,"\'")}','${grupo}','${nivel}')">Ver<i class="ti ti-arrow-right"></i></button>
          <button class="benef-per-asignar-btn" onclick="event.stopPropagation();abrirAsignarBeneficioPara('${nombre.replace(/'/g,"\'")}')"><i class="ti ti-plus"></i>Asignar</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}
