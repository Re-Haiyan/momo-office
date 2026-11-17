import path from "path";
import { MomoEngine } from "./Engine";
import { Secrets } from "./providers/secrets";
export const momoSecrets = new Secrets();
export let momo: MomoEngine;
export async function initializeMomo() {
  await momoSecrets.refresh();
  momo = new MomoEngine(
    path.resolve(process.env.MOMO_DATA_DIR || "./data/momo"),
    undefined,
    undefined,
    momoSecrets,
  );
}
