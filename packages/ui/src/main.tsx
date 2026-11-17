import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { setupPhaser } from "./game/Game";

// The desktop splash waits for both the controls and the live office view.
let controlsReady = false,
  roomReady = false;
function reportReady() {
  if (controlsReady && roomReady)
    requestAnimationFrame(() => (window as any).momoDesktop?.officeReady?.());
}
window.addEventListener(
  "momo:controls-ready",
  () => {
    controlsReady = true;
    reportReady();
  },
  { once: true },
);
window.addEventListener(
  "momo:room-ready",
  () => {
    roomReady = true;
    reportReady();
  },
  { once: true },
);

// Start React UI overlay
const rootElement = document.getElementById("ui-root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}

// Start Phaser Game Engine
setupPhaser("phaser-container");
