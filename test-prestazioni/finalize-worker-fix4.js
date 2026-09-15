// Dedicated worker: HTTP requests continue when the UI thread is busy.
// Server remains authoritative for deadline, pause, presence and assignment.
let state=null,busy=false,lastAttempt=0;
onmessage=({data})=>{if(data?.type==='state')state={...data,received:Date.now()};};
async function tick(){
 const s=state,now=Date.now();
 if(busy||!s?.active||!s.token||s.leagueId!=='13622072-cec9-4932-8181-5f2cfd07876a'||s.url!=='https://nbsxpjwivhnyiqtaxehk.supabase.co'||now-s.received>60000)return;
 const deadline=Date.parse(s.deadline);
 if(!Number.isFinite(deadline)||now+Number(s.offset||0)<deadline||now-lastAttempt<250)return;
 busy=true;lastAttempt=now;
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),4000);
 try{
  const response=await fetch(s.url+'/rest/v1/rpc/fa_finalize_v475',{method:'POST',headers:{apikey:s.key,Authorization:'Bearer '+s.token,'Content-Type':'application/json'},body:JSON.stringify({p_league_id:s.leagueId}),signal:controller.signal});
  const result=await response.json();
  if(!response.ok||result?.ok===false)throw new Error(result?.error||'HTTP '+response.status);
  postMessage({ready:true,error:null,last_attempt_at:new Date(now).toISOString(),rpc_ms:Date.now()-now,expired:!!result?.expired});
  if(result?.expired&&state===s)state={...s,active:false};
 }catch(e){postMessage({ready:true,error:e.name==='AbortError'?'Timeout chiusura':e.message});}
 finally{clearTimeout(timeout);busy=false;}
}
setInterval(tick,100);
postMessage({ready:true,error:null});
