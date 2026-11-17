import type { IncomingMessage } from "http";
import { timingSafeEqual } from "crypto";
export function sameToken(left: unknown, right: string) {
  if (typeof left !== "string") return false;
  const a = Buffer.from(left),
    b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function requestToken(req: IncomingMessage) {
  const header = req.headers["x-momo-token"];
  if (typeof header === "string") return header;
  const cookie = req.headers.cookie
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("momo-session="));
  return cookie?.slice("momo-session=".length);
}
export function checkRequest(
  req: IncomingMessage,
  token: string,
  requireToken = true,
  dev = false,
): number {
  const host = req.headers.host || "";
  const port = req.socket.localPort;
  if (
    ![
      `127.0.0.1:${port}`,
      `localhost:${port}`,
      ...(dev ? ["localhost:5173", "127.0.0.1:5173"] : []),
    ].includes(host)
  )
    return 403;
  const origin = req.headers.origin;
  if (
    origin &&
    ![
      `http://${host}`,
      ...(dev ? ["http://localhost:5173", "http://127.0.0.1:5173"] : []),
    ].includes(origin)
  )
    return 403;
  const authenticated = sameToken(requestToken(req), token);
  if (requireToken && !authenticated) return 401;
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method || "GET") &&
    !origin &&
    !authenticated
  )
    return 403;
  return 0;
}
