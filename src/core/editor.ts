import paperCore from "paper/dist/paper-core";
import type paper from "paper";
import {
  emptyProject,
  defaultView,
  validateProject,
  type ProjectData,
  type ViewState,
} from "./project";

export const NS = "http://www.w3.org/2000/svg";
export type Vec = { x: number; y: number };
export type Box = Vec & { width: number; height: number };
export type BooleanOp = "unite" | "subtract" | "intersect" | "exclude";
type Snapshot = { xml: string; selection: string[]; project: ProjectData };
type Entry = { before: Snapshot; after: Snapshot; label: string };
const graphics =
  "path,rect,circle,ellipse,line,polyline,polygon,text,image,use,g";
const resources = "defs,clipPath,mask,pattern,marker,symbol";
const paintProperties = [
  "fill",
  "stroke",
  "stroke-width",
  "fill-opacity",
  "stroke-opacity",
  "fill-rule",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-miterlimit",
  "vector-effect",
  "font-size",
  "font-family",
  "font-weight",
  "text-anchor",
  "color",
];
export function svgElement<T extends SVGElement = SVGElement>(
  tag: string,
  attrs: Record<string, string | number> = {},
): T {
  const el = document.createElementNS(NS, tag) as T;
  Object.entries(attrs).forEach(([key, val]) =>
    el.setAttribute(key, String(val)),
  );
  return el;
}
export function matrixString(m: DOMMatrix | SVGMatrix) {
  return `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;
}
export function point(m: DOMMatrix | SVGMatrix, p: Vec): Vec {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

export class SvgEditor {
  project: ProjectData = emptyProject();
  extensions: Record<string, unknown> = {};
  svg!: SVGSVGElement;
  ids: string[] = [];
  status = "준비";
  onChange: () => void = () => {};
  readonly scope = new paperCore.PaperScope();
  private past: Entry[] = [];
  private future: Entry[] = [];
  private pending: Snapshot | null = null;
  private saved = "";
  private counter = 0;
  constructor(readonly host: HTMLElement) {
    this.scope.setup(document.createElement("canvas"));
    this.newDocument(960, 640);
  }
  get selected(): SVGGraphicsElement[] {
    return this.ids
      .map((id) => this.svg.querySelector(`[id="${CSS.escape(id)}"]`))
      .filter(Boolean) as SVGGraphicsElement[];
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  get dirty() {
    return this.fingerprint() !== this.saved;
  }
  get size(): Box {
    const b = this.svg.viewBox.baseVal;
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }
  freshId() {
    let id;
    do {
      id = `drawing-${++this.counter}`;
    } while (this.svg?.querySelector(`[id="${id}"]`));
    return id;
  }
  private ensureIds() {
    const used = new Set<string>();
    this.svg.querySelectorAll("*").forEach((el) => {
      if (el.id && used.has(el.id)) el.id = this.freshId();
      if (el.matches(graphics) && !el.id) el.id = this.freshId();
      if (el.id) used.add(el.id);
    });
  }
  private mount(svg: SVGSVGElement) {
    this.svg = document.importNode(svg, true);
    this.svg.setAttribute("xmlns", NS);
    this.svg.setAttribute("data-testid", "artboard");
    if (!this.svg.hasAttribute("viewBox")) {
      const w = parseFloat(this.svg.getAttribute("width") || "960") || 960;
      const h = parseFloat(this.svg.getAttribute("height") || "640") || 640;
      this.svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    }
    this.host.replaceChildren(this.svg);
    this.ensureIds();
  }
  load(xml: string) {
    const parsed = new DOMParser().parseFromString(xml, "image/svg+xml");
    if (
      parsed.querySelector("parsererror") ||
      parsed.documentElement.localName !== "svg"
    )
      throw new Error("올바른 SVG 파일이 아닙니다.");
    const svg = parsed.documentElement as unknown as SVGSVGElement;
    svg
      .querySelectorAll(
        "script,foreignObject,iframe,object,embed,audio,video,animate,animateMotion,animateTransform,set",
      )
      .forEach((el) => el.remove());
    for (const el of [svg, ...svg.querySelectorAll("*")]) {
      for (const attr of [...el.attributes]) {
        const val = attr.value.trim();
        if (
          /^on/i.test(attr.name) ||
          (/href$/i.test(attr.name) &&
            !/^(#|data:image\/(png|jpeg|gif|webp);base64,)/i.test(val)) ||
          /(?:javascript|vbscript)\s*:|url\(\s*['"]?\s*(?:https?:|\/\/|file:)|@import/i.test(
            val,
          )
        )
          el.removeAttributeNode(attr);
      }
      if (el.localName === "style")
        el.textContent = (el.textContent || "")
          .replace(/@import[^;]+;?/gi, "")
          .replace(/url\([^)]*\)/gi, (m) =>
            /^url\(\s*['"]?(#|data:font\/(ttf|otf);base64,)/i.test(m)
              ? m
              : "none",
          );
    }
    this.mount(svg);
    this.project = emptyProject();
    this.extensions = {};
    this.ids = [];
    this.past = [];
    this.future = [];
    this.pending = null;
    this.markSaved();
    this.status = "SVG 문서를 열었습니다.";
    this.emit();
  }
  newDocument(width = 960, height = 640) {
    if (!(width > 0 && height > 0 && width <= 100000 && height <= 100000))
      throw new Error("문서 크기는 1~100000 사이여야 합니다.");
    this.load(
      `<svg xmlns="${NS}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"></svg>`,
    );
    this.status = "새 문서";
  }
  serialize() {
    const clone = this.svg.cloneNode(true) as SVGSVGElement;
    clone.removeAttribute("data-testid");
    return new XMLSerializer().serializeToString(clone);
  }
  private fingerprint() {
    return this.serialize() + JSON.stringify(this.project);
  }
  serializeProject(workspace: ViewState = defaultView()) {
    return JSON.stringify(
      {
        format: "Drawing",
        version: 1,
        svg: this.serialize(),
        resources: this.project,
        workspace,
        extensions: this.extensions,
      },
      null,
      2,
    );
  }
  loadDocument(content: string): ViewState | null {
    if (!content.trimStart().startsWith("{")) {
      this.load(content);
      return null;
    }
    const p = validateProject(JSON.parse(content));
    this.load(p.svg);
    this.project = p.resources;
    this.extensions = p.extensions;
    this.select(p.workspace.selection);
    this.markSaved();
    return p.workspace;
  }
  markSaved() {
    this.saved = this.fingerprint();
    this.emit();
  }
  private snapshot(): Snapshot {
    return {
      xml: this.serialize(),
      selection: [...this.ids],
      project: structuredClone(this.project),
    };
  }
  private restore(s: Snapshot) {
    this.mount(
      new DOMParser().parseFromString(s.xml, "image/svg+xml")
        .documentElement as unknown as SVGSVGElement,
    );
    this.ids = [...s.selection];
    this.project = structuredClone(s.project);
  }
  begin() {
    if (!this.pending) this.pending = this.snapshot();
  }
  commit(label = "편집") {
    if (!this.pending) return;
    const before = this.pending;
    this.pending = null;
    const after = this.snapshot();
    if (
      before.xml !== after.xml ||
      JSON.stringify(before.project) !== JSON.stringify(after.project)
    ) {
      this.past.push({ before, after, label });
      if (this.past.length > 150) this.past.shift();
      this.future = [];
    }
    this.status = label;
    this.emit();
  }
  cancel() {
    if (this.pending) this.restore(this.pending);
    this.pending = null;
    this.emit();
  }
  command(label: string, action: () => void) {
    this.begin();
    try {
      action();
      this.ensureIds();
      this.commit(label);
    } catch (error) {
      this.cancel();
      throw error;
    }
  }
  undo() {
    if (this.pending) this.cancel();
    const entry = this.past.pop();
    if (entry) {
      this.restore(entry.before);
      this.future.push(entry);
      this.status = `실행 취소: ${entry.label}`;
      this.emit();
    }
  }
  redo() {
    const entry = this.future.pop();
    if (entry) {
      this.restore(entry.after);
      this.past.push(entry);
      this.status = `다시 실행: ${entry.label}`;
      this.emit();
    }
  }
  emit() {
    this.onChange();
  }
  select(ids: string[], toggle = false) {
    let next = toggle ? [...this.ids] : [];
    for (const id of ids) {
      if (toggle && next.includes(id)) next = next.filter((x) => x !== id);
      else if (!next.includes(id)) next.push(id);
    }
    this.ids = next.filter(
      (id) => !!this.svg.querySelector(`[id="${CSS.escape(id)}"]`),
    );
    this.emit();
  }
  editable(el: Element) {
    return (
      !el.closest(resources) &&
      !el.closest('[data-locked="true"]') &&
      !this.hidden(el)
    );
  }
  hidden(el: Element) {
    for (
      let p: Element | null = el;
      p && p !== this.svg.parentElement;
      p = p.parentElement
    ) {
      const s = getComputedStyle(p);
      if (
        s.display === "none" ||
        s.visibility === "hidden" ||
        s.visibility === "collapse"
      )
        return true;
    }
    return false;
  }
  objects() {
    return [...this.svg.querySelectorAll<SVGGraphicsElement>(graphics)].filter(
      (el) => this.editable(el),
    );
  }
  selectAll() {
    this.select(
      [...this.svg.children]
        .filter((el) => el.matches(graphics) && this.editable(el))
        .map((el) => el.id),
    );
  }
  topSelected() {
    return this.selected.filter(
      (el) =>
        !this.selected.some((other) => other !== el && other.contains(el)),
    );
  }
  globalMatrix(el: SVGGraphicsElement): DOMMatrix {
    const root = this.svg.getScreenCTM(),
      m = el.getScreenCTM();
    return root && m
      ? new DOMMatrix([root.a, root.b, root.c, root.d, root.e, root.f])
          .inverse()
          .multiply(new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]))
      : new DOMMatrix();
  }
  bounds(el: SVGGraphicsElement): Box {
    const b = el.getBBox();
    const m = this.globalMatrix(el);
    const pts = [
      point(m, { x: b.x, y: b.y }),
      point(m, { x: b.x + b.width, y: b.y }),
      point(m, { x: b.x, y: b.y + b.height }),
      point(m, { x: b.x + b.width, y: b.y + b.height }),
    ];
    const x = Math.min(...pts.map((p) => p.x)),
      y = Math.min(...pts.map((p) => p.y));
    return {
      x,
      y,
      width: Math.max(...pts.map((p) => p.x)) - x,
      height: Math.max(...pts.map((p) => p.y)) - y,
    };
  }
  selectionBounds(): Box | null {
    const b = this.selected.map((el) => this.bounds(el));
    if (!b.length) return null;
    const x = Math.min(...b.map((b) => b.x)),
      y = Math.min(...b.map((b) => b.y));
    return {
      x,
      y,
      width: Math.max(...b.map((b) => b.x + b.width)) - x,
      height: Math.max(...b.map((b) => b.y + b.height)) - y,
    };
  }
  applyMatrix(el: SVGGraphicsElement, world: DOMMatrix, original?: string) {
    const parent = el.parentNode;
    const p =
      parent instanceof SVGGraphicsElement && parent !== this.svg
        ? this.globalMatrix(parent)
        : new DOMMatrix();
    let local = new DOMMatrix();
    if (original !== undefined) {
      const temp = svgElement<SVGGraphicsElement>("g", { transform: original });
      this.svg.append(temp);
      const m = temp.transform.baseVal.consolidate()?.matrix;
      if (m) local = new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]);
      temp.remove();
    } else {
      const m = el.transform.baseVal.consolidate()?.matrix;
      if (m) local = new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]);
    }
    el.setAttribute(
      "transform",
      matrixString(p.inverse().multiply(world).multiply(p).multiply(local)),
    );
  }
  transform(world: DOMMatrix, label = "변형") {
    this.command(label, () =>
      this.topSelected().forEach((el) => this.applyMatrix(el, world)),
    );
  }
  private finite(...values: number[]) {
    if (!values.every(Number.isFinite))
      throw new Error("유효한 숫자를 입력하세요.");
  }
  move(dx: number, dy: number) {
    this.finite(dx, dy);
    this.transform(new DOMMatrix().translate(dx, dy), "이동");
  }
  resize(width: number, height: number) {
    this.finite(width, height);
    const b = this.selectionBounds();
    if (!b || b.width === 0 || b.height === 0 || width <= 0 || height <= 0)
      return;
    this.transform(
      new DOMMatrix()
        .translate(b.x, b.y)
        .scale(width / b.width, height / b.height)
        .translate(-b.x, -b.y),
      "크기 변경",
    );
  }
  rotate(angle: number) {
    this.finite(angle);
    const b = this.selectionBounds();
    if (b)
      this.transform(
        new DOMMatrix()
          .translate(b.x + b.width / 2, b.y + b.height / 2)
          .rotate(angle)
          .translate(-b.x - b.width / 2, -b.y - b.height / 2),
        "회전",
      );
  }
  add(el: SVGGraphicsElement) {
    this.svg.append(el);
    this.ensureIds();
    this.ids = [el.id];
  }
  create(tag: string, attrs: Record<string, string | number>, text?: string) {
    let result!: SVGGraphicsElement;
    this.command("객체 만들기", () => {
      result = svgElement<SVGGraphicsElement>(tag, attrs);
      if (text !== undefined) result.textContent = text;
      this.add(result);
    });
    return result;
  }
  setStyle(property: string, value: string) {
    if (property === "font-size" && /^\d+(?:\.\d+)?$/.test(value))
      value += "px";
    if (!CSS.supports(property, value))
      throw new Error("유효한 색상 또는 속성 값을 입력하세요.");
    this.command("속성 변경", () =>
      this.selected.forEach((el) => {
        el.setAttribute(property, value);
        el.style.setProperty(property, value);
      }),
    );
  }
  setName(el: Element, name: string) {
    this.command("이름 변경", () => el.setAttribute("data-name", name));
  }
  setText(text: string) {
    this.command("텍스트 변경", () =>
      this.selected
        .filter((el) => el.localName === "text")
        .forEach((el) => (el.textContent = text)),
    );
  }
  private cloneNodes(nodes: SVGGraphicsElement[]) {
    const clones = nodes.map((el) => el.cloneNode(true) as SVGGraphicsElement);
    const map = new Map<string, string>();
    for (const clone of clones)
      for (const el of [clone, ...clone.querySelectorAll("[id]")]) {
        if (el.id) {
          const id = this.freshId();
          map.set(el.id, id);
          el.id = id;
        }
      }
    for (const clone of clones)
      for (const el of [clone, ...clone.querySelectorAll("*")]) {
        for (const attr of [...el.attributes]) {
          let val = attr.value;
          val = val.replace(
            /url\(\s*['"]?#([^'"\s)]+)['"]?\s*\)/g,
            (original, id: string) =>
              map.has(id) ? `url(#${map.get(id)})` : original,
          );
          for (const [old, id] of map) {
            if (val === `#${old}`) val = `#${id}`;
          }
          el.setAttributeNS(attr.namespaceURI, attr.name, val);
        }
        if (el.localName === "style") {
          let css = el.textContent || "";
          for (const [old, id] of map)
            css = css.replaceAll(`#${old}`, `#${id}`);
          el.textContent = css;
        }
      }
    return clones;
  }
  duplicateRaw(dx = 0, dy = 0) {
    const source = this.topSelected();
    const clones = this.cloneNodes(source);
    source.forEach((el, i) => {
      el.after(clones[i]);
      if (dx || dy)
        this.applyMatrix(clones[i], new DOMMatrix().translate(dx, dy));
    });
    this.ids = clones.map((el) => el.id);
    return clones;
  }
  duplicate(dx = 16, dy = 16) {
    this.command("복제", () => {
      this.duplicateRaw(dx, dy);
    });
  }
  deleteSelection() {
    this.command("삭제", () => {
      this.topSelected().forEach((el) => el.remove());
      this.ids = [];
    });
  }
  private referencedIds() {
    const refs = new Set<string>();
    for (const el of [this.svg, ...this.svg.querySelectorAll("*")]) {
      for (const attr of [...el.attributes]) {
        if (/href$/.test(attr.name) && attr.value.startsWith("#"))
          refs.add(attr.value.slice(1));
        for (const match of attr.value.matchAll(
          /url\(\s*['"]?#([^'"\s)]+)['"]?\s*\)/g,
        ))
          refs.add(match[1]);
      }
      if (el.localName === "style")
        for (const match of (el.textContent || "").matchAll(
          /url\(\s*['"]?#([^'"\s)]+)['"]?\s*\)/g,
        ))
          refs.add(match[1]);
    }
    return refs;
  }
  transparentElements(): SVGGraphicsElement[] {
    const refs = this.referencedIds();
    const candidates: SVGGraphicsElement[] = [];
    const alphaZero = (paint: string) =>
      paint === "none" ||
      paint === "transparent" ||
      /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(paint) ||
      /\/\s*0(?:\.0+)?\s*\)$/.test(paint);
    for (const el of this.svg.querySelectorAll<SVGGraphicsElement>(graphics)) {
      if (
        el.closest(resources) ||
        this.hidden(el) ||
        [el, ...el.querySelectorAll("[id]")].some((n) => refs.has(n.id))
      )
        continue;
      let zero = false;
      for (
        let p: Element | null = el;
        p && p !== this.svg.parentElement;
        p = p.parentElement
      )
        if (Number(getComputedStyle(p).opacity) === 0) zero = true;
      const s = getComputedStyle(el);
      // Filters and markers can paint artwork independently of fill/stroke.
      const special =
        s.filter !== "none" ||
        s.markerStart !== "none" ||
        s.markerMid !== "none" ||
        s.markerEnd !== "none" ||
        s.maskImage !== "none";
      if (!zero && (special || ["g", "image", "use"].includes(el.localName)))
        continue;
      const noFill = alphaZero(s.fill) || Number(s.fillOpacity) === 0;
      const noStroke =
        alphaZero(s.stroke) ||
        Number(s.strokeOpacity) === 0 ||
        parseFloat(s.strokeWidth) === 0;
      if (zero || (noFill && noStroke)) candidates.push(el);
    }
    return candidates.filter(
      (el) =>
        !candidates.some((parent) => parent !== el && parent.contains(el)),
    );
  }
  selectTransparent() {
    const els = this.transparentElements();
    this.select(els.map((el) => el.id));
    this.status = `완전히 투명한 요소 ${els.length}개 선택`;
    this.emit();
  }
  deleteTransparent() {
    this.command("완전히 투명한 요소 삭제", () => {
      const els = this.transparentElements();
      els.forEach((el) => el.remove());
      this.ids = this.ids.filter(
        (id) => !!this.svg.querySelector(`[id="${CSS.escape(id)}"]`),
      );
      this.status = `투명 요소 ${els.length}개 삭제`;
    });
  }
  private shapeData(el: SVGGraphicsElement): string {
    const n = (key: string, fallback = 0) =>
      parseFloat(el.getAttribute(key) || String(fallback));
    switch (el.localName) {
      case "path":
        return el.getAttribute("d") || "";
      case "rect": {
        const x = n("x"),
          y = n("y"),
          w = n("width"),
          h = n("height"),
          rx = Math.min(n("rx", n("ry")), w / 2),
          ry = Math.min(n("ry", rx), h / 2);
        return rx || ry
          ? `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
          : `M${x} ${y}h${w}v${h}h${-w}Z`;
      }
      case "circle":
      case "ellipse": {
        const x = n("cx"),
          y = n("cy"),
          rx = n("r", n("rx")),
          ry = n("r", n("ry"));
        return `M${x - rx} ${y}A${rx} ${ry} 0 1 0 ${x + rx} ${y}A${rx} ${ry} 0 1 0 ${x - rx} ${y}Z`;
      }
      case "line":
        return `M${n("x1")} ${n("y1")}L${n("x2")} ${n("y2")}`;
      case "polyline":
      case "polygon":
        return `M${el.getAttribute("points") || ""}${el.localName === "polygon" ? "Z" : ""}`;
      default:
        throw new Error(
          "도형과 경로만 변환할 수 있습니다. 텍스트·이미지는 지원하지 않습니다.",
        );
    }
  }
  geometry(el: SVGGraphicsElement, world = true): paper.PathItem {
    this.scope.activate();
    if (el.localName === "g") {
      const children = [...el.children].filter((x) =>
        x.matches(graphics),
      ) as SVGGraphicsElement[];
      if (!children.length)
        throw new Error("빈 그룹에는 패스파인더를 적용할 수 없습니다.");
      let result = this.geometry(children[0], world);
      for (const child of children.slice(1)) {
        const next = this.geometry(child, world);
        const merged = result.unite(next, { insert: false });
        result.remove();
        next.remove();
        result = merged;
      }
      return result;
    }
    const p = this.scope.PathItem.create(this.shapeData(el));
    p.remove();
    p.fillRule = getComputedStyle(el).fillRule as "nonzero" | "evenodd";
    if (world) {
      const m = this.globalMatrix(el);
      p.transform(new this.scope.Matrix(m.a, m.b, m.c, m.d, m.e, m.f));
    }
    return p;
  }
  private effectivePaint(el: SVGGraphicsElement) {
    const s = getComputedStyle(el);
    const attrs: Record<string, string> = {};
    for (const p of paintProperties) attrs[p] = s.getPropertyValue(p);
    let opacity = 1;
    for (let n: Element | null = el; n && n !== this.svg; n = n.parentElement)
      opacity *= Number(getComputedStyle(n).opacity);
    attrs.opacity = String(opacity);
    return attrs;
  }
  private reparentRoot(el: SVGGraphicsElement) {
    const m = this.globalMatrix(el),
      attrs = this.effectivePaint(el);
    Object.entries(attrs).forEach(([k, v]) => {
      el.setAttribute(k, v);
      el.style.setProperty(k, v);
    });
    this.svg.append(el);
    el.setAttribute("transform", matrixString(m));
  }
  convertPaths() {
    this.command("경로로 변환", () => {
      this.ids = this.topSelected().map((el) => {
        const p = this.geometry(el);
        const result = svgElement<SVGGraphicsElement>("path", {
          ...this.effectivePaint(el),
          d: p.pathData,
          opacity: getComputedStyle(el).opacity,
        });
        p.remove();
        const parent = el.parentNode;
        if (parent instanceof SVGGraphicsElement && parent !== this.svg)
          result.setAttribute(
            "transform",
            matrixString(this.globalMatrix(parent).inverse()),
          );
        result.id = el.id;
        el.replaceWith(result);
        return result.id;
      });
    });
  }
  pathfinder(op: BooleanOp) {
    const els = this.topSelected().sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
    if (els.length < 2)
      throw new Error("패스파인더에는 도형을 2개 이상 선택하세요.");
    for (const el of els) {
      const ancestors: Element[] = [];
      for (
        let p = el.parentElement;
        p && p !== this.svg.parentElement;
        p = p.parentElement
      )
        ancestors.push(p);
      for (const child of [
        el,
        ...el.querySelectorAll(graphics),
        ...ancestors,
      ]) {
        const s = getComputedStyle(child);
        if (
          s.filter !== "none" ||
          s.clipPath !== "none" ||
          s.maskImage !== "none"
        )
          throw new Error(
            "필터·클리핑·마스크가 있는 요소는 먼저 효과를 해제하세요.",
          );
      }
    }
    this.command(`패스파인더: ${op}`, () => {
      const attrs = {
        ...this.effectivePaint(els[0]),
        opacity: getComputedStyle(els[0]).opacity,
      };
      let p = this.geometry(els[0]);
      const isClosed = (item: paper.PathItem): boolean =>
        item instanceof this.scope.Path
          ? item.closed
          : (item as paper.CompoundPath).children.every(
              (child) => (child as paper.Path).closed,
            );
      if (!isClosed(p)) {
        p.remove();
        throw new Error("닫힌 도형과 경로를 선택하세요.");
      }
      try {
        for (const el of els.slice(1)) {
          const next = this.geometry(el);
          if (!isClosed(next)) {
            next.remove();
            throw new Error("닫힌 도형과 경로를 선택하세요.");
          }
          const result = p[op](next, { insert: false });
          p.remove();
          next.remove();
          p = result;
        }
        p.reorient(true);
        const parent = els[0].parentNode!;
        const result = svgElement<SVGGraphicsElement>("path", {
          ...attrs,
          d: p.pathData,
          "fill-rule": "nonzero",
        });
        if (parent instanceof SVGGraphicsElement && parent !== this.svg)
          result.setAttribute(
            "transform",
            matrixString(this.globalMatrix(parent).inverse()),
          );
        if (p.pathData) {
          els[0].before(result);
          result.id = this.freshId();
          this.ids = [result.id];
        } else this.ids = [];
        els.forEach((el) => el.remove());
      } finally {
        p.remove();
      }
    });
  }
  group() {
    if (!this.selected.length) return;
    this.command("그룹", () => {
      const nodes = this.topSelected();
      const g = svgElement<SVGGraphicsElement>("g", { "data-name": "그룹" });
      const last = nodes[nodes.length - 1];
      let insertion: Element | null = last;
      while (insertion?.parentNode !== this.svg)
        insertion = insertion!.parentElement;
      insertion!.after(g);
      nodes.forEach((el) => {
        this.reparentRoot(el);
        g.append(el);
      });
      g.id = this.freshId();
      this.ids = [g.id];
    });
  }
  ungroup() {
    this.command("그룹 해제", () => {
      const ids: string[] = [];
      for (const g of this.topSelected()) {
        if (g.localName !== "g") continue;
        const next = g.nextSibling;
        for (const child of [...g.children]) {
          if (child instanceof SVGGraphicsElement) {
            this.reparentRoot(child);
            this.svg.insertBefore(
              child,
              next?.parentNode === this.svg ? next : null,
            );
            ids.push(child.id);
          } else this.svg.append(child);
        }
        g.remove();
      }
      this.ids = ids;
    });
  }
  reorder(direction: "front" | "back" | "forward" | "backward") {
    this.command("순서 변경", () => {
      const els = this.topSelected();
      for (const el of direction === "back" || direction === "backward"
        ? [...els].reverse()
        : els) {
        if (direction === "front") el.parentElement!.append(el);
        else if (direction === "back") el.parentElement!.prepend(el);
        else if (direction === "forward" && el.nextElementSibling)
          el.nextElementSibling.after(el);
        else if (direction === "backward" && el.previousElementSibling)
          el.previousElementSibling.before(el);
      }
    });
  }
  align(mode: "left" | "center" | "right" | "top" | "middle" | "bottom") {
    const b = this.selectionBounds();
    if (!b) return;
    this.command("정렬", () =>
      this.topSelected().forEach((el) => {
        const r = this.bounds(el);
        let x = 0,
          y = 0;
        if (mode === "left") x = b.x - r.x;
        if (mode === "center") x = b.x + b.width / 2 - r.x - r.width / 2;
        if (mode === "right") x = b.x + b.width - r.x - r.width;
        if (mode === "top") y = b.y - r.y;
        if (mode === "middle") y = b.y + b.height / 2 - r.y - r.height / 2;
        if (mode === "bottom") y = b.y + b.height - r.y - r.height;
        this.applyMatrix(el, new DOMMatrix().translate(x, y));
      }),
    );
  }
  distribute(axis: "x" | "y") {
    const els = this.topSelected().sort(
      (a, b) => this.bounds(a)[axis] - this.bounds(b)[axis],
    );
    if (els.length < 3) throw new Error("분배에는 객체가 3개 이상 필요합니다.");
    this.command("간격 분배", () => {
      const dim = axis === "x" ? "width" : "height";
      const boxes = els.map((el) => this.bounds(el));
      const first = boxes[0][axis],
        last = boxes.at(-1)!;
      const gap =
        (last[axis] +
          last[dim] -
          first -
          boxes.reduce((sum, b) => sum + b[dim], 0)) /
        (els.length - 1);
      let cursor = first;
      els.forEach((el, i) => {
        const delta = cursor - boxes[i][axis];
        this.applyMatrix(
          el,
          new DOMMatrix().translate(
            axis === "x" ? delta : 0,
            axis === "y" ? delta : 0,
          ),
        );
        cursor += boxes[i][dim] + gap;
      });
    });
  }
  toggleLayer(el: Element, kind: "hidden" | "locked") {
    this.command("레이어 상태 변경", () => {
      if (kind === "locked")
        el.setAttribute(
          "data-locked",
          el.getAttribute("data-locked") === "true" ? "false" : "true",
        );
      else {
        const node = el as SVGElement;
        node.style.display = node.style.display === "none" ? "" : "none";
      }
      this.ids = this.ids.filter((id) =>
        this.editable(this.svg.querySelector(`[id="${CSS.escape(id)}"]`)!),
      );
    });
  }
  clipboardSvg() {
    const clone = svgElement<SVGSVGElement>("svg", {
      xmlns: NS,
      viewBox: this.svg.getAttribute("viewBox")!,
      width: this.size.width,
      height: this.size.height,
    });
    // Preserve definitions used by the selected artwork.
    for (const defs of this.svg.querySelectorAll("defs,style"))
      if (!this.topSelected().some((el) => el.contains(defs)))
        clone.append(defs.cloneNode(true));
    for (const el of this.topSelected()) {
      const copy = el.cloneNode(true) as SVGGraphicsElement;
      copy.setAttribute("transform", matrixString(this.globalMatrix(el)));
      Object.entries(this.effectivePaint(el)).forEach(([k, v]) =>
        copy.setAttribute(k, v),
      );
      clone.append(copy);
    }
    return new XMLSerializer().serializeToString(clone);
  }
  paste(xml: string) {
    const tempHost = document.createElement("div");
    tempHost.style.cssText = "position:absolute;visibility:hidden";
    document.body.append(tempHost);
    try {
      const temp = new SvgEditor(tempHost);
      temp.load(xml);
      this.command("붙여넣기", () => {
        const nodes = [...temp.svg.children] as SVGGraphicsElement[];
        const clones = this.cloneNodes(nodes);
        clones.forEach((el) => this.svg.append(el));
        this.ids = clones
          .filter((el) => el.matches(graphics))
          .map((el) => el.id);
        this.topSelected().forEach((el) =>
          this.applyMatrix(el, new DOMMatrix().translate(16, 16)),
        );
      });
      temp.scope.project.remove();
    } finally {
      tempHost.remove();
    }
  }
  paths(el: SVGGraphicsElement): paper.Path[] {
    const p = this.geometry(el, false);
    return p instanceof this.scope.Path
      ? [p]
      : ([...(p as paper.CompoundPath).children] as paper.Path[]);
  }
}
