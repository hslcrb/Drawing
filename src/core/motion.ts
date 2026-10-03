import { SvgEditor, svgElement, point } from "./editor";
import { identityKey, type Keyframe, type Track } from "./project";
export function sampleTrack(track: Track, time: number): Keyframe {
  const keys = [...track.keys].sort((a, b) => a.time - b.time);
  if (!keys.length) return identityKey(time);
  if (time <= keys[0].time) return { ...keys[0], time };
  if (time >= keys.at(-1)!.time) return { ...keys.at(-1)!, time };
  const i = keys.findIndex((k) => k.time >= time),
    a = keys[i - 1],
    b = keys[i];
  let t = (time - a.time) / (b.time - a.time);
  if (a.easing === "step") t = 0;
  if (a.easing === "ease-in-out") t = t * t * (3 - 2 * t);
  const result = { ...a, time };
  for (const property of ["x", "y", "rotation", "scale", "opacity"] as const)
    result[property] = a[property] + (b[property] - a[property]) * t;
  return result;
}
export function upsertKey(e: SvgEditor, id: string, key: Keyframe) {
  if (!e.svg.querySelector(`[id="${CSS.escape(id)}"]`))
    throw new Error("애니메이션 객체가 없습니다.");
  if (
    ![key.time, key.x, key.y, key.rotation, key.scale, key.opacity].every(
      Number.isFinite,
    ) ||
    key.time < 0 ||
    key.time > e.project.motion.duration ||
    key.scale <= 0 ||
    key.opacity < 0 ||
    key.opacity > 1
  )
    throw new Error("키프레임 값을 확인하세요.");
  e.command("키프레임 저장", () => {
    let track = e.project.motion.tracks.find((t) => t.id === id);
    if (!track) {
      track = { id, keys: [] };
      e.project.motion.tracks.push(track);
    }
    const i = track.keys.findIndex(
      (k) => Math.abs(k.time - key.time) < 0.00001,
    );
    if (i >= 0) track.keys[i] = structuredClone(key);
    else track.keys.push(structuredClone(key));
    track.keys.sort((a, b) => a.time - b.time);
  });
}
function center(e: SvgEditor, id: string) {
  const el = e.svg.querySelector<SVGGraphicsElement>(
    `[id="${CSS.escape(id)}"]`,
  );
  if (!el) return { x: 0, y: 0 };
  const b = el.getBBox();
  let m = new DOMMatrix();
  for (let i = 0; i < el.transform.baseVal.numberOfItems; i++)
    m = m.multiply(el.transform.baseVal.getItem(i).matrix);
  return point(m, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
}
function wrap(svg: SVGSVGElement, id: string) {
  const el = svg.querySelector(`[id="${CSS.escape(id)}"]`);
  if (!el) return null;
  const g = svgElement<SVGGElement>("g", { "data-motion-target": id });
  el.replaceWith(g);
  g.append(el);
  return g;
}
export function previewSvg(e: SvgEditor, time: number): SVGSVGElement {
  const svg = e.svg.cloneNode(true) as SVGSVGElement;
  svg.removeAttribute("data-testid");
  for (const track of e.project.motion.tracks) {
    const g = wrap(svg, track.id);
    if (!g) continue;
    const k = sampleTrack(track, time),
      c = center(e, track.id);
    g.setAttribute(
      "transform",
      `translate(${k.x} ${k.y}) translate(${c.x} ${c.y}) rotate(${k.rotation}) scale(${k.scale}) translate(${-c.x} ${-c.y})`,
    );
    g.setAttribute("opacity", String(k.opacity));
  }
  return svg;
}
export function animatedSvg(e: SvgEditor): string {
  const svg = e.svg.cloneNode(true) as SVGSVGElement;
  svg.removeAttribute("data-testid");
  const { duration, loop } = e.project.motion;
  // Sample the same easing used by the editor so exported playback matches it.
  const count = Math.min(
    1800,
    Math.max(2, Math.ceil(duration * e.project.motion.fps)),
  );
  const times = Array.from(
    { length: count + 1 },
    (_, i) => (i * duration) / count,
  );
  for (const track of e.project.motion.tracks) {
    if (!track.keys.length) continue;
    const outer = wrap(svg, track.id);
    if (!outer) continue;
    const el = outer.firstElementChild!,
      c = center(e, track.id);
    const pivot = svgElement("g", { transform: `translate(${c.x} ${c.y})` }),
      rotate = svgElement("g"),
      scale = svgElement("g"),
      unpivot = svgElement("g", { transform: `translate(${-c.x} ${-c.y})` });
    outer.append(pivot);
    pivot.append(rotate);
    rotate.append(scale);
    scale.append(unpivot);
    unpivot.append(el);
    const keys = times.map((t) => sampleTrack(track, t));
    const attrs = {
      dur: `${duration}s`,
      repeatCount: loop ? "indefinite" : 1,
      fill: "freeze",
      keyTimes: times.map((t) => t / duration).join(";"),
      calcMode: "linear",
    };
    for (const [target, type, values] of [
      [outer, "translate", keys.map((k) => `${k.x} ${k.y}`)],
      [rotate, "rotate", keys.map((k) => String(k.rotation))],
      [scale, "scale", keys.map((k) => String(k.scale))],
    ] as const) {
      target.append(
        svgElement("animateTransform", {
          ...attrs,
          attributeName: "transform",
          type,
          values: values.join(";"),
        }),
      );
    }
    outer.append(
      svgElement("animate", {
        ...attrs,
        attributeName: "opacity",
        values: keys.map((k) => k.opacity).join(";"),
      }),
    );
  }
  return new XMLSerializer().serializeToString(svg);
}
