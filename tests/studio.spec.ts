import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

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
