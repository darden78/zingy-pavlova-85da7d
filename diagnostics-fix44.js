export class DiagnosticRecorder {
 constructor(limit=20000){this.limit=limit;this.reset(null);}
 reset(runId){this.runId=runId;this.records=[];this.dropped=0;this.sequence=0;}
 add(value){const record={...value,run_id:this.runId,sequence:++this.sequence};if(this.records.length<this.limit)this.records.push(record);else this.dropped++;}
 snapshot(){return {run_id:this.runId,records:this.records.slice(),dropped:this.dropped};}
}
export function makePackets(snapshot,requestId){
 const count=Math.max(1,Math.ceil(snapshot.records.length/25));
 return Array.from({length:count},(_,index)=>({request_id:requestId,run_id:snapshot.run_id,index,total:count,record_count:snapshot.records.length,dropped:snapshot.dropped,records:snapshot.records.slice(index*25,(index+1)*25)}));
}
export class PacketCollector {
 constructor(runId,requestId){this.runId=runId;this.requestId=requestId;this.parts=new Map();this.meta=null;}
 accept(p){
  if(p?.run_id!==this.runId||p?.request_id!==this.requestId)return null;
  if(!Number.isInteger(p.total)||p.total<1||p.total>1000||!Number.isInteger(p.index)||p.index<0||p.index>=p.total||!Array.isArray(p.records)||p.records.length>25)throw Error('Pacchetto diagnostico non valido');
  if(this.meta&&(p.total!==this.meta.total||p.record_count!==this.meta.record_count||p.dropped!==this.meta.dropped))throw Error('Diagnostica incoerente');
  this.meta=p;this.parts.set(p.index,p.records);
  if(this.parts.size!==p.total)return null;
  const records=Array.from({length:p.total},(_,i)=>this.parts.get(i)).flat();
  if(records.length!==p.record_count||records.some((r,i)=>r.run_id!==this.runId||r.sequence!==i+1))throw Error('Diagnostica incompleta');
  return {run_id:this.runId,records,dropped:p.dropped,complete:p.dropped===0};
 }
}
