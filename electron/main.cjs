const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  dialog,
  clipboard,
} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
let win,
  currentPath = null,
  dirty = false,
  forceClose = false;
const filters = [{ name: "SVG vector document", extensions: ["svg"] }];
function sender(event) {
  if (event.sender !== win?.webContents) throw new Error("Invalid sender");
}
async function writeSvg(xml, saveAs = false, exportOnly = false) {
  if (typeof xml !== "string" || xml.length > 50 * 1024 * 1024)
    throw new Error("SVG file is too large or invalid.");
  let target = exportOnly || saveAs ? null : currentPath;
  if (!target) {
    const choice = await dialog.showSaveDialog(win, {
      title: exportOnly ? "SVG 내보내기" : "SVG 저장",
      defaultPath: currentPath || "Untitled.svg",
      filters,
    });
    if (choice.canceled || !choice.filePath) return null;
    target = choice.filePath;
    if (!/\.svg$/i.test(target)) target += ".svg";
  }
  const temporary = target + `.drawing-${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, xml, "utf8");
    await fs.rename(temporary, target);
  } catch (err) {
    await fs.unlink(temporary).catch(() => {});
    throw err;
  }
  if (!exportOnly) {
    currentPath = target;
    dirty = false;
  }
  return target;
}
ipcMain.handle("drawing:open", async (event) => {
  sender(event);
  const choice = await dialog.showOpenDialog(win, {
    title: "SVG 열기",
    filters,
    properties: ["openFile"],
  });
  if (choice.canceled) return null;
  const target = choice.filePaths[0];
  const stat = await fs.stat(target);
  if (stat.size > 50 * 1024 * 1024)
    throw new Error("SVG 파일은 50MB 이하만 열 수 있습니다.");
  const xml = await fs.readFile(target, "utf8");
  return { xml, path: target };
});
ipcMain.handle("drawing:opened", (event, filePath) => {
  sender(event);
  currentPath = filePath;
});
ipcMain.handle("drawing:new", (event) => {
  sender(event);
  currentPath = null;
  dirty = false;
});
ipcMain.handle("drawing:save", (event, xml, saveAs) => {
  sender(event);
  return writeSvg(xml, !!saveAs);
});
ipcMain.handle("drawing:export", (event, xml) => {
  sender(event);
  return writeSvg(xml, true, true);
});
ipcMain.handle("drawing:clipboard-read", (event) => {
  sender(event);
  return clipboard.readText();
});
ipcMain.handle("drawing:clipboard-write", (event, xml) => {
  sender(event);
  if (typeof xml !== "string") throw new Error("Invalid clipboard");
  clipboard.writeText(xml);
});
ipcMain.on("drawing:changed", (event, value) => {
  sender(event);
  dirty = !!value;
  win.setTitle(`Drawing${dirty ? " •" : ""}`);
});
ipcMain.on("drawing:save-response", (event, saved) => {
  sender(event);
  if (saved) {
    forceClose = true;
    win.close();
  }
});
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1440,
    height: 1000,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: "#22232b",
    show: false,
    title: "Drawing",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.loadFile(path.join(__dirname, "../dist/index.html"));
  win.once("ready-to-show", () => win.show());
  win.on("close", (event) => {
    if (forceClose || !dirty) return;
    event.preventDefault();
    const result = dialog.showMessageBoxSync(win, {
      type: "question",
      title: "변경된 문서",
      message: "변경사항을 저장하시겠습니까?",
      buttons: ["저장", "버리기", "취소"],
      defaultId: 0,
      cancelId: 2,
    });
    if (result === 0) win.webContents.send("drawing:save-request");
    else if (result === 1) {
      forceClose = true;
      win.close();
    }
  });
});
app.on("window-all-closed", () => app.quit());
