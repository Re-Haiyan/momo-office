const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("momoDesktop", {
  officeReady: () => ipcRenderer.send("momo:office-ready"),
  openDataFolder: () => ipcRenderer.invoke("momo:open-data"),
});
