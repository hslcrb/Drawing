import React, { useEffect, useState } from "react";
import { SvgEditor } from "./core/editor";
import { sampleTrack, upsertKey } from "./core/motion";
import { identityKey, type Keyframe } from "./core/project";
export function Timeline({
  editor,
  time,
  setTime,
  playing,
  setPlaying,
  run,
}: {
  editor: SvgEditor;
  time: number;
  setTime: (t: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  run: (f: () => void) => void;
}) {
  const motion = editor.project.motion,
    id = editor.ids[0],
    track = motion.tracks.find((t) => t.id === id);
  const [draft, setDraft] = useState<Keyframe>(identityKey(time));
  useEffect(
    () => setDraft(track ? sampleTrack(track, time) : identityKey(time)),
    [time, id, JSON.stringify(track)],
  );
  const set = (key: keyof Keyframe, value: number | string) =>
    setDraft((d) => ({ ...d, [key]: value }));
  return (
    <div className="timeline" data-testid="timeline">
      <div className="timeline-controls">
        <button
          aria-label={playing ? "모션 일시정지" : "모션 재생"}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button
          aria-label="모션 처음으로"
          onClick={() => {
            setPlaying(false);
            setTime(0);
          }}
        >
          ↤
        </button>
        <label>
          시간{" "}
          <input
            aria-label="모션 시간"
            type="number"
            min={0}
            max={motion.duration}
            step={1 / motion.fps}
            value={Number(time.toFixed(3))}
            onChange={(ev) => {
              setPlaying(false);
              setTime(
                Math.max(0, Math.min(motion.duration, Number(ev.target.value))),
              );
            }}
          />{" "}
          s
        </label>
        <label>
          길이{" "}
          <input
            aria-label="모션 길이"
            type="number"
            min={0.1}
            max={3600}
            step={0.1}
            value={motion.duration}
            onChange={(ev) => {
              const v = Number(ev.target.value);
              if (v >= 0.1 && v <= 3600)
                run(() => {
                  editor.command("모션 길이", () => {
                    editor.project.motion.duration = v;
                    for (const t of motion.tracks)
                      t.keys = t.keys.filter((k) => k.time <= v);
                  });
                  setTime(Math.min(time, v));
                });
            }}
          />{" "}
          s
        </label>
        <label>
          FPS{" "}
          <input
            aria-label="모션 FPS"
            type="number"
            min={1}
            max={120}
            value={motion.fps}
            onChange={(ev) => {
              const v = Number(ev.target.value);
              if (v >= 1 && v <= 120)
                run(() =>
                  editor.command("FPS", () => {
                    motion.fps = v;
                  }),
                );
            }}
          />
        </label>
        <label>
          <input
            type="checkbox"
            aria-label="모션 반복"
            checked={motion.loop}
            onChange={(ev) =>
              run(() =>
                editor.command("반복", () => {
                  motion.loop = ev.target.checked;
                }),
              )
            }
          />
          반복
        </label>
        <span className="panel-note">
          객체를 선택하고 값을 입력한 뒤 ◆ 키 저장
        </span>
      </div>
      <input
        className="time-scrubber"
        aria-label="타임라인 탐색"
        type="range"
        min={0}
        max={motion.duration}
        step={1 / motion.fps}
        value={time}
        onChange={(ev) => {
          setPlaying(false);
          setTime(Number(ev.target.value));
        }}
      />
      <div className="keyframe-values">
        {(["x", "y", "rotation", "scale", "opacity"] as const).map((key) => (
          <label key={key}>
            {
              {
                x: "X 이동",
                y: "Y 이동",
                rotation: "회전",
                scale: "크기",
                opacity: "불투명도",
              }[key]
            }
            <input
              aria-label={`키프레임 ${key}`}
              type="number"
              step={key === "opacity" || key === "scale" ? 0.1 : 1}
              value={draft[key]}
              onChange={(ev) => set(key, Number(ev.target.value))}
            />
          </label>
        ))}
        <select
          aria-label="키프레임 보간"
          value={draft.easing}
          onChange={(ev) => set("easing", ev.target.value)}
        >
          <option value="linear">선형</option>
          <option value="ease-in-out">부드럽게</option>
          <option value="step">유지</option>
        </select>
        <button
          aria-label="키프레임 저장"
          disabled={!id}
          onClick={() => run(() => upsertKey(editor, id, { ...draft, time }))}
        >
          ◆ 키 저장
        </button>
        <button
          aria-label="키프레임 삭제"
          disabled={!track?.keys.some((k) => Math.abs(k.time - time) < 0.00001)}
          onClick={() =>
            run(() =>
              editor.command("키프레임 삭제", () => {
                track!.keys = track!.keys.filter(
                  (k) => Math.abs(k.time - time) > 0.00001,
                );
              }),
            )
          }
        >
          키 삭제
        </button>
      </div>
      <div className="track-list">
        {motion.tracks.map((t) => (
          <div
            className={`motion-track ${t.id === id ? "active" : ""}`}
            key={t.id}
          >
            <button
              aria-label={`모션 트랙 ${t.id}`}
              onClick={() => editor.select([t.id])}
            >
              {editor.svg
                .querySelector(`[id="${CSS.escape(t.id)}"]`)
                ?.getAttribute("data-name") || t.id}
            </button>
            <div className="track-keys">
              {t.keys.map((k) => (
                <button
                  key={k.time}
                  aria-label={`${t.id} 키 ${k.time}`}
                  className={Math.abs(k.time - time) < 0.00001 ? "active" : ""}
                  style={{ left: `${(k.time / motion.duration) * 100}%` }}
                  onClick={() => {
                    setPlaying(false);
                    editor.select([t.id]);
                    setTime(k.time);
                  }}
                >
                  ◆
                </button>
              ))}
            </div>
            <button
              aria-label={`모션 트랙 삭제 ${t.id}`}
              onClick={() =>
                run(() =>
                  editor.command("트랙 삭제", () => {
                    motion.tracks = motion.tracks.filter((x) => x.id !== t.id);
                  }),
                )
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
