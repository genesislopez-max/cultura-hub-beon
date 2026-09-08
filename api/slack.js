// Proxy hacia el webhook de Slack: valida la sesión antes de mandar el
// mensaje. El webhook (secreto) vive solo acá, como variable de entorno.
const {verifySession}=require('./_lib/session');

module.exports=async(req,res)=>{
  if(req.method!=='POST'){
    res.status(405).json({error:{message:'Método no permitido.'}});
    return;
  }

  const idToken=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const verificado=verifySession(idToken);
  if(!verificado.ok){
    res.status(401).json({error:{message:verificado.error}});
    return;
  }

  // El canal viene del cliente, así que NO se usa para armar el nombre de la
  // variable de entorno: se mapea contra una lista fija. Si no, un body
  // malicioso podría hacer que el server lea cualquier env var.
  const WEBHOOKS={
    // Avisos operativos (ingresos, tareas, offboarding…) → #avisos-cultura.
    general:process.env.SLACK_WEBHOOK,
    // El feedback de la plataforma va a su propio canal (#it-culture-hub), que
    // es quien lo resuelve; si SLACK_WEBHOOK_FEEDBACK no está configurada, cae
    // en el general para no perder el aviso.
    feedback:process.env.SLACK_WEBHOOK_FEEDBACK||process.env.SLACK_WEBHOOK,
  };
  const webhook=WEBHOOKS[req.body?.canal]||WEBHOOKS.general;
  if(!webhook){
    res.status(200).json({skipped:true}); // Slack es opcional, igual que antes
    return;
  }

  // Ese fallback era invisible: el feedback aparecía en el canal general y no
  // había manera de saber que era por falta de configuración y no por diseño.
  // Se avisa en el propio mensaje. Va el NOMBRE de la variable, nunca su valor.
  const cayoEnGeneral=req.body?.canal==='feedback'&&!process.env.SLACK_WEBHOOK_FEEDBACK;
  const texto=(req.body?.text||'')+(cayoEnGeneral
    ?'\n\n_⚠️ Esto tendría que llegar a #it-culture-hub. Falta configurar la variable `SLACK_WEBHOOK_FEEDBACK` en Vercel con el webhook de ese canal._'
    :'');

  try{
    await fetch(webhook,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text:texto}),
    });
    res.status(200).json({ok:true});
  }catch(e){
    res.status(502).json({error:{message:'No se pudo enviar el mensaje a Slack.'}});
  }
};
