const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("momoDesktop", {
  apiToken:
    process.argv
      .find((value) => value.startsWith("--momo-api-token="))
      ?.slice("--momo-api-token=".length) || "",
  setProviderKey: (provider, key) =>
    ipcRenderer.invoke("momo:provider-key", provider, key),
  officeReady: () => ipcRenderer.send("momo:office-ready"),
  openDataFolder: () => ipcRenderer.invoke("momo:open-data"),
});
