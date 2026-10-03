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
const filters = [
  { name: "Drawing project", extensions: ["drawing"] },
  { name: "SVG vector document", extensions: ["svg"] },
];
function sender(event) {
  if (event.sender !== win?.webContents) throw new Error("Invalid sender");
}
async function writeSvg(xml, saveAs = false, exportOnly = false) {
  if (
    typeof xml !== "string" ||
    Buffer.byteLength(xml, "utf8") > 150 * 1024 * 1024
  )
    throw new Error("SVG file is too large or invalid.");
  let target = exportOnly || saveAs ? null : currentPath;
  if (!target) {
    const choice = await dialog.showSaveDialog(win, {
      title: exportOnly ? "SVG 내보내기" : "프로젝트 저장",
      defaultPath: exportOnly
        ? "Untitled.svg"
        : currentPath || "Untitled.drawing",
      filters: exportOnly ? [filters[1]] : [filters[0]],
    });
    if (choice.canceled || !choice.filePath) return null;
    target = choice.filePath;
    if (!(exportOnly ? /\.svg$/i : /\.drawing$/i).test(target))
      target += exportOnly ? ".svg" : ".drawing";
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
    title: "프로젝트 / SVG 열기",
    filters,
    properties: ["openFile"],
  });
  if (choice.canceled) return null;
  const target = choice.filePaths[0];
  const stat = await fs.stat(target);
  if (stat.size > 150 * 1024 * 1024)
    throw new Error("프로젝트 파일은 150MB 이하만 열 수 있습니다.");
  const xml = await fs.readFile(target, "utf8");
  return { xml, path: target };
});
ipcMain.handle("drawing:opened", (event, filePath) => {
  sender(event);
  currentPath = /\.drawing$/i.test(filePath) ? filePath : null;
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
ipcMain.handle("drawing:download", async (event, name, base64) => {
  sender(event);
  if (
    typeof name !== "string" ||
    path.basename(name) !== name ||
    !name.endsWith(".zip") ||
    typeof base64 !== "string" ||
    base64.length > 200 * 1024 * 1024 ||
    !/^[A-Za-z0-9+/=]+$/.test(base64)
  )
    throw new Error("Invalid package");
  const choice = await dialog.showSaveDialog(win, {
    title: "상징체계 패키지 저장",
    defaultPath: name,
    filters: [{ name: "ZIP package", extensions: ["zip"] }],
  });
  if (choice.canceled || !choice.filePath) return null;
  const target = choice.filePath.endsWith(".zip")
      ? choice.filePath
      : choice.filePath + ".zip",
    temporary = target + `.drawing-${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, Buffer.from(base64, "base64"));
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.unlink(temporary).catch(() => {});
    throw error;
  }
  return target;
});
const fontFiles = new Map();
ipcMain.handle("drawing:fonts", async (event) => {
  sender(event);
  fontFiles.clear();
  const roots =
    process.platform === "win32"
      ? [
          path.join(process.env.WINDIR || "C:\\Windows", "Fonts"),
          path.join(
            app.getPath("home"),
            "AppData/Local/Microsoft/Windows/Fonts",
          ),
        ]
      : [];
  const crypto = require("node:crypto");
  for (const root of roots) {
    const entries = await fs
      .readdir(root, { withFileTypes: true })
      .catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile() || !/\.(ttf|otf)$/i.test(entry.name)) continue;
      const target = path.join(root, entry.name),
        id = crypto.createHash("sha256").update(target).digest("hex");
      fontFiles.set(id, { target, name: entry.name });
    }
  }
  return [...fontFiles]
    .map(([id, f]) => ({ id, name: f.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
});
ipcMain.handle("drawing:font-data", async (event, id) => {
  sender(event);
  const font = fontFiles.get(id);
  if (!font) throw new Error("알 수 없는 시스템 폰트입니다.");
  const stat = await fs.lstat(font.target);
  if (!stat.isFile() || stat.size > 20 * 1024 * 1024)
    throw new Error("지원하지 않는 폰트 파일입니다.");
  return {
    name: font.name,
    base64: (await fs.readFile(font.target)).toString("base64"),
  };
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
