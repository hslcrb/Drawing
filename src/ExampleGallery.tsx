import React from "react";
import { examples } from "./examples";
export function ExampleGallery({ choose }: { choose: (id: string) => void }) {
  return (
    <div className="example-gallery">
      <h1>아이디어가 시작되는 곳</h1>
      <p>
        모든 예제는 편집 가능한 SVG입니다. 원본은 언제든 다시 열 수 있습니다.
      </p>
      <div className="example-grid">
        {examples.map((ex) => (
          <button
            aria-label={`예제 ${ex.id}`}
            key={ex.id}
            onClick={() => choose(ex.id)}
          >
            <div
              className="example-thumbnail"
              style={{ background: ex.color }}
              dangerouslySetInnerHTML={{ __html: ex.svg }}
            />
            <strong>{ex.name}</strong>
            <span>{ex.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
