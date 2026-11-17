import Phaser from "phaser";
import { getDisplay, reducedMotion, seasonFor, daylight } from "../display";
import { Ambient } from "./TileOffice";
import { TILE } from "./tileset";
export class Atmosphere {
  private shade: Phaser.GameObjects.Rectangle;
  private clock: Phaser.GameObjects.BitmapText;
  private particles: Phaser.GameObjects.Rectangle[] = [];
  private homes: { x: number; y: number }[] = [];
  private timer: Phaser.Time.TimerEvent;
  private activeWeather = false;
  private weatherMode = "off";
  private refresh = () => this.apply();
  private motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  constructor(
    private scene: Phaser.Scene,
    private ambient: Ambient,
  ) {
    this.shade = scene.add
      .rectangle(480, 320, 960, 640, 0x193754, 0)
      .setDepth(5000);
    this.clock = scene.add
      .bitmapText(24, 16, "pixel-font", "", 8)
      .setTint(0xf7d996)
      .setDepth(6000);
    for (let i = 0; i < 24 && ambient.windows.length > 0; i++) {
      const window = ambient.windows[i % ambient.windows.length];
      const home = { x: window.x + 4 + (i % 2) * 5, y: window.y + 3 };
      this.homes.push(home);
      this.particles.push(
        scene.add
          .rectangle(home.x, home.y + (i % 4) * 2, 1, 3, 0xb5d1bd)
          .setDepth(4500)
          .setVisible(false),
      );
    }
    this.timer = scene.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => this.apply(),
    });
    const weather = scene.time.addEvent({
      delay: 80,
      loop: true,
      callback: () => {
        if (!this.activeWeather) return;
        const leaves = this.weatherMode === "leaves";
        for (let i = 0; i < this.particles.length; i++) {
          const p = this.particles[i],
            home = this.homes[i];
          p.y += leaves ? 1 : 2;
          if (leaves) p.x += 1;
          if (p.y > home.y + 9) p.y = home.y;
          if (p.x > home.x + 4) p.x = home.x;
        }
      },
    });
    window.addEventListener("momo:display", this.refresh);
    this.motion.addEventListener("change", this.refresh);
    this.apply();
    scene.events.once("shutdown", () => {
      window.removeEventListener("momo:display", this.refresh);
      this.motion.removeEventListener("change", this.refresh);
      this.timer.remove();
      weather.remove();
    });
  }
  private apply() {
    const date = new Date(),
      light = daylight(date),
      prefs = getDisplay(),
      season = prefs.season === "auto" ? seasonFor(date) : prefs.season;
    this.shade.setFillStyle(light.color, light.alpha);
    this.clock.setText(
      `${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} / ${season.toUpperCase()}`,
    );
    for (const window of this.ambient.windows)
      window.setFrame(
        season === "summer"
          ? 28
          : season === "fall"
            ? 29
            : season === "winter"
              ? 30
              : TILE.window,
      );
    for (const lamp of this.ambient.lamps)
      lamp.setAlpha(light.night ? 0.22 : 0);
    for (const sprite of this.ambient.sprites)
      if (sprite.getData("ambient") === "plant") {
        const base =
          season === "winter"
            ? 46
            : season === "fall"
              ? 48
              : season === "summer"
                ? 50
                : TILE.plant;
        if (sprite.getData("baseFrame") !== base) {
          sprite.setData("baseFrame", base);
          sprite.setFrame(base);
        }
      }
    const active = prefs.weather !== "off" && !reducedMotion();
    this.activeWeather = active;
    this.weatherMode = prefs.weather;
    for (const p of this.particles)
      p.setVisible(active)
        .setFillStyle(
          prefs.weather === "rain"
            ? 0xb6d9dc
            : season === "fall"
              ? 0xd89d51
              : 0xa5b76c,
        )
        .setSize(
          prefs.weather === "rain" ? 1 : 2,
          prefs.weather === "rain" ? 3 : 2,
        );
    this.scene.game.canvas.dataset.fps = String(
      Math.round(this.scene.game.loop.actualFps),
    );
    this.scene.game.canvas.dataset.weatherActive = String(active);
    this.scene.game.canvas.dataset.season = season;
    this.scene.game.canvas.dataset.reducedMotion = String(reducedMotion());
  }
}
