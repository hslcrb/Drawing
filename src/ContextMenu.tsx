import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SvgEditor } from "./core/editor";
import type { Tools } from "./core/tools";
import { registerComponent, detachComponent } from "./core/identity";
type Field = HTMLInputElement | HTMLTextAreaElement;
export function ContextMenu({
  editor,
  tools,
  run,
  asyncRun,
  copy,
  paste,
  fit,
  retypo,
}: {
  editor: SvgEditor;
  tools: Tools | null;
  run: (f: () => void) => void;
  asyncRun: (f: () => Promise<void>) => Promise<void>;
  copy: (cut?: boolean) => Promise<void>;
  paste: () => Promise<void>;
  fit: () => void;
  retypo: () => void;
}) {
  const [menu, setMenu] = useState<{
      x: number;
      y: number;
      field: Field | null;
    } | null>(null),
    ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const open = (ev: MouseEvent) => {
      ev.preventDefault();
      const target = ev.target as Element,
        field = target.closest("input,textarea");
      if (!(
        field instanceof HTMLInputElement ||
        field instanceof HTMLTextAreaElement
      )) {
        const layer = target.closest("[data-context-id]"),
          id = layer?.getAttribute("data-context-id"),
          el = id
            ? editor.svg.querySelector(`[id="${CSS.escape(id)}"]`)
            : tools?.hit(target);
        if (el && editor.editable(el) && !editor.ids.includes(el.id))
          editor.select([el.id]);
      }
      setMenu({
        x: Math.min(ev.clientX, window.innerWidth - 248),
        y: Math.max(8, Math.min(ev.clientY, window.innerHeight - 550)),
        field:
          field instanceof HTMLInputElement ||
          field instanceof HTMLTextAreaElement
            ? field
            : null,
      });
    };
    const dismiss = (ev: PointerEvent) => {
        if (!ref.current?.contains(ev.target as Node)) setMenu(null);
      },
      keys = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") setMenu(null);
      };
    document.addEventListener("contextmenu", open);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("contextmenu", open);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", keys);
    };
  }, [editor, tools]);
  useEffect(() => {
    if (menu && !menu.field)
      ref.current
        ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
        ?.focus();
  }, [menu]);
  useLayoutEffect(() => {
    if (menu && ref.current) {
      const rect = ref.current.getBoundingClientRect(),
        x = Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8)),
        y = Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8));
      if (x !== menu.x || y !== menu.y) setMenu({ ...menu, x, y });
    }
  }, [menu]);
  if (!menu) return null;
  const item = (label: string, action: () => void, disabled = false) => (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        setMenu(null);
        action();
      }}
    >
      {label}
    </button>
  );
  const selected = !!editor.selected.length,
    field = menu.field;
  const fieldWrite = (value: string) => {
    if (!field || field.readOnly || field.disabled) return;
    const start = field.selectionStart ?? field.value.length,
      end = field.selectionEnd ?? start,
      next = field.value.slice(0, start) + value + field.value.slice(end);
    const setter = Object.getOwnPropertyDescriptor(
      field instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(field, next);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.focus();
    try {
      field.setSelectionRange(start + value.length, start + value.length);
    } catch {}
  };
  const fieldCopy = async (cut = false) => {
    const value = field!.value.slice(
      field!.selectionStart ?? 0,
      field!.selectionEnd ?? field!.value.length,
    );
    if (window.desktop) await window.desktop.clipboardWrite(value);
    else await navigator.clipboard.writeText(value);
    if (cut) fieldWrite("");
  };
  return (
    <div
      className="context-menu"
      role="menu"
      aria-label="Drawing 우클릭 메뉴"
      ref={ref}
      style={{ left: Math.max(8, menu.x), top: menu.y }}
      onKeyDown={(ev) => {
        ev.stopPropagation();
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
          ev.preventDefault();
          const buttons = [
              ...ref.current!.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ),
            ],
            i = buttons.indexOf(document.activeElement as HTMLButtonElement);
          buttons[
            (i + (ev.key === "ArrowDown" ? 1 : -1) + buttons.length) %
              buttons.length
          ]?.focus();
        }
      }}
    >
      <small>{field ? "텍스트 입력" : "DRAWING · 빠른 작업"}</small>
      {field ? (
        <>
          {item("입력 복사", () => void asyncRun(() => fieldCopy()))}
          {item(
            "입력 잘라내기",
            () => void asyncRun(() => fieldCopy(true)),
            field.readOnly,
          )}
          {item(
            "입력 붙여넣기",
            () =>
              void asyncRun(async () =>
                fieldWrite(
                  window.desktop
                    ? await window.desktop.clipboardRead()
                    : await navigator.clipboard.readText(),
                ),
              ),
            field.readOnly,
          )}
          {item("입력 전체 선택", () => {
            field.focus();
            try {
              field.select();
            } catch {}
          })}
        </>
      ) : (
        <>
          {item("실행 취소", () => run(() => editor.undo()))}
          {item("다시 실행", () => run(() => editor.redo()))}
          <hr />
          {item("복사", () => void asyncRun(() => copy()), !selected)}
          {item("잘라내기", () => void asyncRun(() => copy(true)), !selected)}
          {item("붙여넣기", () => void asyncRun(paste))}
          {item("복제", () => run(() => editor.duplicate()), !selected)}
          {item("삭제", () => run(() => editor.deleteSelection()), !selected)}
          <hr />
          {item(
            "그룹",
            () => run(() => editor.group()),
            editor.selected.length < 2,
          )}
          {item("그룹 해제", () => run(() => editor.ungroup()), !selected)}
          {item(
            "맨 앞으로",
            () => run(() => editor.reorder("front")),
            !selected,
          )}
          {item("맨 뒤로", () => run(() => editor.reorder("back")), !selected)}
          <hr />
          {item(
            "심볼 원본으로 등록",
            () => run(() => registerComponent(editor, "symbol", "")),
            editor.selected.length !== 1,
          )}
          {item(
            "국문 로고타입으로 등록",
            () => run(() => registerComponent(editor, "logotype-ko", "")),
            editor.selected.length !== 1,
          )}
          {item(
            "영문 로고타입으로 등록",
            () => run(() => registerComponent(editor, "logotype-en", "")),
            editor.selected.length !== 1,
          )}
          {item(
            "컴포넌트 연결 해제",
            () => run(() => detachComponent(editor)),
            !selected,
          )}
          {item("Retypo · 글리프 / 텍스트 복원", retypo)}
          <hr />
          {item("전체 선택", () => editor.selectAll())}
          {item("캔버스에 맞추기", fit)}
        </>
      )}
    </div>
  );
}
