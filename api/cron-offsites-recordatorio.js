// Cron diario (ver vercel.json): si algún Off Site arranca en exactamente 7
// días, avisa por Slack — un mensaje por viaje (Destino + Fecha fin, ya que
// Fecha inicio queda fija por el filtro), agrupando a todas las personas que
// van al mismo lugar en las mismas fechas en un solo aviso, no uno por
// persona (cada record de Off Sites es una persona).
const MESES_ES_ABR=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function fmtFecha(iso){
  if(!iso) return '';
  const [y,m,d]=iso.split('-');
  return `${d} de ${MESES_ES_ABR[Number(m)-1]} de ${y}`;
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
  const webhook=process.env.SLACK_WEBHOOK;
  if(!webhook){
    res.status(200).json({skipped:true}); // Slack es opcional, igual que en el resto de los cron
    return;
  }

  // Argentina no tiene horario de verano desde 2009 — UTC-3 fijo todo el año.
  const hoy=opts.hoy||new Date(Date.now()-3*60*60*1000);
  const enUnaSemana=new Date(hoy);
  enUnaSemana.setDate(enUnaSemana.getDate()+7);
  const fechaStr=enUnaSemana.toISOString().slice(0,10);

  const formula=encodeURIComponent(`IS_SAME({Fecha inicio}, "${fechaStr}", 'day')`);
  const url=`https://api.airtable.com/v0/${base}/${encodeURIComponent('Off Sites')}?filterByFormula=${formula}`;

  let registros=[];
  try{
    const airtableRes=await fetch(url,{headers:{'Authorization':`Bearer ${token}`}});
    const data=await airtableRes.json();
    registros=data.records||[];
  }catch(e){
    res.status(502).json({error:{message:'No se pudo consultar Airtable.'}});
    return;
  }

  if(!registros.length){
    res.status(200).json({ok:true,notificados:0});
    return;
  }

  // Persona puede ser un linked record (array de IDs) o texto libre — mismo
  // criterio que loadOffsites() en js/offsites.js. Si es linked record, hay
  // que resolver los IDs contra Personas para no mostrar un "recXXXX" crudo.
  const idsPersona=[...new Set(registros.flatMap(r=>Array.isArray(r.fields.Persona)?r.fields.Persona:[]))];
  const personasPorId=new Map();
  if(idsPersona.length){
    const formulaP=encodeURIComponent(`OR(${idsPersona.map(id=>`RECORD_ID()="${id}"`).join(',')})`);
    try{
      const pRes=await fetch(`https://api.airtable.com/v0/${base}/Personas?filterByFormula=${formulaP}`,{headers:{'Authorization':`Bearer ${token}`}});
      const pData=await pRes.json();
      (pData.records||[]).forEach(p=>personasPorId.set(p.id,p.fields?.Nombre||p.id));
    }catch(e){/* si falla la resolución, seguimos con los IDs crudos antes que no avisar nada */}
  }

  const viajes={};
  registros.forEach(r=>{
    const f=r.fields;
    const key=`${f.Destino||''}|${f['Fecha fin']||''}`;
    if(!viajes[key]) viajes[key]={destino:f.Destino||'Sin destino',fechaInicio:f['Fecha inicio'],fechaFin:f['Fecha fin'],personas:new Set()};
    const persona=Array.isArray(f.Persona)?(personasPorId.get(f.Persona[0])||f.Persona[0]):(typeof f.Persona==='string'?f.Persona:'');
    if(persona) viajes[key].personas.add(persona);
  });

  const lista=Object.values(viajes);
  for(const v of lista){
    const rango=v.fechaFin?`del ${fmtFecha(v.fechaInicio)} al ${fmtFecha(v.fechaFin)}`:`el ${fmtFecha(v.fechaInicio)}`;
    const quienes=v.personas.size?`\n👥 ${[...v.personas].join(', ')}`:'';
    const texto=`✈️ *En una semana empieza el Off Site a ${v.destino}*, ${rango}${quienes}`;
    try{
      await fetch(webhook,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text:texto}),
      });
    }catch(e){
      console.error(`No se pudo avisar a Slack el Off Site a "${v.destino}":`,e.message);
    }
  }

  res.status(200).json({ok:true,notificados:lista.length});
};
