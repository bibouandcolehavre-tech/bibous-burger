'use strict';
// Serialize keychain/local-storage operations: a delayed sign-in save must not
// finish after logout and silently reconnect that account on the next launch.
function createSessionStorage({read,write,clear}) {
  let pending=Promise.resolve();
  const enqueue=task=>{const next=pending.catch(()=>{}).then(task);pending=next.catch(()=>{});return next;};
  return {
    read:()=>enqueue(read),
    write:token=>enqueue(()=>write(token)),
    clear:()=>enqueue(clear),
    clearIf:(token,isCurrent=()=>true)=>enqueue(async()=>{
      if(await read()!==token||!isCurrent())return false;
      await clear();return true;
    }),
  };
}
module.exports={createSessionStorage};
