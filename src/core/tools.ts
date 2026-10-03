import { SvgEditor, svgElement, point, type Vec, type Box } from "./editor";
import type paper from "paper";

export type Tool =
  "select" | "node" | "pen" | "rect" | "ellipse" | "line" | "text" | "hand";
type Drag = {
  kind:
    "move" | "shape" | "marquee" | "resize" | "rotate" | "pan" | "node" | "pen";
  start: Vec;
  client: Vec;
  last: Vec;
  originals: { el: SVGGraphicsElement; transform: string }[];
  box?: Box;
  handle?: string;
  shape?: SVGGraphicsElement;
  changed?: boolean;
  path?: paper.PathItem;
  part?: paper.Path;
  index?: number;
  component?: string;
  element?: SVGGraphicsElement;
  scroll?: Vec;
};
export class Tools {
  tool: Tool = "select";
  fill = "#8b75ff";
  stroke = "none";
  strokeWidth = 2;
  space = false;
  zoom = 1;
  textAt: (p: Vec) => void = () => {};
  fail: (err: unknown) => void = () => {};
  private drag: Drag | null = null;
  private pen: { el: SVGGraphicsElement; path: paper.Path } | null = null;
  private node: { id: string; part: number; index: number } | null = null;
  private marquee: Box | null = null;
  constructor(
    readonly editor: SvgEditor,
    readonly stage: HTMLElement,
    readonly overlay: SVGSVGElement,
    readonly viewport: HTMLElement,
  ) {
    stage.addEventListener("pointerdown", this.down);
    stage.addEventListener("pointermove", this.move);
    stage.addEventListener("pointerup", this.up);
    stage.addEventListener("pointercancel", () => this.cancel());
    stage.addEventListener("dblclick", this.doubleClick);
  }
  setTool(tool: Tool) {
    if (this.pen) this.finishPen();
    this.tool = tool;
    this.node = null;
    this.stage.dataset.tool = tool;
    this.render();
    this.editor.emit();
  }
  coordinates(event: { clientX: number; clientY: number }): Vec {
    const m = this.editor.svg.getScreenCTM();
    return m
      ? point(m.inverse(), { x: event.clientX, y: event.clientY })
      : { x: 0, y: 0 };
  }
  private hit(target: EventTarget | null): SVGGraphicsElement | null {
    let el = target instanceof Element ? target.closest("[id]") : null;
    if (!el || !this.editor.svg.contains(el) || !this.editor.editable(el))
      return null;
    if (this.tool !== "node")
      while (
        el.parentNode !== this.editor.svg &&
        el.parentElement?.localName === "g"
      )
        el = el.parentElement;
    return el instanceof SVGGraphicsElement ? el : null;
  }
  private down = (ev: PointerEvent) => {
    if (ev.button !== 0 && ev.button !== 1) return;
    ev.preventDefault();
    this.stage.focus();
    const p = this.coordinates(ev),
      target = ev.target as Element;
    const base = {
      start: p,
      last: p,
      client: { x: ev.clientX, y: ev.clientY },
      originals: [],
    };
    try {
      if (this.tool === "hand" || this.space || ev.button === 1) {
        this.drag = {
          ...base,
          kind: "pan",
          scroll: { x: this.viewport.scrollLeft, y: this.viewport.scrollTop },
        };
        return;
      }
      const handle = target.getAttribute("data-handle");
      if (handle && this.editor.selected.length) {
        const box = this.editor.selectionBounds()!;
        this.editor.begin();
        this.drag = {
          ...base,
          kind: handle === "rotate" ? "rotate" : "resize",
          handle,
          box,
          originals: this.originals(),
        };
        return;
      }
      if (this.tool === "node" && target.hasAttribute("data-node")) {
        const el = this.editor.svg.querySelector(
          `[id="${CSS.escape(target.getAttribute("data-element")!)}"]`,
        ) as SVGGraphicsElement;
        const paths = this.editor.paths(el);
        const partIndex = Number(target.getAttribute("data-part"));
        const part = paths[partIndex];
        const index = Number(target.getAttribute("data-node"));
        this.editor.begin();
        this.node = { id: el.id, part: partIndex, index };
        this.drag = {
          ...base,
          kind: "node",
          path: (part.parent as paper.PathItem) || part,
          part,
          index,
          component: target.getAttribute("data-component") || "anchor",
          element: el,
        };
        return;
      }
      if (this.tool === "text") {
        this.textAt(p);
        return;
      }
      if (this.tool === "pen") {
        const scope = this.editor.scope;
        scope.activate();
        if (
          this.pen &&
          this.pen.path.segments.length > 2 &&
          Math.hypot(
            p.x - this.pen.path.firstSegment.point.x,
            p.y - this.pen.path.firstSegment.point.y,
          ) <
            10 / this.zoom
        ) {
          this.pen.path.closed = true;
          this.finishPen();
          return;
        }
        if (!this.pen) {
          this.editor.begin();
          const el = svgElement<SVGGraphicsElement>("path", {
            fill: this.fill,
            stroke: this.stroke === "none" ? "#b3a5ff" : this.stroke,
            "stroke-width": this.strokeWidth,
          });
          this.editor.add(el);
          this.pen = { el, path: new scope.Path({ insert: false }) };
        }
        this.pen.path.add(new scope.Point(p.x, p.y));
        this.pen.el.setAttribute("d", this.pen.path.pathData);
        this.drag = { ...base, kind: "pen" };
        this.editor.emit();
        return;
      }
      if (["rect", "ellipse", "line"].includes(this.tool)) {
        this.editor.begin();
        const el = svgElement<SVGGraphicsElement>(this.tool, {
          fill: this.tool === "line" ? "none" : this.fill,
          stroke:
            this.tool === "line" && this.stroke === "none"
              ? "#b3a5ff"
              : this.stroke,
          "stroke-width": this.strokeWidth,
        });
        this.editor.add(el);
        this.drag = { ...base, kind: "shape", shape: el };
        this.editor.emit();
        return;
      }
      const el = this.hit(ev.target);
      if (el) {
        if (ev.shiftKey) this.editor.select([el.id], true);
        else if (!this.editor.ids.includes(el.id)) this.editor.select([el.id]);
        if (this.tool === "node") {
          this.render();
          return;
        }
        this.editor.begin();
        this.drag = {
          ...base,
          kind: "move",
          originals: this.originals(),
          handle: ev.altKey ? "copy" : "",
        };
      } else {
        if (!ev.shiftKey) this.editor.select([]);
        this.drag = { ...base, kind: "marquee" };
        this.marquee = { ...p, width: 0, height: 0 };
      }
    } catch (err) {
      this.fail(err);
      this.cancel();
    } finally {
      if (this.drag) this.stage.setPointerCapture(ev.pointerId);
    }
  };
  private originals() {
    return this.editor
      .topSelected()
      .map((el) => ({ el, transform: el.getAttribute("transform") || "" }));
  }
  private move = (ev: PointerEvent) => {
    const d = this.drag;
    if (!d) return;
    const p = this.coordinates(ev);
    d.last = p;
    let dx = p.x - d.start.x,
      dy = p.y - d.start.y;
    const changed =
      Math.hypot(ev.clientX - d.client.x, ev.clientY - d.client.y) > 3;
    if (!changed && !d.changed) return;
    d.changed = true;
    try {
      if (d.kind === "pan") {
        this.viewport.scrollLeft = d.scroll!.x - ev.clientX + d.client.x;
        this.viewport.scrollTop = d.scroll!.y - ev.clientY + d.client.y;
        return;
      }
      if (d.kind === "move") {
        if (d.handle === "copy") {
          this.editor.duplicateRaw();
          d.originals = this.originals();
          d.handle = "copied";
        }
        if (ev.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        const matrix = new DOMMatrix().translate(dx, dy);
        d.originals.forEach(({ el, transform }) =>
          this.editor.applyMatrix(el, matrix, transform),
        );
      } else if (d.kind === "shape") {
        if (ev.shiftKey && this.tool !== "line") {
          const size = Math.max(Math.abs(dx), Math.abs(dy));
          dx = Math.sign(dx || 1) * size;
          dy = Math.sign(dy || 1) * size;
        }
        const x = Math.min(d.start.x, d.start.x + dx),
          y = Math.min(d.start.y, d.start.y + dy),
          w = Math.abs(dx),
          h = Math.abs(dy);
        const attrs =
          this.tool === "rect"
            ? { x, y, width: w, height: h }
            : this.tool === "ellipse"
              ? { cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 }
              : {
                  x1: d.start.x,
                  y1: d.start.y,
                  x2: d.start.x + dx,
                  y2: d.start.y + dy,
                };
        Object.entries(attrs).forEach(([k, v]) =>
          d.shape!.setAttribute(k, String(v)),
        );
      } else if (d.kind === "marquee") {
        this.marquee = {
          x: Math.min(p.x, d.start.x),
          y: Math.min(p.y, d.start.y),
          width: Math.abs(dx),
          height: Math.abs(dy),
        };
      } else if (d.kind === "resize") {
        const b = d.box!,
          left = d.handle!.includes("w"),
          top = d.handle!.includes("n");
        const anchor = {
          x: left ? b.x + b.width : b.x,
          y: top ? b.y + b.height : b.y,
        };
        let sx = (b.width + (left ? -dx : dx)) / Math.max(b.width, 0.001),
          sy = (b.height + (top ? -dy : dy)) / Math.max(b.height, 0.001);
        if (ev.shiftKey) sx = sy = Math.abs(sx) > Math.abs(sy) ? sx : sy;
        sx = Math.max(0.01, sx);
        sy = Math.max(0.01, sy);
        const m = new DOMMatrix()
          .translate(anchor.x, anchor.y)
          .scale(sx, sy)
          .translate(-anchor.x, -anchor.y);
        d.originals.forEach(({ el, transform }) =>
          this.editor.applyMatrix(el, m, transform),
        );
      } else if (d.kind === "rotate") {
        const b = d.box!,
          cx = b.x + b.width / 2,
          cy = b.y + b.height / 2;
        let angle =
          ((Math.atan2(p.y - cy, p.x - cx) -
            Math.atan2(d.start.y - cy, d.start.x - cx)) *
            180) /
          Math.PI;
        if (ev.shiftKey) angle = Math.round(angle / 15) * 15;
        const m = new DOMMatrix()
          .translate(cx, cy)
          .rotate(angle)
          .translate(-cx, -cy);
        d.originals.forEach(({ el, transform }) =>
          this.editor.applyMatrix(el, m, transform),
        );
      } else if (d.kind === "pen" && this.pen) {
        const segment = this.pen.path.lastSegment;
        segment.handleOut = new this.editor.scope.Point(dx, dy);
        segment.handleIn = new this.editor.scope.Point(-dx, -dy);
        this.pen.el.setAttribute("d", this.pen.path.pathData);
      } else if (d.kind === "node") {
        const local = point(this.editor.globalMatrix(d.element!).inverse(), p);
        const segment = d.part!.segments[d.index!];
        if (d.component === "anchor")
          segment.point = new this.editor.scope.Point(local.x, local.y);
        else
          segment[d.component as "handleIn" | "handleOut"] =
            new this.editor.scope.Point(
              local.x - segment.point.x,
              local.y - segment.point.y,
            );
        d.element!.setAttribute("d", d.path!.pathData);
      }
      this.editor.emit();
      this.render();
    } catch (err) {
      this.fail(err);
      this.cancel();
    }
  };
  private up = (ev: PointerEvent) => {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    try {
      if (d.kind === "marquee" && this.marquee) {
        const b = this.marquee;
        const els = this.editor.objects().filter((el) => {
          if (el.parentElement?.closest("g")) return false;
          const r = this.editor.bounds(el);
          return (
            r.x >= b.x &&
            r.y >= b.y &&
            r.x + r.width <= b.x + b.width &&
            r.y + r.height <= b.y + b.height
          );
        });
        this.editor.select(
          els.map((el) => el.id),
          ev.shiftKey,
        );
        this.marquee = null;
      } else if (d.kind === "shape" && !d.changed) this.editor.cancel();
      else if (!["pen", "pan"].includes(d.kind)) {
        this.editor.commit(
          d.kind === "move" && d.handle === "copied"
            ? "Alt 복제"
            : d.kind === "node"
              ? "노드 편집"
              : "드래그 편집",
        );
      }
      if (d.path) d.path.remove();
      this.render();
    } catch (err) {
      this.fail(err);
      this.cancel();
    }
    if (this.stage.hasPointerCapture(ev.pointerId))
      this.stage.releasePointerCapture(ev.pointerId);
  };
  finishPen() {
    if (!this.pen) return;
    if (this.pen.path.segments.length < 2) {
      this.pen.path.remove();
      this.pen = null;
      this.editor.cancel();
      return;
    }
    this.pen.el.setAttribute("d", this.pen.path.pathData);
    this.pen.path.remove();
    this.pen = null;
    this.editor.commit("펜 경로");
    this.render();
  }
  cancel() {
    this.drag?.path?.remove();
    this.drag = null;
    this.pen?.path.remove();
    this.pen = null;
    this.marquee = null;
    this.editor.cancel();
    this.render();
  }
  key(ev: KeyboardEvent) {
    if (ev.code === "Space") this.space = true;
    if (ev.key === "Escape") {
      this.cancel();
      return true;
    }
    if (ev.key === "Enter" && this.pen) {
      this.finishPen();
      return true;
    }
    if (
      (ev.key === "Delete" || ev.key === "Backspace") &&
      this.tool === "node" &&
      this.node
    ) {
      this.deleteNode();
      return true;
    }
    return false;
  }
  deleteNode() {
    if (!this.node) return;
    const node = this.node;
    const el = this.editor.svg.querySelector(
      `[id="${CSS.escape(node.id)}"]`,
    ) as SVGGraphicsElement;
    if (!el) return;
    this.editor.command("노드 삭제", () => {
      const parts = this.editor.paths(el),
        part = parts[node.part],
        root = (part.parent as paper.PathItem) || part;
      if (part.segments.length <= 2) {
        root.remove();
        throw new Error("경로에는 최소 2개 노드가 필요합니다.");
      }
      part.removeSegment(node.index);
      el.setAttribute("d", root.pathData);
      root.remove();
    });
    this.node = null;
    this.render();
  }
  closePath() {
    this.editor.command("경로 열기 / 닫기", () => {
      for (const el of this.editor.selected) {
        if (el.localName !== "path") continue;
        const parts = this.editor.paths(el);
        const root = (parts[0].parent as paper.PathItem) || parts[0];
        parts.forEach((p) => (p.closed = !p.closed));
        el.setAttribute("d", root.pathData);
        root.remove();
      }
    });
  }
  private doubleClick = (ev: MouseEvent) => {
    if (this.tool !== "node") return;
    const el = this.hit(ev.target);
    if (!el || el.localName !== "path") return;
    try {
      this.editor.command("노드 추가", () => {
        const local = point(
          this.editor.globalMatrix(el).inverse(),
          this.coordinates(ev),
        );
        const parts = this.editor.paths(el);
        const root = (parts[0].parent as paper.PathItem) || parts[0];
        let closest: {
          p: paper.Path;
          location: paper.CurveLocation;
          distance: number;
        } | null = null;
        for (const p of parts) {
          const location = p.getNearestLocation(
            new this.editor.scope.Point(local.x, local.y),
          );
          if (location && (!closest || location.distance < closest.distance))
            closest = { p, location, distance: location.distance };
        }
        if (closest) closest.p.divideAt(closest.location);
        el.setAttribute("d", root.pathData);
        root.remove();
      });
    } catch (err) {
      this.fail(err);
    }
  };
  render() {
    this.overlay.setAttribute(
      "viewBox",
      this.editor.svg.getAttribute("viewBox")!,
    );
    this.overlay.replaceChildren();
    const unit = 1 / this.zoom;
    const line = (a: Vec, b: Vec) =>
      this.overlay.append(
        svgElement("line", {
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          stroke: "#ae9dff",
          "stroke-width": unit,
        }),
      );
    if (this.tool === "node") {
      for (const el of this.editor.selected) {
        if (el.localName !== "path") continue;
        const parts = this.editor.paths(el);
        const m = this.editor.globalMatrix(el);
        parts.forEach((part, partIndex) =>
          part.segments.forEach((seg, index) => {
            const anchor = point(m, seg.point);
            for (const component of ["handleIn", "handleOut"] as const) {
              const v = seg[component];
              if (v.length < 0.01) continue;
              const h = point(m, {
                x: seg.point.x + v.x,
                y: seg.point.y + v.y,
              });
              line(anchor, h);
              this.overlay.append(
                svgElement("circle", {
                  cx: h.x,
                  cy: h.y,
                  r: 3.5 * unit,
                  fill: "#eee9ff",
                  stroke: "#8b75ff",
                  "stroke-width": unit,
                  "data-node": index,
                  "data-element": el.id,
                  "data-part": partIndex,
                  "data-component": component,
                  class: "node-handle",
                }),
              );
            }
            this.overlay.append(
              svgElement("rect", {
                x: anchor.x - 4 * unit,
                y: anchor.y - 4 * unit,
                width: 8 * unit,
                height: 8 * unit,
                fill:
                  this.node?.id === el.id && this.node.index === index
                    ? "#8b75ff"
                    : "white",
                stroke: "#8b75ff",
                "stroke-width": unit,
                "data-node": index,
                "data-element": el.id,
                "data-part": partIndex,
                class: "node-handle",
              }),
            );
          }),
        );
        (parts[0]?.parent || parts[0])?.remove();
      }
    } else if (this.tool !== "pen") {
      const b = this.editor.selectionBounds();
      if (b) {
        this.overlay.append(
          svgElement("rect", {
            x: b.x,
            y: b.y,
            width: b.width,
            height: b.height,
            fill: "none",
            stroke: "#a18cff",
            "stroke-width": unit,
          }),
        );
        for (const [handle, x, y] of [
          ["nw", b.x, b.y],
          ["ne", b.x + b.width, b.y],
          ["sw", b.x, b.y + b.height],
          ["se", b.x + b.width, b.y + b.height],
        ] as const)
          this.overlay.append(
            svgElement("rect", {
              x: x - 4 * unit,
              y: y - 4 * unit,
              width: 8 * unit,
              height: 8 * unit,
              fill: "white",
              stroke: "#8b75ff",
              "stroke-width": unit,
              "data-handle": handle,
              class: "transform-handle",
            }),
          );
        const top = { x: b.x + b.width / 2, y: b.y };
        const rotation = { x: top.x, y: top.y - 25 * unit };
        line(top, rotation);
        this.overlay.append(
          svgElement("circle", {
            cx: rotation.x,
            cy: rotation.y,
            r: 5 * unit,
            fill: "#d6ccff",
            stroke: "#8b75ff",
            "stroke-width": unit,
            "data-handle": "rotate",
            class: "transform-handle",
          }),
        );
      }
    }
    if (this.pen) {
      for (const seg of this.pen.path.segments)
        this.overlay.append(
          svgElement("circle", {
            cx: seg.point.x,
            cy: seg.point.y,
            r: 4 * unit,
            fill: "#8b75ff",
            stroke: "white",
            "stroke-width": unit,
          }),
        );
    }
    if (this.marquee)
      this.overlay.append(
        svgElement("rect", {
          ...this.marquee,
          fill: "#8b75ff22",
          stroke: "#a18cff",
          "stroke-width": unit,
          "stroke-dasharray": `${4 * unit} ${3 * unit}`,
        }),
      );
  }
}
