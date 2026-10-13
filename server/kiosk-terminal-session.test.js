const test=require('node:test');const assert=require('node:assert/strict');
const {createTerminalSession}=require('./kiosk-terminal-session');
const env={SUMUP_KIOSK_OAUTH_CLIENT_ID:'fake-id',SUMUP_KIOSK_OAUTH_CLIENT_SECRET:'fake-secret',SUMUP_KIOSK_AFFILIATE_KEY:'sup_afk_fake'};
function fixture(options={}){
 let saved={refreshToken:'first'},calls=[],time=100000;
 const store={read:async()=>saved,write:async value=>{if(options.persistFail)throw Error('disk');saved=value;}};
 const fetchImpl=async(url,request)=>{
 calls.push([url,request]);
 if(url.endsWith('/token'))return {ok:!options.revoked,json:async()=>options.revoked?{error:'invalid_grant'}:{access_token:'fake-access',refresh_token:'rotated',token_type:'Bearer',expires_in:120}};
 return {ok:true,json:async()=>({merchant_profile:{merchant_code:options.wrong?'OTHER':'M'}})};
 };
 const session=createTerminalSession({env,store,fetchImpl,now:()=>time});
 return {session,calls,get saved(){return saved;},advance:()=>time+=61000,store,fetchImpl,now:()=>time};
}
test('one refresh serves concurrent requests; only temporary access is exposed',async()=>{
 const f=fixture();const values=await Promise.all(Array.from({length:10},()=>f.session.get('M')));
 assert.equal(f.calls.length,2);assert.deepEqual(f.saved,{refreshToken:'rotated'});
 for(const v of values){assert.equal(v.accessToken,'fake-access');assert.equal(v.refreshToken,undefined);assert.equal(v.clientSecret,undefined);}
 await f.session.get('M');assert.equal(f.calls.length,2);
 f.advance();await f.session.get('M');assert.equal(f.calls.length,4);
 assert.equal(f.calls[2][1].body.get('refresh_token'),'rotated');
});
test('rotated token survives recreating the service',async()=>{
 const f=fixture();await f.session.get('M');
 const restarted=createTerminalSession({env,store:f.store,fetchImpl:f.fetchImpl,now:f.now});await restarted.get('M');
 assert.equal(f.calls[2][1].body.get('refresh_token'),'rotated');
});
test('revocation is persisted and never retried repeatedly',async()=>{
 const f=fixture({revoked:true});await assert.rejects(f.session.get('M'));f.advance();await assert.rejects(f.session.get('M'));
 assert.equal(f.calls.length,1);assert.deepEqual(f.saved,{revoked:true});
 const restarted=createTerminalSession({env,store:f.store,fetchImpl:f.fetchImpl,now:f.now});await assert.rejects(restarted.get('M'));assert.equal(f.calls.length,1);
});
test('wrong merchant and failed durable storage never issue a session',async()=>{
 for(const options of [{wrong:true},{persistFail:true}]){const f=fixture(options);await assert.rejects(f.session.get('M'));}
});
test('missing OAuth configuration fails without contacting SumUp',async()=>{
 let contacted=false;const session=createTerminalSession({env:{},fetchImpl:()=>{contacted=true;}});await assert.rejects(session.get('M'));assert.equal(contacted,false);
});

test('initial authorization checks state, merchant and prevents callback replay',async()=>{
 const f=fixture();const authorizationEnv={...env,SUMUP_KIOSK_OAUTH_REDIRECT_URI:'https://example.test/callback'};
 const session=createTerminalSession({env:authorizationEnv,store:f.store,fetchImpl:f.fetchImpl,now:f.now});
 const start=session.beginAuthorization('M');const url=new URL(start.url),state=url.searchParams.get('state');
 assert.equal(url.origin,'https://api.sumup.com');assert.equal(url.searchParams.get('redirect_uri'),authorizationEnv.SUMUP_KIOSK_OAUTH_REDIRECT_URI);
 await assert.rejects(session.completeAuthorization('wrong','fake-code'));assert.equal(f.calls.length,0);
 assert.equal((await session.completeAuthorization(state,'fake-code')).authorized,true);
 await assert.rejects(session.completeAuthorization(state,'fake-code'));assert.equal(f.calls.length,2);
 assert.equal(f.calls[0][1].body.get('grant_type'),'authorization_code');
});
test('initial authorization rejects expired state and another merchant',async()=>{
 for(const wrong of [true,false]){
 const f=fixture({wrong}),authorizationEnv={...env,SUMUP_KIOSK_OAUTH_REDIRECT_URI:'https://example.test/callback'};
 const session=createTerminalSession({env:authorizationEnv,store:f.store,fetchImpl:f.fetchImpl,now:f.now});
 const state=new URL(session.beginAuthorization('M').url).searchParams.get('state');
 if(!wrong)for(let i=0;i<10;i++)f.advance();
 await assert.rejects(session.completeAuthorization(state,'fake-code'));assert.deepEqual(f.saved,{refreshToken:'first'});
 }
});
