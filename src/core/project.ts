export type Keyframe = {
  time: number;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  opacity: number;
  easing: "linear" | "ease-in-out" | "step";
};
export type Track = { id: string; keys: Keyframe[] };
export type ViewState = {
  zoom: number;
  scrollX: number;
  scrollY: number;
  mode: "design" | "motion";
  tool: string;
  selection: string[];
  expanded: string[];
  fill: string;
  stroke: string;
  strokeWidth: number;
  time: number;
  inspectorScroll?: number;
  paintHandles?: "fill" | "stroke" | null;
};
export type Asset = { id: string; name: string; mime: string; data: string };
export type EmbeddedFont = {
  id: string;
  name: string;
  family: string;
  mode: "full" | "subset";
  data: string;
  characters: string;
  bytes: number;
};
export type ProjectData = {
  assets: Asset[];
  fonts: EmbeddedFont[];
  motion: { duration: number; fps: number; loop: boolean; tracks: Track[] };
};
export type ProjectFile = {
  format: "Drawing";
  version: 1;
  svg: string;
  resources: ProjectData;
  workspace: ViewState;
  extensions: Record<string, unknown>;
};
export const emptyProject = (): ProjectData => ({
  assets: [],
  fonts: [],
  motion: { duration: 3, fps: 30, loop: true, tracks: [] },
});
export const defaultView = (): ViewState => ({
  zoom: 0.8,
  scrollX: 0,
  scrollY: 0,
  mode: "design",
  tool: "select",
  selection: [],
  expanded: [],
  fill: "#8b75ff",
  stroke: "none",
  strokeWidth: 2,
  time: 0,
  inspectorScroll: 0,
  paintHandles: null,
});
export const identityKey = (time = 0): Keyframe => ({
  time,
  x: 0,
  y: 0,
  rotation: 0,
  scale: 1,
  opacity: 1,
  easing: "linear",
});
const finite = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
export function validateProject(value: unknown): ProjectFile {
  const p = value as ProjectFile;
  const fail = () => {
    throw new Error("지원하지 않거나 손상된 Drawing 프로젝트입니다.");
  };
  if (
    !p ||
    p.format !== "Drawing" ||
    p.version !== 1 ||
    typeof p.svg !== "string" ||
    p.svg.length > 150 * 1024 * 1024
  )
    return fail();
  const r = p.resources,
    v = p.workspace;
  if (
    v &&
    ((v.inspectorScroll !== undefined && !finite(v.inspectorScroll, 0, 1e7)) ||
      (v.paintHandles !== undefined &&
        ![null, "fill", "stroke"].includes(v.paintHandles)))
  )
    return fail();
  if (
    !r ||
    !Array.isArray(r.assets) ||
    !Array.isArray(r.fonts) ||
    !r.motion ||
    !finite(r.motion.duration, 0.1, 3600) ||
    !finite(r.motion.fps, 1, 120) ||
    typeof r.motion.loop !== "boolean" ||
    !Array.isArray(r.motion.tracks) ||
    !v ||
    !finite(v.zoom, 0.05, 8) ||
    !finite(v.scrollX, 0, 1e7) ||
    !finite(v.scrollY, 0, 1e7) ||
    !["design", "motion"].includes(v.mode) ||
    ![
      "select",
      "node",
      "pen",
      "rect",
      "ellipse",
      "line",
      "text",
      "hand",
    ].includes(v.tool) ||
    !finite(v.time, 0, r.motion.duration) ||
    !finite(v.strokeWidth, 0, 10000) ||
    typeof v.fill !== "string" ||
    typeof v.stroke !== "string" ||
    !Array.isArray(v.selection) ||
    !v.selection.every((x) => typeof x === "string") ||
    !Array.isArray(v.expanded) ||
    !v.expanded.every((x) => typeof x === "string")
  )
    return fail();
  const ids = new Set<string>();
  for (const a of r.assets) {
    if (
      !a ||
      typeof a.id !== "string" ||
      ids.has(a.id) ||
      typeof a.name !== "string" ||
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
        a.mime,
      ) ||
      typeof a.data !== "string" ||
      !/^data:image\/(png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(a.data)
    )
      return fail();
    ids.add(a.id);
  }
  for (const f of r.fonts) {
    if (
      !f ||
      typeof f.id !== "string" ||
      ids.has(f.id) ||
      typeof f.name !== "string" ||
      !/^[a-zA-Z0-9_-]+$/.test(f.family) ||
      !["full", "subset"].includes(f.mode) ||
      typeof f.characters !== "string" ||
      !finite(f.bytes, 1, 30 * 1024 * 1024) ||
      !/^data:font\/(ttf|otf);base64,[a-zA-Z0-9+/=]+$/.test(f.data)
    )
      return fail();
    ids.add(f.id);
  }
  const tracks = new Set<string>();
  for (const t of r.motion.tracks) {
    if (
      !t ||
      typeof t.id !== "string" ||
      tracks.has(t.id) ||
      !Array.isArray(t.keys)
    )
      return fail();
    tracks.add(t.id);
    const times = new Set<number>();
    for (const k of t.keys) {
      if (
        !k ||
        !finite(k.time, 0, r.motion.duration) ||
        times.has(k.time) ||
        !finite(k.x, -1e6, 1e6) ||
        !finite(k.y, -1e6, 1e6) ||
        !finite(k.rotation, -36000, 36000) ||
        !finite(k.scale, 0.001, 1000) ||
        !finite(k.opacity, 0, 1) ||
        !["linear", "ease-in-out", "step"].includes(k.easing)
      )
        return fail();
      times.add(k.time);
    }
    t.keys.sort((a, b) => a.time - b.time);
  }
  if (
    !p.extensions ||
    typeof p.extensions !== "object" ||
    Array.isArray(p.extensions)
  )
    return fail();
  return structuredClone(p);
}
