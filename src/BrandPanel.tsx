import React, { useState } from "react";
import type { SvgEditor } from "./core/editor";
import {
  identity,
  updateIdentity,
  registerComponent,
  defaultLogotypes,
  generateVariants,
  insertComponent,
  editComponent,
  detachComponent,
  identityArchive,
} from "./core/identity";
import type { BrandVariant, ComponentRole } from "./core/identity-types";
export function BrandPanel({
  editor,
  run,
  asyncRun,
  fit,
  focus,
  retypo,
}: {
  editor: SvgEditor;
  run: (f: () => void) => void;
  asyncRun: (f: () => Promise<void>) => Promise<void>;
  fit: () => void;
  focus: () => void;
  retypo: () => void;
}) {
  const b = identity(editor),
    [role, setRole] = useState<ComponentRole>("symbol"),
    [languages, setLanguages] = useState<BrandVariant["language"][]>([
      "ko",
      "en",
      "bilingual",
    ]),
    [layouts, setLayouts] = useState<BrandVariant["layout"][]>([
      "horizontal",
      "vertical",
      "logotype",
    ]),
    [tones, setTones] = useState<BrandVariant["tone"][]>([
      "primary",
      "secondary",
      "mono",
      "reverse",
    ]),
    [filter, setFilter] = useState("");
  const toggle = <T extends string>(
    items: T[],
    set: (v: T[]) => void,
    item: T,
  ) =>
    set(
      items.includes(item) ? items.filter((v) => v !== item) : [...items, item],
    );
  return (
    <aside className="brand-panel" data-testid="brand-panel">
      <section>
        <span className="eyebrow">IDENTITY SYSTEM</span>
        <h2>상징체계 스튜디오</h2>
        <p>하나의 원본에서 수십 가지 조합까지.</p>
        {(
          [
            ["name", "체계 이름"],
            ["ko", "국문 명칭"],
            ["en", "영문 명칭"],
          ] as const
        ).map(([key, label]) => (
          <label className="field" key={key}>
            <span>{label}</span>
            <input
              aria-label={label}
              value={b[key]}
              onChange={(ev) =>
                run(() =>
                  updateIdentity(editor, (next) => {
                    next[key] = ev.target.value;
                  }),
                )
              }
            />
          </label>
        ))}
      </section>
      <section>
        <h2>
          원본 컴포넌트 <span>MASTERS</span>
        </h2>
        <label className="field">
          <span>역할</span>
          <select
            aria-label="컴포넌트 역할"
            value={role}
            onChange={(ev) => setRole(ev.target.value as ComponentRole)}
          >
            <option value="symbol">로고 심볼</option>
            <option value="logotype-ko">국문 로고타입</option>
            <option value="logotype-en">영문 로고타입</option>
            <option value="generic">공통 컴포넌트</option>
          </select>
        </label>
        <button
          aria-label="선택을 컴포넌트로 등록"
          disabled={editor.selected.length !== 1}
          onClick={() => run(() => registerComponent(editor, role, ""))}
        >
          선택을 원본으로 등록
        </button>
        <button
          aria-label="국문 영문 로고타입 자동 준비"
          onClick={() => run(() => defaultLogotypes(editor))}
        >
          국문·영문 텍스트 준비
        </button>
        {b.components.map((c) => (
          <div className="brand-component" key={c.id}>
            <strong>{c.name}</strong>
            <small>
              {c.role} · {Math.round(c.width)} × {Math.round(c.height)}
            </small>
            <div>
              <button
                aria-label={`원본 편집 ${c.role}`}
                onClick={() =>
                  run(() => {
                    editComponent(editor, c.id);
                    focus();
                  })
                }
              >
                원본 편집
              </button>
              <button
                aria-label={`컴포넌트 인스턴스 ${c.role}`}
                onClick={() => run(() => insertComponent(editor, c.id))}
              >
                인스턴스
              </button>
            </div>
          </div>
        ))}
        <button
          aria-label="컴포넌트 연결 해제"
          disabled={!editor.selected.length}
          onClick={() => run(() => detachComponent(editor))}
        >
          선택 연결 해제
        </button>
        <button aria-label="Retypo 열기" onClick={retypo}>
          Retypo · 경로 → 텍스트
        </button>
      </section>
      <section>
        <h2>
          색상 · 사용 규정 <span>RULES</span>
        </h2>
        <div className="field-grid">
          {Object.entries(b.palette).map(([key, color]) => (
            <label className="field" key={key}>
              <span>{key}</span>
              <input
                aria-label={`상징 색 ${key}`}
                type="color"
                value={color}
                onChange={(ev) =>
                  run(() =>
                    updateIdentity(editor, (next) => {
                      next.palette[key as keyof typeof next.palette] =
                        ev.target.value;
                    }),
                  )
                }
              />
            </label>
          ))}
          {(
            [
              ["gap", "조합 간격"],
              ["clearSpace", "보호 공간"],
              ["minWidth", "최소 사용 너비"],
            ] as const
          ).map(([key, label]) => (
            <label className="field" key={key}>
              <span>{label}</span>
              <input
                aria-label={label}
                type="number"
                min={0}
                max={10000}
                value={b[key]}
                onChange={(ev) => {
                  const n = Number(ev.target.value);
                  if (n >= 0 && n <= 10000)
                    run(() =>
                      updateIdentity(editor, (next) => {
                        next[key] = n;
                      }),
                    );
                }}
              />
            </label>
          ))}
        </div>
        <label className="check-row">
          <input
            aria-label="보호 공간 안내"
            type="checkbox"
            checked={b.showGuides}
            onChange={(ev) =>
              run(() =>
                updateIdentity(editor, (next) => {
                  next.showGuides = ev.target.checked;
                }),
              )
            }
          />
          보호 공간과 조합 이름 표시
        </label>
      </section>
      <section>
        <h2>
          조합 매트릭스{" "}
          <span>
            {languages.length * layouts.length * tones.length} VARIANTS
          </span>
        </h2>
        <div className="matrix-options">
          {(["ko", "en", "bilingual"] as const).map((x) => (
            <label key={x}>
              <input
                type="checkbox"
                aria-label={`언어 ${x}`}
                checked={languages.includes(x)}
                onChange={() => toggle(languages, setLanguages, x)}
              />
              {x === "ko" ? "국문" : x === "en" ? "영문" : "국·영문"}
            </label>
          ))}
        </div>
        <div className="matrix-options">
          {(["horizontal", "vertical", "logotype", "symbol"] as const).map(
            (x) => (
              <label key={x}>
                <input
                  type="checkbox"
                  aria-label={`조합 ${x}`}
                  checked={layouts.includes(x)}
                  onChange={() => toggle(layouts, setLayouts, x)}
                />
                {
                  {
                    horizontal: "가로형",
                    vertical: "세로형",
                    logotype: "로고타입",
                    symbol: "심볼",
                  }[x]
                }
              </label>
            ),
          )}
        </div>
        <div className="matrix-options">
          {(["primary", "secondary", "mono", "reverse"] as const).map((x) => (
            <label key={x}>
              <input
                type="checkbox"
                aria-label={`색상 ${x}`}
                checked={tones.includes(x)}
                onChange={() => toggle(tones, setTones, x)}
              />
              {x}
            </label>
          ))}
        </div>
        <button
          className="primary"
          aria-label="상징 조합 일괄 생성"
          onClick={() =>
            run(() => {
              generateVariants(editor, {
                languages,
                layouts,
                tones,
                width: 500,
                height: 270,
                columns: 3,
              });
              requestAnimationFrame(fit);
            })
          }
        >
          {languages.length * layouts.length * tones.length}개 조합 생성
        </button>
        <button
          aria-label="상징체계 ZIP 내보내기"
          disabled={!b.variants.length}
          onClick={() =>
            void asyncRun(async () => {
              const bytes = await identityArchive(editor);
              const name = `${b.name.replace(/[^a-zA-Z0-9가-힣_-]/g, "_")}-identity.zip`;
              if (window.desktop) {
                let raw = "";
                for (let i = 0; i < bytes.length; i += 8192)
                  raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
                await window.desktop.download(name, btoa(raw));
              } else {
                const url = URL.createObjectURL(
                  new Blob([bytes.slice().buffer], { type: "application/zip" }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = name;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 10000);
              }
            })
          }
        >
          SVG 패키지 ZIP 내보내기
        </button>
      </section>
      <section>
        <h2>
          조합 목록 <span>{b.variants.length}</span>
        </h2>
        <input
          aria-label="상징 조합 검색"
          placeholder="국문, 영문, 색상…"
          value={filter}
          onChange={(ev) => setFilter(ev.target.value)}
        />
        <div className="brand-variants">
          {b.variants
            .filter((v) => v.name.toLowerCase().includes(filter.toLowerCase()))
            .map((v) => (
              <button
                key={v.id}
                aria-label={`상징 조합 ${v.id}`}
                onClick={() => {
                  editor.select([v.id]);
                  focus();
                }}
              >
                <span>
                  {v.language} · {v.layout}
                </span>
                <small>
                  {v.tone} · {v.linked ? "연결됨" : "독립"}
                </small>
              </button>
            ))}
        </div>
      </section>
    </aside>
  );
}
