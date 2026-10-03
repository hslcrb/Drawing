import { test, expect } from "@playwright/test";

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
