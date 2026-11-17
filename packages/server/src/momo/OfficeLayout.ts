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
const blocked = new Set<string>();
const block = (x: number, y: number, w: number, h: number) => {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) blocked.add(`${xx},${yy}`);
};
// Glass partitions have real door gaps; desks and tables are not walk-through.
block(2, 5, 18, 1);
block(2, 5, 1, 13);
block(19, 5, 1, 13);
block(2, 17, 7, 1);
block(11, 17, 9, 1);
block(8, 9, 6, 4);
block(41, 19, 18, 1);
block(41, 19, 1, 8);
block(58, 19, 1, 8);
block(41, 26, 7, 1);
block(50, 26, 9, 1);
block(55, 20, 3, 5);
block(43, 7, 13, 3);
block(47, 13, 5, 2);
block(43, 29, 13, 2);
block(46, 33, 6, 3);
for (const desk of officeLayout.desks) block(desk.x - 2, desk.y - 2, 5, 1);
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
