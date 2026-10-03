import { SvgEditor, svgElement } from "./editor";
export async function fileData(file: File): Promise<string> {
  if (file.size > 20 * 1024 * 1024)
    throw new Error("리소스는 20MB 이하만 포함할 수 있습니다.");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("파일을 읽을 수 없습니다."));
    reader.readAsDataURL(file);
  });
}
export async function embedImage(e: SvgEditor, file: File) {
  if (
    !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type)
  )
    throw new Error("PNG, JPEG, GIF, WebP 이미지를 선택하세요.");
  const data = await fileData(file),
    image = new Image();
  image.src = data;
  await image.decode();
  const scale = Math.min(
    1,
    (e.size.width - 64) / image.naturalWidth,
    (e.size.height - 64) / image.naturalHeight,
  );
  e.command("이미지 포함", () => {
    const id = e.freshId();
    e.project.assets.push({ id, name: file.name, mime: file.type, data });
    e.svg.append(
      svgElement("image", {
        id,
        href: data,
        x: 32,
        y: 32,
        width: image.naturalWidth * scale,
        height: image.naturalHeight * scale,
        "data-name": file.name,
        "data-asset": id,
      }),
    );
    e.ids = [id];
  });
}
