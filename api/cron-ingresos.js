// Cron diario (ver vercel.json): busca en Personas quiénes tienen "Fecha de
// ingreso" igual a hoy y avisa al canal de Slack. A diferencia del resto de
// los endpoints, este lo dispara Vercel Cron y no un usuario logueado, así
// que no valida sesión de Google — se protege con CRON_SECRET (Vercel manda
// ese valor solo si la variable de entorno existe, ver docs de Vercel Cron).
module.exports=async(req,res)=>{
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
    res.status(200).json({skipped:true}); // Slack es opcional, igual que en api/slack.js
    return;
  }

  // Argentina no tiene horario de verano desde 2009 — UTC-3 fijo todo el año.
  const hoy=new Date(Date.now()-3*60*60*1000).toISOString().slice(0,10);

  const formula=encodeURIComponent(`IS_SAME({Fecha de ingreso}, "${hoy}", 'day')`);
  const url=`https://api.airtable.com/v0/${base}/Personas?filterByFormula=${formula}`;

  let personas=[];
  try{
    const airtableRes=await fetch(url,{headers:{'Authorization':`Bearer ${token}`}});
    const data=await airtableRes.json();
    personas=data.records||[];
  }catch(e){
    res.status(502).json({error:{message:'No se pudo consultar Airtable.'}});
    return;
  }

  for(const p of personas){
    const nombre=p.fields?.Nombre||'alguien';
    try{
      await fetch(webhook,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text:`🎉 Hoy ingresa *${nombre}*`}),
      });
    }catch(e){
      console.error(`No se pudo avisar a Slack el ingreso de "${nombre}":`,e.message);
    }
  }

  res.status(200).json({ok:true,notificados:personas.length});
};
