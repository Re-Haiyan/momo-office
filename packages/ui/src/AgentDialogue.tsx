import React,{useEffect,useRef,useState} from 'react';
import {reducedMotion} from './display';
export function AgentDialogue({agent,message,hasOutput,onClose,onOutput,onModel}:{agent:{id:string;name:string;role:string};message:string;hasOutput:boolean;onClose:()=>void;onOutput:()=>void;onModel:()=>void}) {
 const [count,setCount]=useState(reducedMotion()?message.length:0);const ref=useRef<HTMLElement>(null);
 useEffect(()=>{setCount(reducedMotion()?message.length:0);if(reducedMotion())return;const timer=setInterval(()=>setCount(n=>{if(n>=message.length){clearInterval(timer);return n;}return n+1;}),24);return()=>clearInterval(timer);},[message]);
 useEffect(()=>{const old=document.activeElement as HTMLElement;ref.current?.focus();return()=>old?.focus();},[]);
 const hash=[...agent.id].reduce((n,c)=>n+c.charCodeAt(0),0)%6;
 return <section className="agent-dialogue wood-panel" role="dialog" aria-label={`Talk with ${agent.name}`} tabIndex={-1} ref={ref} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
  <button className="dialogue-close" aria-label="Close dialogue" onClick={onClose}>×</button>
  <div className={`dialogue-portrait ${agent.id==='momo'?'cat-portrait':''}`} style={{backgroundImage:`url(${agent.id==='momo'?'/art/momo-portrait.png':`/assets/characters/char_${hash}.png`})`}} aria-hidden="true"/>
  <div className="dialogue-copy"><span className="name-plate">{agent.name}</span><span className="dialogue-role">{agent.role}</span><p aria-hidden="true">{message.slice(0,count)}<span className="type-caret">{count<message.length?'▌':''}</span></p><p className="sr-only">{message}</p><div className="dialogue-actions">{count<message.length&&<button onClick={()=>setCount(message.length)}>Show full text</button>}<button disabled={!hasOutput} onClick={onOutput}>View output</button><button onClick={onModel}>Change model</button></div></div>
 </section>;
}
