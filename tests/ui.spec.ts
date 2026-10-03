import { test, expect } from "@playwright/test";

test("bundled welcome artwork opens at startup and can always be restored", async ({
  page,
}) => {
  await page.goto("/");
  const board = page.getByTestId("artboard");
  await expect(board.locator("text")).toHaveCount(7);
  await expect(board).toContainText("Make something");
  await expect(board).toContainText("wonderfully yours.");
  await expect(page.locator(".doc-tab")).toContainText("Welcome.svg");
  const artwork = () =>
    board.evaluate((element) => {
      const copy = element.cloneNode(true) as Element;
      copy.querySelectorAll("[id]").forEach((node) => {
        if (node.id.startsWith("drawing-")) node.removeAttribute("id");
      });
      return copy.innerHTML;
    });
  const original = await artwork();
  await page.getByRole("button", { name: "새 문서", exact: true }).click();
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await expect(board.locator("text")).toHaveCount(0);
  await page.getByRole("button", { name: "예제 열기", exact: true }).click();
  await expect(board.locator("text")).toHaveCount(7);
  expect(await artwork()).toBe(original);
  await page.getByRole("button", { name: "타이포그래피", exact: true }).click();
  await page.keyboard.press("Delete");
  await expect(board.locator("text")).toHaveCount(3);
  let dismissed = 0;
  page.on("dialog", async (dialog) => {
    await dialog.dismiss();
    dismissed++;
  });
  await page.getByRole("button", { name: "예제 열기", exact: true }).click();
  await expect.poll(() => dismissed).toBe(2);
  await expect(board.locator("text")).toHaveCount(3);
  page.removeAllListeners("dialog");
  page.on("dialog", (dialog) =>
    dialog.message().includes("버리고 계속")
      ? dialog.accept()
      : dialog.dismiss(),
  );
  await page.getByRole("button", { name: "예제 열기", exact: true }).click();
  await expect(board.locator("text")).toHaveCount(7);
  expect(await artwork()).toBe(original);
});

test("Escape cancels a draft property without changing artwork", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "새 문서", exact: true }).click();
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  const board = page.getByTestId("artboard");
  const b = (await board.boundingBox())!;
  await page.getByRole("button", { name: "사각형 (R)", exact: true }).click();
  await page.mouse.move(b.x + 80, b.y + 80);
  await page.mouse.down();
  await page.mouse.move(b.x + 150, b.y + 130);
  await page.mouse.up();
  await page
    .getByRole("textbox", { name: "Fill", exact: true })
    .fill("#00ff00");
  await page.keyboard.press("Escape");
  await expect(board.locator("rect")).toHaveAttribute("fill", "#8b75ff");
});

test("ellipse and text tools, selection resize handles, numeric styles and grouping", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "새 문서", exact: true }).click();
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  const board = page.getByTestId("artboard");
  const b = (await board.boundingBox())!;
  await page.getByRole("button", { name: "타원 (E)", exact: true }).click();
  await page.mouse.move(b.x + 90, b.y + 90);
  await page.mouse.down();
  await page.mouse.move(b.x + 190, b.y + 170);
  await page.mouse.up();
  await expect(board.locator("ellipse")).toHaveCount(1);
  await page.getByRole("button", { name: "선택 (V)", exact: true }).click();
  const handle = page.locator('[data-handle="se"]');
  const h = (await handle.boundingBox())!;
  const previous = Number(
    await page.getByRole("textbox", { name: "W", exact: true }).inputValue(),
  );
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 50, h.y + h.height / 2 + 40);
  await page.mouse.up();
  expect(
    Number(
      await page.getByRole("textbox", { name: "W", exact: true }).inputValue(),
    ),
  ).toBeGreaterThan(previous + 30);
  await page
    .getByRole("textbox", { name: "Fill", exact: true })
    .fill("#ff0000");
  await page.keyboard.press("Enter");
  await expect(board.locator("ellipse")).toHaveAttribute("fill", "#ff0000");
  await page.getByRole("button", { name: "텍스트 (T)", exact: true }).click();
  await page.mouse.click(b.x + 300, b.y + 200);
  await page
    .getByRole("textbox", { name: "텍스트 내용", exact: true })
    .fill("SVG text");
  await page.getByRole("button", { name: "추가", exact: true }).click();
  await expect(board.locator("text")).toHaveText("SVG text");
  await page
    .getByRole("textbox", { name: "글자 크기", exact: true })
    .fill("48");
  await page.keyboard.press("Enter");
  await expect(board.locator("text")).toHaveAttribute("font-size", "48px");
  await page
    .getByRole("textbox", { name: "Fill", exact: true })
    .fill("#00ff00");
  await page.keyboard.press("Escape");
  await expect(board.locator("text")).toHaveAttribute("fill", "#ff0000");
  await page.mouse.click(b.x + 500, b.y + 350);
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+g");
  await expect(board.locator(":scope > g")).toHaveCount(1);
  await page.keyboard.press("Control+Shift+g");
  await expect(board.locator(":scope > g")).toHaveCount(0);
  await expect(board.locator("text")).toHaveText("SVG text");
});

test("transparent cleanup UI preserves painted strokes and undo restores removed artwork", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "새 문서", exact: true }).click();
  await page.getByRole("button", { name: "만들기", exact: true }).click();
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
  const handle = page.locator('[data-component="handleOut"]').first();
  const hb = (await handle.boundingBox())!;
  const beforeHandle = await path.getAttribute("d");
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 25, hb.y + 20);
  await page.mouse.up();
  expect(await path.getAttribute("d")).not.toBe(beforeHandle);
  const anchors = page.locator("[data-node]:not([data-component])");
  await expect(anchors).toHaveCount(3);
  const middle = await path.evaluate((element) => {
    const path = element as SVGPathElement;
    const p = path.getPointAtLength(path.getTotalLength() / 2),
      m = path.getScreenCTM()!;
    return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
  });
  await page.mouse.dblclick(middle.x, middle.y);
  await expect(anchors).toHaveCount(4);
  await page.locator('[data-node="1"]:not([data-component])').click();
  await page.getByRole("button", { name: "노드 삭제", exact: true }).click();
  await expect(anchors).toHaveCount(3);
  await page.getByRole("button", { name: "열기 / 닫기", exact: true }).click();
  expect(await path.getAttribute("d")).toMatch(/[zZ]$/);
});
