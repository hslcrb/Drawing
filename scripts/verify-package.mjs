import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const executable = path.resolve(
  process.argv[2] || "release/win-unpacked/Drawing.exe",
);
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "drawing-package-"));
const savedPath = path.join(directory, "packaged.svg");
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
  await page.getByRole("button", { name: "타이포그래피", exact: true }).click();
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
  await expect(page.locator(".doc-tab")).toContainText("packaged.svg");
  const output = await fs.readFile(savedPath, "utf8");
  expect(output).toContain("linearGradient");
  expect(output).not.toContain("data-testid");
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      executable,
      window: true,
      svgImport: true,
      clipboard: true,
      undo: true,
      edit: true,
      save: true,
      rendererErrors: errors,
    }),
  );
} finally {
  await app.close();
  if (
    path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) ||
    !path.basename(directory).startsWith("drawing-package-")
  )
    throw new Error("Unexpected temporary directory");
  await fs.rm(directory, { recursive: true, force: true });
}
