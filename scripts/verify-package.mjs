import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const executable = path.resolve(
  process.argv[2] || "release/win-unpacked/Drawing.exe",
);
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "drawing-package-"));
const savedPath = path.join(directory, "packaged.drawing");
const app = await electron.launch({
  executablePath: executable,
  timeout: 60000,
});
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(
    page.getByRole("button", { name: "SVG 열기", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("artboard")).toContainText("Make something");
  await expect(page.locator(".doc-tab")).toContainText("Welcome.drawing");
  const sample = path.resolve("samples/welcome.svg");
  await app.evaluate(({ dialog }, target) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [target],
    });
  }, sample);
  await page.getByRole("button", { name: "SVG 열기", exact: true }).click();
  await expect(page.getByTestId("artboard").locator("#flower")).toBeVisible();
  await page.screenshot({ path: "docs/preview.png" });
  // Copy/paste runs the packaged native clipboard and the SVG reference remapper.
  await page
    .getByRole("button", { name: "타이포그래피", exact: true })
    .dblclick();
  await page
    .getByRole("textbox", { name: "레이어 이름", exact: true })
    .fill("Typography");
  await page.getByRole("button", { name: "이름 변경", exact: true }).click();
  await expect(
    page.getByTestId("artboard").locator("#headline"),
  ).toHaveAttribute("data-name", "Typography");
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(page.getByTestId("artboard").locator("text")).toHaveCount(11);
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("artboard").locator("text")).toHaveCount(7);
  // Shape interaction and the real native save bridge in the packaged app.
  await page.getByRole("button", { name: "사각형 (R)", exact: true }).click();
  const b = await page.getByTestId("artboard").boundingBox();
  await page.mouse.move(b.x + 350, b.y + 260);
  await page.mouse.down();
  await page.mouse.move(b.x + 400, b.y + 300);
  await page.mouse.up();
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, savedPath);
  await page.keyboard.press("Control+Shift+s");
  await expect(page.locator(".doc-tab")).toContainText("packaged.drawing");
  const output = await fs.readFile(savedPath, "utf8");
  expect(JSON.parse(output).format).toBe("Drawing");
  expect(output).toContain("linearGradient");
  expect(output).not.toContain("data-testid");
  // Production font subset runs the shipped WASM, without a server or fetch.
  if (process.platform === "win32") {
    await page.getByRole("button", { name: "Typography", exact: true }).click();
    await page
      .getByRole("combobox", { name: "폰트 포함 방식", exact: true })
      .selectOption("subset");
    await page
      .getByTestId("font-input")
      .setInputFiles("C:/Windows/Fonts/arial.ttf");
    await expect(
      page.getByTestId("artboard").locator("style[data-font]"),
    ).toHaveCount(1, { timeout: 30000 });
    await page.getByRole("button", { name: "저장", exact: true }).click();
    const project = JSON.parse(await fs.readFile(savedPath, "utf8"));
    expect(project.resources.fonts[0].mode).toBe("subset");
    expect(project.resources.fonts[0].bytes).toBeLessThan(
      (await fs.stat("C:/Windows/Fonts/arial.ttf")).size / 3,
    );
  }
  await page.getByRole("button", { name: "새 문서", exact: true }).click();
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await page.getByRole("button", { name: "펜 (P)", exact: true }).click();
  const fresh = await page.getByTestId("artboard").boundingBox();
  await page.mouse.click(fresh.x + 90, fresh.y + 90);
  await page.mouse.move(fresh.x + 190, fresh.y + 150);
  await page.mouse.down();
  await page.mouse.move(fresh.x + 220, fresh.y + 100);
  await page.mouse.up();
  await page.mouse.click(fresh.x + 280, fresh.y + 220);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "노드 (A)", exact: true }).click();
  const anchors = page.locator("[data-node]:not([data-component])");
  await expect(anchors).toHaveCount(3);
  const editable = page.getByTestId("artboard").locator("path");
  const curvePoint = await editable.evaluate((el) => {
    const p = el.getPointAtLength(el.getTotalLength() * 0.25),
      m = el.getScreenCTM();
    return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
  });
  await page.mouse.dblclick(curvePoint.x, curvePoint.y);
  await expect(anchors).toHaveCount(4);
  await page.locator('[data-node="1"]:not([data-component])').click();
  await page.getByRole("button", { name: "노드 삭제", exact: true }).click();
  await expect(anchors).toHaveCount(3);
  await page.getByRole("button", { name: "열기 / 닫기", exact: true }).click();
  expect(await editable.getAttribute("d")).toMatch(/[zZ]$/);
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      executable,
      window: true,
      svgImport: true,
      layerRename: true,
      clipboard: true,
      undo: true,
      edit: true,
      save: true,
      nodeEditing: true,
      rendererErrors: errors,
    }),
  );
} finally {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((win) => win.destroy()),
  );
  await app.close();
  if (
    path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) ||
    !path.basename(directory).startsWith("drawing-package-")
  )
    throw new Error("Unexpected temporary directory");
  await fs.rm(directory, { recursive: true, force: true });
}
