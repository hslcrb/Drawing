import { test, expect } from "@playwright/test";

test("transparent cleanup UI preserves painted strokes and undo restores removed artwork", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.getByTestId("artboard");
  const b = (await canvas.boundingBox())!;
  await page.getByRole("button", { name: "사각형 (R)", exact: true }).click();
  await page.mouse.move(b.x + 80, b.y + 80);
  await page.mouse.down();
  await page.mouse.move(b.x + 180, b.y + 160);
  await page.mouse.up();
  await page.getByRole("button", { name: "채우기 없음", exact: true }).click();
  await expect(canvas.locator("rect")).toHaveAttribute("fill", "none");
  await page.getByRole("button", { name: "선 (L)", exact: true }).click();
  await page.mouse.move(b.x + 230, b.y + 100);
  await page.mouse.down();
  await page.mouse.move(b.x + 330, b.y + 200);
  await page.mouse.up();
  await page
    .getByRole("button", { name: "투명 요소 선택", exact: true })
    .click();
  await expect(page.locator(".inspector-title")).toContainText("1개 선택");
  await page
    .getByRole("button", { name: "투명 요소 삭제", exact: true })
    .click();
  await expect(canvas.locator("rect")).toHaveCount(0);
  await expect(canvas.locator("line")).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect(canvas.locator("rect")).toHaveCount(1);
  await expect(canvas.locator("line")).toHaveCount(1);
});

test("rectangle, Alt-drag duplicate, undo, redo and SVG export", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "새 문서", exact: true }).click();
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await page.getByRole("button", { name: "사각형 (R)", exact: true }).click();
  const canvas = page.locator('[data-testid="artboard"]');
  const b = (await canvas.boundingBox())!;
  await page.mouse.move(b.x + 80, b.y + 80);
  await page.mouse.down();
  await page.mouse.move(b.x + 180, b.y + 160);
  await page.mouse.up();
  await expect(canvas.locator("rect")).toHaveCount(1);
  await page.getByRole("button", { name: "선택 (V)", exact: true }).click();
  await page.keyboard.down("Alt");
  await page.mouse.move(b.x + 110, b.y + 110);
  await page.mouse.down();
  await page.mouse.move(b.x + 240, b.y + 210);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect(canvas.locator("rect")).toHaveCount(2);
  await page.keyboard.press("Control+z");
  await expect(canvas.locator("rect")).toHaveCount(1);
  await page.keyboard.press("Control+Shift+z");
  await expect(canvas.locator("rect")).toHaveCount(2);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "SVG 내보내기", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.svg$/);
});

test("pen creates cubic path and node movement changes its shape", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "새 문서", exact: true }).click();
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await page.getByRole("button", { name: "펜 (P)", exact: true }).click();
  const c = page.locator('[data-testid="artboard"]');
  const b = (await c.boundingBox())!;
  await page.mouse.click(b.x + 90, b.y + 90);
  await page.mouse.move(b.x + 190, b.y + 150);
  await page.mouse.down();
  await page.mouse.move(b.x + 220, b.y + 100);
  await page.mouse.up();
  await page.mouse.click(b.x + 280, b.y + 220);
  await page.keyboard.press("Enter");
  const path = c.locator("path");
  await expect(path).toHaveCount(1);
  const before = await path.getAttribute("d");
  expect(before).toMatch(/[Cc]/);
  await page.getByRole("button", { name: "노드 (A)", exact: true }).click();
  const anchor = page.locator('[data-node="0"]');
  await expect(anchor).toBeVisible();
  const a = (await anchor.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 30, a.y + 30);
  await page.mouse.up();
  expect(await path.getAttribute("d")).not.toBe(before);
});
