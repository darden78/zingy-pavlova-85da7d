// Dedicated worker: HTTP requests continue when the UI thread is busy.
// Server remains authoritative for deadline, pause, presence and assignment.
let state=null,busy=false,lastAttempt=0;
let flushPending=[];let diagRun=null,diagSeq=0,lastTick=0,lastStateKey="";
function event44(kind,s,extra={}){postMessage({diag_event:{source:"worker",kind,run_id:s?.run_id??diagRun,at:new Date().toISOString(),server_estimate_ms:Date.now()+Number(s?.offset||0),clock_offset_ms:Number(s?.offset||0),player_id:s?.player_id,deadline:s?.deadline,...extra}});}
onmessage=({data})=>{
 if(data?.type==='reset_diag'){diagRun=data.run_id;lastStateKey="";lastTick=0;}
 if(data?.type==='flush_diag'){if(busy)flushPending.push(data.request_id);else postMessage({flush_ack:data.request_id});}
 if(data?.type==='state'){
  state={...data,received:Date.now()};
  const key=JSON.stringify([data.player_id,data.active,data.deadline,!!data.token,data.run_id]);
  if(key!==lastStateKey){lastStateKey=key;event44("state_received",state,{active:!!data.active,session_available:!!data.token});}
 }
};
async function tick(){
 const s=state,now=Date.now();if(lastTick&&now-lastTick>750)event44("worker_tick_gap",s,{gap_ms:now-lastTick});lastTick=now;
 if(busy||!s?.active||!s.token||!(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.leagueId||''))||s.url!=='https://nbsxpjwivhnyiqtaxehk.supabase.co'||now-s.received>60000)return;
 const deadline=Date.parse(s.deadline);
 if(!Number.isFinite(deadline)||now+Number(s.offset||0)<deadline||now-lastAttempt<250)return;
 busy=true;lastAttempt=now;const attemptId="worker-"+(++diagSeq),started=performance.now();event44("close_request",s,{attempt_id:attemptId,deadline_lateness_ms:now+Number(s.offset||0)-deadline});
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),4000);
 try{
  const response=await fetch(s.url+'/rest/v1/rpc/fa_finalize_v475',{method:'POST',headers:{apikey:s.key,Authorization:'Bearer '+s.token,'Content-Type':'application/json'},body:JSON.stringify({p_league_id:s.leagueId}),signal:controller.signal});
  const result=await response.json();
  event44("close_response",s,{attempt_id:attemptId,rpc_ms:performance.now()-started,http_status:response.status,ok:response.ok&&result?.ok!==false,expired:result?.expired??null,error:result?.error||null});
  if(!response.ok||result?.ok===false)throw new Error(result?.error||'HTTP '+response.status);
  postMessage({ready:true,error:null,last_attempt_at:new Date(now).toISOString(),rpc_ms:Date.now()-now,expired:!!result?.expired});
  if(result?.expired&&state===s)state={...s,active:false};
 }catch(e){event44("close_error",s,{attempt_id:attemptId,rpc_ms:performance.now()-started,error:e.name==='AbortError'?'Timeout chiusura':e.message});postMessage({ready:true,error:e.name==='AbortError'?'Timeout chiusura':e.message});}
 finally{clearTimeout(timeout);busy=false;for(const id of flushPending.splice(0))postMessage({flush_ack:id});}
}
setInterval(tick,100);
postMessage({ready:true,error:null});
