import welcome from "../samples/welcome.svg?raw";
import gradients from "../samples/gradients.svg?raw";
import strokes from "../samples/strokes.svg?raw";
import typography from "../samples/typography.svg?raw";
import motion from "../samples/motion.svg?raw";
import brand from "../samples/identity.svg?raw";
import { SvgEditor } from "./core/editor";
import {
  registerComponent,
  updateIdentity,
  generateVariants,
} from "./core/identity";
import { emptyProject, defaultView, identityKey } from "./core/project";
export const examples = [
  {
    id: "identity",
    name: "One identity. Every application.",
    description: "상징체계 · 연결 컴포넌트 · 국문/영문 조합",
    svg: brand,
    color: "#c6d8c9",
  },
  {
    id: "welcome",
    name: "Make something",
    description: "곡선 · 그룹 · 패스파인더",
    svg: welcome,
    color: "#d9c7f2",
  },
  {
    id: "gradients",
    name: "Color beyond boundaries",
    description: "선형 · 방사형 · 자유형 점과 선",
    svg: gradients,
    color: "#e7adbb",
  },
  {
    id: "strokes",
    name: "Every line has character",
    description: "선 두께 · 대시 · 끝 모양",
    svg: strokes,
    color: "#b7c9af",
  },
  {
    id: "typography",
    name: "Type tells a story",
    description: "SVG 텍스트 · 내장 글꼴",
    svg: typography,
    color: "#ffba8b",
  },
  {
    id: "motion",
    name: "Set ideas in motion",
    description: "키프레임 · 회전 · 이동",
    svg: motion,
    color: "#a58aff",
  },
];
export function exampleContent(id: string) {
  const example = examples.find((ex) => ex.id === id);
  if (!example) throw new Error("예제가 없습니다.");
  if (id === "identity") {
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:-20000px;top:0";
    document.body.append(host);
    const e = new SvgEditor(host);
    try {
      e.load(brand);
      updateIdentity(e, (b) => {
        b.name = "한빛문화진흥원";
        b.ko = "한빛문화진흥원";
        b.en = "HANBIT CULTURAL FOUNDATION";
      });
      for (const [source, role] of [
        ["identity-symbol", "symbol"],
        ["identity-ko", "logotype-ko"],
        ["identity-en", "logotype-en"],
      ] as const) {
        e.select([source]);
        registerComponent(e, role, "");
      }
      generateVariants(e, {
        languages: ["ko", "en", "bilingual"],
        layouts: ["horizontal"],
        tones: ["primary", "reverse"],
        width: 500,
        height: 270,
        columns: 2,
      });
      return e.serializeProject({
        ...defaultView(),
        mode: "identity",
        selection: ["identity-symbol"],
      });
    } finally {
      host.remove();
      e.scope.project.remove();
    }
  }
  const resources = emptyProject(),
    workspace = defaultView();
  if (id === "motion") {
    resources.motion.duration = 4;
    workspace.mode = "motion";
    workspace.selection = ["motion-star"];
    resources.motion.tracks = [
      {
        id: "motion-star",
        keys: [
          identityKey(),
          {
            ...identityKey(2),
            rotation: 180,
            scale: 0.65,
            easing: "ease-in-out",
          },
          { ...identityKey(4), rotation: 360 },
        ],
      },
      {
        id: "motion-ball",
        keys: [
          identityKey(),
          { ...identityKey(1), x: 245, y: -120, easing: "ease-in-out" },
          { ...identityKey(2), x: 490 },
          { ...identityKey(3), x: 245, y: 120, easing: "ease-in-out" },
          identityKey(4),
        ],
      },
    ];
  }
  return JSON.stringify({
    format: "Drawing",
    version: 1,
    svg: example.svg,
    resources,
    workspace,
    extensions: {},
  });
}
