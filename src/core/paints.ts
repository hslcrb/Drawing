import { SvgEditor, svgElement } from "./editor";
export type PaintKind = "linear" | "radial" | "points" | "lines";
export type ColorNode = {
  x: number;
  y: number;
  offset: number;
  color: string;
  opacity: number;
  radius: number;
};
export type GradientPaint = {
  kind: PaintKind;
  start: { x: number; y: number };
  end: { x: number; y: number };
  nodes: ColorNode[];
};
export function initialPaint(kind: PaintKind = "linear"): GradientPaint {
  return {
    kind,
    start: { x: 0.15, y: 0.5 },
    end: { x: 0.85, y: 0.5 },
    nodes: [
      { x: 0.2, y: 0.2, offset: 0, color: "#a58aff", opacity: 1, radius: 0.7 },
      { x: 0.8, y: 0.8, offset: 1, color: "#ffba8b", opacity: 1, radius: 0.7 },
    ],
  };
}
function validate(p: GradientPaint) {
  if (
    !["linear", "radial", "points", "lines"].includes(p.kind) ||
    p.nodes.length < 2 ||
    p.nodes.length > 64
  )
    throw new Error("색상 노드는 2~64개가 필요합니다.");
  for (const n of p.nodes) {
    if (
      !/^#[0-9a-f]{6}$/i.test(n.color) ||
      ![n.x, n.y, n.offset, n.opacity, n.radius].every(Number.isFinite) ||
      n.opacity < 0 ||
      n.opacity > 1 ||
      n.offset < 0 ||
      n.offset > 1 ||
      n.radius <= 0 ||
      n.radius > 4
    )
      throw new Error("그라데이션 값을 확인하세요.");
  }
  if (![p.start.x, p.start.y, p.end.x, p.end.y].every(Number.isFinite))
    throw new Error("그라데이션 좌표를 확인하세요.");
}
export function readPaint(
  e: SvgEditor,
  property: "fill" | "stroke",
): GradientPaint | null {
  const el = e.selected[0];
  if (!el) return null;
  const ref = (
    el.style.getPropertyValue(property) ||
    el.getAttribute(property) ||
    ""
  ).match(/url\(["']?#([^\s"')]+)["']?\)/);
  if (!ref) return null;
  const def = e.svg.querySelector(`[id="${CSS.escape(ref[1])}"]`);
  if (!def) return null;
  const data = def.getAttribute("data-drawing-paint");
  if (data) {
    try {
      const p = JSON.parse(data);
      validate(p);
      return p;
    } catch {
      return null;
    }
  }
  if (!["linearGradient", "radialGradient"].includes(def.localName))
    return null;
  const coord = (name: string, fallback: number) => {
    const v = def.getAttribute(name);
    return v === null ? fallback : parseFloat(v) / (v.endsWith("%") ? 100 : 1);
  };
  const kind = def.localName === "radialGradient" ? "radial" : "linear";
  const p = initialPaint(kind);
  p.start =
    kind === "linear"
      ? { x: coord("x1", 0), y: coord("y1", 0) }
      : { x: coord("cx", 0.5), y: coord("cy", 0.5) };
  p.end =
    kind === "linear"
      ? { x: coord("x2", 1), y: coord("y2", 0) }
      : { x: p.start.x + coord("r", 0.5), y: p.start.y };
  const stops = [...def.querySelectorAll("stop")];
  if (stops.length >= 2)
    p.nodes = stops.map((s, i) => {
      const style = getComputedStyle(s),
        canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle =
        style.stopColor || s.getAttribute("stop-color") || "#000000";
      let color = ctx.fillStyle;
      if (!color.startsWith("#")) {
        const rgb = color.match(/\d+/g) || ["0", "0", "0"];
        color =
          "#" +
          rgb
            .slice(0, 3)
            .map((x) => Number(x).toString(16).padStart(2, "0"))
            .join("");
      }
      const offset = s.getAttribute("offset") || "0";
      return {
        x: i / (stops.length - 1),
        y: 0.5,
        offset: parseFloat(offset) / (offset.endsWith("%") ? 100 : 1),
        color,
        opacity: Number(style.stopOpacity || 1),
        radius: 0.7,
      };
    });
  return p;
}
function mix(a: string, b: string, t: number) {
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          parseInt(a.slice(i, i + 2), 16) * (1 - t) +
            parseInt(b.slice(i, i + 2), 16) * t,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function buildPaint(id: string, p: GradientPaint): SVGElement {
  validate(p);
  if (p.kind === "linear" || p.kind === "radial") {
    const el = svgElement(
      p.kind === "linear" ? "linearGradient" : "radialGradient",
      {
        id,
        "data-drawing-paint": JSON.stringify(p),
        ...(p.kind === "linear"
          ? { x1: p.start.x, y1: p.start.y, x2: p.end.x, y2: p.end.y }
          : {
              cx: p.start.x,
              cy: p.start.y,
              r: Math.max(
                0.001,
                Math.hypot(p.end.x - p.start.x, p.end.y - p.start.y),
              ),
            }),
      },
    );
    for (const n of [...p.nodes].sort((a, b) => a.offset - b.offset))
      el.append(
        svgElement("stop", {
          offset: n.offset,
          "stop-color": n.color,
          "stop-opacity": n.opacity,
        }),
      );
    return el;
  }
  const pattern = svgElement("pattern", {
    id,
    "data-drawing-paint": JSON.stringify(p),
    patternUnits: "objectBoundingBox",
    width: 1,
    height: 1,
    viewBox: "0 0 1000 1000",
    preserveAspectRatio: "none",
  });
  const defs = svgElement("defs");
  pattern.append(defs);
  pattern.append(
    svgElement("rect", {
      width: 1000,
      height: 1000,
      fill: p.nodes[0].color,
      "fill-opacity": p.nodes[0].opacity,
    }),
  );
  const dots: ColorNode[] = p.kind === "points" ? p.nodes : [];
  if (p.kind === "lines")
    for (let i = 0; i < p.nodes.length - 1; i++) {
      const a = p.nodes[i],
        b = p.nodes[i + 1];
      for (let step = 0; step <= 24; step++) {
        const t = step / 24;
        dots.push({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          color: mix(a.color, b.color, t),
          opacity: a.opacity + (b.opacity - a.opacity) * t,
          radius: a.radius + (b.radius - a.radius) * t,
          offset: 0,
        });
      }
    }
  dots.forEach((n, i) => {
    const gid = `${id}-field-${i}`;
    const g = svgElement("radialGradient", { id: gid });
    g.append(
      svgElement("stop", {
        offset: 0,
        "stop-color": n.color,
        "stop-opacity": n.opacity,
      }),
      svgElement("stop", {
        offset: 1,
        "stop-color": n.color,
        "stop-opacity": 0,
      }),
    );
    defs.append(g);
    pattern.append(
      svgElement("circle", {
        cx: n.x * 1000,
        cy: n.y * 1000,
        r: n.radius * 1000,
        fill: `url(#${gid})`,
      }),
    );
  });
  return pattern;
}
export function applyPaint(
  e: SvgEditor,
  property: "fill" | "stroke",
  p: GradientPaint,
  continuous = false,
) {
  if (!e.selected.length) throw new Error("먼저 객체를 선택하세요.");
  const action = () => {
    let defs = e.svg.querySelector(":scope > defs");
    if (!defs) {
      defs = svgElement("defs");
      e.svg.prepend(defs);
    }
    const id = e.freshId();
    defs.append(buildPaint(id, p));
    for (const el of e.selected) {
      el.setAttribute(property, `url(#${id})`);
      el.style.setProperty(property, `url(#${id})`);
    }
    // Replace only our unused resources; preserve imported SVG definitions.
    const refs = new XMLSerializer().serializeToString(e.svg);
    for (const old of [...defs.children])
      if (
        old.hasAttribute("data-drawing-paint") &&
        old.id !== id &&
        !refs.includes(`url(#${old.id})`) &&
        !refs.includes(`url(&quot;#${old.id}&quot;)`)
      )
        old.remove();
  };
  if (continuous) {
    action();
    e.emit();
  } else e.command("그라데이션 변경", action);
}
