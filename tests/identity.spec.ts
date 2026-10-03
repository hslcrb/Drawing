import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { unzipSync, strFromU8 } from "fflate";

test("identity masters drive variants, undo, detach, copies and project roundtrip", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { SvgEditor } = await import("/src/core/editor.ts"),
      {
        registerComponent,
        defaultLogotypes,
        generateVariants,
        updateIdentity,
        detachComponent,
        identityArchive,
      } = await import("/src/core/identity.ts");
    const host = document.createElement("div");
    document.body.append(host);
    const e = new SvgEditor(host);
    e.load(
      '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="400"><rect id="master" x="20" y="20" width="90" height="80" fill="#ff0000"/></svg>',
    );
    e.select(["master"]);
    registerComponent(e, "symbol", "Symbol");
    defaultLogotypes(e);
    generateVariants(e, {
      languages: ["ko", "en", "bilingual"],
      layouts: ["horizontal", "vertical", "logotype"],
      tones: ["primary", "secondary", "mono", "reverse"],
      width: 500,
      height: 270,
      columns: 3,
    });
    const b = e.project.identity!,
      variant = b.variants[0],
      definition = e.svg.querySelector(`[id="${b.components[0].id}"]`)!;
    e.select(["master"]);
    e.command("resize", () =>
      e.svg.querySelector("#master")!.setAttribute("width", "140"),
    );
    const resized = e.project.identity!.components[0].width;
    e.undo();
    const restored = e.project.identity!.components[0].width;
    e.redo();
    const now = e.project.identity!;
    e.select([variant.id]);
    e.duplicate();
    const copied = now.variants.length;
    e.select([variant.id]);
    detachComponent(e);
    const independent = e.svg.querySelector(`[id="${variant.id}"]`)!,
      detached = independent.querySelectorAll("use").length,
      frozen = independent.innerHTML;
    updateIdentity(e, (b) => {
      b.palette.primary = "#112233";
    });
    const frozenAfter = independent.innerHTML === frozen,
      zip = await identityArchive(e),
      json = e.serializeProject();
    const otherHost = document.createElement("div");
    document.body.append(otherHost);
    const other = new SvgEditor(otherHost);
    other.loadDocument(json);
    const output = {
      resized,
      restored,
      copied,
      detached,
      frozenAfter,
      count: other.project.identity!.variants.length,
      uses: other.svg.querySelectorAll("use[data-brand-component]").length,
      zip: Array.from(zip),
      definitionTag: definition.localName,
      duplicates: [...other.svg.querySelectorAll("[id]")].map((el) => el.id),
    };
    host.remove();
    otherHost.remove();
    e.scope.project.remove();
    other.scope.project.remove();
    return output;
  });
  expect(result.resized).toBe(140);
  expect(result.restored).toBe(90);
  expect(result.copied).toBe(37);
  expect(result.detached).toBe(0);
  expect(result.frozenAfter).toBe(true);
  expect(result.count).toBe(37);
  expect(result.uses).toBeGreaterThan(50);
  expect(result.definitionTag).toBe("symbol");
  expect(new Set(result.duplicates).size).toBe(result.duplicates.length);
  const zip = unzipSync(Uint8Array.from(result.zip)),
    svgFiles = Object.keys(zip).filter((name) => name.endsWith(".svg"));
  expect(svgFiles).toHaveLength(37);
  expect(
    JSON.parse(strFromU8(zip["identity-manifest.json"])).variants,
  ).toHaveLength(37);
  for (const name of svgFiles) {
    const svg = strFromU8(zip[name]);
    expect(svg).toContain("<symbol");
    expect(svg).not.toContain('data-brand-guide="true"');
  }
});

test("brand example UI generates, exports, and reopens its identity workspace", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "예제 열기", exact: true }).click();
  await page
    .getByRole("button", { name: "예제 identity", exact: true })
    .click();
  await expect(page.getByTestId("brand-panel")).toBeVisible();
  await expect(
    page.getByTestId("artboard").locator("g[data-brand-variant]"),
  ).toHaveCount(6);
  await page
    .getByRole("button", { name: "상징 조합 일괄 생성", exact: true })
    .click();
  await expect(
    page.getByTestId("artboard").locator("g[data-brand-variant]"),
  ).toHaveCount(42);
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "상징체계 ZIP 내보내기", exact: true })
    .click();
  const d = await downloaded;
  const zip = unzipSync(await fs.readFile((await d.path())!));
  expect(Object.keys(zip).filter((f) => f.endsWith(".svg"))).toHaveLength(42);
  const save = page.waitForEvent("download");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  const content = await fs.readFile((await (await save).path())!, "utf8");
  expect(JSON.parse(content).workspace.mode).toBe("identity");
  await page
    .locator('input[accept=".drawing,.svg,image/svg+xml,application/json"]')
    .setInputFiles({
      name: "identity.drawing",
      mimeType: "application/json",
      buffer: Buffer.from(content),
    });
  await expect(page.getByTestId("brand-panel")).toBeVisible();
  await expect(
    page.getByTestId("artboard").locator("g[data-brand-variant]"),
  ).toHaveCount(42);
});

test("right click works on canvas, layer, header, and text input", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("header").click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
  await page
    .getByRole("menuitem", { name: "캔버스에 맞추기", exact: true })
    .click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page
    .getByRole("button", { name: "타이포그래피", exact: true })
    .click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "복제", exact: true }),
  ).toBeEnabled();
  await page.getByRole("menuitem", { name: "복제", exact: true }).click();
  await expect(page.locator(".inspector-title")).toContainText("1개 선택");
  await page
    .getByRole("button", { name: "상징체계 모드", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "체계 이름", exact: true })
    .click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "입력 전체 선택", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("menuitem", { name: "입력 전체 선택", exact: true })
    .click();
  expect(
    await page
      .getByRole("textbox", { name: "체계 이름", exact: true })
      .evaluate(
        (el: HTMLInputElement) => el.selectionEnd! - el.selectionStart!,
      ),
  ).toBeGreaterThan(0);
});

test("Retypo matches actual font outlines and restores editable embedded text", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/");
  await page
    .getByRole("button", { name: "상징체계 모드", exact: true })
    .click();
  await page.getByRole("button", { name: "Retypo 열기", exact: true }).click();
  await page
    .getByTestId("retypo-font-input")
    .setInputFiles("C:/Windows/Fonts/arial.ttf");
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
  ).toHaveValue("AB", { timeout: 30000 });
  await expect(page.getByTestId("retypo-confidence")).toContainText("100%");
  await page
    .getByRole("button", { name: "Retypo 텍스트로 복원", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30000 });
  await expect(
    page.getByTestId("artboard").locator('text[data-retypo="true"]'),
  ).toHaveText("AB");
  await page.getByRole("textbox", { name: "내용", exact: true }).fill("ABC");
  await page.getByRole("textbox", { name: "내용", exact: true }).press("Enter");
  await expect(
    page.getByTestId("artboard").locator('text[data-retypo="true"]'),
  ).toHaveText("ABC");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  const data = JSON.parse(
    await fs.readFile((await (await download).path())!, "utf8"),
  );
  expect(data.resources.fonts[0].mode).toBe("full");
  expect(data.svg).toContain("data:font/ttf;base64,");
});

test("native font catalogue restricts font reads and exports identity ZIP", async () => {
  test.setTimeout(60000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "drawing-brand-")),
    target = path.join(directory, "brand.zip"),
    app = await electron.launch({ args: ["."] });
  try {
    const page = await app.firstWindow();
    const result = await page.evaluate(async () => {
      const fonts = await window.desktop!.systemFonts(),
        arial = fonts.find((f) => f.name.toLowerCase() === "arial.ttf")!;
      const data = await window.desktop!.fontData(arial.id);
      let rejected = false;
      try {
        await window.desktop!.fontData("C:/Windows/Fonts/arial.ttf");
      } catch {
        rejected = true;
      }
      return {
        count: fonts.length,
        name: data.name,
        size: data.base64.length,
        rejected,
      };
    });
    expect(result.count).toBeGreaterThan(10);
    expect(result.name).toBe("arial.ttf");
    expect(result.size).toBeGreaterThan(10000);
    expect(result.rejected).toBe(true);
    await page.getByRole("button", { name: "예제 열기", exact: true }).click();
    await page
      .getByRole("button", { name: "예제 identity", exact: true })
      .click();
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, target);
    await page
      .getByRole("button", { name: "상징체계 ZIP 내보내기", exact: true })
      .click();
    await expect
      .poll(async () => {
        try {
          return Object.keys(unzipSync(await fs.readFile(target))).filter((f) =>
            f.endsWith(".svg"),
          ).length;
        } catch {
          return 0;
        }
      })
      .toBe(6);
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
    );
    await app.close();
  }
});
