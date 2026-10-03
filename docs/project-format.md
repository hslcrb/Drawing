# Drawing open project format, version 1

`.drawing` is UTF-8 JSON, with no compression, proprietary encoding or required
server. It is published under the repository's MIT license. The public schema is
[drawing.schema.json](drawing.schema.json). Readers must reject unsupported
versions rather than silently dropping data. Unknown application data belongs
under `extensions` and is preserved when opening and saving.

```json
{
  "format": "Drawing",
  "version": 1,
  "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" ...>...</svg>",
  "resources": {
    "assets": [],
    "fonts": [],
    "motion": { "duration": 3, "fps": 30, "loop": true, "tracks": [] }
  },
  "workspace": {
    "zoom": 0.8, "scrollX": 0, "scrollY": 0,
    "mode": "design", "tool": "select", "selection": [], "expanded": [],
    "fill": "#8b75ff", "stroke": "none", "strokeWidth": 2, "time": 0
  },
  "extensions": {}
}
```

The SVG is the editable artwork, including native SVG text, raster `image`
elements with data URLs, stroke properties, definitions and embedded font CSS.
No canvas pixel representation replaces the SVG document. Asset records contain
`id`, `name`, `mime` and `data`; images reference their asset through `data-asset`.
Fonts contain `id`, `name`, a safe internal `family`, `mode`, `data`, `characters`
and byte length. Their base64 TTF/OTF bytes also appear in an SVG `@font-face`
definition, so static SVG exports are self-contained. Project resources preserve
original filenames and embedding metadata.

Subset fonts use HarfBuzz, with layout feature closure retained. `characters`
records the requested Unicode characters; additional dependent glyphs may be
included for shaping. A subset project does not secretly include the original
full font. To add characters outside its coverage after reopening, import the
font again (and include all document text), or choose full embedding. Full fonts
retain their original bytes. Only local font files supplied by the user are
embedded; system fonts are not collected automatically.

Linear and radial paints use standard SVG gradients. Freeform point and line
paints use normalized SVG patterns composed of radial color fields. Line fields
interpolate adjacent color nodes. They are a portable SVG approximation of a
freeform color field, not Illustrator's proprietary mesh representation. A
definition's `data-drawing-paint` JSON preserves type, geometry, colors, opacity,
stop offsets and radii, allowing editing after SVG/project import. Coordinates
are normalized to each painted object's bounding box.

Motion tracks reference SVG element IDs. Each key contains seconds `time`,
parent-coordinate translations `x`/`y`, degrees `rotation`, relative `scale`,
additional `opacity`, and outgoing `easing` (`linear`, `ease-in-out`, `step`).
Rotation/scale use the source object's transformed bounding-box center. Keys are
unique by time and sorted. Before the first key and after the last, the endpoint
value is held. Motion preview clones the SVG without changing the design source.
Deleting a target deletes its track in the same undoable action.

Motion-mode SVG export emits SVG/SMIL animations for translation, rotation,
scale and opacity. Easing is sampled at the selected FPS, capped at 1,800
intervals per track; the exported SVG does not require JavaScript. Design-mode
SVG export emits the static artwork. SVG import strips active animation elements;
use `.drawing` to retain an editable timeline.

Workspace records zoom, viewport scroll, mode, selected tool, selected IDs,
expanded layer groups, default paint settings and timeline playhead. It does not
resume live playback, an open file dialog, or undo history. Viewing and scrolling
do not dirty a document, but their current state is captured on explicit save.
Artwork/resources/timeline changes participate in undo and dirty tracking.

Files are limited to 150 MiB; individual imported resources to 20 MiB. Invalid
JSON, unsupported versions, invalid numeric ranges, duplicate resource/track IDs
and duplicate key times are rejected before replacing the current document.
Opened SVGs are sanitized; scripts, external resource references and foreign
objects are excluded. Saving uses a temporary sibling and atomic rename.
