import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

test("Electron layer names can be edited in the application dialog", async () => {
  const app = await electron.launch({ args: ["."] });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "새 문서", exact: true }).click();
    await page.getByRole("button", { name: "만들기", exact: true }).click();
    await page.getByRole("button", { name: "사각형 (R)", exact: true }).click();
    const b = (await page.getByTestId("artboard").boundingBox())!;
    await page.mouse.move(b.x + 80, b.y + 80);
    await page.mouse.down();
    await page.mouse.move(b.x + 150, b.y + 130);
    await page.mouse.up();
    await page.getByRole("button", { name: "사각형", exact: true }).dblclick();
    await expect(
      page.getByRole("textbox", { name: "레이어 이름", exact: true }),
    ).toBeVisible({ timeout: 5000 });
    await page
      .getByRole("textbox", { name: "레이어 이름", exact: true })
      .fill("My layer");
    await page.getByRole("button", { name: "이름 변경", exact: true }).click();
    await expect(page.getByTestId("artboard").locator("rect")).toHaveAttribute(
      "data-name",
      "My layer",
    );
    await expect(
      page.getByRole("button", { name: "My layer", exact: true }),
    ).toBeVisible();
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((win) => win.destroy()),
    );
    await app.close();
  }
});

test("Electron edits, saves, reopens SVG and resets save path for a new document", async () => {
  test.setTimeout(60000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "drawing-test-"));
  const savedPath = path.join(directory, "drawing.svg"),
    secondPath = path.join(directory, "new.svg");
  const app = await electron.launch({ args: ["."] });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "새 문서", exact: true }).click();
    await page.getByRole("button", { name: "만들기", exact: true }).click();
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
    await page.getByRole("button", { name: "예제 열기", exact: true }).click();
    await expect(board.locator("text")).toHaveCount(7);
    await app.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: target,
      });
    }, secondPath);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.locator(".doc-tab")).toContainText("new.svg");
    expect(await fs.readFile(savedPath, "utf8")).toBe(xml);
    expect(await fs.readFile(secondPath, "utf8")).toContain("Make something");
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
