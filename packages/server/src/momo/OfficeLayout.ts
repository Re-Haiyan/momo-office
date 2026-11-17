export interface Point {
  x: number;
  y: number;
}
export const officeLayout = {
  width: 960,
  height: 640,
  tileSize: 16,
  rooms: [
    {
      id: "meeting",
      name: "THE MEETING ROOM",
      x: 2,
      y: 5,
      w: 17,
      h: 12,
      color: 0xc6b7d0,
    },
    {
      id: "studio",
      name: "THE WORK STUDIO",
      x: 2,
      y: 20,
      w: 35,
      h: 18,
      color: 0xb5bcc7,
    },
    {
      id: "lounge",
      name: "THE LOUNGE",
      x: 41,
      y: 5,
      w: 17,
      h: 12,
      color: 0xb9c5ab,
    },
    {
      id: "library",
      name: "THE QUIET CORNER",
      x: 41,
      y: 19,
      w: 17,
      h: 7,
      color: 0xc2b6a6,
    },
    {
      id: "coffee",
      name: "COFFEE & KITCHEN",
      x: 41,
      y: 28,
      w: 17,
      h: 10,
      color: 0xcbb594,
    },
  ],
  desks: [
    { x: 28, y: 10 },
    ...Array.from({ length: 9 }, (_, i) => ({
      x: 7 + (i % 3) * 11,
      y: 23 + Math.floor(i / 3) * 6,
    })),
  ],
  meetingSeats: [
    { x: 7, y: 9 },
    { x: 7, y: 12 },
    { x: 10, y: 7 },
    { x: 13, y: 7 },
    { x: 15, y: 9 },
    { x: 15, y: 12 },
    { x: 10, y: 14 },
    { x: 13, y: 14 },
    { x: 6, y: 10 },
    { x: 16, y: 10 },
  ],
  loungeSeats: [
    { x: 44, y: 11 },
    { x: 48, y: 11 },
    { x: 52, y: 11 },
  ],
  coffeeSeats: [
    { x: 45, y: 34 },
    { x: 52, y: 34 },
    { x: 47, y: 36 },
    { x: 50, y: 36 },
  ],
  readingSeats: [
    { x: 44, y: 22 },
    { x: 48, y: 22 },
    { x: 52, y: 22 },
  ],
};
// Visual placement and collision rectangles are shared with the renderer.
export const furniture = [
  { id: "conference", kind: "table", x: 8, y: 9, w: 6, h: 4 },
  { id: "books", kind: "bookshelf", x: 55, y: 20, w: 3, h: 5 },
  { id: "sofa", kind: "couch", x: 43, y: 7, w: 13, h: 3 },
  { id: "lounge-table", kind: "table", x: 47, y: 13, w: 5, h: 2 },
  { id: "kitchen-counter", kind: "counter", x: 43, y: 29, w: 13, h: 2 },
  { id: "coffee-table", kind: "table", x: 46, y: 33, w: 6, h: 3 },
  ...officeLayout.desks.map((d, i) => ({
    id: `desk-${i}`,
    kind: "desk",
    x: d.x - 2,
    y: d.y - 2,
    w: 5,
    h: 1,
  })),
];
export const walls = [
  { x: 2, y: 5, w: 18, h: 1 },
  { x: 2, y: 5, w: 1, h: 13 },
  { x: 19, y: 5, w: 1, h: 13 },
  { x: 2, y: 17, w: 7, h: 1 },
  { x: 11, y: 17, w: 9, h: 1 },
  { x: 41, y: 19, w: 18, h: 1 },
  { x: 41, y: 19, w: 1, h: 8 },
  { x: 58, y: 19, w: 1, h: 8 },
  { x: 41, y: 26, w: 7, h: 1 },
  { x: 50, y: 26, w: 9, h: 1 },
];
export const decorations = [
  { kind: "window", x: 5, y: 3 },
  { kind: "window", x: 27, y: 3 },
  { kind: "window", x: 46, y: 3 },
  { kind: "whiteboard", x: 9, y: 5 },
  { kind: "coffee", x: 44, y: 29 },
  { kind: "sink", x: 53, y: 29 },
  { kind: "plant", x: 1, y: 6 },
  { kind: "plant", x: 1, y: 36 },
  { kind: "plant", x: 59, y: 7 },
  { kind: "plant", x: 59, y: 35 },
];
export const visualLayout = { ...officeLayout, furniture, walls, decorations };
const blocked = new Set<string>();
const block = (x: number, y: number, w: number, h: number) => {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) blocked.add(`${xx},${yy}`);
};
// The same rectangles drive tile art and pathfinding. Door gaps remain open.
for (const area of [...walls, ...furniture])
  block(area.x, area.y, area.w, area.h);
export function walkable(point: Point) {
  return (
    point.x >= 1 &&
    point.x <= 58 &&
    point.y >= 4 &&
    point.y <= 38 &&
    !blocked.has(`${point.x},${point.y}`)
  );
}
export function findOfficePath(from: Point, to: Point): Point[] {
  if (!walkable(from) || !walkable(to)) return [];
  const key = (p: Point) => `${p.x},${p.y}`;
  const queue: Point[] = [from],
    previous = new Map<string, Point | null>([[key(from), null]]);
  for (let head = 0; head < queue.length; head++) {
    const point = queue[head];
    if (point.x === to.x && point.y === to.y) {
      const route: Point[] = [];
      let current: Point | null = point;
      while (current && key(current) !== key(from)) {
        route.unshift(current);
        current = previous.get(key(current)) || null;
      }
      return route;
    }
    for (const next of [
      { x: point.x + 1, y: point.y },
      { x: point.x - 1, y: point.y },
      { x: point.x, y: point.y + 1 },
      { x: point.x, y: point.y - 1 },
    ]) {
      if (walkable(next) && !previous.has(key(next))) {
        previous.set(key(next), point);
        queue.push(next);
      }
    }
  }
  return [];
}
