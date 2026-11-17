const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("momoStartup", {
  onStatus: (callback) => {
    if (typeof callback !== "function") return;
    ipcRenderer.on("momo:startup-status", (_event, message) => {
      if (typeof message === "string") callback(message);
    });
  },
  cancel: () => ipcRenderer.send("momo:cancel-startup"),
});
