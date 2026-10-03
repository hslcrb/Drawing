import React, { useEffect, useState } from "react";
import { SvgEditor, point } from "./core/editor";
import {
  applyPaint,
  initialPaint,
  readPaint,
  type GradientPaint,
  type PaintKind,
} from "./core/paints";

export function PaintEditor({
  editor,
  revision,
  active,
  onActive,
  run,
}: {
  editor: SvgEditor;
  revision: number;
  active: "fill" | "stroke" | null;
  onActive: (v: "fill" | "stroke" | null) => void;
  run: (fn: () => void) => void;
}) {
  const [property, setProperty] = useState<"fill" | "stroke">("fill");
  const [draft, setDraft] = useState<GradientPaint>(initialPaint());
  const current = readPaint(editor, property);
  const [node, setNode] = useState(0);
  useEffect(() => {
    if (current) setDraft(current);
    setNode(0);
  }, [revision, property]);
  const p = current || draft,
    n = p.nodes[Math.min(node, p.nodes.length - 1)];
  const change = (fn: (next: GradientPaint) => void) => {
    const next = structuredClone(p);
    fn(next);
    setDraft(next);
    run(() => applyPaint(editor, property, next));
  };
  return (
    <section className="gradient-editor">
      <h2>
        그라데이션 <span>COLOR FIELD</span>
      </h2>
      <div className="field-grid">
        <label className="field">
          <span>대상</span>
          <select
            aria-label="그라데이션 대상"
            value={property}
            onChange={(ev) => {
              setProperty(ev.target.value as "fill" | "stroke");
              onActive(null);
            }}
          >
            <option value="fill">채우기</option>
            <option value="stroke">스트로크</option>
          </select>
        </label>
        <label className="field">
          <span>유형</span>
          <select
            aria-label="그라데이션 유형"
            value={p.kind}
            onChange={(ev) =>
              change((next) => {
                next.kind = ev.target.value as PaintKind;
              })
            }
          >
            <option value="linear">선형</option>
            <option value="radial">방사형</option>
            <option value="points">자유형 · 점</option>
            <option value="lines">자유형 · 선</option>
          </select>
        </label>
      </div>
      <div
        className="gradient-ramp"
        style={{
          background: `linear-gradient(90deg,${[...p.nodes]
            .sort((a, b) => a.offset - b.offset)
            .map((n) => `${n.color} ${n.offset * 100}%`)
            .join(",")})`,
        }}
      />
      <div className="stop-list">
        {p.nodes.map((n, i) => (
          <button
            key={i}
            className={i === node ? "active" : ""}
            aria-label={`색상 노드 ${i + 1}`}
            onClick={() => setNode(i)}
          >
            <i style={{ background: n.color }} />
            {i + 1}
          </button>
        ))}
      </div>
      <div className="field-grid">
        <label className="field">
          <span>노드 색</span>
          <input
            type="color"
            aria-label="노드 색"
            value={n.color}
            onChange={(ev) =>
              change((next) => {
                next.nodes[node].color = ev.target.value;
              })
            }
          />
        </label>
        <label className="field">
          <span>알파</span>
          <input
            type="number"
            aria-label="노드 알파"
            min={0}
            max={1}
            step={0.05}
            value={n.opacity}
            onChange={(ev) =>
              change((next) => {
                next.nodes[node].opacity = Number(ev.target.value);
              })
            }
          />
        </label>
        {(["linear", "radial"].includes(p.kind)
          ? ["offset"]
          : ["x", "y", "radius"]
        ).map((key) => (
          <label className="field" key={key}>
            <span>
              {key === "offset"
                ? "스톱 위치"
                : key === "radius"
                  ? "영향 반경"
                  : `노드 ${key.toUpperCase()}`}
            </span>
            <input
              aria-label={`그라데이션 ${key}`}
              type="number"
              step={0.05}
              min={0}
              max={key === "radius" ? 4 : 1}
              value={n[key as "offset" | "x" | "y" | "radius"]}
              onChange={(ev) =>
                change((next) => {
                  next.nodes[node][key as "offset" | "x" | "y" | "radius"] =
                    Number(ev.target.value);
                })
              }
            />
          </label>
        ))}
      </div>
      <div className="field-grid">
        <button
          aria-label="색상 노드 추가"
          onClick={() => {
            change((next) => {
              next.nodes.push({
                x: 0.5,
                y: 0.5,
                offset: 0.5,
                color: "#ffffff",
                opacity: 1,
                radius: 0.6,
              });
            });
            setNode(p.nodes.length);
          }}
        >
          + 노드
        </button>
        <button
          aria-label="색상 노드 삭제"
          disabled={p.nodes.length <= 2}
          onClick={() => {
            change((next) => {
              next.nodes.splice(node, 1);
            });
            setNode(0);
          }}
        >
          노드 삭제
        </button>
        <button
          aria-label="그라데이션 적용"
          onClick={() => run(() => applyPaint(editor, property, p))}
        >
          적용
        </button>
        <button
          aria-label="그라데이션 핸들 편집"
          className={active === property ? "active" : ""}
          disabled={!current}
          onClick={() => onActive(active === property ? null : property)}
        >
          캔버스 핸들
        </button>
      </div>
      {["linear", "radial"].includes(p.kind) && (
        <div className="field-grid">
          {(["start", "end"] as const).flatMap((k) =>
            (["x", "y"] as const).map((axis) => (
              <label className="field" key={k + axis}>
                <span>
                  {k === "start" ? "시작" : "끝"} {axis.toUpperCase()}
                </span>
                <input
                  aria-label={`${k} ${axis}`}
                  type="number"
                  step={0.05}
                  value={p[k][axis]}
                  onChange={(ev) =>
                    change((next) => {
                      next[k][axis] = Number(ev.target.value);
                    })
                  }
                />
              </label>
            )),
          )}
        </div>
      )}
      <p className="panel-note">
        캔버스 핸들을 드래그하거나 0~1 좌표로 조절하세요.
      </p>
    </section>
  );
}

export function GradientHandles({
  editor,
  property,
  zoom,
  run,
}: {
  editor: SvgEditor;
  property: "fill" | "stroke";
  zoom: number;
  run: (fn: () => void) => void;
}) {
  const p = readPaint(editor, property),
    el = editor.selected[0];
  if (!p || !el) return null;
  const bbox = el.getBBox(),
    root = editor.svg.getScreenCTM(),
    matrix = el.getScreenCTM();
  if (!root || !matrix) return null;
  const m = root.inverse().multiply(matrix);
  const markers: [string, { x: number; y: number }][] = [
    "points",
    "lines",
  ].includes(p.kind)
    ? p.nodes.map((n, i) => [String(i), n])
    : [
        ["start", p.start],
        ["end", p.end],
      ];
  const positions = markers.map(
    ([id, n]) =>
      [
        id,
        point(m, {
          x: bbox.x + n.x * bbox.width,
          y: bbox.y + n.y * bbox.height,
        }),
      ] as const,
  );
  return (
    <svg
      className="gradient-handles"
      width="100%"
      height="100%"
      viewBox={`0 0 ${editor.size.width} ${editor.size.height}`}
    >
      <polyline
        points={positions.map(([, v]) => `${v.x},${v.y}`).join(" ")}
        fill="none"
        stroke="#ffffff"
        strokeWidth={2 / zoom}
      />
      {positions.map(([id, v]) => (
        <circle
          key={id}
          data-gradient-handle={id}
          cx={v.x}
          cy={v.y}
          r={7 / zoom}
          fill={
            Number.isFinite(Number(id)) ? p.nodes[Number(id)].color : "#ffffff"
          }
          stroke="#7254e8"
          strokeWidth={2 / zoom}
          onPointerDown={(ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            editor.begin();
            ev.currentTarget.setPointerCapture(ev.pointerId);
          }}
          onPointerMove={(ev) => {
            if (!ev.currentTarget.hasPointerCapture(ev.pointerId)) return;
            ev.stopPropagation();
            const local = point(matrix.inverse(), {
              x: ev.clientX,
              y: ev.clientY,
            });
            const next = structuredClone(readPaint(editor, property)!);
            const n = {
              x: (local.x - bbox.x) / Math.max(0.001, bbox.width),
              y: (local.y - bbox.y) / Math.max(0.001, bbox.height),
            };
            if (id === "start" || id === "end") next[id] = n;
            else Object.assign(next.nodes[Number(id)], n);
            run(() => applyPaint(editor, property, next, true));
          }}
          onPointerUp={(ev) => {
            ev.stopPropagation();
            editor.commit("그라데이션 핸들 이동");
            ev.currentTarget.releasePointerCapture(ev.pointerId);
          }}
          onPointerCancel={() => editor.cancel()}
        />
      ))}
    </svg>
  );
}
