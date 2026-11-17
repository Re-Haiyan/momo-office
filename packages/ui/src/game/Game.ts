import {buildTileOffice,Ambient} from "./TileOffice";
import {TILE} from "./tileset";
import { sessionHeaders } from "../session";
import Phaser from "phaser";
type AgentState = {
  id: string;
  name: string;
  x: number;
  y: number;
  direction: string;
  action: string;
  thought: string;
  currentTask: string;
};

class OfficeScene extends Phaser.Scene {
  private stream?: EventSource;
  private ambient?:Ambient;
  private agentUpdates = new Map<string, (agent: AgentState) => void>();
  private sprites = new Map<string, Phaser.GameObjects.Container>();
  private dragging = false;
  private moved = false;
  private previous = { x: 0, y: 0 };
  private lastClick = 0;
  private closing = false;
  constructor() {
    super("MomoOffice");
  }
  preload() {
    for (let i = 0; i < 6; i++)
      this.load.spritesheet(`char_${i}`, `/assets/characters/char_${i}.png`, {
        frameWidth: 16,
        frameHeight: 32,
      });
    this.load.bitmapFont("pixel-font","/fonts/silkscreen.png","/fonts/silkscreen.xml");
    this.load.json({
      key: "office-layout",
      url: "/api/momo/office",
      xhrSettings: { responseType: "text", headers: sessionHeaders() },
    });
  }
  private fitOffice() {
    const camera=this.cameras.main;
    camera.setViewport(0,0,960,640).setRoundPixels(true).setZoom(1).centerOn(480,320);
    this.fitCanvas();
  }
  private fitCanvas() {
    const factor=Math.max(1,Math.floor(Math.min(window.innerWidth/960,(window.innerHeight-240)/640)));
    const canvas=this.game.canvas;canvas.style.width=`${960*factor}px`;canvas.style.height=`${640*factor}px`;
    this.scale.updateBounds();this.scale.displayScale.set(1/factor,1/factor);
  }
  create() {
    for (let i = 0; i < 6; i++) {
      const key = `char_${i}`;
      if (!this.textures.exists(key)) continue;
      for (const [direction, start] of [
        ["down", 0],
        ["up", 7],
        ["right", 14],
      ] as const) {
        this.anims.create({
          key: `${key}-walk-${direction}`,
          frames: this.anims.generateFrameNumbers(key, {
            start,
            end: start + 2,
          }),
          frameRate: 8,
          repeat: -1,
        });
        this.anims.create({key:`${key}-work-${direction}`,frames:this.anims.generateFrameNumbers(key,{start:start+3,end:start+4}),frameRate:3,repeat:-1});
      }
    }
    this.drawCozyOffice();
    for(const [direction,row] of [['down',0],['left',1],['right',2],['up',3]] as const){
      this.anims.create({key:`cat-walk-${direction}`,frames:[0,1,2,1].map(i=>({key:'pixel-cat',frame:row*5+i})),frameRate:7,repeat:-1});
      this.anims.create({key:`cat-idle-${direction}`,frames:[0,3].map(i=>({key:'pixel-cat',frame:row*5+i})),frameRate:1,repeat:-1});
      this.anims.create({key:`cat-work-${direction}`,frames:[3,4].map(i=>({key:'pixel-cat',frame:row*5+i})),frameRate:3,repeat:-1});
    }
    this.time.addEvent({delay:650,loop:true,callback:()=>{for(const sprite of this.ambient?.sprites||[]){const type=sprite.getData('ambient');const a=type==='monitor'?TILE.monitor:type==='plant'?TILE.plant:TILE.steam;const b=type==='monitor'?TILE.monitorGlow:type==='plant'?TILE.plantSway:TILE.steamAlt;sprite.setFrame(sprite.frame.name===String(a)?b:a);}}});
    this.cameras.main.setBackgroundColor("#242335");
    this.fitOffice();
    const resize=()=>this.fitCanvas();window.addEventListener("resize",resize);
    this.events.once("shutdown",()=>window.removeEventListener("resize",resize));
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.moved = false;
      this.previous = { x: pointer.x, y: pointer.y };
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.dragging || !pointer.isDown) return;
      const dx = pointer.x - this.previous.x,
        dy = pointer.y - this.previous.y;
      if (Math.abs(dx) + Math.abs(dy) > 1) this.moved = true;
      this.cameras.main.scrollX -= dx / this.cameras.main.zoom;
      this.cameras.main.scrollY -= dy / this.cameras.main.zoom;
      this.previous = { x: pointer.x, y: pointer.y };
    });
    this.input.on("pointerup", () => {
      if (!this.moved && Date.now() - this.lastClick < 350) this.fitOffice();
      this.lastClick = this.moved ? 0 : Date.now();
      this.dragging = false;
    });
    this.input.on("gameout", () => {
      this.dragging = false;
    });
    this.input.on(
      "wheel",
      (
        pointer: Phaser.Input.Pointer,
        _objects: unknown,
        _dx: number,
        dy: number,
      ) => {
        const camera = this.cameras.main;
        const before = camera.getWorldPoint(pointer.x, pointer.y);
        camera.setZoom(Phaser.Math.Clamp(camera.zoom+(dy>0?-1:1),1,4));
        const after = camera.getWorldPoint(pointer.x, pointer.y);
        camera.scrollX += before.x - after.x;
        camera.scrollY += before.y - after.y;
      },
    );
    this.events.once("shutdown", () => {
      this.closing = true;
      this.stream?.close();
    });
    void this.connect();
  }
  private async connect() {
    this.stream = new EventSource("/api/office/events");
    this.stream.addEventListener("office", (event) => {
      if (this.closing) return;
      try {
        const state = JSON.parse((event as MessageEvent).data);
        const ids = new Set<string>();
        for (const agent of state.agents as AgentState[]) {
          ids.add(agent.id);
          if (!this.sprites.has(agent.id)) this.addAgent(agent, agent.id);
          this.agentUpdates.get(agent.id)?.(agent);
        }
        for (const id of this.sprites.keys())
          if (!ids.has(id)) {
            this.sprites.get(id)?.destroy();
            this.sprites.delete(id);
            this.agentUpdates.delete(id);
          }
        window.dispatchEvent(new Event("momo:room-ready"));
      } catch {
        console.warn(
          "Office frame was unavailable. Waiting for the next frame.",
        );
      }
    });
  }
  private addAgent(agent: AgentState, id: string) {
    if (this.sprites.has(id)) return;
    const hash = [...id].reduce((sum, c) => sum + c.charCodeAt(0), 0);
    const key = id === "momo" ? "pixel-cat" : `char_${hash % 6}`;
    const group = this.add.container(agent.x * 16, agent.y * 16).setDepth(1000+agent.y*16);
    const shadow = this.add.rectangle(0,3,12,3,0x273932,0.35);
    const character = this.add.sprite(0, -8, key, 0);

    const label=this.add.bitmapText(0,15,'pixel-font',agent.name,8).setTint(0xf6e2af).setOrigin(0.5);
    const work=this.add.bitmapText(12,-27,'pixel-font','*',8).setTint(0xffd36b).setVisible(false);
    const thought=this.add.bitmapText(0,-45,'pixel-font','',8).setTint(0xffe9b1).setMaxWidth(150).setOrigin(0.5,1).setVisible(false);
    const bubble=this.add.graphics().fillStyle(0x493424).fillRect(-80,-70,160,31).fillStyle(0xf8e4b5).fillRect(-78,-68,156,27).fillStyle(0x493424).fillRect(-3,-39,6,5).setVisible(false);
    thought.setPosition(-74,-65).setOrigin(0).setMaxWidth(148).setTint(0x362c24);
    group.add([shadow, character, label, work, bubble,thought]);
    group.setSize(32, 48).setInteractive();
    group.on("pointerover", () => {thought.setVisible(true);bubble.setVisible(true);});
    group.on("pointerout", () => {thought.setVisible(false);bubble.setVisible(false);});
    this.sprites.set(id, group);
    let previousX = agent.x,
      previousY = agent.y;
    this.agentUpdates.set(id, (next) => {
      agent = next;
      group.setDepth(1000+agent.y*16+2);
      this.tweens.killTweensOf(group);
      this.tweens.add({
        targets: group,
        x: agent.x * 16,
        y: agent.y * 16,
        duration: 230,
        onComplete: () => {if(id!=="momo"&&agent.action!=="work")character.stop();},
      });
      if (id !== "momo") {
        if (agent.x > previousX) {
          character.play(`${key}-walk-right`, true);
          character.setFlipX(false);
        } else if (agent.x < previousX) {
          character.play(`${key}-walk-right`, true);
          character.setFlipX(true);
        } else if (agent.y > previousY)
          character.play(`${key}-walk-down`, true);
        else if (agent.y < previousY) character.play(`${key}-walk-up`, true);
      }
      const direction=['up','down','left','right'].includes(agent.direction)?agent.direction:'down';
      const moving=agent.x!==previousX||agent.y!==previousY;
      if(id==='momo')character.play(`cat-${moving?'walk':agent.action==='work'?'work':'idle'}-${direction}`,true);
      else if(!moving){if(agent.action==='work'){character.setFlipX(direction==='left');character.play(`${key}-work-${direction==='left'?'right':direction}`,true);}else{character.stop();character.setFrame(direction==='up'?7:direction==='left'||direction==='right'?14:0);character.setFlipX(direction==='left');}}
      label.setText(agent.name);
      work.setVisible(agent.action === "work");
      thought.setText(agent.thought);
      previousX = agent.x;
      previousY = agent.y;
    });
  }
  private drawCozyOffice() {
    const layout=this.cache.json.get('office-layout');if(layout)this.ambient=buildTileOffice(this,layout);
  }

}
export function setupPhaser(parentId: string) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: parentId,
    width: 960,
    height: 640,
    render:{pixelArt:true,roundPixels:true,antialias:false,antialiasGL:false},
    backgroundColor: "#242335",
    scene: [OfficeScene],
    pixelArt: true,
    scale: { mode: Phaser.Scale.NONE },
    input: { keyboard: false },
  });
}
