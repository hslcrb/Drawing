import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

test("Electron edits, saves, reopens SVG and resets save path for a new document", async () => {
  test.setTimeout(60000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "drawing-test-"));
  const savedPath = path.join(directory, "drawing.svg"),
    secondPath = path.join(directory, "new.svg");
  const app = await electron.launch({ args: ["."] });
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByRole("button", { name: "새 문서", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "사각형 (R)", exact: true }).click();
    const board = page.getByTestId("artboard");
    const box = (await board.boundingBox())!;
    await page.mouse.move(box.x + 80, box.y + 80);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 160);
    await page.mouse.up();
    await expect(board.locator("rect")).toHaveCount(1);
    await app.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: target,
      });
    }, savedPath);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.locator(".doc-tab")).toContainText("drawing.svg");
    const xml = await fs.readFile(savedPath, "utf8");
    expect(xml).toContain("<rect");
    expect(xml).not.toContain("data-testid");
    await page.getByRole("button", { name: "새 문서", exact: true }).click();
    await page.getByRole("button", { name: "만들기", exact: true }).click();
    await expect(board.locator("rect")).toHaveCount(0);
    await app.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: target,
      });
    }, secondPath);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.locator(".doc-tab")).toContainText("new.svg");
    expect(await fs.readFile(savedPath, "utf8")).toBe(xml);
    await app.evaluate(({ dialog }, target) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [target],
      });
    }, savedPath);
    await page.getByRole("button", { name: "SVG 열기", exact: true }).click();
    await expect(board.locator("rect")).toHaveCount(1);
    await expect(page.locator(".doc-tab")).toContainText("drawing.svg");
    await page.screenshot({ path: "test-results/desktop.png" });
  } finally {
    await app.close();
    if (
      path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) ||
      !path.basename(directory).startsWith("drawing-test-")
    )
      throw new Error("Unexpected temporary directory");
    await fs.rm(directory, { recursive: true, force: true });
  }
});
