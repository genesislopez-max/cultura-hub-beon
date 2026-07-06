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

  const webhook=process.env.SLACK_WEBHOOK;
  if(!webhook){
    res.status(200).json({skipped:true}); // Slack es opcional, igual que antes
    return;
  }

  try{
    await fetch(webhook,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text:req.body?.text||''}),
    });
    res.status(200).json({ok:true});
  }catch(e){
    res.status(502).json({error:{message:'No se pudo enviar el mensaje a Slack.'}});
  }
};
