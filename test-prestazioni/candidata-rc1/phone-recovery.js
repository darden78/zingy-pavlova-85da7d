/* FANTASTICA TEST RC1: one owner for phone channels, cancellation and retries. */
class FantasticaPhoneRecovery {
 constructor(options){this.o=options;this.epoch=0;this.channel=null;this.timer=null;this.task=null;this.removal=Promise.resolve();this.connected=false;this.attempts=0;this.records=[];this.dropped=0;}
 record(type,extra={}){const e={type,at:new Date().toISOString(),...extra};if(this.records.length<2000)this.records.push(e);else this.dropped++;}
 guard(current,callback){return (...args)=>{if(current())return callback(...args)}}
 detach(){const ch=this.channel;this.channel=null;if(ch)this.removal=this.removal.catch(()=>{}).then(async()=>{const r=await this.o.db.removeChannel(ch);if(r!=='ok')throw Error('Rimozione canale: '+r)}).catch(e=>{if(!this.channel)this.channel=ch;this.record('remove_error',{error:e.message});throw e});return this.removal;}
 stop(){this.epoch++;clearTimeout(this.timer);this.timer=null;this.cancel?.();this.cancel=null;this.task=null;this.connected=false;this.attempts=0;this.record('stop');this.detach().catch(()=>{});}
 async connect(force=false){
  if(!this.o.ready())return;
  if(this.task)return this.task;
  if(this.connected&&!force)return;
  if(force)this.attempts=0;
  if(this.attempts>=3){this.o.onStatus('Connessione non riuscita: esci e rientra',false);return;}
  clearTimeout(this.timer);this.timer=null;
  const epoch=++this.epoch;let failed=false;
  const current=()=>epoch===this.epoch&&!failed&&this.o.ready();
  this.attempts++;this.connected=false;this.record('connect_attempt',{attempt:this.attempts});this.o.onStatus('Riconnessione...',false);
  const work=(async()=>{
   try{
    await this.detach();if(!current())return;
    const began=performance.now();let waited=false;
    while(this.o.db.realtime.isDisconnecting()){
     if(!current())return;
     waited=true;if(performance.now()-began>=2000)throw Error('Socket in chiusura oltre 2000 ms');
     await new Promise(r=>setTimeout(r,20));
    }
    if(waited)this.record('socket_disconnect_wait',{elapsed_ms:performance.now()-began});
    if(!current())return;
    const ch=this.o.create(current);this.channel=ch;
    await new Promise((resolve,reject)=>{
     let settled=false,tracking=false;
     const finish=e=>{if(settled)return;settled=true;clearTimeout(timeout);this.cancel=null;e?reject(e):resolve();};
     this.cancel=()=>finish(Error('Connessione annullata'));
     const timeout=setTimeout(()=>finish(Error('Connessione oltre 12000 ms')),12000);
     ch.subscribe(async status=>{
      if(!current()||this.channel!==ch)return;
      this.record('channel_status',{status});
      if(status==='SUBSCRIBED'&&!tracking){
       tracking=true;
       try{await this.o.onConnected(current,ch);if(!current())return;this.connected=true;this.attempts=0;this.o.onStatus('● ONLINE',true);this.record('connected');finish();}
       catch(e){if(!settled)finish(e);else this.retry(epoch,e);}
       finally{tracking=false;}
      }else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){
       if(!settled)finish(Error('Realtime '+status));else this.retry(epoch,Error('Realtime '+status));
      }
     });
    });
   }catch(e){failed=true;if(epoch===this.epoch)this.retry(epoch,e);}
  })();
  this.task=work;
  try{await work;}finally{if(this.task===work)this.task=null;}
 }
 retry(epoch,e){
  if(epoch!==this.epoch)return;
  this.epoch++;this.cancel?.();this.cancel=null;this.connected=false;this.record('connection_error',{error:e.message});
  this.o.onStatus(this.attempts>=3?'Connessione non riuscita: esci e rientra':'Riconnessione...',false);
  clearTimeout(this.timer);
  if(this.o.ready()&&this.attempts<3)this.timer=setTimeout(()=>this.connect(),700);
 }
}
if(typeof module!=='undefined')module.exports=FantasticaPhoneRecovery;
else window.FantasticaPhoneRecovery=FantasticaPhoneRecovery;
