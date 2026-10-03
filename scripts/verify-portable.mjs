import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
const { version } = JSON.parse(await fs.readFile("package.json", "utf8"));
const executable = path.resolve(`release/Drawing-${version}-win-x64.exe`);
const port = 19347;
const processHandle = spawn(executable, [`--remote-debugging-port=${port}`], {
  windowsHide: true,
  stdio: "ignore",
});
const browser = await (async () => {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error("Portable EXE did not open a browser window");
})();
try {
  const context = browser.contexts()[0],
    page = context.pages()[0];
  await page.bringToFront();
  await expect(
    page.getByRole("button", { name: "새 문서", exact: true }),
  ).toBeVisible();
  const board = page.getByTestId("artboard");
  await expect(board).toBeVisible();
  await expect(board.locator("text")).toContainText([
    "DRAWING / VECTOR PLAYGROUND",
    "Make something",
    "wonderfully yours.",
  ]);
  await page.screenshot({ path: "docs/preview.png" });
  await page.getByRole("button", { name: "새 문서", exact: true }).click();
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await page.getByRole("button", { name: "사각형 (R)", exact: true }).click();
  const b = await board.boundingBox();
  await page.mouse.move(b.x + 80, b.y + 80);
  await page.mouse.down();
  await page.mouse.move(b.x + 180, b.y + 160);
  await page.mouse.up();
  await expect(board.locator("rect")).toHaveCount(1);
  await page.getByRole("button", { name: "선택 (V)", exact: true }).click();
  await page.keyboard.down("Alt");
  await page.mouse.move(b.x + 110, b.y + 110);
  await page.mouse.down();
  await page.mouse.move(b.x + 240, b.y + 210);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect(board.locator("rect")).toHaveCount(2);
  await page.keyboard.press("Control+z");
  await expect(board.locator("rect")).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect(board.locator("rect")).toHaveCount(0);
  await fs.writeFile(
    "release/portable-verification.json",
    JSON.stringify(
      { executable, window: true, draw: true, altDuplicate: true, undo: true },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      portableExecutable: executable,
      window: true,
      draw: true,
      altDuplicate: true,
      undo: true,
    }),
  );
  await page.getByRole("button", { name: "예제 열기", exact: true }).click();
  await page.getByRole("button", { name: "예제 welcome", exact: true }).click();
  await expect(board.locator("text")).toHaveCount(7);
  await page.close();
} finally {
  await browser.close();
  processHandle.kill();
}
