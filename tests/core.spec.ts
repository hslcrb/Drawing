import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("transparent cleanup respects defaults, references, inherited paint and hidden layers", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { SvgEditor } = await import("/src/core/editor.ts");
    const host = document.createElement("div");
    document.body.append(host);
    const e = new SvgEditor(host);
    e.load(
      `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><path id="resource" fill="none" stroke="none" d="M0 0L10 10"/></defs><rect id="default" width="10" height="10"/><rect id="empty" width="10" height="10" fill="none" stroke="none"/><rect id="alpha" width="10" height="10" fill="rgba(255,0,0,0)"/><g id="zero" opacity="0"><rect width="10" height="10"/></g><g id="paint" fill="none" stroke="blue"><path id="outline" d="M0 0L20 20"/></g><g id="mixed"><rect fill="none" id="innerempty" width="10" height="10"/><rect id="visible" width="10" height="10"/></g><rect id="hidden" display="none" fill="none" width="10" height="10"/><path id="source" fill="none" d="M0 0L10 10"/><use href="#source"/><rect id="gradient" fill="url(#g)" width="10" height="10"/></svg>`,
    );
    const before = e.serialize();
    const ids = e
      .transparentElements()
      .map((x: Element) => x.id)
      .sort();
    e.deleteTransparent();
    const after = e.serialize();
    e.undo();
    return { ids, after, restored: before === e.serialize() };
  });
  expect(result.ids).toEqual(["alpha", "empty", "innerempty", "zero"]);
  expect(result.after).toContain('id="source"');
  expect(result.after).toContain('id="outline"');
  expect(result.restored).toBe(true);
});

for (const [operation, area] of [
  ["unite", 15000],
  ["subtract", 5000],
  ["intersect", 5000],
  ["exclude", 10000],
] as const) {
  test(`pathfinder ${operation} returns distinct real geometry`, async ({
    page,
  }) => {
    const result = await page.evaluate(async (op) => {
      const { SvgEditor } = await import("/src/core/editor.ts");
      const e = new SvgEditor(
        document.body.appendChild(document.createElement("div")),
      );
      e.load(
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><g transform="translate(30 20)"><rect id="a" width="100" height="100" fill="red"/><rect id="b" x="50" width="100" height="100" fill="blue"/></g></svg>',
      );
      e.select(["a", "b"]);
      e.pathfinder(op);
      const el = e.selected[0];
      const path = e.geometry(el);
      const output = {
        area: Math.abs(path.area),
        x: path.bounds.x,
        y: path.bounds.y,
        tag: el.tagName,
        fill: getComputedStyle(el).fill,
      };
      path.remove();
      e.undo();
      return {
        ...output,
        restored: !!e.svg.querySelector("#a") && !!e.svg.querySelector("#b"),
      };
    }, operation);
    expect(result.area).toBeCloseTo(area, 3);
    expect(result.x).toBeCloseTo(operation === "intersect" ? 80 : 30, 3);
    expect(result.y).toBeCloseTo(20, 3);
    expect(result.tag).toBe("path");
    expect(result.fill).toBe("rgb(255, 0, 0)");
    expect(result.restored).toBe(true);
  });
}

test("duplicate remaps internal references and undo/redo restores document", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { SvgEditor } = await import("/src/core/editor.ts");
    const e = new SvgEditor(
      document.body.appendChild(document.createElement("div")),
    );
    e.load(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><g id="group"><defs><linearGradient id="gradient"><stop stop-color="red"/></linearGradient></defs><rect id="r" width="50" height="50" fill="url(#gradient)"/></g></svg>',
    );
    e.select(["group"]);
    const before = e.serialize();
    e.duplicate(20, 30);
    const clone = e.selected[0];
    const ids = [...e.svg.querySelectorAll("[id]")].map((x: Element) => x.id);
    const ref = clone.querySelector("rect")!.getAttribute("fill");
    const gradient = clone.querySelector("linearGradient")!.id;
    const after = e.serialize();
    e.undo();
    const undo = e.serialize() === before;
    e.redo();
    return {
      unique: new Set(ids).size === ids.length,
      ref,
      gradient,
      undo,
      redo: e.serialize() === after,
    };
  });
  expect(result.unique).toBe(true);
  expect(result.ref).toBe(`url(#${result.gradient})`);
  expect(result.undo).toBe(true);
  expect(result.redo).toBe(true);
});

test("SVG import sanitizes executable content and export roundtrips geometry and style", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { SvgEditor } = await import("/src/core/editor.ts");
    const e = new SvgEditor(
      document.body.appendChild(document.createElement("div")),
    );
    e.load(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="10 20 400 300"><script>alert(1)</script><rect id="r" onclick="alert(1)" x="30" y="40" width="60" height="70" fill="none" stroke="blue" transform="rotate(10)"/><foreignObject width="10" height="10"/><image href="javascript:alert(1)"/></svg>',
    );
    const output = e.serialize();
    e.load(output);
    const r = e.svg.querySelector("#r")!;
    return {
      output,
      viewBox: e.svg.getAttribute("viewBox"),
      width: r.getAttribute("width"),
      stroke: r.getAttribute("stroke"),
      transform: r.getAttribute("transform"),
    };
  });
  expect(result.output).not.toMatch(
    /script|onclick|foreignObject|javascript:/i,
  );
  expect(result.viewBox).toBe("10 20 400 300");
  expect(result.width).toBe("60");
  expect(result.stroke).toBe("blue");
  expect(result.transform).toBe("rotate(10)");
});

test("convert a transformed shape preserves its position and ancestor opacity", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { SvgEditor } = await import("/src/core/editor.ts");
    const e = new SvgEditor(
      document.body.appendChild(document.createElement("div")),
    );
    e.load(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><g opacity="0.5" transform="translate(30 20)"><rect id="r" width="40" height="50" transform="rotate(15)" fill="red"/></g></svg>',
    );
    e.select(["r"]);
    const before = e.bounds(e.selected[0]);
    e.convertPaths();
    return {
      before,
      after: e.bounds(e.selected[0]),
      opacity: getComputedStyle(e.selected[0]).opacity,
    };
  });
  expect(result.after.x).toBeCloseTo(result.before.x, 4);
  expect(result.after.y).toBeCloseTo(result.before.y, 4);
  expect(result.after.width).toBeCloseTo(result.before.width, 4);
  expect(result.opacity).toBe("1");
});

test("pathfinder preserves holes, curves and empty intersection", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { SvgEditor } = await import("/src/core/editor.ts");
    const e = new SvgEditor(
      document.body.appendChild(document.createElement("div")),
    );
    e.load(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><path id="ring" fill-rule="evenodd" d="M0 0H100V100H0Z M25 25H75V75H25Z"/><rect id="cover" width="100" height="100"/></svg>',
    );
    e.select(["ring", "cover"]);
    e.pathfinder("intersect");
    const p = e.geometry(e.selected[0]);
    const area = Math.abs(p.area);
    const hole = p.contains(new e.scope.Point(50, 50));
    p.remove();
    e.load(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><circle id="a" cx="50" cy="50" r="30"/><circle id="b" cx="80" cy="50" r="30"/></svg>',
    );
    e.select(["a", "b"]);
    e.pathfinder("unite");
    const curve = e.selected[0].getAttribute("d");
    e.load(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect id="a" width="10" height="10"/><rect id="b" x="100" width="10" height="10"/></svg>',
    );
    e.select(["a", "b"]);
    e.pathfinder("intersect");
    return {
      area,
      hole,
      curve,
      empty: e.svg.querySelectorAll("path,rect").length,
    };
  });
  expect(result.area).toBeCloseTo(7500, 3);
  expect(result.hole).toBe(false);
  expect(result.curve).toMatch(/[cC]/);
  expect(result.empty).toBe(0);
});

test("unsupported pathfinder is atomic and grouping retains coordinates", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { SvgEditor } = await import("/src/core/editor.ts");
    const e = new SvgEditor(
      document.body.appendChild(document.createElement("div")),
    );
    e.load(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><g transform="translate(30 20)"><rect id="a" width="20" height="20"/></g><rect id="b" x="100" width="20" height="20"/><text id="t">hello</text></svg>',
    );
    e.select(["a", "t"]);
    const before = e.serialize();
    let rejected = false;
    try {
      e.pathfinder("unite");
    } catch {
      rejected = true;
    }
    const atomic = e.serialize() === before;
    e.select(["a", "b"]);
    e.group();
    const grouped = e.selected[0].localName === "g";
    e.ungroup();
    const boxes = e.selected.map((el: SVGGraphicsElement) => e.bounds(el));
    return { atomic, rejected, grouped, boxes };
  });
  expect(result.atomic).toBe(true);
  expect(result.rejected).toBe(true);
  expect(result.grouped).toBe(true);
  expect(result.boxes.map((b) => [b.x, b.y])).toEqual([
    [30, 20],
    [100, 0],
  ]);
});

test("invalid numeric transforms are rejected without corrupting SVG", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { SvgEditor } = await import("/src/core/editor.ts");
    const e = new SvgEditor(
      document.body.appendChild(document.createElement("div")),
    );
    e.load(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect id="a" width="20" height="20"/></svg>',
    );
    e.select(["a"]);
    const before = e.serialize();
    let rejected = false;
    try {
      e.move(NaN, 0);
    } catch {
      rejected = true;
    }
    return { rejected, unchanged: before === e.serialize() };
  });
  expect(result.rejected).toBe(true);
  expect(result.unchanged).toBe(true);
});

test("clipboard preserves quoted SVG paint references after ID remapping", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { SvgEditor } = await import("/src/core/editor.ts");
    const e = new SvgEditor(
      document.body.appendChild(document.createElement("div")),
    );
    e.load(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="paint"><stop stop-color="red"/></linearGradient></defs><g transform="translate(40 20)"><rect id="r" width="40" height="50" fill="url(#paint)"/></g></svg>',
    );
    e.select(["r"]);
    e.paste(e.clipboardSvg());
    const clone = e.selected[0];
    const ref = clone.getAttribute("fill")!.match(/#([^"')]+)/)![1];
    return {
      ref,
      old: "paint",
      found: !!e.svg.querySelector(`linearGradient[id="${ref}"]`),
      x: e.bounds(clone).x,
      y: e.bounds(clone).y,
    };
  });
  expect(result.ref).not.toBe(result.old);
  expect(result.found).toBe(true);
  expect(result.x).toBeCloseTo(56, 3);
  expect(result.y).toBeCloseTo(36, 3);
});

test("alignment and distribution calculate equal gaps", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { SvgEditor } = await import("/src/core/editor.ts");
    const e = new SvgEditor(
      document.body.appendChild(document.createElement("div")),
    );
    e.load(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect id="a" y="10" width="20" height="20"/><rect id="b" x="60" y="30" width="40" height="30"/><rect id="c" x="180" y="50" width="20" height="20"/></svg>',
    );
    e.select(["a", "b", "c"]);
    e.align("top");
    e.distribute("x");
    return e.selected.map((el: SVGGraphicsElement) => e.bounds(el));
  });
  expect(result.map((b) => b.y)).toEqual([10, 10, 10]);
  expect(result.map((b) => b.x)).toEqual([0, 80, 180]);
});

test("pathfinder rejects effects on ancestors without dropping artwork", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { SvgEditor } = await import("/src/core/editor.ts");
    const e = new SvgEditor(
      document.body.appendChild(document.createElement("div")),
    );
    e.load(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><clipPath id="clip"><rect width="10" height="10"/></clipPath></defs><g clip-path="url(#clip)"><rect id="a" width="100" height="100"/></g><rect id="b" x="50" width="100" height="100"/></svg>',
    );
    e.select(["a", "b"]);
    const before = e.serialize();
    let rejected = false;
    try {
      e.pathfinder("unite");
    } catch {
      rejected = true;
    }
    return { rejected, unchanged: before === e.serialize() };
  });
  expect(result.rejected).toBe(true);
  expect(result.unchanged).toBe(true);
});
