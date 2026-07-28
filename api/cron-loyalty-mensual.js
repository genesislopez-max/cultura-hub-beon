// Cron mensual (ver vercel.json): el último día hábil del mes, resume en
// Slack quiénes cambiaron de Nivel Loyalty durante el mes. Vercel Cron no
// permite expresar "último día hábil" directamente, así que se agenda para
// correr todos los días entre el 25 y el 31 (los días que no existen en el
// mes simplemente no disparan) y acá se chequea si HOY es ese día — el
// resto de las corridas no hacen nada.
//
// Requiere la tabla "Historial Loyalty" en Airtable (campos: Persona, Nivel
// anterior, Nivel nuevo, Fecha), que se completa desde cambiarNivel() en
// js/personas.js cada vez que alguien cambia de nivel.
const MESES_ES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// Fin de semana en Argentina = sábado/domingo, sin feriados (no hay ningún
// calendario de feriados cargado en el Hub) — misma simplificación que ya
// usa cron-ingresos.js con el huso horario.
function esUltimoDiaHabilDelMes(fecha){
  const ultimo=new Date(fecha.getFullYear(),fecha.getMonth()+1,0);
  while(ultimo.getDay()===0||ultimo.getDay()===6) ultimo.setDate(ultimo.getDate()-1);
  return fecha.getDate()===ultimo.getDate();
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

  // Argentina no tiene horario de verano desde 2009 — UTC-3 fijo todo el año.
  const hoy=opts.hoy||new Date(Date.now()-3*60*60*1000);
  if(!esUltimoDiaHabilDelMes(hoy)){
    res.status(200).json({skipped:true,motivo:'no es el último día hábil del mes'});
    return;
  }

  const webhook=process.env.SLACK_WEBHOOK;
  if(!webhook){
    res.status(200).json({skipped:true}); // Slack es opcional, igual que en el resto de los cron
    return;
  }

  const hoyStr=hoy.toISOString().slice(0,10);
  const formula=encodeURIComponent(`IS_SAME({Fecha}, "${hoyStr}", 'month')`);
  const url=`https://api.airtable.com/v0/${base}/${encodeURIComponent('Historial Loyalty')}?filterByFormula=${formula}`;

  let cambios=[];
  try{
    const airtableRes=await fetch(url,{headers:{'Authorization':`Bearer ${token}`}});
    const data=await airtableRes.json();
    cambios=data.records||[];
  }catch(e){
    res.status(502).json({error:{message:'No se pudo consultar Airtable.'}});
    return;
  }

  if(!cambios.length){
    res.status(200).json({ok:true,notificados:0});
    return;
  }

  const mesTexto=`${MESES_ES[hoy.getMonth()]} de ${hoy.getFullYear()}`;
  const lineas=cambios.map(c=>{
    const f=c.fields||{};
    return `• *${f.Persona||'alguien'}*: ${f['Nivel anterior']||'—'} → ${f['Nivel nuevo']||'—'}`;
  });
  const texto=`📊 *Resumen mensual — Cambios de Nivel Loyalty (${mesTexto})*\n${lineas.join('\n')}`;

  try{
    await fetch(webhook,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text:texto}),
    });
  }catch(e){
    console.error('No se pudo enviar el resumen mensual de Loyalty a Slack:',e.message);
  }

  res.status(200).json({ok:true,notificados:cambios.length});
};
module.exports.esUltimoDiaHabilDelMes=esUltimoDiaHabilDelMes;
