import { useEffect, useState } from "react";
export type Season = "spring" | "summer" | "fall" | "winter";
export type DisplayPrefs = {
  weather: "off" | "rain" | "leaves";
  season: "auto" | Season;
  pixelCursor: boolean;
  highContrast: boolean;
  uiScale: 1 | 2 | 3;
};
const defaults: DisplayPrefs = {
  weather: "off",
  season: "auto",
  pixelCursor: true,
  highContrast: false,
  uiScale: 1,
};
const validate = (v: any): DisplayPrefs => ({
  uiScale: [1, 2, 3].includes(v?.uiScale) ? v.uiScale : 1,
  weather: ["off", "rain", "leaves"].includes(v?.weather) ? v.weather : "off",
  pixelCursor: v?.pixelCursor !== false,
  highContrast: v?.highContrast === true,
  season: ["auto", "spring", "summer", "fall", "winter"].includes(v?.season)
    ? v.season
    : "auto",
});
let current = { ...defaults };
try {
  current = validate(JSON.parse(localStorage.getItem("momo-display") || "{}"));
} catch {}
export const getDisplay = () => ({ ...current });
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
export const reducedMotion = () => motionPreference.matches;
export function setDisplay(patch: Partial<DisplayPrefs>) {
  current = validate({ ...current, ...patch });
  try {
    localStorage.setItem("momo-display", JSON.stringify(current));
  } catch {}
  window.dispatchEvent(
    new CustomEvent("momo:display", { detail: getDisplay() }),
  );
}
export function useDisplay() {
  const [prefs, setPrefs] = useState(getDisplay);
  const [reduced, setReduced] = useState(reducedMotion);
  useEffect(() => {
    const update = () => setPrefs(getDisplay());
    const motion = motionPreference;
    const change = () => setReduced(motion.matches);
    window.addEventListener("momo:display", update);
    motion.addEventListener("change", change);
    return () => {
      window.removeEventListener("momo:display", update);
      motion.removeEventListener("change", change);
    };
  }, []);
  return { prefs, reduced };
}
export function seasonFor(date = new Date()): Season {
  const m = date.getMonth();
  return m >= 2 && m <= 4
    ? "spring"
    : m >= 5 && m <= 7
      ? "summer"
      : m >= 8 && m <= 10
        ? "fall"
        : "winter";
}
export function daylight(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const stops = [
    { h: 0, c: 0x193754, a: 0.32 },
    { h: 6, c: 0xdba16b, a: 0.13 },
    { h: 12, c: 0xffedc7, a: 0 },
    { h: 17, c: 0xda814f, a: 0.15 },
    { h: 21, c: 0x193754, a: 0.32 },
    { h: 24, c: 0x193754, a: 0.32 },
  ];
  const i = stops.findIndex(
    (s, index) =>
      index < stops.length - 1 && h >= s.h && h < stops[index + 1].h,
  );
  const a = stops[Math.max(0, i)],
    b = stops[Math.max(0, i) + 1];
  const t = (h - a.h) / (b.h - a.h);
  let c = 0;
  for (const shift of [16, 8, 0])
    c |=
      Math.round(
        ((a.c >> shift) & 255) * (1 - t) + ((b.c >> shift) & 255) * t,
      ) << shift;
  return {
    color: c,
    alpha: a.a + (b.a - a.a) * t,
    night: h < 6 || h >= 19,
    hour: h,
  };
}
