import * as opentype from "opentype.js";
import type { Font, Path as FontPath } from "opentype.js";
import type paper from "paper";
import { SvgEditor, svgElement, matrixString, type Box } from "./editor";
import type { EmbeddedFont } from "./project";
export type FontReport = {
  family: string;
  style: string;
  glyphCount: number;
  unitsPerEm: number;
  characters: { char: string; code: number; glyph: number }[];
};
export type Recognition = {
  text: string;
  score: number;
  candidates: { char: string; score: number }[][];
  bounds: Box;
  matrix: DOMMatrix;
  sourceIds: string[];
};
export function parseFont(bytes: ArrayBuffer): Font {
  return opentype.parse(bytes);
}
export function fontReport(font: Font): FontReport {
  const table = font.tables.cmap?.glyphIndexMap as
    Record<string, number> | undefined;
  const characters = Object.entries(table || {})
    .map(([code, glyph]) => ({
      char: String.fromCodePoint(Number(code)),
      code: Number(code),
      glyph,
    }))
    .filter((c) => c.code > 31 && c.code <= 0x10ffff)
    .sort((a, b) => a.code - b.code);
  const names = font.names as unknown as Record<string, unknown>;
  const find = (key: string) => {
    const name = names[key] as Record<string, string> | undefined;
    if (name) return name.en || Object.values(name)[0] || "";
    const platforms = names.windows as
      Record<string, Record<string, string>> | undefined;
    return platforms?.[key]?.en || "";
  };
  return {
    family: find("fontFamily") || "Font",
    style: find("fontSubfamily") || "Regular",
    glyphCount: font.glyphs.length,
    unitsPerEm: font.unitsPerEm,
    characters,
  };
}
export function pathData(path: FontPath) {
  return path.commands
    .map((c) => {
      switch (c.type) {
        case "M":
        case "L":
          return `${c.type}${c.x} ${c.y}`;
        case "C":
          return `C${c.x1} ${c.y1} ${c.x2} ${c.y2} ${c.x} ${c.y}`;
        case "Q":
          return `Q${c.x1} ${c.y1} ${c.x} ${c.y}`;
        default:
          return "Z";
      }
    })
    .join("");
}
export function glyphSvg(font: Font, char: string) {
  const p = font.getPath(char, 0, 0, 100),
    b = p.getBoundingBox();
  return {
    d: pathData(p),
    viewBox: `${b.x1 - 5} ${b.y1 - 5} ${Math.max(1, b.x2 - b.x1) + 10} ${Math.max(1, b.y2 - b.y1) + 10}`,
  };
}
function signature(item: paper.PathItem) {
  const b = item.bounds,
    bits = new Uint8Array(32 * 32);
  let area = 0;
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const ink = item.contains({
        x: b.x + ((x + 0.5) * b.width) / 32,
        y: b.y + ((y + 0.5) * b.height) / 32,
      } as paper.Point);
      bits[y * 32 + x] = ink ? 1 : 0;
      if (ink) area++;
    }
  return { bits, ratio: b.width / Math.max(0.001, b.height), area };
}
function difference(
  a: ReturnType<typeof signature>,
  b: ReturnType<typeof signature>,
) {
  let mismatch = 0,
    union = 0;
  for (let i = 0; i < a.bits.length; i++) {
    if (a.bits[i] || b.bits[i]) union++;
    if (a.bits[i] !== b.bits[i]) mismatch++;
  }
  return (
    mismatch / Math.max(1, union) +
    Math.min(1, Math.abs(Math.log(a.ratio / b.ratio))) * 0.35
  );
}
export async function recognizeOutlines(
  e: SvgEditor,
  font: Font,
  characters: string,
  onProgress: (v: number) => void = () => {},
): Promise<Recognition> {
  const selected = e.topSelected();
  if (!selected.length || selected.some((el) => !el.matches("path,g")))
    throw new Error("경로 글자 또는 경로로 된 그룹을 선택하세요.");
  const matrix =
    selected.length === 1 ? e.globalMatrix(selected[0]) : new DOMMatrix();
  const geometry = selected.map((el) => e.geometry(el, true));
  for (const g of geometry)
    g.transform(
      new e.scope.Matrix(
        matrix.inverse().a,
        matrix.inverse().b,
        matrix.inverse().c,
        matrix.inverse().d,
        matrix.inverse().e,
        matrix.inverse().f,
      ),
    );
  try {
    const contours: paper.Path[] = [];
    for (const g of geometry) {
      if (g instanceof e.scope.CompoundPath)
        contours.push(...(g.children as paper.Path[]));
      else contours.push(g as paper.Path);
    }
    const ordered = contours
      .filter((p) => p.bounds.width > 0.01 && p.bounds.height > 0.01)
      .sort((a, b) => a.bounds.x - b.bounds.x);
    const groups: paper.Path[][] = [];
    for (const p of ordered) {
      const last = groups.at(-1),
        right = last ? Math.max(...last.map((p) => p.bounds.right)) : -Infinity;
      if (last && p.bounds.left <= right + 0.25) last.push(p);
      else groups.push([p]);
    }
    if (!groups.length || groups.length > 120)
      throw new Error("한 번에 1~120개의 분리 가능한 글자를 분석하세요.");
    const report = fontReport(font),
      chars = [
        ...new Set([
          ...(characters ||
            report.characters
              .slice(0, 4096)
              .map((c) => c.char)
              .join("")),
        ]),
      ].filter((c) => font.hasChar(c) && !/^\s$/.test(c));
    if (!chars.length || chars.length > 4096)
      throw new Error("비교할 문자를 1~4096개 지정하세요.");
    const targets = groups.map((paths) => {
      const cp = new e.scope.CompoundPath({
        children: paths.map((p) => p.clone({ insert: false })),
        insert: false,
      });
      return cp;
    });
    const signatures = targets.map(signature),
      candidates: { char: string; score: number }[][] = targets.map(() => []);
    try {
      for (let i = 0; i < chars.length; i++) {
        const c = chars[i],
          data = pathData(font.getPath(c, 0, 0, 100));
        if (!data) continue;
        const glyph = new e.scope.CompoundPath({
          pathData: data,
          insert: false,
        });
        try {
          if (glyph.bounds.width && glyph.bounds.height) {
            const sig = signature(glyph);
            for (let j = 0; j < signatures.length; j++) {
              const score = Math.max(0, 1 - difference(signatures[j], sig));
              candidates[j].push({ char: c, score });
              candidates[j].sort((a, b) => b.score - a.score);
              candidates[j] = candidates[j].slice(0, 5);
            }
          }
        } finally {
          glyph.remove();
        }
        if (i % 32 === 0) {
          onProgress(i / chars.length);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      const box = targets.reduce(
        (b, p) => (b ? b.unite(p.bounds) : p.bounds.clone()),
        null as paper.Rectangle | null,
      )!;
      const sizes = candidates.map((list, i) => {
        const p = font
          .getPath(list[0]?.char || "?", 0, 0, 100)
          .getBoundingBox();
        return (targets[i].bounds.height / Math.max(0.001, p.y2 - p.y1)) * 100;
      });
      const typical = sizes.sort((a, b) => a - b)[Math.floor(sizes.length / 2)];
      let text = "";
      for (let i = 0; i < candidates.length; i++) {
        if (
          i &&
          targets[i].bounds.left - targets[i - 1].bounds.right > typical * 0.25
        )
          text += " ";
        text += candidates[i][0]?.char || "?";
      }
      onProgress(1);
      return {
        text,
        score:
          candidates.reduce((n, c) => n + (c[0]?.score || 0), 0) /
          candidates.length,
        candidates,
        bounds: { x: box.x, y: box.y, width: box.width, height: box.height },
        matrix,
        sourceIds: selected.map((el) => el.id),
      };
    } finally {
      targets.forEach((p) => p.remove());
    }
  } finally {
    geometry.forEach((g) => g.remove());
  }
}
export function replaceWithText(
  e: SvgEditor,
  font: Font,
  embedded: EmbeddedFont,
  text: string,
  result: Recognition,
) {
  if (!text.trim()) throw new Error("복원할 텍스트를 입력하세요.");
  const sources = result.sourceIds.map((id) =>
    e.svg.querySelector<SVGGraphicsElement>(`[id="${CSS.escape(id)}"]`),
  );
  if (sources.some((el) => !el))
    throw new Error("분석한 원본이 변경되었습니다. 다시 분석하세요.");
  const p = font.getPath(text, 0, 0, 100),
    ref = p.getBoundingBox(),
    box = result.bounds,
    sy = box.height / Math.max(0.001, ref.y2 - ref.y1),
    sx = box.width / Math.max(0.001, ref.x2 - ref.x1);
  const root = sources[0]!,
    leaf =
      root.localName === "path" ? root : root.querySelector("path") || root,
    paint = getComputedStyle(leaf),
    m = result.matrix.translate(box.x, box.y).scale(sx / sy, 1);
  e.command("Retypo 텍스트 복원", () => {
    e.project.fonts.push(embedded);
    let defs = e.svg.querySelector(":scope > defs");
    if (!defs) {
      defs = svgElement("defs");
      e.svg.prepend(defs);
    }
    const css = svgElement("style", { "data-font": embedded.id });
    css.textContent = `@font-face{font-family:'${embedded.family}';src:url('${embedded.data}');font-display:block}`;
    defs.append(css);
    const el = svgElement<SVGTextElement>("text", {
      id: sources.length === 1 ? root.id : e.freshId(),
      x: -ref.x1 * sy,
      y: -ref.y1 * sy,
      "font-size": 100 * sy,
      "font-family": embedded.family,
      "font-variant-ligatures": "none",
      fill: paint.fill,
      stroke: paint.stroke,
      "stroke-width": paint.strokeWidth,
      transform: matrixString(m),
      "data-name": root.getAttribute("data-name") || "Retypo 텍스트",
      "data-retypo": "true",
    });
    const master = root.getAttribute("data-brand-master");
    if (master) el.setAttribute("data-brand-master", master);
    el.textContent = text;
    sources.forEach((s) => s!.remove());
    e.svg.append(el);
    e.ids = [el.id];
  });
}
