import { expect } from "@playwright/test";
export async function verifyBrand(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  const discard = (dialog) => dialog.accept();
  page.once("dialog", discard);
  await page.getByRole("button", { name: "예제 열기", exact: true }).click();
  await page
    .getByRole("button", { name: "예제 identity", exact: true })
    .click();
  await expect(page.getByTestId("brand-panel")).toBeVisible();
  page.off("dialog", discard);
  const board = page.getByTestId("artboard");
  await expect(board.locator("g[data-brand-variant]")).toHaveCount(6);
  await page
    .getByRole("button", { name: "상징 조합 일괄 생성", exact: true })
    .click();
  await expect(board.locator("g[data-brand-variant]")).toHaveCount(42);
  const first = page.locator(".brand-variants button").first();
  await first.click();
  await page.screenshot({ path: "docs/identity.png" });
  await page.locator("header").click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
  await page
    .getByRole("menuitem", {
      name: "Retypo · 글리프 / 텍스트 복원",
      exact: true,
    })
    .click();
  await page
    .getByRole("textbox", { name: "Retypo 폰트 검색", exact: true })
    .fill("arial.ttf");
  await page
    .getByRole("button", { name: "Retypo 폰트 arial.ttf", exact: true })
    .click();
  await expect(page.getByTestId("font-report")).toContainText("Arial");
  await page
    .getByRole("textbox", { name: "Retypo 복원 텍스트", exact: true })
    .fill("AB");
  await page
    .getByRole("button", { name: "Retypo 글리프 경로 삽입", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Retypo 비교 문자", exact: true })
    .fill("ABCXYZ");
  await page
    .getByRole("button", { name: "Retypo 경로 분석", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Retypo 복원 텍스트", exact: true }),
  ).toHaveValue("AB");
  await expect(page.getByTestId("retypo-confidence")).toContainText("100%");
  await page.screenshot({ path: "docs/retypo.png" });
  await page
    .getByRole("button", { name: "Retypo 텍스트로 복원", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30000 });
  await expect(board.locator('text[data-retypo="true"]')).toHaveText("AB");
  await page.getByRole("textbox", { name: "내용", exact: true }).fill("ABC");
  await page.getByRole("textbox", { name: "내용", exact: true }).press("Enter");
  await expect(board.locator('text[data-retypo="true"]')).toHaveText("ABC");
  expect(errors).toEqual([]);
  return {
    identityVariants: 42,
    systemFontReport: true,
    retypo: true,
    editableText: true,
    contextMenu: true,
    rendererErrors: errors,
  };
}
