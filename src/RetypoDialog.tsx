import React, { useEffect, useRef, useState } from "react";
import type { Font } from "opentype.js";
import type { SvgEditor } from "./core/editor";
import {
  parseFont,
  fontReport,
  glyphSvg,
  pathData,
  recognizeOutlines,
  replaceWithText,
  type Recognition,
} from "./core/retypo";
const alphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789한국공공기관대한민국문화교육환경산업연구정보진흥원시청국립센터";
export default function RetypoDialog({
  editor,
  close,
}: {
  editor: SvgEditor;
  close: () => void;
}) {
  const [fonts, setFonts] = useState<{ id: string; name: string }[]>([]),
    [font, setFont] = useState<Font | null>(null),
    [file, setFile] = useState<File | null>(null),
    [fontId, setFontId] = useState(""),
    [search, setSearch] = useState(""),
    [glyphSearch, setGlyphSearch] = useState(""),
    [page, setPage] = useState(0),
    [characters, setCharacters] = useState(alphabet),
    [result, setResult] = useState<Recognition | null>(null),
    [text, setText] = useState("Drawing"),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [message, setMessage] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    void window.desktop
      ?.systemFonts()
      .then((v) => {
        if (alive.current) setFonts(v);
      })
      .catch((err) => {
        if (alive.current) setMessage(String(err));
      });
    return () => {
      alive.current = false;
    };
  }, []);
  const work = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (err) {
      if (alive.current)
        setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const read = async (value: File, id: string) => {
    const parsed = parseFont(await value.arrayBuffer());
    if (alive.current) {
      setFont(parsed);
      setFile(value);
      setFontId(id);
      setResult(null);
      setPage(0);
    }
  };
  const load = (id: string) =>
    void work(async () => {
      const embedded = editor.project.fonts.find(
        (f) => `embedded:${f.id}` === id,
      );
      const data = embedded
        ? { name: embedded.name, base64: embedded.data.split(",")[1] }
        : await window.desktop!.fontData(id);
      const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
      await read(new File([bytes], data.name), id);
    });
  const report = font ? fontReport(font) : null,
    visible =
      report?.characters.filter(
        (c) =>
          !glyphSearch ||
          c.char.includes(glyphSearch) ||
          `U+${c.code.toString(16).toUpperCase()}`.includes(
            glyphSearch.toUpperCase(),
          ),
      ) || [];
  return (
    <div className="retypo-dialog">
      <span className="eyebrow">RET YPO / GLYPH INTELLIGENCE</span>
      <h1>Retypo</h1>
      <p>
        폰트 글리프를 살펴보고 경로 글자를 편집 가능한 SVG 텍스트로 복원합니다.
      </p>
      <div className="retypo-columns">
        <section className="font-browser">
          <h2>시스템 · 프로젝트 폰트</h2>
          <input
            aria-label="Retypo 폰트 검색"
            placeholder="폰트 이름 검색"
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
          />
          <label className="font-upload">
            TTF / OTF 파일 열기
            <input
              data-testid="retypo-font-input"
              aria-label="Retypo 폰트 파일"
              type="file"
              accept=".ttf,.otf"
              disabled={busy}
              onChange={(ev) => {
                const f = ev.target.files?.[0];
                if (f)
                  void work(async () => {
                    if (f.size > 20 * 1024 * 1024)
                      throw new Error("폰트는 20MB 이하로 선택하세요.");
                    await read(f, "file");
                  });
                ev.target.value = "";
              }}
            />
          </label>
          <div className="font-list">
            {[
              ...editor.project.fonts.map((f) => ({
                id: `embedded:${f.id}`,
                name: `${f.name} (프로젝트)`,
              })),
              ...fonts,
            ]
              .filter((f) =>
                f.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((f) => (
                <button
                  key={f.id}
                  className={fontId === f.id ? "active" : ""}
                  aria-label={`Retypo 폰트 ${f.name}`}
                  disabled={busy}
                  onClick={() => load(f.id)}
                >
                  {f.name}
                </button>
              ))}
          </div>
          {!window.desktop && (
            <small>웹 미리보기에서는 폰트 파일을 직접 열어주세요.</small>
          )}
        </section>
        <section className="glyph-browser">
          <h2>글리프 보고서</h2>
          {report ? (
            <>
              <div data-testid="font-report" className="font-report">
                <strong>
                  {report.family} · {report.style}
                </strong>
                <span>
                  {report.glyphCount.toLocaleString()} 글리프 ·{" "}
                  {report.characters.length.toLocaleString()} Unicode 문자 ·{" "}
                  {report.unitsPerEm} UPM
                </span>
              </div>
              <input
                aria-label="Retypo 글리프 검색"
                placeholder="문자 또는 U+0041 검색"
                value={glyphSearch}
                onChange={(ev) => {
                  setGlyphSearch(ev.target.value);
                  setPage(0);
                }}
              />
              <div className="glyph-grid">
                {visible.slice(page * 72, (page + 1) * 72).map((c) => {
                  const g = glyphSvg(font!, c.char);
                  return (
                    <button
                      key={c.code}
                      title={`${c.char} · U+${c.code.toString(16).toUpperCase()} · glyph ${c.glyph}`}
                      onClick={() =>
                        setCharacters((v) =>
                          v.includes(c.char) ? v : v + c.char,
                        )
                      }
                    >
                      <svg viewBox={g.viewBox} aria-hidden="true">
                        <path d={g.d} />
                      </svg>
                      <span>{c.char}</span>
                      <small>{c.code.toString(16).toUpperCase()}</small>
                    </button>
                  );
                })}
              </div>
              <div className="glyph-paging">
                <button
                  disabled={page === 0}
                  onClick={() => setPage((v) => v - 1)}
                >
                  이전
                </button>
                <span>
                  {page + 1} / {Math.max(1, Math.ceil(visible.length / 72))}
                </span>
                <button
                  disabled={(page + 1) * 72 >= visible.length}
                  onClick={() => setPage((v) => v + 1)}
                >
                  다음
                </button>
              </div>
            </>
          ) : (
            <p className="empty-hint">
              폰트를 선택하면 실제 글리프의 윤곽과 Unicode 목록이 표시됩니다.
            </p>
          )}
        </section>
      </div>
      <section className="retypo-analysis">
        <h2>경로 → 텍스트</h2>
        <label className="field">
          <span>비교 문자 집합 · 빈칸이면 폰트의 처음 4,096문자</span>
          <input
            aria-label="Retypo 비교 문자"
            value={characters}
            maxLength={8192}
            onChange={(ev) => setCharacters(ev.target.value)}
          />
        </label>
        <div className="retypo-actions">
          <button
            aria-label="Retypo 경로 분석"
            disabled={!font || busy}
            onClick={() =>
              void work(async () => {
                const r = await recognizeOutlines(
                  editor,
                  font!,
                  characters,
                  (v) => {
                    if (alive.current) setProgress(v);
                  },
                );
                if (alive.current) {
                  setResult(r);
                  setText(r.text);
                }
              })
            }
          >
            {busy ? `분석 ${Math.round(progress * 100)}%` : "선택 경로 분석"}
          </button>
          <button
            aria-label="Retypo 글리프 경로 삽입"
            disabled={!font || busy || !text.trim()}
            onClick={() => {
              editor.create("path", {
                d: pathData(font!.getPath(text, 40, 240, 80)),
                fill: "#31294a",
                "data-name": "Retypo 글리프 경로",
              });
              setResult(null);
            }}
          >
            문구를 글리프 경로로 삽입
          </button>
        </div>
        {result && (
          <>
            <p data-testid="retypo-confidence">
              형태 유사도 {Math.round(result.score * 100)}% · 선택한 폰트의
              후보입니다. 아래 문구를 확인·수정한 뒤 복원하세요.
            </p>
            <div className="retypo-candidates">
              {result.candidates.map((list, i) => (
                <span key={i}>
                  {list
                    .map((c) => `${c.char} ${Math.round(c.score * 100)}%`)
                    .join(" · ")}
                </span>
              ))}
            </div>
          </>
        )}
        <label className="field">
          <span>문구 / 복원 결과</span>
          <input
            aria-label="Retypo 복원 텍스트"
            value={text}
            onChange={(ev) => setText(ev.target.value)}
          />
        </label>
        <button
          className="primary"
          aria-label="Retypo 텍스트로 복원"
          disabled={!result || !font || !file || busy || !text.trim()}
          onClick={() =>
            void work(async () => {
              const { makeEmbeddedFont } = await import("./core/fonts");
              const embedded = await makeEmbeddedFont(
                file!,
                "full",
                text,
                editor.freshId(),
              );
              replaceWithText(editor, font!, embedded, text, result!);
              await document.fonts.load(`80px "${embedded.family}"`, text);
              close();
            })
          }
        >
          편집 가능한 텍스트로 복원 · 전체 폰트 포함
        </button>
        <small>
          글리프 비교는 선택한 폰트와 분리된 글자 윤곽을 기준으로 합니다.
          변형되거나 붙어 있는 글자는 문구를 직접 보정할 수 있습니다.
        </small>
        {message && (
          <p className="retypo-error" role="alert">
            {message}
          </p>
        )}
      </section>
    </div>
  );
}
