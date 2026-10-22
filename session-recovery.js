'use strict';
function createSessionRecovery({read,verify,clear,onRestored,onAbsent,onUnavailable,isCurrent=()=>true,canRetry=()=>true,schedule=setTimeout,cancel=clearTimeout}) {
  let stopped=false,busy=false,timer=null,attempts=0;
  const active=()=>!stopped&&isCurrent();
  async function retry() {
    if(!active()||busy||!canRetry())return;
    if(timer!==null){cancel(timer);timer=null;}busy=true;
    try {
      while(active()) {
        const token=await read();if(!active())return;
        if(!token){onAbsent('absent');stopped=true;return;}
        const response=await verify(token);if(!active())return;
        // A response for an old token must neither restore nor erase a newer login.
        if(await read()!==token)continue;
        if(!active())return;
        if(response.status===401) {
          if(!await clear(token,active))continue;
          if(active()){onAbsent('invalid');stopped=true;}return;
        }
        if(!response.ok||!response.payload?.customer)throw Error('Connexion non actualisée.');
        onRestored(token,response.payload.customer);stopped=true;return;
      }
    }catch {
      if(active()){
        onUnavailable();attempts++;
        timer=schedule(()=>{timer=null;void retry();},attempts<3?5000:15000);
      }
    }finally{busy=false;}
  }
  return {retry,stop(){stopped=true;if(timer!==null)cancel(timer);timer=null;}};
}
module.exports={createSessionRecovery};
