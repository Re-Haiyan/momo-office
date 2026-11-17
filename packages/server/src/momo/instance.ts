import path from "path";
import { MomoEngine } from "./Engine";
export const momo = new MomoEngine(
  path.resolve(process.env.MOMO_DATA_DIR || "./data/momo"),
);
