export type ComponentRole =
  "symbol" | "logotype-ko" | "logotype-en" | "generic";
export type BrandComponent = {
  id: string;
  name: string;
  role: ComponentRole;
  sourceId: string;
  width: number;
  height: number;
};
export type BrandVariant = {
  id: string;
  name: string;
  language: "ko" | "en" | "bilingual";
  layout: "horizontal" | "vertical" | "logotype" | "symbol";
  tone: "primary" | "secondary" | "mono" | "reverse";
  symbolId: string;
  koId: string;
  enId: string;
  width: number;
  height: number;
  linked: boolean;
};
export type IdentitySystem = {
  name: string;
  ko: string;
  en: string;
  components: BrandComponent[];
  variants: BrandVariant[];
  palette: {
    primary: string;
    secondary: string;
    mono: string;
    reverse: string;
  };
  gap: number;
  clearSpace: number;
  minWidth: number;
  showGuides: boolean;
};
export function defaultIdentity(): IdentitySystem {
  return {
    name: "새 상징체계",
    ko: "한국공공기관",
    en: "KOREA PUBLIC AGENCY",
    components: [],
    variants: [],
    palette: {
      primary: "#6550b7",
      secondary: "#42856a",
      mono: "#24212b",
      reverse: "#ffffff",
    },
    gap: 24,
    clearSpace: 24,
    minWidth: 120,
    showGuides: true,
  };
}
export function validIdentity(b: IdentitySystem): boolean {
  if (
    !b ||
    ![b.name, b.ko, b.en].every(
      (v) => typeof v === "string" && v.length <= 1000,
    ) ||
    !Array.isArray(b.components) ||
    !Array.isArray(b.variants) ||
    b.components.length > 500 ||
    b.variants.length > 5000 ||
    !b.palette ||
    ![
      b.palette.primary,
      b.palette.secondary,
      b.palette.mono,
      b.palette.reverse,
    ].every((v) => /^#[a-f0-9]{6}$/i.test(v)) ||
    typeof b.showGuides !== "boolean" ||
    ![b.gap, b.clearSpace, b.minWidth].every(
      (v) => Number.isFinite(v) && v >= 0 && v <= 10000,
    )
  )
    return false;
  const ids = new Set<string>();
  for (const c of b.components) {
    if (
      !c ||
      typeof c.id !== "string" ||
      ids.has(c.id) ||
      typeof c.sourceId !== "string" ||
      typeof c.name !== "string" ||
      !["symbol", "logotype-ko", "logotype-en", "generic"].includes(c.role) ||
      ![c.width, c.height].every((v) => Number.isFinite(v) && v > 0 && v <= 1e6)
    )
      return false;
    ids.add(c.id);
  }
  for (const v of b.variants) {
    if (
      !v ||
      typeof v.id !== "string" ||
      ids.has(v.id) ||
      typeof v.name !== "string" ||
      !["ko", "en", "bilingual"].includes(v.language) ||
      !["horizontal", "vertical", "logotype", "symbol"].includes(v.layout) ||
      !["primary", "secondary", "mono", "reverse"].includes(v.tone) ||
      ![v.symbolId, v.koId, v.enId].every((x) => typeof x === "string") ||
      typeof v.linked !== "boolean" ||
      ![v.width, v.height].every((n) => Number.isFinite(n) && n > 0 && n <= 1e6)
    )
      return false;
    ids.add(v.id);
  }
  return true;
}
