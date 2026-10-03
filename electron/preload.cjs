const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  open: () => ipcRenderer.invoke("drawing:open"),
  opened: (path) => ipcRenderer.invoke("drawing:opened", path),
  newDocument: () => ipcRenderer.invoke("drawing:new"),
  save: (xml, saveAs) => ipcRenderer.invoke("drawing:save", xml, saveAs),
  export: (xml) => ipcRenderer.invoke("drawing:export", xml),
  download: (name, base64) =>
    ipcRenderer.invoke("drawing:download", name, base64),
  systemFonts: () => ipcRenderer.invoke("drawing:fonts"),
  fontData: (id) => ipcRenderer.invoke("drawing:font-data", id),
  changed: (dirty) => ipcRenderer.send("drawing:changed", dirty),
  clipboardRead: () => ipcRenderer.invoke("drawing:clipboard-read"),
  clipboardWrite: (xml) => ipcRenderer.invoke("drawing:clipboard-write", xml),
  onSaveRequest: (callback) => {
    const listener = async () => {
      try {
        ipcRenderer.send("drawing:save-response", await callback());
      } catch {
        ipcRenderer.send("drawing:save-response", false);
      }
    };
    ipcRenderer.on("drawing:save-request", listener);
    return () => ipcRenderer.removeListener("drawing:save-request", listener);
  },
});
