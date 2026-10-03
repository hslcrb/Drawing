import type { SvgEditor } from "./editor";
import { svgElement, matrixString } from "./editor";
import {
  defaultIdentity,
  type BrandComponent,
  type BrandVariant,
  type ComponentRole,
  type IdentitySystem,
} from "./identity-types";

export function identity(e: SvgEditor): IdentitySystem {
  return e.project.identity || defaultIdentity();
}
function ensure(e: SvgEditor) {
  return (e.project.identity ||= defaultIdentity());
}
function defs(e: SvgEditor) {
  let d = e.svg.querySelector(":scope > defs");
  if (!d) {
    d = svgElement("defs");
    e.svg.prepend(d);
  }
  return d;
}
export function registerComponent(
  e: SvgEditor,
  role: ComponentRole,
  name: string,
) {
  if (e.selected.length !== 1)
    throw new Error(
      "하나의 객체 또는 그룹을 선택하세요. 여러 객체는 먼저 그룹으로 묶으세요.",
    );
  const source = e.selected[0];
  if (source.closest("[data-brand-variant]") || source.localName === "use")
    throw new Error(
      "연결된 조합을 원본으로 등록하려면 먼저 연결을 해제하세요.",
    );
  e.command("상징 컴포넌트 등록", () => {
    const b = ensure(e),
      box = e.bounds(source),
      id = e.freshId();
    const c: BrandComponent = {
      id,
      name: name || source.getAttribute("data-name") || role,
      role,
      sourceId: source.id,
      width: Math.max(1, box.width),
      height: Math.max(1, box.height),
    };
    source.setAttribute("data-brand-master", id);
    b.components.unshift(c);
  });
}
function syncComponent(e: SvgEditor, c: BrandComponent) {
  const source = e.svg.querySelector<SVGGraphicsElement>(
    `[id="${CSS.escape(c.sourceId)}"]`,
  );
  if (!source || source.closest("defs")) return;
  const box = e.bounds(source),
    matrix = e.globalMatrix(source);
  const fingerprint =
    new XMLSerializer().serializeToString(source) +
    matrixString(matrix) +
    JSON.stringify(box);
  const d = defs(e);
  let symbol = d.querySelector<SVGSymbolElement>(
    `:scope > [id="${CSS.escape(c.id)}"]`,
  );
  if (symbol?.getAttribute("data-source-fingerprint") === fingerprint) return;
  c.width = Math.max(1, box.width);
  c.height = Math.max(1, box.height);
  if (!symbol) {
    symbol = svgElement<SVGSymbolElement>("symbol", { id: c.id });
    d.append(symbol);
  }
  symbol.setAttribute("viewBox", `0 0 ${c.width} ${c.height}`);
  symbol.setAttribute("data-source-fingerprint", fingerprint);
  const clone = e.cloneNodes([source])[0];
  clone.removeAttribute("transform");
  clone.removeAttribute("data-brand-master");
  const computed = getComputedStyle(source);
  for (const property of [
    "fill",
    "stroke",
    "stroke-width",
    "fill-opacity",
    "stroke-opacity",
    "fill-rule",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-dasharray",
    "font-family",
    "font-size",
    "font-weight",
    "text-anchor",
    "color",
  ])
    clone.setAttribute(property, computed.getPropertyValue(property));
  const group = svgElement("g", {
    transform: `translate(${-box.x} ${-box.y}) ${matrixString(matrix)}`,
  });
  group.append(clone);
  symbol.replaceChildren(group);
}
function placeUse(
  parent: Element,
  c: BrandComponent,
  x: number,
  y: number,
  scale: number,
  tint: string | null,
) {
  parent.append(
    svgElement("use", {
      href: `#${c.id}`,
      x,
      y,
      width: c.width * scale,
      height: c.height * scale,
      "data-brand-component": c.id,
      ...(tint ? { filter: `url(#${tint})` } : {}),
    }),
  );
}
function syncVariant(e: SvgEditor, v: BrandVariant, b: IdentitySystem) {
  if (!v.linked) return;
  const group = e.svg.querySelector<SVGGElement>(`[id="${CSS.escape(v.id)}"]`);
  if (!group) return;
  const symbol = b.components.find((c) => c.id === v.symbolId),
    ko = b.components.find((c) => c.id === v.koId),
    en = b.components.find((c) => c.id === v.enId);
  const logs =
    v.language === "ko" ? [ko] : v.language === "en" ? [en] : [ko, en];
  const components = logs.filter(Boolean) as BrandComponent[];
  const stamp = JSON.stringify({
    v: { ...v, width: 0, height: 0 },
    components: [symbol, ...components],
    palette: b.palette,
    gap: b.gap,
    clear: b.clearSpace,
    guides: b.showGuides,
  });
  if (group.getAttribute("data-brand-stamp") === stamp) return;
  const W = v.width,
    H = v.height,
    pad = b.clearSpace,
    areaW = Math.max(1, W - pad * 2),
    areaH = Math.max(1, H - pad * 2 - 25);
  const ink =
    v.tone === "primary"
      ? b.palette.primary
      : v.tone === "secondary"
        ? b.palette.secondary
        : v.tone === "mono"
          ? b.palette.mono
          : b.palette.reverse;
  const fid = `brand-ink-${v.tone}`;
  const tint = v.tone === "primary" ? null : fid;
  let filter = defs(e).querySelector(`[id="${fid}"]`);
  if (!filter) {
    filter = svgElement("filter", {
      id: fid,
      x: "-10%",
      y: "-10%",
      width: "120%",
      height: "120%",
      "color-interpolation-filters": "sRGB",
    });
    defs(e).append(filter);
  }
  filter.replaceChildren(
    svgElement("feFlood", { "flood-color": ink, result: "ink" }),
    svgElement("feComposite", {
      in: "ink",
      in2: "SourceAlpha",
      operator: "in",
    }),
  );
  const children: SVGElement[] = [];
  const holder = svgElement("g");
  if (v.layout === "symbol") {
    if (symbol) {
      const s = Math.min(areaW / symbol.width, areaH / symbol.height, 0.9);
      placeUse(
        holder,
        symbol,
        (W - symbol.width * s) / 2,
        (H - symbol.height * s) / 2,
        s,
        tint,
      );
    }
  } else {
    const logH =
      components.reduce((n, c) => n + c.height, 0) +
      (components.length - 1) * 12;
    const logW = Math.max(1, ...components.map((c) => c.width));
    const useSymbol = v.layout !== "logotype" && symbol;
    const nativeW =
      v.layout === "horizontal" && useSymbol
        ? symbol.width + b.gap + logW
        : Math.max(logW, useSymbol ? symbol.width : 0);
    const nativeH =
      v.layout === "vertical" && useSymbol
        ? symbol.height + b.gap + logH
        : Math.max(logH, useSymbol ? symbol.height : 0);
    const scale = Math.min(
      areaW / Math.max(1, nativeW),
      areaH / Math.max(1, nativeH),
      2,
    );
    const ox = (W - nativeW * scale) / 2,
      oy = (H - 25 - nativeH * scale) / 2;
    if (useSymbol)
      placeUse(
        holder,
        symbol,
        v.layout === "vertical"
          ? ox + ((nativeW - symbol.width) * scale) / 2
          : ox,
        v.layout === "horizontal"
          ? oy + ((nativeH - symbol.height) * scale) / 2
          : oy,
        scale,
        tint,
      );
    let ly =
      oy +
      (v.layout === "vertical" && useSymbol
        ? (symbol.height + b.gap) * scale
        : ((nativeH - logH) * scale) / 2);
    for (const c of components) {
      const lx =
        v.layout === "horizontal" && useSymbol
          ? ox + (symbol.width + b.gap) * scale
          : ox + ((nativeW - c.width) * scale) / 2;
      placeUse(holder, c, lx, ly, scale, tint);
      ly += (c.height + 12) * scale;
    }
  }
  children.push(
    svgElement("rect", {
      width: W,
      height: H,
      fill: v.tone === "reverse" ? b.palette.primary : "#ffffff",
      "data-brand-background": "true",
    }),
    holder,
  );
  if (b.showGuides)
    children.push(
      svgElement("rect", {
        x: pad,
        y: pad,
        width: areaW,
        height: areaH,
        fill: "none",
        stroke: v.tone === "reverse" ? "#ffffff88" : "#958bb788",
        "stroke-width": 1,
        "stroke-dasharray": "5 4",
        "data-brand-guide": "true",
      }),
    );
  const label = svgElement("text", {
    x: 12,
    y: H - 9,
    fill: v.tone === "reverse" ? "#ffffff" : "#6b637a",
    "font-family": "Arial, Malgun Gothic",
    "font-size": 11,
    "data-brand-guide": "true",
  });
  label.textContent = v.name;
  children.push(label);
  group.replaceChildren(...children);
  group.setAttribute("data-brand-stamp", stamp);
  group.setAttribute("data-brand-config", JSON.stringify(v));
}
export function syncIdentity(e: SvgEditor) {
  const b = e.project.identity;
  if (!b) return;
  for (const g of e.svg.querySelectorAll<SVGGElement>(
    "g[data-brand-variant][data-brand-config]",
  ))
    if (!b.variants.some((v) => v.id === g.id)) {
      try {
        const v = JSON.parse(
          g.getAttribute("data-brand-config")!,
        ) as BrandVariant;
        const original = b.variants.find((old) => old.id === v.id);
        if (original)
          b.variants.push({
            ...original,
            id: g.id,
            name: `${original.name} 복제`,
          });
      } catch {}
    }
  for (const c of b.components) syncComponent(e, c);
  b.variants = b.variants.filter(
    (v) => !!e.svg.querySelector(`[id="${CSS.escape(v.id)}"]`),
  );
  for (const v of b.variants) syncVariant(e, v, b);
}
export function updateIdentity(
  e: SvgEditor,
  action: (b: IdentitySystem) => void,
) {
  e.command("상징체계 설정", () => {
    const b = ensure(e);
    action(b);
    for (const c of b.components) {
      const source = e.svg.querySelector(`[id="${CSS.escape(c.sourceId)}"]`);
      if (source?.getAttribute("data-brand-auto"))
        source.textContent = c.role === "logotype-ko" ? b.ko : b.en;
    }
  });
}
export function defaultLogotypes(e: SvgEditor) {
  e.command("국문·영문 로고타입 준비", () => {
    const b = ensure(e);
    for (const [role, value, y] of [
      ["logotype-ko", b.ko, 70],
      ["logotype-en", b.en, 140],
    ] as const) {
      if (b.components.some((c) => c.role === role)) continue;
      const id = e.freshId(),
        source = svgElement<SVGTextElement>("text", {
          id,
          x: 40,
          y,
          "font-family": "Arial, Malgun Gothic",
          "font-size": role === "logotype-ko" ? 42 : 28,
          "font-weight": 700,
          fill: b.palette.primary,
          "data-brand-auto": "true",
          "data-name":
            role === "logotype-ko"
              ? "국문 로고타입 원본"
              : "영문 로고타입 원본",
        });
      source.textContent = value;
      e.svg.append(source);
      const box = e.bounds(source),
        cid = e.freshId();
      source.setAttribute("data-brand-master", cid);
      b.components.push({
        id: cid,
        name: source.getAttribute("data-name")!,
        role,
        sourceId: id,
        width: Math.max(1, box.width),
        height: Math.max(1, box.height),
      });
    }
  });
}
export type MatrixOptions = {
  languages: BrandVariant["language"][];
  layouts: BrandVariant["layout"][];
  tones: BrandVariant["tone"][];
  width: number;
  height: number;
  columns: number;
};
export function generateVariants(e: SvgEditor, o: MatrixOptions) {
  const b = identity(e);
  const symbol = b.components.find((c) => c.role === "symbol"),
    ko = b.components.find((c) => c.role === "logotype-ko"),
    en = b.components.find((c) => c.role === "logotype-en");
  if (
    !o.languages.length ||
    !o.layouts.length ||
    !o.tones.length ||
    ![o.width, o.height, o.columns].every(Number.isFinite) ||
    o.width < 100 ||
    o.width > 3000 ||
    o.height < 100 ||
    o.height > 3000 ||
    o.columns < 1 ||
    o.columns > 12
  )
    throw new Error("생성할 조합과 크기를 확인하세요.");
  if (
    o.layouts.some(
      (x) => x === "horizontal" || x === "vertical" || x === "symbol",
    ) &&
    !symbol
  )
    throw new Error("먼저 심볼 원본을 등록하세요.");
  if (
    o.layouts.some((x) => x !== "symbol") &&
    ((o.languages.some((x) => x !== "en") && !ko) ||
      (o.languages.some((x) => x !== "ko") && !en))
  )
    throw new Error("국문·영문 로고타입을 등록하거나 자동 준비하세요.");
  const count = o.languages.length * o.layouts.length * o.tones.length;
  if (b.variants.length + count > 500)
    throw new Error("조합은 한 프로젝트에서 500개까지 생성할 수 있습니다.");
  e.command(`${count}개 상징 조합 생성`, () => {
    const brand = ensure(e);
    let index = 0;
    const gap = 32,
      startY = e.size.height + 40,
      created: string[] = [];
    for (const language of o.languages)
      for (const layout of o.layouts)
        for (const tone of o.tones) {
          const id = e.freshId(),
            name = `${brand.name} / ${language} / ${layout} / ${tone}`;
          const g = svgElement("g", {
            id,
            "data-name": name,
            "data-brand-variant": "true",
            transform: `translate(${24 + (index % o.columns) * (o.width + gap)} ${startY + Math.floor(index / o.columns) * (o.height + gap)})`,
          });
          e.svg.append(g);
          brand.variants.push({
            id,
            name,
            language,
            layout,
            tone,
            symbolId: symbol?.id || "",
            koId: ko?.id || "",
            enId: en?.id || "",
            width: o.width,
            height: o.height,
            linked: true,
          });
          created.push(id);
          index++;
        }
    const width = Math.max(e.size.width, o.columns * (o.width + gap) + 24),
      height = startY + Math.ceil(count / o.columns) * (o.height + gap) + 24;
    e.svg.setAttribute("width", String(width));
    e.svg.setAttribute("height", String(height));
    e.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    e.ids = created.slice(0, 1);
  });
}
export function insertComponent(e: SvgEditor, id: string) {
  const c = identity(e).components.find((c) => c.id === id);
  if (!c) throw new Error("컴포넌트가 없습니다.");
  e.command("컴포넌트 인스턴스", () => {
    const uid = e.freshId();
    e.svg.append(
      svgElement("use", {
        id: uid,
        href: `#${id}`,
        x: 40,
        y: 200,
        width: c.width,
        height: c.height,
        "data-name": `${c.name} 인스턴스`,
        "data-brand-component": id,
      }),
    );
    e.ids = [uid];
  });
}
export function detachComponent(e: SvgEditor) {
  e.command("컴포넌트 연결 해제", () => {
    const b = identity(e);
    for (const selected of e.selected) {
      const uses =
        selected.localName === "use"
          ? [selected]
          : [
              ...selected.querySelectorAll<SVGGraphicsElement>(
                "use[data-brand-component]",
              ),
            ];
      for (const use of uses) {
        const id = use.getAttribute("data-brand-component")!,
          c = b.components.find((c) => c.id === id),
          symbol = e.svg.querySelector(`[id="${CSS.escape(id)}"]`);
        if (!c || !symbol) continue;
        const width = Number(use.getAttribute("width")) || c.width,
          height = Number(use.getAttribute("height")) || c.height,
          scale = Math.min(width / c.width, height / c.height);
        const group = svgElement<SVGGElement>("g");
        for (const attr of [...use.attributes])
          if (
            ![
              "href",
              "x",
              "y",
              "width",
              "height",
              "data-brand-component",
            ].includes(attr.name)
          )
            group.setAttribute(attr.name, attr.value);
        group.setAttribute(
          "transform",
          `${use.getAttribute("transform") || ""} translate(${Number(use.getAttribute("x")) || 0} ${Number(use.getAttribute("y")) || 0}) scale(${scale})`,
        );
        const filterRef = use
          .getAttribute("filter")
          ?.match(/^url\(#([^)]*)\)$/);
        if (filterRef) {
          const filter = e.svg.querySelector(
            `[id="${CSS.escape(filterRef[1])}"]`,
          );
          if (filter) {
            const cloned = filter.cloneNode(true) as Element;
            cloned.id = e.freshId();
            defs(e).append(cloned);
            group.setAttribute("filter", `url(#${cloned.id})`);
          }
        }
        group.append(
          ...e.cloneNodes([...symbol.children] as SVGGraphicsElement[]),
        );
        use.replaceWith(group);
      }
      const v = b.variants.find((v) => v.id === selected.id);
      if (v) v.linked = false;
      selected.removeAttribute("data-brand-variant");
    }
  });
}
export function editComponent(e: SvgEditor, id: string) {
  const c = identity(e).components.find((c) => c.id === id);
  if (!c) return;
  if (e.svg.querySelector(`[id="${CSS.escape(c.sourceId)}"]`)) {
    e.select([c.sourceId]);
    return;
  }
  e.command("컴포넌트 원본 복구", () => {
    const symbol = e.svg.querySelector(`[id="${CSS.escape(id)}"]`);
    if (!symbol) throw new Error("컴포넌트 정의가 없습니다.");
    const source = svgElement<SVGGElement>("g", {
      id: e.freshId(),
      transform: "translate(32 32)",
      "data-name": c.name,
      "data-brand-master": c.id,
    });
    source.append(
      ...e.cloneNodes([...symbol.children] as SVGGraphicsElement[]),
    );
    e.svg.append(source);
    c.sourceId = source.id;
    e.ids = [source.id];
  });
}
export function variantSvg(e: SvgEditor, v: BrandVariant) {
  const root = svgElement<SVGSVGElement>("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: v.width,
    height: v.height,
    viewBox: `0 0 ${v.width} ${v.height}`,
  });
  const d = e.svg.querySelector(":scope > defs");
  if (d) root.append(d.cloneNode(true));
  const g = e.svg
    .querySelector(`[id="${CSS.escape(v.id)}"]`)
    ?.cloneNode(true) as SVGElement;
  if (!g) throw new Error("조합을 찾을 수 없습니다.");
  g.removeAttribute("transform");
  g.querySelectorAll("[data-brand-guide]").forEach((x) => x.remove());
  root.append(g);
  return new XMLSerializer().serializeToString(root);
}
export async function identityArchive(e: SvgEditor) {
  const { zipSync, strToU8 } = await import("fflate"),
    b = identity(e);
  const files: Record<string, Uint8Array> = {};
  for (const v of b.variants)
    files[`${v.language}/${v.layout}/${v.tone}-${v.id}.svg`] = strToU8(
      variantSvg(e, v),
    );
  files["identity-manifest.json"] = strToU8(JSON.stringify(b, null, 2));
  files["README.txt"] = strToU8(
    `${b.name}\n${b.ko}\n${b.en}\n\nClear space: ${b.clearSpace}px\nMinimum width: ${b.minWidth}px\nGap: ${b.gap}px\n\nAll assets are SVG. Font licensing remains with the font owner.\n`,
  );
  return zipSync(files, { level: 6 });
}
