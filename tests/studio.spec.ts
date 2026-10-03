import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

test("exported motion SVG plays native animation at the expected position", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { SvgEditor } = await import("/src/core/editor.ts"),
      { identityKey } = await import("/src/core/project.ts"),
      { upsertKey, animatedSvg } = await import("/src/core/motion.ts");
    const host = document.createElement("div");
    document.body.append(host);
    const e = new SvgEditor(host);
    e.load(
      '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="300"><rect id="moving" width="80" height="60" fill="red"/></svg>',
    );
    upsertKey(e, "moving", identityKey());
    upsertKey(e, "moving", { ...identityKey(2), x: 200 });
    const second = document.createElement("div");
    second.innerHTML = animatedSvg(e);
    document.body.append(second);
    const svg = second.querySelector("svg")!;
    svg.pauseAnimations();
    svg.setCurrentTime(1);
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const group = svg.querySelector<SVGGElement>("[data-motion-target]")!;
    return {
      x: group.transform.animVal.numberOfItems
        ? group.transform.animVal.getItem(0).matrix.e
        : 0,
      source: e.svg.querySelector("rect")!.getAttribute("transform"),
    };
  });
  expect(result.x).toBeCloseTo(100, 1);
  expect(result.source).toBeNull();
});

test("gradient nodes stay selected while editing and canvas handles move geometry", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "예제 열기", exact: true }).click();
  await page
    .getByRole("button", { name: "예제 gradients", exact: true })
    .click();
  await page.getByRole("button", { name: "LINEAR", exact: true }).click();
  await page.getByRole("button", { name: "색상 노드 2", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "노드 알파", exact: true })
    .fill("0.5");
  await expect(
    page.getByRole("button", { name: "색상 노드 2", exact: true }),
  ).toHaveClass("active");
  await page
    .getByRole("button", { name: "그라데이션 핸들 편집", exact: true })
    .click();
  const handle = page.locator('[data-gradient-handle="start"]'),
    b = (await handle.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 35, b.y + b.height / 2 + 20);
  await page.mouse.up();
  await expect(
    page.getByRole("spinbutton", { name: "start x", exact: true }),
  ).not.toHaveValue("0");
  await expect(page.locator(".inspector-title")).toContainText("1개 선택");
  await page.keyboard.press("Control+z");
  await expect(
    page.getByRole("spinbutton", { name: "start x", exact: true }),
  ).toHaveValue("0");
});

test("raster images embed into SVG and project resources with undo", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "새 문서", exact: true }).click();
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await page.getByTestId("image-input").setInputFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByTestId("artboard").locator("image")).toHaveAttribute(
    "href",
    /^data:image\/png;base64,/,
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  const saved = await download;
  const content = await fs.readFile((await saved.path())!, "utf8"),
    p = JSON.parse(content);
  expect(p.resources.assets[0]).toMatchObject({
    name: "pixel.png",
    mime: "image/png",
  });
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("artboard").locator("image")).toHaveCount(0);
});

test("example gallery opens all five editable documents and motion sample plays", async ({
  page,
}) => {
  await page.goto("/");
  for (const id of [
    "gradients",
    "strokes",
    "typography",
    "motion",
    "welcome",
  ]) {
    await page.getByRole("button", { name: "예제 열기", exact: true }).click();
    await page.getByRole("button", { name: `예제 ${id}`, exact: true }).click();
    await expect(
      page.getByTestId("artboard").locator("text").first(),
    ).toBeAttached();
    if (id === "motion") {
      await expect(page.getByTestId("timeline")).toBeVisible();
      await page
        .getByRole("spinbutton", { name: "모션 시간", exact: true })
        .fill("2");
      await expect(
        page
          .getByTestId("motion-preview")
          .locator('[data-motion-target="motion-star"]'),
      ).toHaveAttribute("transform", /rotate\(180\)/);
      await page
        .getByRole("button", { name: "모션 재생", exact: true })
        .click();
      await expect
        .poll(async () =>
          Number(
            await page
              .getByRole("spinbutton", { name: "모션 시간", exact: true })
              .inputValue(),
          ),
        )
        .toBeGreaterThan(2);
      await page
        .getByRole("button", { name: "모션 일시정지", exact: true })
        .click();
    }
  }
  await expect(page.getByTestId("artboard")).toContainText("Make something");
});

test("keyframe interpolation, step, undo and animated export preserve source", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { SvgEditor } = await import("/src/core/editor.ts");
    const { identityKey } = await import("/src/core/project.ts");
    const { upsertKey, sampleTrack, previewSvg, animatedSvg } =
      await import("/src/core/motion.ts");
    const host = document.createElement("div");
    document.body.append(host);
    const e = new SvgEditor(host);
    e.load(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><g transform="translate(20 30)"><rect id="r" width="100" height="60" transform="translate(12 7) rotate(20)" fill="red"/></g></svg>',
    );
    const source = e.serialize();
    upsertKey(e, "r", identityKey());
    upsertKey(e, "r", {
      ...identityKey(2),
      x: 200,
      rotation: 90,
      scale: 2,
      opacity: 0.2,
    });
    const midpoint = sampleTrack(e.project.motion.tracks[0], 1);
    const preview = previewSvg(e, 1).querySelector("[data-motion-target]")!;
    const animation = animatedSvg(e);
    const unchanged = source === e.serialize();
    const serialized = e.serializeProject();
    e.loadDocument(serialized);
    e.command(
      "easing",
      () => (e.project.motion.tracks[0].keys[0].easing = "step"),
    );
    const stepped = sampleTrack(e.project.motion.tracks[0], 1).x;
    e.undo();
    const restored = sampleTrack(e.project.motion.tracks[0], 1).x;
    e.select(["r"]);
    e.deleteSelection();
    const pruned = e.project.motion.tracks.length;
    e.undo();
    return {
      midpoint,
      preview: preview.getAttribute("transform"),
      animation,
      unchanged,
      stepped,
      restored,
      pruned,
      undo: e.project.motion.tracks.length,
    };
  });
  expect(result.midpoint).toMatchObject({
    x: 100,
    rotation: 45,
    scale: 1.5,
    opacity: 0.6,
  });
  expect(result.preview).toContain("translate(100 0)");
  expect(result.animation).toContain("animateTransform");
  expect(result.animation).toContain('repeatCount="indefinite"');
  expect(result).toMatchObject({
    unchanged: true,
    stepped: 0,
    restored: 100,
    pruned: 0,
    undo: 1,
  });
});

test("motion workspace edits keys, scrubs non-destructively and exports animation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "새 문서", exact: true }).click();
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  const board = page.getByTestId("artboard"),
    b = (await board.boundingBox())!;
  await page.getByRole("button", { name: "사각형 (R)", exact: true }).click();
  await page.mouse.move(b.x + 80, b.y + 80);
  await page.mouse.down();
  await page.mouse.move(b.x + 180, b.y + 150);
  await page.mouse.up();
  const source = await board.innerHTML();
  await page.getByRole("button", { name: "모션 모드", exact: true }).click();
  await page
    .getByRole("button", { name: "키프레임 저장", exact: true })
    .click();
  await page
    .getByRole("spinbutton", { name: "모션 시간", exact: true })
    .fill("1");
  await page
    .getByRole("spinbutton", { name: "키프레임 x", exact: true })
    .fill("160");
  await page
    .getByRole("button", { name: "키프레임 저장", exact: true })
    .click();
  await page
    .getByRole("spinbutton", { name: "모션 시간", exact: true })
    .fill("0.5");
  await expect(
    page.getByTestId("motion-preview").locator("[data-motion-target]"),
  ).toHaveAttribute("transform", /translate\(80 0\)/);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "SVG 내보내기", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.svg$/);
  await page.getByRole("button", { name: "디자인 모드", exact: true }).click();
  expect(await board.innerHTML()).toBe(source);
});

test("open project preserves SVG, resources, workspace, extensions and metadata undo", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { SvgEditor } = await import("/src/core/editor.ts");
    const { defaultView } = await import("/src/core/project.ts");
    const host = document.createElement("div");
    document.body.append(host);
    const e = new SvgEditor(host);
    e.load(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect id="box" width="90" height="60"/></svg>',
    );
    e.command("timeline", () => {
      e.project.motion.duration = 6;
    });
    const dirty = e.dirty;
    e.undo();
    const undo = e.project.motion.duration;
    e.redo();
    const redo = e.project.motion.duration;
    e.extensions = { future: { enabled: true } };
    const v = {
      ...defaultView(),
      zoom: 1.25,
      mode: "motion" as const,
      time: 2,
      selection: ["box"],
      scrollX: 320,
    };
    const serialized = e.serializeProject(v);
    e.newDocument();
    const view = e.loadDocument(serialized);
    const restored = e.serializeProject(view!);
    const before = restored;
    let rejected = false;
    try {
      const p = JSON.parse(serialized);
      p.version = 999;
      e.loadDocument(JSON.stringify(p));
    } catch {
      rejected = true;
    }
    return {
      dirty,
      undo,
      redo,
      view,
      restored,
      serialized,
      rejected,
      atomic: before === e.serializeProject(view!),
      saved: !e.dirty,
    };
  });
  expect(result).toMatchObject({
    dirty: true,
    undo: 3,
    redo: 6,
    rejected: true,
    atomic: true,
    saved: true,
  });
  expect(result.view).toMatchObject({
    zoom: 1.25,
    mode: "motion",
    scrollX: 320,
    selection: ["box"],
  });
  expect(result.restored).toBe(result.serialized);
});

test("all gradient types render SVG resources, retain editable nodes and undo", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { SvgEditor } = await import("/src/core/editor.ts");
    const { applyPaint, initialPaint, readPaint } =
      await import("/src/core/paints.ts");
    const host = document.createElement("div");
    document.body.append(host);
    const e = new SvgEditor(host);
    e.load(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect id="r" width="200" height="120" fill="red"/></svg>',
    );
    e.select(["r"]);
    const kinds = ["linear", "radial", "points", "lines"] as const;
    const types = kinds.map((kind) => {
      const p = initialPaint(kind);
      p.nodes.push({
        x: 0.5,
        y: 0.1,
        offset: 0.4,
        color: "#00ff00",
        opacity: 0.6,
        radius: 0.5,
      });
      applyPaint(e, "fill", p);
      const before = e.serializeProject();
      const found = readPaint(e, "fill");
      e.loadDocument(before);
      e.select(["r"]);
      return {
        kind: found?.kind,
        nodes: readPaint(e, "fill")?.nodes.length,
        resource: !!e.svg.querySelector(
          kind === "linear"
            ? "linearGradient"
            : kind === "radial"
              ? "radialGradient"
              : "pattern",
        ),
        circles: e.svg.querySelectorAll("pattern circle").length,
      };
    });
    const before = e.serialize();
    e.setStyle("stroke", "blue");
    e.setStyle("stroke-linecap", "round");
    e.setStyle("stroke-dasharray", "8 4");
    e.undo();
    const dash = e.selected[0].getAttribute("stroke-dasharray");
    e.undo();
    e.undo();
    return { types, dash, undo: e.serialize() === before };
  });
  expect(result.types.map((x) => x.kind)).toEqual([
    "linear",
    "radial",
    "points",
    "lines",
  ]);
  expect(result.types.every((x) => x.nodes === 3 && x.resource)).toBe(true);
  expect(result.types[2].circles).toBe(3);
  expect(result.types[3].circles).toBe(50);
  expect(result).toMatchObject({ dash: null, undo: true });
});

test("embedded full and subset fonts survive project loading and remain usable", async ({
  page,
}) => {
  test.skip(
    process.platform !== "win32",
    "Uses a local Windows test font; no font is redistributed",
  );
  const bytes = [...(await fs.readFile("C:/Windows/Fonts/arial.ttf"))];
  await page.goto("/");
  const result = await page.evaluate(async (bytes) => {
    const { SvgEditor } = await import("/src/core/editor.ts");
    const { makeEmbeddedFont, embedFont } = await import("/src/core/fonts.ts");
    const host = document.createElement("div");
    document.body.append(host);
    const e = new SvgEditor(host);
    e.load(
      '<svg xmlns="http://www.w3.org/2000/svg"><text id="t" x="10" y="50">Hello ffi</text></svg>',
    );
    e.select(["t"]);
    const file = new File([new Uint8Array(bytes)], "Arial.ttf");
    const full = await makeEmbeddedFont(file, "full", "Hello ffi", "full");
    const small = await makeEmbeddedFont(file, "subset", "Hello ffi", "subset");
    embedFont(e, full);
    embedFont(e, small);
    const doc = e.serializeProject();
    e.loadDocument(doc);
    await document.fonts.ready;
    const loaded = await new FontFace(
      small.family,
      `url(${small.data})`,
    ).load();
    const registered = await document.fonts.load(
      `20px ${small.family}`,
      "Hello ffi",
    );
    return {
      full: full.bytes,
      small: small.bytes,
      loaded: loaded.status,
      registered: registered.length,
      fonts: e.project.fonts.length,
      css: e.svg.querySelector("style[data-font='subset']")?.textContent,
      undo: e.canUndo,
    };
  }, bytes);
  expect(result.small).toBeLessThan(result.full / 3);
  expect(result.loaded).toBe("loaded");
  expect(result.registered).toBeGreaterThan(0);
  expect(result.fonts).toBe(2);
  expect(result.css).toContain("data:font/");
  expect(result.css).not.toContain("url(none)");
});
