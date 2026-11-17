const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("momoDesktop", {
  openDataFolder: () => ipcRenderer.invoke("momo:open-data"),
});
