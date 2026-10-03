import wasmUrl from "hb-subset-wasm/hb-subset.wasm?url&inline";
import { init, subset } from "hb-subset-wasm";
import { SvgEditor, svgElement } from "./editor";
import type { EmbeddedFont } from "./project";
let ready: Promise<void> | null = null;
function base64(bytes: Uint8Array) {
  let data = "";
  for (let i = 0; i < bytes.length; i += 8192)
    data += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(data);
}
export async function makeEmbeddedFont(
  file: File,
  mode: "full" | "subset",
  text: string,
  id: string,
): Promise<EmbeddedFont> {
  if (file.size > 20 * 1024 * 1024 || !/\.(ttf|otf)$/i.test(file.name))
    throw new Error("20MB 이하 TTF 또는 OTF 파일을 선택하세요.");
  const original = new Uint8Array(await file.arrayBuffer());
  const characters = [...new Set([...text])].join("");
  let bytes: Uint8Array = original;
  if (mode === "subset") {
    if (!characters.trim())
      throw new Error("먼저 텍스트를 추가하거나 포함할 문자를 입력하세요.");
    if (!ready)
      ready = (async () => {
        const data = wasmUrl.startsWith("data:")
          ? Uint8Array.from(atob(wasmUrl.split(",")[1]), (c) => c.charCodeAt(0))
          : new Uint8Array(await (await fetch(wasmUrl)).arrayBuffer());
        await init(data);
      })();
    await ready;
    bytes = await subset(original, { text: characters, layoutFeatures: "*" });
  }
  const family = `DrawingFont_${id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
  const face = new FontFace(family, bytes.slice().buffer);
  await face.load();
  document.fonts.add(face);
  const mime = bytes[0] === 79 && bytes[1] === 84 ? "otf" : "ttf";
  return {
    id,
    name: file.name,
    family,
    mode,
    data: `data:font/${mime};base64,${base64(bytes)}`,
    characters: mode === "subset" ? characters : "",
    bytes: bytes.length,
  };
}
export function embedFont(e: SvgEditor, font: EmbeddedFont) {
  e.command("글꼴 포함", () => {
    e.project.fonts.push(font);
    let defs = e.svg.querySelector(":scope > defs");
    if (!defs) {
      defs = svgElement("defs");
      e.svg.prepend(defs);
    }
    const style = svgElement("style", { "data-font": font.id });
    style.textContent = `@font-face{font-family:'${font.family}';src:url('${font.data}');font-display:block}`;
    defs.append(style);
    for (const el of e.selected) {
      el.setAttribute("font-family", font.family);
      el.style.fontFamily = font.family;
    }
  });
}
