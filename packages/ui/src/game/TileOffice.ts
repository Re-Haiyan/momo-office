import Phaser from "phaser";
import { TILE, createTileset, createCat } from "./tileset";
export type Ambient = {
  sprites: Phaser.GameObjects.Sprite[];
  windows: Phaser.GameObjects.Image[];
  lamps: Phaser.GameObjects.Rectangle[];
};
export function buildTileOffice(scene: Phaser.Scene, layout: any): Ambient {
  createTileset(scene);
  createCat(scene);
  const floor = Array.from({ length: 40 }, (_, y) =>
    Array.from({ length: 60 }, (_, x) =>
      x === 0 || x === 59 || y < 4 || y === 39
        ? TILE.dark
        : (x + y) % 3 === 0
          ? TILE.woodAlt
          : TILE.wood,
    ),
  );
  for (const room of layout.rooms)
    for (let y = room.y; y < room.y + room.h; y++)
      for (let x = room.x; x < room.x + room.w; x++)
        floor[y][x] =
          room.id === "coffee"
            ? TILE.stone
            : room.id === "meeting" || room.id === "lounge"
              ? TILE.rug
              : TILE.wood;
  for (const wall of layout.walls)
    for (let y = wall.y; y < wall.y + wall.h; y++)
      for (let x = wall.x; x < wall.x + wall.w; x++) floor[y][x] = TILE.wall;
  for (const room of layout.rooms) {
    const y = room.y + room.h;
    for (let x = room.x; x <= room.x + room.w; x++)
      if (floor[y]?.[x] !== undefined && floor[y][x] !== TILE.wall)
        floor[y][x] = TILE.door;
  }
  const map = scene.make.tilemap({
    data: floor,
    tileWidth: 16,
    tileHeight: 16,
  });
  const tiles = map.addTilesetImage(
    "office-tiles",
    "office-tiles",
    16,
    16,
    0,
    0,
  )!;
  const layer = map.createLayer(0, tiles, 0, 0)!.setDepth(0);
  scene.add.renderTexture(0, 0, 960, 640).setOrigin(0).setDepth(0).draw(layer);
  layer.setVisible(false);
  const ambient: Ambient = { sprites: [], windows: [], lamps: [] };
  const tile = (x: number, y: number, index: number, depth: number) =>
    scene.add
      .image(x * 16, y * 16, "office-tiles", index)
      .setOrigin(0)
      .setDepth(depth);
  for (const f of layout.furniture) {
    const index =
      f.kind === "desk"
        ? TILE.desk
        : f.kind === "bookshelf"
          ? TILE.book
          : f.kind === "couch"
            ? TILE.couch
            : f.kind === "counter"
              ? TILE.counter
              : TILE.table;
    const depth = 1000 + (f.y + f.h) * 16;
    const cached = scene.add
      .renderTexture(f.x * 16, f.y * 16, f.w * 16, f.h * 16)
      .setOrigin(0)
      .setDepth(depth);
    const stamp = scene.make
      .image({ key: "office-tiles", add: false })
      .setOrigin(0);
    for (let y = 0; y < f.h; y++)
      for (let x = 0; x < f.w; x++) {
        let frame = index;
        if (f.kind === "table") {
          frame =
            y === 0
              ? x === 0
                ? 36
                : x === f.w - 1
                  ? 37
                  : 32
              : y === f.h - 1
                ? x === 0
                  ? 38
                  : x === f.w - 1
                    ? 39
                    : 33
                : x === 0
                  ? 34
                  : x === f.w - 1
                    ? 35
                    : 14;
        }
        if (f.kind === "couch") frame = y === 0 ? 41 : y === f.h - 1 ? 43 : 42;
        stamp.setFrame(frame).setPosition(x * 16, y * 16);
        cached.draw(stamp);
      }
    stamp.destroy();
    if (f.kind === "desk") {
      const monitor = scene.add
        .sprite((f.x + 2) * 16, (f.y - 1) * 16, "office-tiles", TILE.monitor)
        .setOrigin(0)
        .setDepth(depth + 1);
      ambient.sprites.push(monitor);
      monitor.setData("ambient", "monitor");
      tile(f.x + 4, f.y - 1, TILE.lamp, depth + 2);
      ambient.lamps.push(
        scene.add
          .rectangle(
            (f.x + 4) * 16 + 8,
            (f.y - 1) * 16 + 8,
            40,
            32,
            0xffca77,
            0,
          )
          .setDepth(5001)
          .setBlendMode(Phaser.BlendModes.ADD),
      );
    }
  }
  for (const seat of [
    ...layout.desks,
    ...layout.meetingSeats,
    ...layout.loungeSeats,
    ...layout.coffeeSeats,
    ...layout.readingSeats,
  ])
    scene.add.image(seat.x * 16, seat.y * 16, "office-tiles", 40).setDepth(2);
  for (const d of layout.decorations) {
    const index =
      d.kind === "whiteboard"
        ? TILE.board
        : ((TILE as any)[d.kind] ?? TILE.plant);
    const depth = 1000 + (d.y + 1) * 16;
    if (d.kind === "window") {
      for (let i = 0; i < 4; i++) {
        ambient.windows.push(tile(d.x + i, d.y, TILE.window, depth));
        ambient.lamps.push(
          scene.add
            .rectangle((d.x + i) * 16 + 8, d.y * 16 + 8, 16, 22, 0xffc36e, 0)
            .setDepth(5001)
            .setBlendMode(Phaser.BlendModes.ADD),
        );
      }
    } else if (d.kind === "plant") {
      const plant = scene.add
        .sprite(d.x * 16, d.y * 16, "office-tiles", index)
        .setOrigin(0)
        .setDepth(depth);
      plant.setData("ambient", "plant");
      ambient.sprites.push(plant);
    } else {
      tile(d.x, d.y, index, depth);
      if (d.kind === "coffee") {
        const steam = scene.add
          .sprite(d.x * 16, (d.y - 1) * 16, "office-tiles", TILE.steam)
          .setOrigin(0)
          .setDepth(depth + 1);
        steam.setData("ambient", "steam");
        ambient.sprites.push(steam);
      }
    }
  }
  for (const room of layout.rooms)
    scene.add
      .bitmapText(
        room.x * 16 + 16,
        room.y * 16 + 18,
        "pixel-font",
        room.name,
        8,
      )
      .setTint(0xf4e1b0)
      .setDepth(3000);
  return ambient;
}
