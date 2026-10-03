import React, { useRef, useState } from "react";
import { SvgEditor } from "./core/editor";
import { embedImage } from "./core/assets";
export function ResourcePanel({
  editor,
  run,
  asyncRun,
}: {
  editor: SvgEditor;
  run: (f: () => void) => void;
  asyncRun: (f: () => Promise<void>) => Promise<void>;
}) {
  const image = useRef<HTMLInputElement>(null),
    font = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"full" | "subset">("full"),
    [characters, setCharacters] = useState(""),
    [busy, setBusy] = useState(false);
  const allText = [...editor.svg.querySelectorAll("text")]
    .map((el) => el.textContent || "")
    .join("");
  return (
    <section className="resource-panel">
      <h2>
        이미지 · 글꼴 <span>EMBEDDED</span>
      </h2>
      <button aria-label="이미지 포함" onClick={() => image.current?.click()}>
        이미지 가져오기
      </button>
      <input
        hidden
        data-testid="image-input"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        ref={image}
        onChange={(ev) => {
          const file = ev.target.files?.[0];
          ev.target.value = "";
          if (file) void asyncRun(() => embedImage(editor, file));
        }}
      />
      <div className="field-grid">
        <label className="field">
          <span>폰트 포함</span>
          <select
            aria-label="폰트 포함 방식"
            value={mode}
            onChange={(ev) => setMode(ev.target.value as "full" | "subset")}
          >
            <option value="full">전체 글리프</option>
            <option value="subset">사용 글리프만</option>
          </select>
        </label>
        <button
          aria-label="폰트 포함"
          disabled={busy}
          onClick={() => font.current?.click()}
        >
          {busy ? "포함 중…" : "TTF / OTF"}
        </button>
      </div>
      {mode === "subset" && (
        <label className="field">
          <span>추가로 포함할 문자</span>
          <input
            aria-label="추가 포함 문자"
            value={characters}
            onChange={(ev) => setCharacters(ev.target.value)}
          />
        </label>
      )}
      <input
        hidden
        data-testid="font-input"
        type="file"
        accept=".ttf,.otf"
        ref={font}
        onChange={(ev) => {
          const file = ev.target.files?.[0];
          ev.target.value = "";
          if (file)
            void asyncRun(async () => {
              setBusy(true);
              try {
                const { makeEmbeddedFont, embedFont } =
                  await import("./core/fonts");
                const f = await makeEmbeddedFont(
                  file,
                  mode,
                  allText + characters,
                  editor.freshId(),
                );
                embedFont(editor, f);
              } finally {
                setBusy(false);
              }
            });
        }}
      />
      {editor.project.fonts.map((f) => (
        <div className="resource-card" key={f.id}>
          <strong>{f.name}</strong>
          <span>
            {f.mode === "full" ? "전체" : "사용 글리프"} ·{" "}
            {(f.bytes / 1024).toFixed(1)} KB
          </span>
          <button
            aria-label={`글꼴 적용 ${f.name}`}
            disabled={!editor.selected.length}
            onClick={() => run(() => editor.setStyle("font-family", f.family))}
          >
            선택에 적용
          </button>
          {f.mode === "subset" && (
            <small>
              포함 문자: {f.characters.slice(0, 100)}
              {f.characters.length > 100 ? "…" : ""}
              <br />새 문자는 폰트를 다시 포함하세요.
            </small>
          )}
        </div>
      ))}
      {editor.project.assets.map((a) => (
        <div className="resource-card" key={a.id}>
          <span>{a.name}</span>
          <small>프로젝트와 SVG에 포함됨</small>
        </div>
      ))}
      <p className="panel-note">
        선택한 텍스트에 폰트를 적용합니다. 글꼴을 포함할 권한이 있는 파일을
        사용하세요.
      </p>
    </section>
  );
}
