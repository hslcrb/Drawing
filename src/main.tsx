import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  MousePointer2,
  Square,
  Circle,
  PenTool,
  Type,
  Hand,
  Minus,
  Spline,
  Plus,
  FolderOpen,
  Save,
  Download,
  Undo2,
  Redo2,
  Copy,
  Trash2,
  Group,
  Ungroup,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronDown,
  ChevronRight,
  Layers,
  Scan,
  Sparkles,
  ZoomIn,
  ZoomOut,
  Maximize,
  HelpCircle,
  X,
  ArrowUpToLine,
  ArrowDownToLine,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
} from "lucide-react";
import { SvgEditor, type Vec } from "./core/editor";
import { Tools, type Tool } from "./core/tools";
import "./style.css";
import welcomeSvg from "../samples/welcome.svg?raw";
import { defaultView, type ViewState } from "./core/project";
import { PaintEditor, GradientHandles } from "./PaintEditor";
import { ResourcePanel } from "./ResourcePanel";

const toolList: {
  id: Tool;
  name: string;
  key: string;
  icon: React.ElementType;
}[] = [
  { id: "select", name: "선택", key: "V", icon: MousePointer2 },
  { id: "node", name: "노드", key: "A", icon: Spline },
  { id: "pen", name: "펜", key: "P", icon: PenTool },
  { id: "rect", name: "사각형", key: "R", icon: Square },
  { id: "ellipse", name: "타원", key: "E", icon: Circle },
  { id: "line", name: "선", key: "L", icon: Minus },
  { id: "text", name: "텍스트", key: "T", icon: Type },
  { id: "hand", name: "손", key: "H", icon: Hand },
];
function Button({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  active = false,
  children,
}: {
  label: string;
  icon?: React.ElementType;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={active ? "active" : ""}
      onClick={onClick}
    >
      {Icon && <Icon size={17} />}
      {children}
    </button>
  );
}
function Field({
  label,
  value,
  onCommit,
  min,
  step = 1,
}: {
  label: string;
  value: string | number;
  onCommit: (v: string) => void;
  min?: number;
  step?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <input
        aria-label={label}
        value={draft}
        min={min}
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(event) => {
          const current = event.currentTarget.value;
          if (current !== String(value)) onCommit(current);
          setDraft(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            e.currentTarget.value = String(value);
            setDraft(String(value));
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
function PathIcon({ op }: { op: string }) {
  return (
    <svg width="28" height="25" viewBox="0 0 28 25" aria-hidden="true">
      <rect
        x="3"
        y="3"
        width="14"
        height="14"
        rx="2"
        fill={op === "intersect" ? "none" : "#a89aff"}
        stroke="#c7bbff"
      />
      <rect
        x="11"
        y="10"
        width="14"
        height="13"
        rx="2"
        fill={op === "unite" ? "#a89aff" : "none"}
        stroke="#c7bbff"
      />
      {op === "intersect" && <path d="M11 10h6v7h-6z" fill="#a89aff" />}
      {op === "subtract" && <path d="M11 10h6v7h-6z" fill="#25262e" />}
      {op === "exclude" && <path d="M11 10h6v7h-6z" fill="#25262e" />}
    </svg>
  );
}
function App() {
  const host = useRef<HTMLDivElement>(null),
    stage = useRef<HTMLDivElement>(null),
    overlay = useRef<SVGSVGElement>(null),
    viewport = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null);
  const engine = useRef<SvgEditor | null>(null),
    controller = useRef<Tools | null>(null);
  const [revision, update] = useState(0),
    [tool, setTool] = useState<Tool>("select"),
    [zoom, setZoom] = useState(0.8),
    [filename, setFilename] = useState("Welcome.drawing"),
    [error, setError] = useState("");
  const [modal, setModal] = useState<"new" | "text" | "rename" | "help" | null>(
      null,
    ),
    [text, setText] = useState("Drawing"),
    [textPoint, setTextPoint] = useState<Vec | null>(null),
    [renameId, setRenameId] = useState(""),
    [width, setWidth] = useState(960),
    [height, setHeight] = useState(640),
    [fill, setFill] = useState("#8b75ff"),
    [stroke, setStroke] = useState("none"),
    [strokeWidth, setStrokeWidth] = useState(2);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"design" | "motion">("design");
  const [time, setTime] = useState(0);
  const [paintHandles, setPaintHandles] = useState<"fill" | "stroke" | null>(
    null,
  );
  const workspace = useRef<ViewState>(defaultView());
  workspace.current = {
    zoom,
    scrollX: viewport.current?.scrollLeft || 0,
    scrollY: viewport.current?.scrollTop || 0,
    mode,
    tool,
    selection: engine.current?.ids || [],
    expanded: [...expanded],
    fill,
    stroke,
    strokeWidth,
    time,
  };
  const e = engine.current,
    b = e?.selectionBounds(),
    sel = e?.selected || [];
  const run = (action: () => void) => {
    try {
      controller.current?.finishPen();
      action();
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const asyncRun = async (action: () => Promise<void>) => {
    try {
      await action();
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const fit = () => {
    if (!engine.current || !viewport.current) return;
    const size = engine.current.size;
    setZoom(
      Math.max(
        0.05,
        Math.min(
          2,
          (viewport.current.clientWidth - 160) / size.width,
          (viewport.current.clientHeight - 160) / size.height,
        ),
      ),
    );
  };
  const changeTool = (t: Tool) => {
    controller.current?.setTool(t);
    setTool(t);
  };
  function download(xml: string, name: string) {
    const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function save(saveAs = false): Promise<boolean> {
    const ed = engine.current!;
    controller.current?.finishPen();
    if (window.desktop) {
      const path = await window.desktop.save(
        ed.serializeProject(workspace.current),
        saveAs,
      );
      if (!path) return false;
      setFilename(path.split(/[\\/]/).at(-1)!);
    } else
      download(
        ed.serializeProject(workspace.current),
        filename.replace(/\.(svg|drawing)$/i, "") + ".drawing",
      );
    ed.markSaved();
    ed.status = "SVG 저장 완료";
    ed.emit();
    return true;
  }
  async function guard(): Promise<boolean> {
    if (!engine.current?.dirty) return true;
    const result = window.confirm(
      "문서가 변경되었습니다. 현재 문서를 저장할까요?\n확인: 저장하고 계속 / 취소: 변경사항 버리기 또는 돌아가기",
    );
    if (result) return save();
    return window.confirm("변경사항을 버리고 계속할까요?");
  }
  async function open() {
    if (!(await guard())) return;
    if (window.desktop) {
      const file = await window.desktop.open();
      if (file) {
        loadDocument(file.xml);
        await window.desktop.opened(file.path);
        setFilename(file.path.split(/[\\/]/).at(-1)!);
      }
    } else fileInput.current?.click();
  }
  function loadDocument(content: string) {
    controller.current?.cancel();
    const view = engine.current!.loadDocument(content);
    if (view) {
      setZoom(view.zoom);
      setMode(view.mode);
      setTime(view.time);
      changeTool(view.tool as Tool);
      setExpanded(new Set(view.expanded));
      setFill(view.fill);
      setStroke(view.stroke);
      setStrokeWidth(view.strokeWidth);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (viewport.current) {
            viewport.current.scrollLeft = view.scrollX;
            viewport.current.scrollTop = view.scrollY;
          }
        }),
      );
    } else {
      setMode("design");
      setTime(0);
      requestAnimationFrame(fit);
    }
  }
  async function openExample() {
    controller.current?.finishPen();
    if (!(await guard())) return;
    controller.current?.cancel();
    engine.current!.load(welcomeSvg);
    await window.desktop?.newDocument();
    setFilename("Welcome.drawing");
    setMode("design");
    setTime(0);
    requestAnimationFrame(fit);
  }
  async function copy(cut = false) {
    const ed = engine.current!;
    if (!ed.selected.length) return;
    const xml = ed.clipboardSvg();
    if (window.desktop) await window.desktop.clipboardWrite(xml);
    else await navigator.clipboard.writeText(xml);
    if (cut) ed.deleteSelection();
    ed.status = cut ? "잘라내기" : "SVG 클립보드에 복사";
    ed.emit();
  }
  async function paste() {
    const xml = window.desktop
      ? await window.desktop.clipboardRead()
      : await navigator.clipboard.readText();
    run(() => engine.current!.paste(xml));
  }
  useEffect(() => {
    const ed = new SvgEditor(host.current!);
    engine.current = ed;
    const tools = new Tools(
      ed,
      stage.current!,
      overlay.current!,
      viewport.current!,
    );
    controller.current = tools;
    ed.onChange = () => {
      tools.render();
      window.desktop?.changed(ed.dirty);
      update((x) => x + 1);
    };
    tools.fail = (err) =>
      setError(err instanceof Error ? err.message : String(err));
    tools.textAt = (p) => {
      setTextPoint(p);
      setText("Drawing");
      setModal("text");
    };
    ed.load(welcomeSvg);
    requestAnimationFrame(fit);
    const beforeUnload = (ev: BeforeUnloadEvent) => {
      if (ed.dirty && !window.desktop) {
        ev.preventDefault();
        ev.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      ed.scope.project.remove();
    };
  }, []);
  useEffect(() => {
    if (controller.current) {
      controller.current.zoom = zoom;
      controller.current.render();
    }
  }, [zoom, revision]);
  useEffect(() => {
    if (controller.current) {
      controller.current.fill = fill;
      controller.current.stroke = stroke;
      controller.current.strokeWidth = strokeWidth;
    }
  }, [fill, stroke, strokeWidth]);
  useEffect(() => window.desktop?.onSaveRequest(() => save()), [filename]);
  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      if (
        (ev.target as Element)?.closest(
          'input,textarea,select,[contenteditable="true"]',
        ) ||
        modal
      )
        return;
      if (!engine.current || !controller.current) return;
      if (controller.current.key(ev)) {
        ev.preventDefault();
        return;
      }
      const ed = engine.current;
      const ctrl = ev.ctrlKey || ev.metaKey;
      const k = ev.key.toLowerCase();
      if (ctrl) {
        const actions: Record<string, () => void> = {
          z: () => (ev.shiftKey ? ed.redo() : ed.undo()),
          y: () => ed.redo(),
          a: () => ed.selectAll(),
          d: () => ed.duplicate(),
          g: () => (ev.shiftKey ? ed.ungroup() : ed.group()),
          s: () => {
            void asyncRun(async () => {
              await save(ev.shiftKey);
            });
          },
          o: () => {
            void asyncRun(open);
          },
          n: () => setModal("new"),
          c: () => {
            void asyncRun(() => copy());
          },
          x: () => {
            void asyncRun(() => copy(true));
          },
          v: () => {
            void asyncRun(paste);
          },
          "0": fit,
          "=": () => setZoom((z) => Math.min(8, z * 1.2)),
          "-": () => setZoom((z) => Math.max(0.05, z / 1.2)),
        };
        if (actions[k]) {
          ev.preventDefault();
          run(actions[k]);
        }
        return;
      }
      if (k === "delete" || k === "backspace") {
        ev.preventDefault();
        run(() => ed.deleteSelection());
        return;
      }
      if (ev.key.startsWith("Arrow")) {
        ev.preventDefault();
        const step = ev.shiftKey ? 10 : 1;
        run(() =>
          ed.move(
            ev.key === "ArrowLeft" ? -step : ev.key === "ArrowRight" ? step : 0,
            ev.key === "ArrowUp" ? -step : ev.key === "ArrowDown" ? step : 0,
          ),
        );
        return;
      }
      if (k === "[" || k === "]") {
        ev.preventDefault();
        run(() =>
          ed.reorder(
            k === "]"
              ? ev.shiftKey
                ? "front"
                : "forward"
              : ev.shiftKey
                ? "back"
                : "backward",
          ),
        );
        return;
      }
      const t = toolList.find((t) => t.key.toLowerCase() === k);
      if (t) {
        ev.preventDefault();
        changeTool(t.id);
      }
      if (ev.code === "Space") ev.preventDefault();
    };
    const up = (ev: KeyboardEvent) => {
      if (ev.code === "Space" && controller.current)
        controller.current.space = false;
    };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", up);
    };
  }, [modal, filename]);
  const common = (property: string) => {
    if (!sel.length) return "";
    const vals = sel.map((el) =>
      getComputedStyle(el).getPropertyValue(property),
    );
    return vals.every((v) => v === vals[0]) ? vals[0] : "혼합";
  };
  const changePaint = (property: "fill" | "stroke", value: string) => {
    if (property === "fill") setFill(value);
    else setStroke(value);
    if (sel.length) run(() => e!.setStyle(property, value));
  };
  const styleColor = (v: string) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#8b75ff";
    ctx.fillStyle = v;
    return /^#[a-f\d]{6}$/i.test(ctx.fillStyle) ? ctx.fillStyle : "#8b75ff";
  };
  function layer(el: Element, depth = 0): React.ReactNode {
    if (
      !el.matches(
        "g,path,rect,circle,ellipse,line,polyline,polygon,text,image,use",
      )
    )
      return null;
    const children = [...el.children].filter((child) =>
      child.matches(
        "g,path,rect,circle,ellipse,line,polyline,polygon,text,image,use",
      ),
    );
    const hidden = (el as SVGElement).style.display === "none",
      locked = el.getAttribute("data-locked") === "true";
    const name =
      el.getAttribute("data-name") ||
      (
        {
          g: "그룹",
          path: "경로",
          rect: "사각형",
          circle: "원",
          ellipse: "타원",
          text: "텍스트",
          line: "선",
        } as Record<string, string>
      )[el.localName] ||
      el.localName;
    return (
      <React.Fragment key={el.id}>
        <div
          className={`layer ${e?.ids.includes(el.id) ? "selected" : ""}`}
          style={{ paddingLeft: 8 + depth * 14 }}
        >
          <button
            className="expand"
            aria-label={`${name} 펼치기`}
            onClick={() =>
              setExpanded((old) => {
                const next = new Set(old);
                next.has(el.id) ? next.delete(el.id) : next.add(el.id);
                return next;
              })
            }
          >
            {children.length ? (
              expanded.has(el.id) ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )
            ) : (
              <span />
            )}
          </button>
          <button
            className="layer-name"
            disabled={locked || hidden}
            onClick={(ev) => {
              if (!e?.editable(el)) return;
              e.select([el.id], ev.shiftKey);
            }}
            onDoubleClick={() => {
              setRenameId(el.id);
              setText(el.getAttribute("data-name") || name);
              setModal("rename");
            }}
          >
            <span
              className="layer-swatch"
              style={{
                background:
                  common("fill") === "none"
                    ? "transparent"
                    : getComputedStyle(el).fill,
              }}
            />
            {name}
          </button>
          <Button
            label={`${name} ${hidden ? "표시" : "숨기기"}`}
            icon={hidden ? EyeOff : Eye}
            onClick={() => run(() => e!.toggleLayer(el, "hidden"))}
          />
          <Button
            label={`${name} ${locked ? "잠금 해제" : "잠금"}`}
            icon={locked ? Lock : Unlock}
            onClick={() => run(() => e!.toggleLayer(el, "locked"))}
          />
        </div>
        {expanded.has(el.id) &&
          children.reverse().map((child) => layer(child, depth + 1))}
      </React.Fragment>
    );
  }
  return (
    <div className="app">
      <header>
        <a className="brand" href="#" onClick={(ev) => ev.preventDefault()}>
          <span className="brand-mark">
            <PenTool size={20} />
          </span>
          Drawing<span className="version">SVG STUDIO</span>
        </a>
        <div className="header-actions">
          <Button
            label="예제 열기"
            icon={Sparkles}
            onClick={() => void asyncRun(openExample)}
          >
            예제
          </Button>
          <Button label="새 문서" icon={Plus} onClick={() => setModal("new")}>
            새 문서
          </Button>
          <Button
            label="SVG 열기"
            icon={FolderOpen}
            onClick={() => void asyncRun(open)}
          >
            열기
          </Button>
          <Button
            label="저장"
            icon={Save}
            onClick={() =>
              void asyncRun(async () => {
                await save();
              })
            }
          >
            저장
          </Button>
          <Button
            label="SVG 내보내기"
            icon={Download}
            onClick={() =>
              void asyncRun(async () => {
                if (window.desktop) await window.desktop.export(e!.serialize());
                else
                  download(
                    e!.serialize(),
                    filename.replace(/\.drawing$/i, "") + ".svg",
                  );
              })
            }
          >
            내보내기
          </Button>
        </div>
        <span className="header-divider" />
        <Button
          label="도움말"
          icon={HelpCircle}
          onClick={() => setModal("help")}
        />
      </header>
      <div className="document-bar">
        <div className="doc-tab">
          <span className="file-dot" />
          {filename}
          {e?.dirty && <span className="dirty-dot" />}
          <span className="doc-format">DRAWING</span>
        </div>
        <span className="document-hint">벡터로 그리고, SVG로 남기세요.</span>
        <div className="history">
          <Button
            label="실행 취소 (Ctrl+Z)"
            icon={Undo2}
            disabled={!e?.canUndo}
            onClick={() => run(() => e!.undo())}
          />
          <Button
            label="다시 실행 (Ctrl+Shift+Z)"
            icon={Redo2}
            disabled={!e?.canRedo}
            onClick={() => run(() => e!.redo())}
          />
        </div>
      </div>
      <main>
        <aside className="toolbox">
          {toolList.map((t) => (
            <Button
              key={t.id}
              label={`${t.name} (${t.key})`}
              icon={t.icon}
              active={tool === t.id}
              onClick={() => changeTool(t.id)}
            />
          ))}
          <div className="tool-separator" />
          <div className="paint-preview" title="현재 채우기 / 선">
            <span
              style={{ background: fill === "none" ? "transparent" : fill }}
            />
            <i
              style={{ borderColor: stroke === "none" ? "#787885" : stroke }}
            />
          </div>
          <div className="toolbox-bottom">
            <Button label="화면 맞춤 (Ctrl+0)" icon={Maximize} onClick={fit} />
          </div>
        </aside>
        <section className="workspace">
          <div className="workspace-caption">
            <span>ARTBOARD 01</span>
            <span>
              {e ? Math.round(e.size.width) : 960} ×{" "}
              {e ? Math.round(e.size.height) : 640} px
            </span>
          </div>
          <div
            className="viewport"
            ref={viewport}
            onWheel={(ev) => {
              if (ev.ctrlKey || ev.metaKey) {
                ev.preventDefault();
                setZoom((z) =>
                  Math.max(
                    0.05,
                    Math.min(8, z * (ev.deltaY < 0 ? 1.1 : 1 / 1.1)),
                  ),
                );
              }
            }}
          >
            <div className="canvas-content">
              <div
                ref={stage}
                className="stage"
                tabIndex={0}
                style={{
                  width: (e?.size.width || 960) * zoom,
                  height: (e?.size.height || 640) * zoom,
                }}
              >
                <div className="document-host" ref={host} />
                <svg ref={overlay} className="overlay" />
                {e && paintHandles && (
                  <GradientHandles
                    editor={e}
                    property={paintHandles}
                    zoom={zoom}
                    run={run}
                  />
                )}
              </div>
            </div>
          </div>
          <div className="zoom-control">
            <Button
              label="축소"
              icon={ZoomOut}
              onClick={() => setZoom((z) => Math.max(0.05, z / 1.2))}
            />
            <button onClick={fit} title="화면 맞춤">
              {Math.round(zoom * 100)}%
            </button>
            <Button
              label="확대"
              icon={ZoomIn}
              onClick={() => setZoom((z) => Math.min(8, z * 1.2))}
            />
            <span />
            <Button label="화면 맞춤" icon={Maximize} onClick={fit} />
          </div>
        </section>
        <aside className="inspector">
          <div className="inspector-title">
            <span>속성</span>
            <span>{sel.length ? `${sel.length}개 선택` : "문서"}</span>
          </div>
          <section>
            <h2>
              변형 <span>TRANSFORM</span>
            </h2>
            {b ? (
              <>
                <div className="field-grid">
                  <Field
                    label="X"
                    value={Math.round(b.x * 100) / 100}
                    onCommit={(v) => run(() => e!.move(Number(v) - b.x, 0))}
                  />
                  <Field
                    label="Y"
                    value={Math.round(b.y * 100) / 100}
                    onCommit={(v) => run(() => e!.move(0, Number(v) - b.y))}
                  />
                  <Field
                    label="W"
                    value={Math.round(b.width * 100) / 100}
                    onCommit={(v) => run(() => e!.resize(Number(v), b.height))}
                  />
                  <Field
                    label="H"
                    value={Math.round(b.height * 100) / 100}
                    onCommit={(v) => run(() => e!.resize(b.width, Number(v)))}
                  />
                </div>
                <Field
                  label="회전 Δ°"
                  value={0}
                  onCommit={(v) => run(() => e!.rotate(Number(v)))}
                />
              </>
            ) : (
              <p className="empty-property">
                객체를 선택하여 편집하세요.
                <br />
                또는 왼쪽 도구로 그리기 시작하세요.
              </p>
            )}
          </section>
          <section>
            <h2>
              모양 <span>APPEARANCE</span>
            </h2>
            {(["fill", "stroke"] as const).map((property) => (
              <div className="paint-row" key={property}>
                <span>{property === "fill" ? "채우기" : "선"}</span>
                <input
                  type="color"
                  aria-label={`${property === "fill" ? "채우기" : "선"} 색상`}
                  value={styleColor(
                    sel.length
                      ? common(property)
                      : property === "fill"
                        ? fill
                        : stroke,
                  )}
                  onChange={(ev) => changePaint(property, ev.target.value)}
                />
                <Field
                  label={property === "fill" ? "Fill" : "Stroke"}
                  value={
                    sel.length
                      ? common(property)
                      : property === "fill"
                        ? fill
                        : stroke
                  }
                  onCommit={(v) => changePaint(property, v)}
                />
                <button
                  className="none-paint"
                  title="색 없음"
                  aria-label={`${property === "fill" ? "채우기" : "선"} 없음`}
                  onClick={() => changePaint(property, "none")}
                >
                  ∅
                </button>
              </div>
            ))}
            <div className="field-grid">
              <Field
                label="선 두께"
                value={sel.length ? common("stroke-width") : strokeWidth}
                onCommit={(v) => {
                  setStrokeWidth(Number(v));
                  if (sel.length) run(() => e!.setStyle("stroke-width", v));
                }}
              />
              <Field
                label="불투명도"
                value={sel.length ? common("opacity") : 1}
                step={0.1}
                onCommit={(v) =>
                  run(() =>
                    e!.setStyle(
                      "opacity",
                      String(Math.max(0, Math.min(1, Number(v)))),
                    ),
                  )
                }
              />
            </div>
            {sel.length > 0 && (
              <div className="field-grid">
                <Field
                  label="채우기 α"
                  value={common("fill-opacity")}
                  onCommit={(v) => run(() => e!.setStyle("fill-opacity", v))}
                />
                <Field
                  label="선 α"
                  value={common("stroke-opacity")}
                  onCommit={(v) => run(() => e!.setStyle("stroke-opacity", v))}
                />
              </div>
            )}
            {sel.length === 1 && sel[0].localName === "text" && (
              <>
                <Field
                  label="내용"
                  value={sel[0].textContent || ""}
                  onCommit={(v) => run(() => e!.setText(v))}
                />
                <div className="field-grid">
                  <Field
                    label="글꼴"
                    value={common("font-family")}
                    onCommit={(v) => run(() => e!.setStyle("font-family", v))}
                  />
                  <Field
                    label="글자 크기"
                    value={common("font-size")}
                    onCommit={(v) => run(() => e!.setStyle("font-size", v))}
                  />
                </div>
              </>
            )}
          </section>
          {e && sel.length > 0 && (
            <>
              <section>
                <h2>
                  스트로크 <span>STROKE</span>
                </h2>
                <div className="field-grid">
                  {(
                    [
                      [
                        "stroke-linecap",
                        "끝 모양",
                        ["butt", "round", "square"],
                      ],
                      [
                        "stroke-linejoin",
                        "모서리",
                        ["miter", "round", "bevel"],
                      ],
                    ] as const
                  ).map(([property, label, options]) => (
                    <label className="field" key={property}>
                      <span>{label}</span>
                      <select
                        aria-label={label}
                        value={common(property)}
                        onChange={(ev) =>
                          run(() => e.setStyle(property, ev.target.value))
                        }
                      >
                        {options.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <Field
                    label="대시 배열"
                    value={common("stroke-dasharray")}
                    onCommit={(v) =>
                      run(() => e.setStyle("stroke-dasharray", v))
                    }
                  />
                  <Field
                    label="대시 오프셋"
                    value={common("stroke-dashoffset")}
                    onCommit={(v) =>
                      run(() => e.setStyle("stroke-dashoffset", v))
                    }
                  />
                  <Field
                    label="마이터 한계"
                    value={common("stroke-miterlimit")}
                    onCommit={(v) =>
                      run(() => e.setStyle("stroke-miterlimit", v))
                    }
                  />
                </div>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={common("vector-effect") === "non-scaling-stroke"}
                    onChange={(ev) =>
                      run(() =>
                        e.setStyle(
                          "vector-effect",
                          ev.target.checked ? "non-scaling-stroke" : "none",
                        ),
                      )
                    }
                  />
                  확대해도 선 두께 유지
                </label>
              </section>
              <PaintEditor
                editor={e}
                revision={revision}
                active={paintHandles}
                onActive={setPaintHandles}
                run={run}
              />
            </>
          )}
          <section>
            <h2>
              패스파인더 <span>PATHFINDER</span>
            </h2>
            <div className="pathfinder">
              {[
                ["unite", "합치기"],
                ["subtract", "빼기"],
                ["intersect", "교차"],
                ["exclude", "제외"],
              ].map(([op, name]) => (
                <button
                  key={op}
                  aria-label={`패스파인더 ${name}`}
                  disabled={sel.length < 2}
                  title={name}
                  onClick={() => run(() => e!.pathfinder(op as any))}
                >
                  <PathIcon op={op} />
                  <span>{name}</span>
                </button>
              ))}
            </div>
            <button
              className="text-action"
              disabled={!sel.length}
              onClick={() => run(() => e!.convertPaths())}
            >
              <Spline size={13} />
              경로로 변환
            </button>
            {tool === "node" && (
              <div className="node-actions">
                <button
                  onClick={() => run(() => controller.current!.closePath())}
                >
                  열기 / 닫기
                </button>
                <button
                  onClick={() => run(() => controller.current!.deleteNode())}
                >
                  노드 삭제
                </button>
                <small>경로 더블클릭: 노드 추가</small>
              </div>
            )}
          </section>
          <section>
            <h2>정렬과 구성</h2>
            <div className="icon-grid">
              {(
                [
                  ["left", "왼쪽 정렬", AlignHorizontalJustifyStart],
                  ["center", "가로 중앙 정렬", AlignHorizontalJustifyCenter],
                  ["right", "오른쪽 정렬", AlignHorizontalJustifyEnd],
                  ["top", "위 정렬", AlignVerticalJustifyStart],
                  ["middle", "세로 중앙 정렬", AlignVerticalJustifyCenter],
                  ["bottom", "아래 정렬", AlignVerticalJustifyEnd],
                ] as const
              ).map(([mode, name, icon]) => (
                <Button
                  key={mode}
                  label={name}
                  icon={icon}
                  disabled={sel.length < 2}
                  onClick={() => run(() => e!.align(mode))}
                />
              ))}
              <Button
                label="가로 간격 분배"
                icon={AlignHorizontalDistributeCenter}
                disabled={sel.length < 3}
                onClick={() => run(() => e!.distribute("x"))}
              />
              <Button
                label="세로 간격 분배"
                icon={AlignVerticalDistributeCenter}
                disabled={sel.length < 3}
                onClick={() => run(() => e!.distribute("y"))}
              />
            </div>
            <div className="icon-grid">
              <Button
                label="복제 (Ctrl+D)"
                icon={Copy}
                disabled={!sel.length}
                onClick={() => run(() => e!.duplicate())}
              />
              <Button
                label="그룹 (Ctrl+G)"
                icon={Group}
                disabled={!sel.length}
                onClick={() => run(() => e!.group())}
              />
              <Button
                label="그룹 해제"
                icon={Ungroup}
                disabled={!sel.length}
                onClick={() => run(() => e!.ungroup())}
              />
              <Button
                label="맨 앞으로"
                icon={ArrowUpToLine}
                disabled={!sel.length}
                onClick={() => run(() => e!.reorder("front"))}
              />
              <Button
                label="맨 뒤로"
                icon={ArrowDownToLine}
                disabled={!sel.length}
                onClick={() => run(() => e!.reorder("back"))}
              />
              <Button
                label="선택 삭제"
                icon={Trash2}
                disabled={!sel.length}
                onClick={() => run(() => e!.deleteSelection())}
              />
            </div>
          </section>
          <section className="cleanup">
            <h2>
              <Sparkles size={15} />
              투명 요소 정리
            </h2>
            <p>
              색과 선이 없는 요소를 찾아 정리합니다.
              <br />
              참조 리소스와 숨긴 레이어는 보존합니다.
            </p>
            <div>
              <Button
                label="투명 요소 선택"
                icon={Scan}
                onClick={() => run(() => e!.selectTransparent())}
              >
                선택
              </Button>
              <Button
                label="투명 요소 삭제"
                icon={Trash2}
                onClick={() => run(() => e!.deleteTransparent())}
              >
                삭제
              </Button>
            </div>
          </section>
          {e && <ResourcePanel editor={e} run={run} asyncRun={asyncRun} />}
          <section className="layers">
            <h2>
              <Layers size={15} />
              레이어{" "}
              <span>
                {e
                  ? [...e.svg.children].filter((el) =>
                      el.matches(
                        "g,path,rect,circle,ellipse,line,polyline,polygon,text,image,use",
                      ),
                    ).length
                  : 0}
              </span>
            </h2>
            {e && [...e.svg.children].reverse().map((el) => layer(el))}
            {e && !e.svg.children.length && (
              <p className="empty-property">아직 객체가 없습니다.</p>
            )}
          </section>
        </aside>
      </main>
      <footer>
        <span className="status-dot" />
        <span>{error || e?.status || "준비"}</span>
        <span className="footer-shortcut">
          {tool === "pen"
            ? "Enter: 완료 · 첫 점 클릭: 닫기"
            : tool === "node"
              ? "앵커·핸들 드래그 · 더블클릭: 노드 추가"
              : "Shift: 비율·축 고정 · Alt 드래그: 복제 · Space: 이동"}
        </span>
        <span className="svg-badge">100% SVG</span>
      </footer>
      <input
        hidden
        type="file"
        ref={fileInput}
        accept=".drawing,.svg,image/svg+xml,application/json"
        onChange={(ev) => {
          const file = ev.target.files?.[0];
          if (file)
            void asyncRun(async () => {
              const xml = await file.text();
              loadDocument(xml);
              setFilename(file.name);
            });
          ev.target.value = "";
        }}
      />
      {modal && (
        <div className="modal-backdrop">
          <div
            className={`modal ${modal === "help" ? "help-modal" : ""}`}
            role="dialog"
            aria-modal="true"
          >
            <button
              className="modal-close"
              aria-label="닫기"
              onClick={() => setModal(null)}
            >
              <X size={18} />
            </button>
            {modal === "new" ? (
              <>
                <span className="eyebrow">A NEW BEGINNING</span>
                <h1>새로운 캔버스</h1>
                <p>모든 아이디어의 시작은 빈 공간입니다.</p>
                <div className="field-grid">
                  <label>
                    너비 (px)
                    <input
                      type="number"
                      aria-label="문서 너비"
                      value={width}
                      onChange={(ev) => setWidth(Number(ev.target.value))}
                    />
                  </label>
                  <label>
                    높이 (px)
                    <input
                      type="number"
                      aria-label="문서 높이"
                      value={height}
                      onChange={(ev) => setHeight(Number(ev.target.value))}
                    />
                  </label>
                </div>
                <div className="presets">
                  <button
                    onClick={() => {
                      setWidth(960);
                      setHeight(640);
                    }}
                  >
                    960 × 640
                  </button>
                  <button
                    onClick={() => {
                      setWidth(1080);
                      setHeight(1080);
                    }}
                  >
                    정사각형
                  </button>
                  <button
                    onClick={() => {
                      setWidth(1920);
                      setHeight(1080);
                    }}
                  >
                    Full HD
                  </button>
                </div>
                <button
                  className="primary"
                  onClick={() =>
                    void asyncRun(async () => {
                      if (await guard()) {
                        controller.current!.cancel();
                        engine.current!.newDocument(width, height);
                        await window.desktop?.newDocument();
                        setFilename("Untitled.drawing");
                        setMode("design");
                        setTime(0);
                        setModal(null);
                        requestAnimationFrame(fit);
                      }
                    })
                  }
                >
                  만들기 <Plus size={16} />
                </button>
              </>
            ) : modal === "text" ? (
              <>
                <span className="eyebrow">TYPE SOMETHING</span>
                <h1>텍스트 추가</h1>
                <textarea
                  autoFocus
                  aria-label="텍스트 내용"
                  value={text}
                  onChange={(ev) => setText(ev.target.value)}
                />
                <button
                  className="primary"
                  onClick={() => {
                    run(() =>
                      engine.current!.create(
                        "text",
                        {
                          x: textPoint!.x,
                          y: textPoint!.y,
                          fill,
                          stroke,
                          "font-size": 36,
                          "font-family": "Arial, sans-serif",
                        },
                        text,
                      ),
                    );
                    setModal(null);
                    changeTool("select");
                  }}
                >
                  추가
                </button>
              </>
            ) : modal === "rename" ? (
              <>
                <span className="eyebrow">ORGANIZE YOUR ARTWORK</span>
                <h1>레이어 이름 변경</h1>
                <input
                  autoFocus
                  aria-label="레이어 이름"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
                <button
                  className="primary"
                  style={{ marginTop: 24 }}
                  onClick={() => {
                    const el = engine.current!.svg.querySelector(
                      `[id="${CSS.escape(renameId)}"]`,
                    );
                    if (el && text.trim())
                      run(() => engine.current!.setName(el, text.trim()));
                    setModal(null);
                  }}
                >
                  이름 변경
                </button>
              </>
            ) : (
              <>
                <span className="eyebrow">DRAWING QUICK GUIDE</span>
                <h1>손끝에서 벡터로.</h1>
                <p>
                  모든 객체는 실제 SVG입니다. 저장한 파일을 다른 벡터 도구에서도
                  열 수 있습니다.
                </p>
                <div className="help-grid">
                  <div>
                    <h3>그리기</h3>
                    <p>
                      V 선택 · A 노드 · P 펜<br />R 사각형 · E 타원 · L 선<br />
                      T 텍스트 · H 손 도구
                    </p>
                    <p>
                      펜: 클릭으로 점, 드래그로 곡선.
                      <br />
                      Enter로 완료, 첫 점 클릭으로 닫기.
                    </p>
                  </div>
                  <div>
                    <h3>편집</h3>
                    <p>
                      Shift 클릭: 다중 선택
                      <br />
                      Alt 드래그: 복제 · Shift: 비율 고정
                      <br />
                      Ctrl+C / X / V: 복사·잘라내기·붙여넣기
                      <br />
                      Ctrl+D: 복제 · Delete: 삭제
                    </p>
                  </div>
                  <div>
                    <h3>문서와 보기</h3>
                    <p>
                      Ctrl+S: 저장 · Ctrl+Shift+S: 다른 이름
                      <br />
                      Ctrl+O: 열기 · Ctrl+N: 새 문서
                      <br />
                      Ctrl+Z / Ctrl+Shift+Z: 취소·다시 실행
                      <br />
                      Ctrl+0: 화면 맞춤 · Space 드래그: 이동
                      <br />
                      Ctrl+휠: 확대·축소
                    </p>
                  </div>
                  <div>
                    <h3>구성</h3>
                    <p>
                      Ctrl+G / Ctrl+Shift+G: 그룹·해제
                      <br />[ / ]: 뒤로·앞으로 · Shift: 맨 끝<br />
                      화살표: 1px · Shift+화살표: 10px
                      <br />
                      레이어 이름 더블클릭: 이름 변경
                      <br />
                      노드 경로 더블클릭: 점 추가
                    </p>
                  </div>
                </div>
                <button className="primary" onClick={() => setModal(null)}>
                  그리기 시작
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
