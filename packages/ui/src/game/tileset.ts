import Phaser from "phaser";
// Single, swappable original tileset definition. Every cell is 16x16; no borrowed game art.
export const TILE = {
  dark: 0,
  wood: 1,
  woodAlt: 2,
  stone: 3,
  rug: 4,
  wall: 5,
  wallFace: 6,
  window: 7,
  door: 8,
  desk: 9,
  monitor: 10,
  monitorGlow: 11,
  book: 12,
  couch: 13,
  table: 14,
  counter: 15,
  sink: 16,
  coffee: 17,
  plant: 18,
  plantSway: 19,
  board: 20,
  lamp: 21,
  grass: 22,
  summer: 23,
  fall: 24,
  winter: 25,
  steam: 26,
  steamAlt: 27,
};
export function createTileset(scene: Phaser.Scene) {
  if (scene.textures.exists("office-tiles")) return;
  const texture = scene.textures.createCanvas("office-tiles", 128, 128)!;
  const ctx = texture.context;
  for (let tile = 0; tile < 64; tile++) {
    const x = (tile % 8) * 16,
      y = Math.floor(tile / 8) * 16;
    const r = (a: number, b: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x + a, y + b, w, h);
    };
    if (tile === 0) {
      r(0, 0, 16, 16, "#172728");
      continue;
    }
    if (tile === 1 || tile === 2) {
      r(0, 0, 16, 16, tile === 1 ? "#b47b45" : "#bf8950");
      r(0, 0, 16, 1, "#684627");
      r(0, 8, 16, 1, "#80572e");
      r(tile === 1 ? 4 : 11, 0, 1, 8, "#80572e");
      r(tile === 1 ? 11 : 3, 8, 1, 8, "#80572e");
      r(1, 2, 7, 1, "#d5a467");
      r(8, 11, 5, 1, "#d5a467");
      continue;
    }
    if (tile === 3) {
      r(0, 0, 16, 16, "#829080");
      r(0, 0, 16, 1, "#536b65");
      r(0, 0, 1, 16, "#536b65");
      r(3, 3, 4, 1, "#a9b39a");
      r(9, 10, 3, 1, "#a9b39a");
      continue;
    }
    if (tile === 4) {
      r(0, 0, 16, 16, "#647d60");
      r(3, 5, 1, 1, "#72906a");
      r(11, 12, 1, 1, "#587052");
      continue;
    }
    if (tile === 5 || tile === 6) {
      r(0, 0, 16, 16, "#d4bc89");
      r(0, 0, 16, 3, "#5a3b28");
      r(0, 3, 16, 2, "#b27d47");
      r(0, 14, 16, 2, "#714b2c");
      r(3, 6, 1, 7, "#c2a273");
      continue;
    }
    if (tile === 7 || tile === 28 || tile === 29 || tile === 30) {
      r(0, 0, 16, 16, "#67462e");
      r(2, 2, 12, 12, "#b8d6c0");
      r(3, 3, 10, 5, "#84b5c8");
      r(
        3,
        8,
        10,
        5,
        tile === 28
          ? "#53855a"
          : tile === 29
            ? "#bc864e"
            : tile === 30
              ? "#d3dfcd"
              : "#689465",
      );
      r(7, 1, 2, 14, "#e0c396");
      r(1, 7, 14, 2, "#e0c396");
      r(0, 14, 16, 2, "#c28e54");
      continue;
    }
    if (tile === 8) {
      r(0, 0, 16, 16, "#ad7c4a");
      r(0, 3, 16, 2, "#e1b875");
      r(0, 12, 16, 2, "#765532");
      continue;
    }
    if (tile === 14 || (tile >= 32 && tile <= 39)) {
      r(0, 0, 16, 16, "#ba854e");
      r(3, 6, 8, 1, "#c79556");
      r(8, 12, 5, 1, "#a77745");
      const top = [32, 36, 37].includes(tile),
        bottom = [33, 38, 39].includes(tile),
        left = [34, 36, 38].includes(tile),
        right = [35, 37, 39].includes(tile);
      if (top) {
        r(0, 0, 16, 2, "#503b2a");
        r(0, 2, 16, 2, "#e0b371");
      }
      if (bottom) r(0, 13, 16, 3, "#6a472e");
      if (left) r(0, 0, 2, 16, "#69482e");
      if (right) r(14, 0, 2, 16, "#69482e");
      continue;
    }
    if (tile === 9) {
      r(0, 0, 16, 16, "#b58550");
      r(0, 0, 16, 2, "#e0b371");
      r(0, 12, 16, 4, "#69482e");
      r(3, 7, 8, 1, "#c99b60");
      continue;
    }
    if ([15].includes(tile)) {
      r(0, 0, 16, 16, "#453629");
      r(1, 1, 14, 12, tile === 15 ? "#879889" : "#b9804a");
      r(2, 2, 12, 2, "#e4b36c");
      r(1, 12, 14, 2, "#754a30");
      r(2, 14, 2, 2, "#503a29");
      r(12, 14, 2, 2, "#503a29");
      continue;
    }
    if (tile === 10 || tile === 11) {
      r(1, 1, 14, 10, "#253c3d");
      r(3, 3, 10, 6, tile === 10 ? "#709c91" : "#a6d7bc");
      r(5, 4, 5, 1, "#d7ebbb");
      r(7, 11, 2, 2, "#514e3e");
      r(4, 13, 8, 1, "#d1c4a0");
      continue;
    }
    if (tile === 12) {
      r(0, 0, 16, 16, "#553c2b");
      r(1, 2, 14, 1, "#c68f52");
      r(1, 9, 14, 1, "#c68f52");
      ["#ac6850", "#708a77", "#d4af65", "#74929b"].forEach((c, i) => {
        r(2 + i * 3, 3, 2, 5, c);
        r(2 + i * 3, 10, 2, 5, c);
      });
      continue;
    }
    if (tile === 13) {
      r(0, 4, 16, 12, "#473f32");
      r(0, 1, 16, 11, "#577c65");
      r(1, 3, 14, 3, "#88a47d");
      r(2, 7, 12, 5, "#75966f");
      r(7, 7, 1, 5, "#476d5a");
      continue;
    }
    if (tile === 16) {
      r(1, 1, 14, 13, "#c5c9ae");
      r(3, 4, 10, 8, "#6e9690");
      r(5, 0, 5, 2, "#dadac1");
      r(9, 1, 2, 4, "#dadac1");
      continue;
    }
    if (tile === 17) {
      r(2, 3, 11, 12, "#344846");
      r(3, 1, 9, 4, "#c1b38a");
      r(4, 6, 7, 2, "#c58147");
      r(6, 9, 5, 4, "#f1d3a0");
      r(11, 10, 2, 2, "#f1d3a0");
      continue;
    }
    if (tile === 18 || tile === 19 || (tile >= 46 && tile <= 51)) {
      const sway = tile % 2 === 1;
      const winter = tile === 46 || tile === 47,
        fall = tile === 48 || tile === 49,
        summer = tile === 50 || tile === 51;
      const leaf = winter
        ? "#aebea0"
        : fall
          ? "#c28d4e"
          : summer
            ? "#609259"
            : "#80a45c";
      r(5, 10, 7, 5, "#a65d3d");
      r(4, 9, 9, 2, "#df9860");
      r(8, 3, 1, 8, "#4c7147");
      r(sway ? 3 : 2, 3, 7, 5, fall ? "#986e42" : "#507c4b");
      r(8, sway ? 2 : 1, 6, 5, leaf);
      r(5, 0, 6, 4, leaf);
      if (winter) r(5, 0, 6, 1, "#e5e9ce");
      continue;
    }
    if (tile === 20) {
      r(0, 0, 16, 16, "#744c2f");
      r(1, 1, 14, 12, "#e2d8b0");
      r(3, 4, 7, 1, "#6b8d79");
      r(3, 7, 10, 1, "#6b8d79");
      r(3, 10, 5, 1, "#b77657");
      continue;
    }
    if (tile === 21) {
      r(7, 5, 2, 8, "#504c36");
      r(3, 13, 10, 2, "#504c36");
      r(2, 3, 12, 4, "#f6d287");
      r(4, 1, 8, 2, "#c88e43");
      continue;
    }
    if (tile >= 22 && tile <= 25) {
      const colors = ["#7eaa67", "#527e59", "#ba794b", "#d1d9c0"];
      r(0, 0, 16, 16, colors[tile - 22]);
      r(2, 3, 2, 2, tile === 25 ? "#edf1dd" : "#d9bc78");
      r(10, 9, 3, 2, tile === 24 ? "#d8a35a" : "#9fb77b");
      continue;
    }
    if (tile === 40) {
      r(3, 3, 10, 9, "#4c3828");
      r(4, 2, 8, 8, "#8a5c3d");
      r(5, 3, 6, 6, "#a47d4f");
      r(3, 10, 2, 4, "#483929");
      r(11, 10, 2, 4, "#483929");
      continue;
    }
    if (tile >= 41 && tile <= 43) {
      r(0, 0, 16, 16, "#53745a");
      r(0, 1, 16, 2, "#90a47b");
      if (tile === 41) r(0, 0, 16, 2, "#3d523f");
      if (tile === 42) {
        r(0, 13, 16, 2, "#42614b");
        r(7, 4, 1, 7, "#64866b");
      }
      if (tile === 43) {
        r(0, 10, 16, 6, "#3d523f");
        r(3, 14, 2, 2, "#342d23");
      }
      continue;
    }
    if (tile === 26 || tile === 27) {
      r(tile === 26 ? 6 : 7, 3, 2, 4, "#e0d5af");
      r(tile === 26 ? 8 : 6, 7, 2, 3, "#c6c7aa");
    }
  }
  texture.refresh();
  scene.textures.addSpriteSheet("office-tiles", texture, {
    frameWidth: 16,
    frameHeight: 16,
  });
}
export function createCat(scene: Phaser.Scene) {
  if (scene.textures.exists("pixel-cat")) return;
  const texture = scene.textures.createCanvas("pixel-cat", 80, 96)!;
  const c = texture.context;
  for (let dir = 0; dir < 4; dir++)
    for (let frame = 0; frame < 5; frame++) {
      const x = frame * 16,
        y = dir * 24;
      const r = (a: number, b: number, w: number, h: number, color: string) => {
        c.fillStyle = color;
        c.fillRect(x + a, y + b, w, h);
      };
      const bob = frame === 1 ? 1 : 0;
      const tail = frame === 3 ? 2 : 0;
      r(3, 11 + bob, 10, 8, "#9e6336");
      r(4, 10 + bob, 8, 8, "#dfac65");
      r(2, 5 + bob, 12, 9, "#dfac65");
      r(2, 2 + bob, 4, 5, "#dfac65");
      r(10, 2 + bob, 4, 5, "#dfac65");
      r(3, 3 + bob, 2, 3, "#bd7d67");
      r(11, 3 + bob, 2, 3, "#bd7d67");
      r(dir === 1 ? 0 : 13, 12 + tail, 3, 5, "#bf864b");
      r(4, 19, 3, frame === 2 ? 1 : 2, "#f3dba0");
      r(10, 19, 3, frame === 1 ? 1 : 2, "#f3dba0");
      if (dir !== 3) {
        r(dir === 1 ? 3 : dir === 2 ? 11 : 5, 8 + bob, 2, 2, "#273a33");
        if (dir === 0) r(10, 8 + bob, 2, 2, "#273a33");
        r(dir === 1 ? 2 : dir === 2 ? 13 : 7, 11 + bob, 2, 1, "#855042");
        r(6, 13 + bob, 4, 2, "#f3dba0");
      } else {
        r(5, 7 + bob, 2, 4, "#b7793e");
        r(10, 7 + bob, 2, 4, "#b7793e");
      }
      if (frame === 4) r(5, 16, 6, 2, "#f3dba0");
    }
  texture.refresh();
  scene.textures.addSpriteSheet("pixel-cat", texture, {
    frameWidth: 16,
    frameHeight: 24,
  });
}
