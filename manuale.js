import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from "./config.js";

const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const leagueId=params.get("league")||"";
const slotNo=Number(params.get("slot")||0);
const preview=params.get("preview")==="1";
const db=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);

let league=null,auction=null,slots=[],catalog=[];
let exactValue="",exactMode=false,loading=false,reloadTimer=null,channel=null;

function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function slotName(n){const s=slots.find(x=>Number(x.slot)===Number(n));return s?.display_name||`Posto ${n}`}
function rosterInfo(slot){
 const ps=catalog.filter(p=>Number(p.assigned_slot)===Number(slot));
 const playerSpent=ps.reduce((a,p)=>a+Number(p.assigned_price||0),0);
 const adjustment=Number(slots.find(s=>Number(s.slot)===Number(slot))?.credit_adjustment||0);
 const remain=Number(league?.credits_initial||0)-playerSpent+adjustment;
 const total=Number(league?.roster_p||0)+Number(league?.roster_d||0)+Number(league?.roster_c||0)+Number(league?.roster_a||0);
 const max=Math.max(0,remain-Math.max(0,total-ps.length-1));
 return {ps,remain,max};
}
function msg(text="",cls="",exact=false){
 const el=$(exact?"exactMsg":"msg");
 el.className=`message ${cls||""}`;
 el.textContent=text;
}
function activeSlot(){
 return slots.find(x=>Number(x.slot)===slotNo);
}
function manualBidError(er){
 return er==="COOLDOWN"?"Attendi un istante prima del rilancio.":
 er==="SUPERA_MASSIMO"?"L'offerta supera il massimo spendibile.":
 er==="MAGGIORE_OFFERENTE_NON_PUO_ABBANDONARE"?"Il maggiore offerente non può abbandonare.":
 er||"Operazione non riuscita";
}
function setExactMode(on){
 exactMode=!!on;
 $("manualWindow").classList.toggle("exactMode",exactMode);
 const s=activeSlot();
 $("manualTitle").textContent=exactMode?`OFFERTA LIBERA — ${s?.display_name||""}`:`COMANDI MANUALI — ${s?.display_name||""}`;
 if(exactMode){
   exactValue="";
   $("exactDisplay").innerHTML="&nbsp;";
   $("exactCurrent").textContent=auction?.highest_slot?auction.current_bid:"—";
   $("exactMax").textContent=s?rosterInfo(slotNo).max:"—";
   msg("","",true);
 }
}
function render(){
 const s=activeSlot();
 if(!s?.display_name){msg("Partecipante non disponibile.","bad");return}
 if(!s.manual_control&&!preview){
   $("manualTitle").textContent=`GESTIONE MANUALE TERMINATA — ${s.display_name}`;
   for(const id of ["plus1","plus10","exactBtn","leaveBtn"])if($(id))$(id).disabled=true;
   msg("Il partecipante non è più in gestione manuale.","warn");
   return;
 }
 const r=rosterInfo(slotNo);
 const hi=Number(auction?.highest_slot)===slotNo;
 const currentAmount=auction?.highest_slot?auction.current_bid:"—";
 const leader=auction?.highest_slot?slotName(auction.highest_slot):"Nessuno";
 const active=auction?.status==="OPEN"&&!!auction?.current_player_id&&!!s.active&&!s.abandoned;

 $("manualTitle").textContent=exactMode?`OFFERTA LIBERA — ${s.display_name}`:`COMANDI MANUALI — ${s.display_name}`;
 $("currentAmount").innerHTML=`${esc(currentAmount)}${currentAmount==="—"?"":'<span class="unit">crediti</span>'}`;
 $("currentLeader").textContent=leader;
 $("creditsRemain").innerHTML=`${esc(r.remain)}<span class="unit">crediti</span>`;
 $("plus1").disabled=!active;
 $("plus10").disabled=!active;
 $("exactBtn").disabled=!active;

 const wrap=$("leaveWrap");
 if(s.abandoned){
   wrap.innerHTML=`<button id="leaveBtn" class="action resume" ${auction?.status==="OPEN"&&s.active?"":"disabled"}>RIPRENDI ASTA</button>`;
 }else if(hi){
   wrap.innerHTML=`<div class="leaderInfo">MAGGIORE OFFERENTE — ABBANDONA ASTA NON DISPONIBILE</div>`;
 }else{
   wrap.innerHTML=`<button id="leaveBtn" class="action leave" ${auction?.status==="OPEN"&&s.active?"":"disabled"}>ABBANDONA ASTA</button>`;
 }
 bindLeave();
 if(exactMode){
   $("exactCurrent").textContent=currentAmount;
   $("exactMax").textContent=r.max;
 }
}
async function load(){
 if(preview)return;
 if(loading||!leagueId||!slotNo)return;
 loading=true;
 try{
   const [l,a,s,p]=await Promise.all([
     db.from("fa_leagues").select("*").eq("id",leagueId).maybeSingle(),
     db.from("fa_auction").select("*").eq("league_id",leagueId).maybeSingle(),
     db.from("fa_slots").select("league_id,slot,display_name,active,abandoned,credit_adjustment,member_enabled,manual_control").eq("league_id",leagueId).order("slot"),
     db.from("fa_players").select("*").eq("league_id",leagueId)
   ]);
   if(l.error||a.error||s.error||p.error)throw new Error(l.error?.message||a.error?.message||s.error?.message||p.error?.message);
   league=l.data;auction=a.data;slots=s.data||[];catalog=p.data||[];
   render();
 }catch(e){msg("Errore lettura dati: "+(e?.message||e),"bad")}
 finally{loading=false}
}
function scheduleLoad(){clearTimeout(reloadTimer);reloadTimer=setTimeout(load,35)}
async function bid(kind,exact=null){
 msg("");
 const {data,error}=await db.rpc("fa_place_bid_manual_v511",{p_league_id:leagueId,p_slot:slotNo,p_kind:kind,p_exact:exact});
 if(error||!data?.ok){msg(manualBidError(error?.message||data?.error),"bad",exactMode);return}
 msg(`✓ Offerta ${data.amount??exact??""} accettata`,"ok",exactMode);
 exactValue="";
 if(exactMode)setExactMode(false);
 await load();
}
function bindLeave(){
 const b=$("leaveBtn");if(!b)return;
 b.onclick=async()=>{
   const s=activeSlot();if(!s)return;
   msg("");
   const {data,error}=await db.rpc("fa_leave_manual_v511",{p_league_id:leagueId,p_slot:slotNo,p_rejoin:!!s.abandoned});
   if(error||!data?.ok){msg(manualBidError(error?.message||data?.error),"bad");return}
   msg(s.abandoned?"✓ Partecipante rientrato nell'asta":"✓ Partecipante fuori dall'asta","ok");
   await load();
 };
}
function key(k){
 if(k==="C")exactValue="";
 else if(k==="B")exactValue=exactValue.slice(0,-1);
 else if(/^\d$/.test(k)){exactValue=(exactValue==="0"?"":exactValue)+k;if(exactValue.length>7)exactValue=exactValue.slice(0,7)}
 $("exactDisplay").textContent=exactValue||"\u00a0";
}
async function sendExact(){
 if(exactValue===""){msg("Inserisci un importo.","bad",true);return}
 const n=Number(exactValue);
 if(!Number.isInteger(n)||n<0){msg("Inserisci un importo intero valido.","bad",true);return}
 await bid("EXACT",n);
}

$("closeBtn").onclick=()=>window.fantasticaDesktop?.closeManualWindow?.()||window.close();
$("plus1").onclick=()=>bid("PLUS1");
$("plus10").onclick=()=>bid("PLUS10");
$("exactBtn").onclick=()=>setExactMode(true);
$("exactCancel").onclick=()=>setExactMode(false);
$("exactSend").onclick=sendExact;
document.querySelectorAll("[data-key]").forEach(b=>b.onclick=()=>key(b.dataset.key));
window.addEventListener("keydown",e=>{
 if(!exactMode)return;
 if(/^\d$/.test(e.key)){e.preventDefault();key(e.key)}
 else if(e.key==="Backspace"){e.preventDefault();key("B")}
 else if(e.key==="Delete"){e.preventDefault();key("C")}
 else if(e.key==="Escape"){e.preventDefault();setExactMode(false)}
 else if(e.key==="Enter"){e.preventDefault();sendExact()}
});

if(preview){
 league={credits_initial:600,roster_p:3,roster_d:8,roster_c:8,roster_a:6};
 auction={status:"OPEN",current_player_id:"preview",highest_slot:3,current_bid:562};
 slots=[
  {slot:1,display_name:"Alessandro",active:true,abandoned:false,credit_adjustment:-102,manual_control:true},
  {slot:3,display_name:"Tablet",active:true,abandoned:false,credit_adjustment:0,manual_control:false}
 ];
 catalog=[];
 render();
}else{
 load();
 channel=db.channel(`manual-window:${leagueId}:${slotNo}`)
  .on("postgres_changes",{event:"*",schema:"public",table:"fa_auction",filter:`league_id=eq.${leagueId}`},scheduleLoad)
  .on("postgres_changes",{event:"*",schema:"public",table:"fa_slots",filter:`league_id=eq.${leagueId}`},scheduleLoad)
  .on("postgres_changes",{event:"*",schema:"public",table:"fa_players",filter:`league_id=eq.${leagueId}`},scheduleLoad)
  .on("postgres_changes",{event:"*",schema:"public",table:"fa_leagues",filter:`id=eq.${leagueId}`},scheduleLoad)
  .subscribe();
}
