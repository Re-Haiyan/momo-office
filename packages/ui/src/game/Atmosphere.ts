import Phaser from 'phaser';
import {getDisplay,reducedMotion,seasonFor,daylight} from '../display';
import {Ambient} from './TileOffice';import {TILE} from './tileset';
export class Atmosphere {
 private shade:Phaser.GameObjects.Rectangle;
 private clock:Phaser.GameObjects.BitmapText;
 private particles:Phaser.GameObjects.Rectangle[]=[];
 private timer:Phaser.Time.TimerEvent;
 private refresh=()=>this.apply();
 private motion=window.matchMedia('(prefers-reduced-motion: reduce)');
 constructor(private scene:Phaser.Scene,private ambient:Ambient){
  this.shade=scene.add.rectangle(480,320,6000,6000,0x193754,0).setDepth(5000);
  this.clock=scene.add.bitmapText(24,16,'pixel-font','',8).setTint(0xf7d996).setDepth(6000);
  for(let i=0;i<24;i++)this.particles.push(scene.add.rectangle(70+i*31,48+(i%4)*3,1,3,0xb5d1bd).setDepth(4500).setVisible(false));
  this.timer=scene.time.addEvent({delay:1000,loop:true,callback:()=>this.apply()});
  const weather=scene.time.addEvent({delay:80,loop:true,callback:()=>{
    if(reducedMotion()||getDisplay().weather==='off')return;
    const leaves=getDisplay().weather==='leaves';for(const p of this.particles){p.y+=leaves?1:2;if(leaves)p.x+=1;if(p.y>61)p.y=48;if(p.x>840)p.x=80;}
  }});
  window.addEventListener('momo:display',this.refresh);this.motion.addEventListener('change',this.refresh);this.apply();
  scene.events.once('shutdown',()=>{window.removeEventListener('momo:display',this.refresh);this.motion.removeEventListener('change',this.refresh);this.timer.remove();weather.remove();});
 }
 private apply(){
  const date=new Date(),light=daylight(date),prefs=getDisplay(),season=prefs.season==='auto'?seasonFor(date):prefs.season;
  this.shade.setFillStyle(light.color,light.alpha);
  this.clock.setText(`${date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} / ${season.toUpperCase()}`);
  for(const window of this.ambient.windows)window.setFrame(season==='summer'?28:season==='fall'?29:season==='winter'?30:TILE.window);
  for(const lamp of this.ambient.lamps)lamp.setAlpha(light.night?.22:0);
  for(const sprite of this.ambient.sprites)if(sprite.getData('ambient')==='plant')sprite.setTint(season==='fall'?0xe0b578:season==='winter'?0xc5d5c5:0xffffff);
  const active=prefs.weather!=='off'&&!reducedMotion();for(const p of this.particles)p.setVisible(active).setFillStyle(prefs.weather==='rain'?0xb6d9dc:season==='fall'?0xd89d51:0xa5b76c).setSize(prefs.weather==='rain'?1:2,prefs.weather==='rain'?3:2);
  this.scene.game.canvas.dataset.weatherActive=String(active);this.scene.game.canvas.dataset.season=season;this.scene.game.canvas.dataset.reducedMotion=String(reducedMotion());
 }
}
