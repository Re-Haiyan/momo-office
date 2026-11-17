import {useEffect,useState} from 'react';
export type SoundPrefs={enabled:boolean;master:number;music:number;ambient:number;effects:number;dialogue:number};
const defaults:SoundPrefs={enabled:false,master:.35,music:.18,ambient:.12,effects:.3,dialogue:.15};
const valid=(raw:any):SoundPrefs=>Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,key==='enabled'?raw?.enabled===true:typeof raw?.[key]==='number'&&Number.isFinite(raw[key])?Math.max(0,Math.min(1,raw[key])):value])) as SoundPrefs;
let prefs={...defaults};try{prefs=valid(JSON.parse(localStorage.getItem('momo-sound')||'{}'));}catch{}
class SoundSystem {
 private ctx?:AudioContext;private main?:GainNode;private noise?:AudioBufferSourceNode;private room?:GainNode;private loop?:ReturnType<typeof setInterval>;private note=0;
 private phrase=[261.63,329.63,392,329.63,293.66,349.23,440,0,246.94,293.66,392,293.66,261.63,329.63,523.25,0];
 install(){document.documentElement.dataset.audioStarted='false';const gesture=(event:Event)=>{if(event.isTrusted&&prefs.enabled)void this.unlock(event);};const click=(event:Event)=>{if(event.isTrusted&&(event.target as HTMLElement).closest('button,a,summary'))this.click();};document.addEventListener('pointerdown',gesture);document.addEventListener('keydown',gesture);document.addEventListener('click',click);return()=>{document.removeEventListener('pointerdown',gesture);document.removeEventListener('keydown',gesture);document.removeEventListener('click',click);this.stop();void this.ctx?.close();};}
 async unlock(event:Event){if(!event.isTrusted||!prefs.enabled)return;try{if(!this.ctx){this.ctx=new AudioContext();this.main=this.ctx.createGain();this.main.connect(this.ctx.destination);document.documentElement.dataset.audioStarted='true';}await this.ctx.resume();this.apply();}catch{/* Optional audio never blocks the office. */}}
 set(patch:Partial<SoundPrefs>,gesture?:Event){prefs=valid({...prefs,...patch});try{localStorage.setItem('momo-sound',JSON.stringify(prefs));}catch{}if(!prefs.enabled)this.stop();else if(gesture)void this.unlock(gesture);else this.apply();window.dispatchEvent(new Event('momo:sound'));}
 private tone(freq:number,duration:number,level:number,delay=0,type:OscillatorType='sine'){
  if(!prefs.enabled||!this.ctx||this.ctx.state!=='running'||!this.main||!freq||!level)return;
  const at=this.ctx.currentTime+delay,o=this.ctx.createOscillator(),gain=this.ctx.createGain();o.type=type;o.frequency.value=freq;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(level,at+.012);gain.gain.exponentialRampToValueAtTime(.00001,at+duration);o.connect(gain);gain.connect(this.main);o.start(at);o.stop(at+duration+.02);o.onended=()=>{o.disconnect();gain.disconnect();};
 }
 click(){this.tone(330,.045,prefs.effects*.07,0,'triangle');}
 blip(character:string){if(character.trim())this.tone(480+(character.charCodeAt(0)%5)*35,.025,prefs.dialogue*.035);}
 complete(){[392,493.88,587.33,783.99].forEach((frequency,index)=>this.tone(frequency,.25,prefs.effects*.07,index*.12,'triangle'));}
 private apply(){if(!this.ctx||!this.main)return;this.main.gain.setTargetAtTime(prefs.enabled?prefs.master:0,this.ctx.currentTime,.03);if(!prefs.enabled)return;
  if(!this.noise){const buffer=this.ctx.createBuffer(1,this.ctx.sampleRate*2,this.ctx.sampleRate),data=buffer.getChannelData(0);let state=17;for(let i=0;i<data.length;i++){state=(state*1664525+1013904223)>>>0;data[i]=(state/4294967296-.5)*.1;}const noise=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=180;this.room=this.ctx.createGain();this.room.gain.value=prefs.ambient*.18;noise.buffer=buffer;noise.loop=true;noise.connect(filter);filter.connect(this.room);this.room.connect(this.main);noise.start();this.noise=noise;}
  this.room?.gain.setTargetAtTime(prefs.ambient*.18,this.ctx.currentTime,.1);
  if(!this.loop)this.loop=setInterval(()=>{this.tone(this.phrase[this.note++%this.phrase.length],.8,prefs.music*.045,0,'triangle');},650);
 }
 private stop(){if(this.loop){clearInterval(this.loop);this.loop=undefined;}try{this.noise?.stop();this.noise?.disconnect();}catch{}this.noise=undefined;this.room?.disconnect();this.room=undefined;if(this.main&&this.ctx)this.main.gain.value=0;void this.ctx?.suspend().catch(()=>{});}
}
export const sound=new SoundSystem();
export function useSound(){const [value,setValue]=useState(()=>({...prefs}));useEffect(()=>{const change=()=>setValue({...prefs});window.addEventListener('momo:sound',change);return()=>window.removeEventListener('momo:sound',change);},[]);return value;}
