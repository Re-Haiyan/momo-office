import React from "react";
import { sound, useSound, SoundPrefs } from "./sound";
export function SoundSettings() {
  const prefs = useSound();
  return (
    <section className="editor sound-settings">
      <h3>Optional sound</h3>
      <p>
        Muted by default. Generated tones only; no external music or recordings.
        Audio starts only after your interaction.
      </p>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={prefs.enabled}
          onChange={(e) =>
            sound.set({ enabled: e.target.checked }, e.nativeEvent)
          }
        />
        Enable sound
      </label>
      {[
        ["master", "Master volume"],
        ["music", "Gentle music"],
        ["ambient", "Room tone"],
        ["effects", "UI and completion sounds"],
        ["dialogue", "Dialogue blips"],
      ].map(([key, label]) => (
        <label key={key}>
          {label}
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={prefs[key as keyof SoundPrefs] as number}
            onChange={(e) => sound.set({ [key]: Number(e.target.value) })}
          />
          <output>
            {Math.round((prefs[key as keyof SoundPrefs] as number) * 100)}%
          </output>
        </label>
      ))}
    </section>
  );
}
