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
    this.load.image("momo-cat", "/momo-icon.png");
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
      }
    }
    this.drawCozyOffice();
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
    const key = id === "momo" ? "momo-cat" : `char_${hash % 6}`;
    const group = this.add.container(agent.x * 16, agent.y * 16).setDepth(5);
    const shadow = this.add.ellipse(0, 4, 18, 7, 0x393044, 0.18);
    const character = this.add.sprite(0, -8, key, 0);
    if (id === "momo") character.setDisplaySize(31, 31);
    const label=this.add.bitmapText(0,15,'pixel-font',agent.name,8).setTint(0xf6e2af).setOrigin(0.5);
    const work=this.add.bitmapText(12,-27,'pixel-font','*',8).setTint(0xffd36b).setVisible(false);
    const thought=this.add.bitmapText(0,-45,'pixel-font','',8).setTint(0xffe9b1).setMaxWidth(150).setOrigin(0.5,1).setVisible(false);
    group.add([shadow, character, label, work, thought]);
    group.setSize(32, 48).setInteractive();
    group.on("pointerover", () => thought.setVisible(true));
    group.on("pointerout", () => thought.setVisible(false));
    this.sprites.set(id, group);
    let previousX = agent.x,
      previousY = agent.y;
    this.agentUpdates.set(id, (next) => {
      agent = next;
      this.tweens.killTweensOf(group);
      this.tweens.add({
        targets: group,
        x: agent.x * 16,
        y: agent.y * 16,
        duration: 230,
        onComplete: () => character.stop(),
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
      label.setText(agent.name);
      work.setVisible(agent.action === "work");
      thought.setText(agent.thought);
      previousX = agent.x;
      previousY = agent.y;
    });
  }
  private drawCozyOffice() {
    const layout = this.cache.json.get("office-layout");
    if (!layout) return;
    const g = this.add.graphics();
    g.fillStyle(0x181624, 0.35);
    g.fillRoundedRect(6, 13, 960, 632, 12);
    g.fillStyle(0xbda695);
    g.fillRoundedRect(0, 0, 960, 632, 10);
    g.fillStyle(0xcbb8a4);
    g.fillRect(12, 48, 936, 568);
    for (let y = 48; y < 616; y += 28)
      for (let x = 12; x < 948; x += 78) {
        g.lineStyle(1, 0xa88f7f, 0.28);
        g.strokeRect(x, y, Math.min(77, 948 - x), 28);
        g.lineStyle(1, 0xf4dfc1, 0.18);
        g.lineBetween(x + 5, y + 11, Math.min(x + 65, 946), y + 11);
      }
    g.fillStyle(0xebe0ce);
    g.fillRoundedRect(0, 0, 960, 53, 10);
    g.fillStyle(0x9d8a7a);
    g.fillRect(0, 46, 960, 8);
    const window = (x: number) => {
      g.fillStyle(0x8f9f9b);
      g.fillRoundedRect(x, 8, 108, 35, 3);
      g.fillStyle(0xc2d9cb);
      g.fillRect(x + 4, 12, 100, 27);
      g.fillStyle(0xe6eee0);
      g.fillTriangle(x + 5, 13, x + 45, 13, x + 5, 38);
      g.fillStyle(0xeee2cb);
      g.fillRect(x + 52, 10, 4, 32);
      g.fillStyle(0x9d8a7a);
      g.fillRect(x - 3, 41, 114, 5);
    };
    window(80);
    window(422);
    window(770);
    const text = (
      x: number,
      y: number,
      label: string,
      color = "#766478",
      size = "8px",
    ) => this.add.bitmapText(x,y,"pixel-font",label,8).setTint(Number(color.replace("#","0x"))).setOrigin(0.5);
    const plant = (x: number, y: number) => {
      g.fillStyle(0x665147, 0.15);
      g.fillEllipse(x + 2, y + 9, 23, 10);
      g.fillStyle(0xc48c76);
      g.fillRoundedRect(x - 7, y - 1, 14, 14, 3);
      g.fillStyle(0x799a76);
      g.fillEllipse(x - 4, y - 12, 14, 20);
      g.fillEllipse(x + 6, y - 10, 13, 19);
      g.fillStyle(0x91af85);
      g.fillEllipse(x, y - 17, 13, 19);
    };
    for (const room of layout.rooms) {
      const x = room.x * 16,
        y = room.y * 16,
        w = room.w * 16,
        h = room.h * 16;
      g.fillStyle(room.color);
      g.fillRoundedRect(x, y, w, h, 12);
      g.lineStyle(2, 0xf6ebde, 0.45);
      g.strokeRoundedRect(x + 5, y + 5, w - 10, h - 10, 9);
      text(x + w / 2, y + h - 13, room.name);
    }
    // The meeting room and reading room have glass walls with open doors.
    const glass = (x: number, y: number, w: number, h: number) => {
      g.fillStyle(0x5e6575, 0.12);
      g.fillRect(x + 4, y + 5, w, h);
      g.fillStyle(0xe0e9e0, 0.42);
      g.fillRect(x, y, w, h);
      g.lineStyle(1, 0x7b8e8f, 0.8);
      g.strokeRect(x, y, w, h);
    };
    glass(32, 80, 280, 5);
    glass(32, 80, 5, 196);
    glass(306, 80, 6, 196);
    glass(32, 272, 112, 5);
    glass(176, 272, 136, 5);
    text(160, 69, "MEET • PLAN • HAND OFF", "#b7a3c5", "7px");
    // Conference table, individual chairs and a whiteboard.
    g.fillStyle(0x99785e);
    g.fillRoundedRect(128, 146, 96, 68, 10);
    g.fillStyle(0xd5b490);
    g.fillRoundedRect(128, 140, 96, 66, 10);
    g.fillStyle(0xf3e5cf);
    g.fillRoundedRect(151, 164, 22, 15, 2);
    g.fillRoundedRect(183, 180, 20, 12, 2);
    g.lineStyle(1, 0xaca19b);
    g.lineBetween(155, 168, 168, 168);
    g.lineBetween(155, 172, 166, 172);
    for (const seat of layout.meetingSeats) {
      g.fillStyle(0x9783a5);
      g.fillRoundedRect(seat.x * 16 - 7, seat.y * 16 - 1, 15, 13, 4);
    }
    g.fillStyle(0x9c8b83);
    g.fillRoundedRect(99, 91, 130, 28, 3);
    g.fillStyle(0xf3ebdb);
    g.fillRect(103, 94, 122, 21);
    g.lineStyle(2, 0xa89abc);
    g.lineBetween(114, 101, 149, 101);
    g.lineBetween(161, 101, 213, 101);
    // Workstations, including Momo's central coordination desk.
    const desk = (x: number, y: number, color: number) => {
      g.fillStyle(0x746355, 0.2);
      g.fillRoundedRect(x - 28, y - 31, 75, 44, 6);
      g.fillStyle(0x95765e);
      g.fillRoundedRect(x - 31, y - 36, 76, 31, 4);
      g.fillStyle(0xdfc3a0);
      g.fillRoundedRect(x - 31, y - 40, 76, 31, 4);
      g.fillStyle(0x5f5a69);
      g.fillRoundedRect(x - 17, y - 37, 27, 18, 2);
      g.fillStyle(0xb5c9d4);
      g.fillRect(x - 14, y - 34, 21, 12);
      g.fillStyle(0xf2e5bf);
      g.fillRect(x - 10, y - 31, 12, 2);
      g.fillStyle(0x8e7c71);
      g.fillRect(x - 6, y - 19, 5, 4);
      g.fillStyle(0xeee4d5);
      g.fillRoundedRect(x - 16, y - 14, 25, 5, 1);
      g.fillStyle(color);
      g.fillCircle(x + 27, y - 22, 5);
      g.lineStyle(2, color);
      g.strokeCircle(x + 32, y - 22, 3);
      g.fillStyle(0x847387);
      g.fillRoundedRect(x - 9, y - 1, 19, 14, 4);
      g.fillStyle(color);
      g.fillRoundedRect(x - 7, y + 1, 15, 8, 3);
    };
    g.fillStyle(0xc2adbf);
    g.fillRoundedRect(381, 89, 148, 112, 18);
    for (let i = 0; i < layout.desks.length; i++)
      desk(
        layout.desks[i].x * 16,
        layout.desks[i].y * 16,
        [
          0xc79b75, 0x94ae92, 0x98a9d0, 0xc5a0bf, 0xaea1ce, 0xcda77f, 0x9aafa7,
          0xc0a0a4, 0x95a7be, 0xb9ad88,
        ][i],
      );
    text(450, 77, "MOMO’S DESK", "#b7a3c5");
    // Lounge couch and low coffee table.
    g.fillStyle(0x718b76);
    g.fillRoundedRect(688, 112, 208, 47, 8);
    g.fillStyle(0x99b18f);
    g.fillRoundedRect(696, 118, 192, 31, 5);
    g.lineStyle(1, 0x718b76);
    g.lineBetween(758, 118, 758, 149);
    g.lineBetween(824, 118, 824, 149);
    g.fillStyle(0xbda27f);
    g.fillRoundedRect(752, 210, 80, 28, 8);
    g.fillStyle(0xece0c3);
    g.fillCircle(775, 221, 5);
    g.fillStyle(0x927ea9);
    g.fillRoundedRect(796, 216, 17, 12, 1);
    // Reading room with a wall of books and three quiet chairs.
    glass(656, 304, 280, 5);
    glass(656, 304, 5, 117);
    glass(928, 304, 6, 117);
    glass(656, 416, 112, 5);
    glass(800, 416, 134, 5);
    g.fillStyle(0x96775e);
    g.fillRoundedRect(880, 320, 40, 77, 3);
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 5; i++) {
        g.fillStyle([0xb592a7, 0x8da694, 0xc9a97b, 0x9b9dc0][i % 4]);
        g.fillRect(884 + i * 6, 328 + row * 32, 5, 21 - (i % 3) * 2);
      }
      g.fillStyle(0x765f4f);
      g.fillRect(882, 352 + row * 32, 36, 4);
    }
    for (const seat of layout.readingSeats) {
      g.fillStyle(0x968ca6);
      g.fillRoundedRect(seat.x * 16 - 13, seat.y * 16 - 9, 27, 27, 8);
      g.fillStyle(0xb6a8c4);
      g.fillRoundedRect(seat.x * 16 - 10, seat.y * 16 - 5, 21, 19, 6);
    }
    // Kitchen counters, coffee machine, sink and a shared lunch table.
    g.fillStyle(0x977d61);
    g.fillRoundedRect(688, 464, 208, 33, 3);
    g.fillStyle(0xe2ceb0);
    g.fillRect(689, 462, 206, 24);
    g.fillStyle(0x69636d);
    g.fillRoundedRect(701, 448, 26, 28, 4);
    g.fillStyle(0xb2c8b8);
    g.fillRect(705, 453, 18, 10);
    g.fillStyle(0xf0e2c5);
    g.fillCircle(713, 474, 4);
    g.fillStyle(0xabb9bb);
    g.fillRoundedRect(751, 466, 32, 16, 3);
    g.lineStyle(2, 0x7d8c90);
    g.strokeCircle(766, 466, 6);
    g.fillStyle(0xb9b4aa);
    g.fillRoundedRect(865, 440, 28, 43, 3);
    g.lineStyle(1, 0x88827e);
    g.lineBetween(867, 456, 891, 456);
    g.fillStyle(0xa78664);
    g.fillRoundedRect(736, 533, 96, 40, 9);
    g.fillStyle(0xd4b38b);
    g.fillRoundedRect(736, 528, 96, 39, 9);
    g.fillStyle(0xe7d8b6);
    g.fillCircle(758, 541, 6);
    g.fillCircle(804, 552, 6);
    g.fillStyle(0x8da483);
    g.fillEllipse(784, 546, 13, 8);
    for (const seat of layout.coffeeSeats) {
      g.fillStyle(0xa88f78);
      g.fillCircle(seat.x * 16, seat.y * 16 + 2, 8);
    }
    // Reception bench, house plants and a small noticeboard along the hall.
    g.fillStyle(0x8f7c99);
    g.fillRoundedRect(396, 239, 120, 30, 7);
    g.fillStyle(0xb3a0ba);
    g.fillRoundedRect(402, 242, 108, 18, 5);
    text(456, 290, "SMALL TEAM. BIG IDEAS.", "#8c756f", "7px");
    plant(25, 74);
    plant(340, 90);
    plant(582, 89);
    plant(940, 81);
    plant(620, 316);
    plant(24, 606);
    plant(625, 600);
    plant(940, 607);
    plant(845, 346);
    text(480, 618, "MOMO OFFICE", "#887466", "7px");
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
