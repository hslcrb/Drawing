import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

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
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><g transform="translate(20 30)"><rect id="r" width="100" height="60" transform="rotate(20)" fill="red"/></g></svg>',
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
    return {
      full: full.bytes,
      small: small.bytes,
      loaded: loaded.status,
      fonts: e.project.fonts.length,
      css: e.svg.querySelector("style[data-font='subset']")?.textContent,
      undo: e.canUndo,
    };
  }, bytes);
  expect(result.small).toBeLessThan(result.full / 3);
  expect(result.loaded).toBe("loaded");
  expect(result.fonts).toBe(2);
  expect(result.css).toContain("data:font/");
  expect(result.css).not.toContain("url(none)");
});
