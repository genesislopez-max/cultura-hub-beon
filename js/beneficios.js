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
  poblarFiltroBeneficioNombre();
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
function switchBenefTab(tab, btn){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
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
  document.getElementById('mb-presupuesto').textContent=totalUsado>0?`$${totalUsado.toLocaleString('es-AR')}`:'—';

  // Personas con/sin beneficios
  const personasConBenef=new Set(cacheBenefAsignados.filter(a=>(a.fields.Estado||'Activo')==='Activo').map(a=>{
    return Array.isArray(a.fields.Persona)?a.fields.Persona[0]:a.fields.Persona;
  }));
  const totalPersonas=cachePersonasRaw.length;
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
function filtrarBeneficios(){
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
  const grupoBadge={Engineers:'badge-blue','Core Team':'badge-purple',Ambos:'badge-gray'};
  const loyaltyColors={'Spark':'badge-nivel-Spark','Ray':'badge-nivel-Ray','Lightning':'badge-nivel-Lightning','Thunder':'badge-nivel-Thunder','Storm':'badge-nivel-Storm'};

  // Agrupar por grupo para render dividido
  const engineers=recs.filter(r=>{const g=r.fields.Grupo||'Ambos';return g==='Engineers'||g==='Ambos';});
  const coreTeam=recs.filter(r=>{const g=r.fields.Grupo||'Ambos';return g==='Core Team'||g==='Ambos';});

  // seccionGrupo es el grupo de la sección donde se está pintando esta fila
  // (Engineers o Core Team) — un beneficio "Ambos" aparece en las dos
  // secciones, así que la lista de gente de cada una se acota a su propio
  // grupo. Si no, un beneficio "Ambos" mostraba el mismo listado completo
  // (los dos grupos mezclados) duplicado debajo de cada sección.
  function benefRow(r,seccionGrupo){
    const f=r.fields;
    const g=f.Grupo||'Ambos';
    const nivel=f['Nivel Loyalty']||'';
    const valor=f.Valor?`$${Number(f.Valor).toLocaleString('es-AR')}/mes`:'—';
    const fila=`<tr class="tr-clickable" onclick="toggleBenefDetalle('${r.id}')">
      <td><strong>${f.Beneficio||'—'}</strong><div style="font-size:11px;color:var(--text3);margin-top:2px">${f.Descripción||''}</div></td>
      <td><span class="badge ${grupoBadge[g]||'badge-gray'}">${g}</span></td>
      <td><span class="badge badge-blue">${f.Categoría||'—'}</span></td>
      <td>${(!nivel||nivel==='Todos')?'<span style="color:var(--text3);font-size:12px">Todos los niveles</span>':`<span class="badge ${loyaltyColors[nivel]||'badge-gray'}">desde ${nivel}</span>`}</td>
      <td style="font-size:13px;font-weight:500">${valor}</td>
      <td><span class="badge ${(f.Estado||'Activo')==='Activo'?'badge-green':'badge-amber'}">${f.Estado||'Activo'}</span></td>
    </tr>`;
    // Con el filtro "Beneficio" puntual elegido, no hace falta además
    // clickear la fila para ver quién lo tiene — se despliega sola.
    return(benefExpandido===r.id||(nombreFil&&f.Beneficio===nombreFil))?fila+filaDetalleBeneficio(r,seccionGrupo):fila;
  }

  const container=document.getElementById('benef-catalogo-container');
  if(!recs.length){
    container.innerHTML='<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px;">Sin resultados</div>';
    return;
  }

  const tableHead=`<table class="data-table"><thead><tr><th>Beneficio</th><th>Grupo</th><th>Categoría</th><th>Nivel mínimo</th><th>Valor</th><th>Estado</th></tr></thead><tbody>`;

  let html='';
  if(engineers.length){
    html+=`<div style="display:flex;align-items:center;gap:12px;padding:14px 18px 12px;background:var(--bg2);border-bottom:1px solid var(--border)">
      <span style="font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:var(--blue)">Engineers & Tech</span>
      <span style="flex:1;height:1px;background:var(--border)"></span>
      <span class="badge badge-blue">${engineers.length} beneficio${engineers.length!==1?'s':''}</span>
    </div>`;
    html+=tableHead+engineers.map(r=>benefRow(r,'Engineers')).join('')+'</tbody></table>';
  }
  if(coreTeam.length){
    html+=`<div style="display:flex;align-items:center;gap:12px;padding:14px 18px 12px;background:var(--bg2);border-bottom:1px solid var(--border);border-top:2px solid var(--border);margin-top:22px">
      <span style="font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:var(--purple)">Core Team</span>
      <span style="flex:1;height:1px;background:var(--border)"></span>
      <span class="badge badge-purple">${coreTeam.length} beneficio${coreTeam.length!==1?'s':''}</span>
    </div>`;
    html+=tableHead+coreTeam.map(r=>benefRow(r,'Core Team')).join('')+'</tbody></table>';
  }
  container.innerHTML=html;
}

// Click en una fila del catálogo despliega/oculta debajo la lista de
// personas que tienen ese beneficio activo (Beneficios Asignados).
function toggleBenefDetalle(id){
  benefExpandido=benefExpandido===id?null:id;
  renderBenefCatalogo();
}
// grupoFiltro acota la lista de personas a Engineers/Core Team — clave para
// un beneficio "Ambos" (ej. clase de inglés), donde el catálogo tiene una
// sola fila pero conviene poder ver solo quiénes de cada grupo lo usan.
function personasActivasBeneficio(nombreBeneficio,grupoFiltro){
  return cacheBenefAsignados.filter(a=>{
    const bNombre=typeof a.fields.Beneficio==='string'?a.fields.Beneficio:(Array.isArray(a.fields.Beneficio)?a.fields.Beneficio[0]:'');
    if(bNombre!==nombreBeneficio||(a.fields.Estado||'Activo')!=='Activo') return false;
    if(grupoFiltro==='Engineers'||grupoFiltro==='Core Team'){
      const nombrePersona=typeof a.fields.Persona==='string'?a.fields.Persona:(Array.isArray(a.fields.Persona)?a.fields.Persona[0]:'');
      const persona=(cachePersonasRaw||[]).find(p=>(p.fields.Nombre||'').trim()===(nombrePersona||'').trim());
      if(!persona||getRolGroup(persona.fields['Rol en empresa']||'')!==grupoFiltro) return false;
    }
    return true;
  });
}
function filaDetalleBeneficio(r,grupoFiltro){
  const activos=personasActivasBeneficio(r.fields.Beneficio,grupoFiltro);
  if(!activos.length){
    const sufijoGrupo=(grupoFiltro==='Engineers'||grupoFiltro==='Core Team')?` de ${grupoFiltro}`:'';
    return `<tr class="benef-detalle-row"><td colspan="6"><div style="padding:14px 18px;color:var(--text3);font-size:12px;">Nadie${sufijoGrupo} tiene este beneficio activo en este momento.</div></td></tr>`;
  }
  const items=activos.map(a=>{
    const nombre=typeof a.fields.Persona==='string'?a.fields.Persona:(Array.isArray(a.fields.Persona)?a.fields.Persona[0]:'—');
    const monto=a.fields.Monto?`$${Number(a.fields.Monto).toLocaleString('es-AR')}`:'';
    const extra=[a.fields.Frecuencia,a.fields['Profesional Asignado'],a.fields.Curso,a.fields.Quarter].filter(Boolean).join(' · ');
    return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">${avH(nombre)}<span style="font-size:13px">${nombre}</span>${extra?`<span style="font-size:11px;color:var(--text3)">(${extra})</span>`:''}${monto?`<span style="margin-left:auto;font-size:12px;color:var(--text3)">${monto}</span>`:''}</div>`;
  }).join('');
  return `<tr class="benef-detalle-row" onclick="event.stopPropagation()"><td colspan="6"><div style="padding:12px 18px;background:var(--bg2);border-radius:8px;margin:4px 0;"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text3);margin-bottom:6px;">${activos.length} persona${activos.length!==1?'s':''} usando este beneficio</div>${items}</div></td></tr>`;
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

function filtrarBenefPersonas(){ renderBenefPersonas(); }

function renderBenefPersonas(){
  const q=(document.getElementById('benef-persona-search')?.value||'').toLowerCase();
  const grupoFil=document.getElementById('benef-persona-grupo')?.value||'';
  const loyaltyFil=document.getElementById('benef-persona-loyalty')?.value||'';

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
    return !yaEgreso(p)&&matchQ&&matchG&&matchL;
  });

  document.getElementById('badge-benef-personas').textContent=`${personas.length} personas`;

  const tb=document.getElementById('tbody-benef-personas');
  if(!personas.length){
    tb.innerHTML='<tr class="empty-row"><td colspan="6">Sin resultados</td></tr>';
    return;
  }

  tb.innerHTML=personas.map((p,idx)=>{
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
    const nivelEmoji={'Spark':'⚡','Ray':'☀️','Lightning':'🌩','Thunder':'🌪','Storm':'🌊'};
    const bg=idx%2===0?'background:var(--bg2)':'';

    return`<tr class="tr-clickable" style="${bg}" onclick="verBenefPersona('${nombre.replace(/'/g,"\\'")}','${grupo}','${nivel}')">
      <td>${avH(nombre)}${nombre}</td>
      <td><span class="badge ${grupoBadge}">${grupo}</span></td>
      <td><span class="badge ${nivelColors[nivel]||'badge-gray'}">${nivel}</span></td>
      <td style="font-size:13px">
        <span style="font-weight:600">${asignados.length}</span>
        <span style="color:var(--text3);font-size:11px"> asignados / ${beneficiosAccesibles.length} disponibles</span>
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
        <button onclick="event.stopPropagation();verBenefPersona('${nombre.replace(/'/g,"\'")}','${grupo}','${nivel}')" style="background:none;border:1px solid var(--border);border-radius:7px;padding:4px 10px;font-size:12px;font-weight:600;color:var(--blue);cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;">Ver →</button>
        <button onclick="event.stopPropagation();abrirAsignarBeneficioPara('${nombre.replace(/'/g,"\'")}')" style="background:none;border:1px solid var(--border);border-radius:7px;padding:4px 10px;font-size:12px;font-weight:600;color:var(--blue);cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;margin-left:6px;">+ Asignar</button>
      </td>
    </tr>`;
  }).join('');
}
