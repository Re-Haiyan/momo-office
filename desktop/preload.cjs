const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("momoDesktop", {
  setProviderKey: (provider, key) =>
    ipcRenderer.invoke("momo:provider-key", provider, key),
  officeReady: () => ipcRenderer.send("momo:office-ready"),
  openDataFolder: () => ipcRenderer.invoke("momo:open-data"),
});
