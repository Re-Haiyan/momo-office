import fs from "fs";
import path from "path";
export function isNewerVersion(current: string, candidate: string) {
  const parse = (v: string) =>
    /^v?\d+\.\d+\.\d+$/.test(v)
      ? v.replace(/^v/, "").split(".").map(Number)
      : null;
  const a = parse(current),
    b = parse(candidate);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (b[i] !== a[i]) return b[i] > a[i];
  }
  return false;
}
let cached: { at: number; value: any } | undefined;
export async function checkForUpdates() {
  if (cached && Date.now() - cached.at < 1800000) return cached.value;
  const version = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../../../../package.json"),
      "utf8",
    ),
  ).version;
  try {
    const r = await fetch(
      "https://api.github.com/repos/Re-Haiyan/momo-office/releases/latest",
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "Momo-Office-update-check",
        },
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!r.ok) throw new Error("Unavailable");
    const data = await r.json();
    const tag = String(data.tag_name || "");
    if (!/^v?\d+\.\d+\.\d+$/.test(tag)) throw new Error("Invalid release");
    const value = {
      current: version,
      latest: tag,
      available: isNewerVersion(version, tag),
      url: `https://github.com/Re-Haiyan/momo-office/releases/tag/${tag}`,
    };
    cached = { at: Date.now(), value };
    return value;
  } catch {
    return {
      current: version,
      available: false,
      error:
        "Update check unavailable. You can check the GitHub Releases page manually.",
    };
  }
}
