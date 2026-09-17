// Cron semanal (ver vercel.json): avisa a #it-culture-hub qué accesos de
// O'Reilly/Pluralsight cumplieron 6 meses desde la última vez que se
// compartieron las credenciales.
//
// El problema que resuelve: estos beneficios no vencen solos ni avisan. Cuando
// cambia la contraseña, el acceso queda muerto y nadie se entera hasta que la
// persona lo pide — y muchos no lo piden. El recordatorio le llega al equipo de
// Cultura, no a la persona: son ellos quienes tienen las credenciales y deciden
// si hace falta recompartirlas.
//
// Un solo mensaje con todos los accesos que tocan esta semana, no uno por
// persona: el punto es revisarlos juntos.
const MESES_RECORDATORIO=6;

const MESES_ES_ABR=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function fmtFecha(iso){
  if(!iso) return '';
  const [y,m,d]=iso.split('-');
  return `${d} de ${MESES_ES_ABR[Number(m)-1]} de ${y}`;
}

// Sumar meses con setMonth desborda: el 31 de agosto + 6 meses cae en el 3 de
// marzo, porque febrero no tiene 31. Acá se recorta al último día del mes, que
// es lo que uno espera de "seis meses después".
function sumarMeses(iso,n){
  const [y,m,d]=iso.split('-').map(Number);
  const totalMes=(m-1)+n;
  const anio=y+Math.floor(totalMes/12);
  const mes=((totalMes%12)+12)%12;
  const ultimoDia=new Date(Date.UTC(anio,mes+1,0)).getUTCDate();
  const dia=Math.min(d,ultimoDia);
  return `${anio}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
}

// ¿Este acceso cumplió un múltiplo de 6 meses dentro de la ventana que cubre
// esta corrida? Mirar solo "tiene más de 6 meses" haría que el mismo acceso se
// avise todas las semanas para siempre; mirar la fecha exacta lo perdería si el
// cron no corre ese día. La ventana (los últimos `diasVentana` días) avisa una
// vez por hito: a los 6 meses, a los 12, a los 18…
function tocaRecordatorio(fechaStr,hoyStr,diasVentana){
  if(!fechaStr||fechaStr>hoyStr) return null;
  const desde=new Date(`${hoyStr}T00:00:00Z`);
  desde.setUTCDate(desde.getUTCDate()-(diasVentana-1));
  const desdeStr=desde.toISOString().slice(0,10);
  for(let k=1;k<=40;k++){ // 40 hitos = 20 años, de sobra
    const hito=sumarMeses(fechaStr,k*MESES_RECORDATORIO);
    if(hito>hoyStr) return null;
    if(hito>=desdeStr) return k*MESES_RECORDATORIO;
  }
  return null;
}

function normalizarClave(s){
  return String(s||'').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,'');
}
function esCredencial(nombreBeneficio){
  const k=normalizarClave(nombreBeneficio);
  return k==='oreilly'||k==='pluralsight';
}

// Airtable devuelve 100 registros por request: sin seguir el offset, una base
// con más asignaciones que eso dejaría accesos afuera del recordatorio sin
// ningún error visible.
async function traerTodo(url,token){
  let registros=[],offset=null;
  do{
    const sep=url.includes('?')?'&':'?';
    const res=await fetch(`${url}${sep}pageSize=100${offset?`&offset=${offset}`:''}`,
      {headers:{'Authorization':`Bearer ${token}`}});
    const data=await res.json();
    registros=registros.concat(data.records||[]);
    offset=data.offset||null;
  } while(offset);
  return registros;
}

// De todas las asignaciones de credenciales, la ÚLTIMA vez que se le
// compartieron a cada persona: si se recompartieron hace un mes, el acceso está
// fresco y no corresponde recordar nada aunque la primera vez fuera en 2024.
function ultimaCompartidaPorPersona(asignaciones,nombreDeBeneficio,nombreDePersona){
  const porAcceso=new Map();
  asignaciones.forEach(r=>{
    const beneficio=nombreDeBeneficio(r);
    if(!esCredencial(beneficio)) return;
    const fecha=r.fields?.['Fecha activación'];
    if(!fecha) return;
    const persona=nombreDePersona(r);
    if(!persona) return;
    const clave=`${normalizarClave(persona)}|${normalizarClave(beneficio)}`;
    const previo=porAcceso.get(clave);
    if(!previo||fecha>previo.fecha) porAcceso.set(clave,{persona,beneficio,fecha});
  });
  return [...porAcceso.values()];
}

module.exports=async(req,res,opts={})=>{
  const secret=process.env.CRON_SECRET;
  if(secret){
    const auth=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
    if(auth!==secret){
      res.status(401).json({error:{message:'No autorizado.'}});
      return;
    }
  }

  const token=process.env.AIRTABLE_TOKEN;
  const base=process.env.AIRTABLE_BASE;
  if(!token||!base){
    res.status(500).json({error:{message:'El servidor no tiene configurado Airtable (faltan variables de entorno).'}});
    return;
  }
  // Va a #it-culture-hub, igual que el feedback de la plataforma. Si esa
  // variable no está, cae en el canal general y el propio mensaje lo dice —
  // mismo criterio que api/slack.js, para que un aviso mal ruteado se note.
  const webhook=process.env.SLACK_WEBHOOK_FEEDBACK||process.env.SLACK_WEBHOOK;
  if(!webhook){
    res.status(200).json({skipped:true}); // Slack es opcional, igual que en el resto de los cron
    return;
  }
  const cayoEnGeneral=!process.env.SLACK_WEBHOOK_FEEDBACK;

  // Argentina no tiene horario de verano desde 2009 — UTC-3 fijo todo el año.
  const hoy=opts.hoy||new Date(Date.now()-3*60*60*1000);
  const hoyStr=hoy.toISOString().slice(0,10);
  const diasVentana=opts.diasVentana||7; // el cron corre semanal

  let asignaciones=[],catalogo=[],personas=[];
  try{
    [asignaciones,catalogo]=await Promise.all([
      traerTodo(`https://api.airtable.com/v0/${base}/${encodeURIComponent('Beneficios Asignados')}?filterByFormula=${encodeURIComponent('{Estado}="Activo"')}`,token),
      traerTodo(`https://api.airtable.com/v0/${base}/Beneficios`,token),
    ]);
  }catch(e){
    res.status(502).json({error:{message:'No se pudo consultar Airtable.'}});
    return;
  }

  // Beneficio y Persona son linked records (array de ids), salvo que estén
  // cargados como texto — los dos casos conviven en la base.
  const nombreBenefPorId=new Map(catalogo.map(b=>[b.id,b.fields?.Beneficio||'']));
  const valorVinculado=c=>typeof c==='string'?c:(Array.isArray(c)?c[0]||'':'');
  const nombreDeBeneficio=r=>{
    const v=valorVinculado(r.fields?.Beneficio);
    return nombreBenefPorId.get(v)||v;
  };

  const idsPersona=[...new Set(asignaciones.flatMap(r=>Array.isArray(r.fields?.Persona)?r.fields.Persona:[]))];
  const personasPorId=new Map();
  if(idsPersona.length){
    try{
      // De a 50 ids por consulta: la fórmula va en la URL y con cientos de
      // ids se pasa del largo máximo.
      for(let i=0;i<idsPersona.length;i+=50){
        const lote=idsPersona.slice(i,i+50);
        const formulaP=encodeURIComponent(`OR(${lote.map(id=>`RECORD_ID()="${id}"`).join(',')})`);
        personas=await traerTodo(`https://api.airtable.com/v0/${base}/Personas?filterByFormula=${formulaP}`,token);
        personas.forEach(p=>personasPorId.set(p.id,p.fields?.Nombre||p.id));
      }
    }catch(e){/* si falla la resolución seguimos con los ids crudos antes que no avisar */}
  }
  const nombreDePersona=r=>{
    const v=valorVinculado(r.fields?.Persona);
    return personasPorId.get(v)||v;
  };

  const accesos=ultimaCompartidaPorPersona(asignaciones,nombreDeBeneficio,nombreDePersona);
  const aRecordar=accesos
    .map(a=>({...a,meses:tocaRecordatorio(a.fecha,hoyStr,diasVentana)}))
    .filter(a=>a.meses!=null)
    .sort((a,b)=>(a.beneficio.localeCompare(b.beneficio)||a.fecha.localeCompare(b.fecha)));

  if(!aRecordar.length){
    res.status(200).json({ok:true,notificados:0});
    return;
  }

  const lineas=aRecordar.map(a=>
    `• *${a.beneficio}* — ${a.persona} · compartidas el ${fmtFecha(a.fecha)} (hace ${a.meses} meses)`);
  // Cada línea dice su propia antigüedad: el título no puede decir "6 meses"
  // cuando en la misma tanda puede haber uno de 6 y otro de 30.
  const titulo=aRecordar.length===1?'1 acceso':`${aRecordar.length} accesos`;
  const texto=`🔑 *Credenciales para revisar* — ${titulo}\n`+
    `Conviene chequear si las credenciales siguen sirviendo y, si cambiaron, volver a compartirlas.\n\n`+
    lineas.join('\n')+
    (cayoEnGeneral
      ?'\n\n_⚠️ Esto tendría que llegar a #it-culture-hub. Falta configurar la variable `SLACK_WEBHOOK_FEEDBACK` en Vercel con el webhook de ese canal._'
      :'');

  try{
    await fetch(webhook,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text:texto}),
    });
  }catch(e){
    console.error('No se pudo avisar a Slack los accesos a revisar:',e.message);
  }

  res.status(200).json({ok:true,notificados:aRecordar.length});
};

module.exports.tocaRecordatorio=tocaRecordatorio;
module.exports.sumarMeses=sumarMeses;
module.exports.ultimaCompartidaPorPersona=ultimaCompartidaPorPersona;
module.exports.esCredencial=esCredencial;
