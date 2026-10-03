# Drawing 1.2.0 verification

Date: 2026-10-04 (Asia/Seoul). Platform: Windows x64.

## Automated checks

`npm test` completed successfully: TypeScript check, Vite production build and
**37 Playwright tests passed**. Tests use real Chromium and Electron.

| Requirement | Evidence |
| --- | --- |
| SVG-native document and export | Import/sanitize/roundtrip tests; desktop real-file save and reopen; exported SVG excludes overlays |
| Pathfinder union/subtract/intersection/XOR | Independent rectangle area expectations 15000/5000/5000/10000, nested transforms, holes, curves and empty intersection |
| Safe transparent selection/deletion | Defaults, none paints, alpha zero, ancestor opacity, stroke-only paths, hidden layers and referenced definitions; UI deletion and undo |
| Alt duplication and references | Real pointer Alt-drag, undo/redo, unique IDs, internal references and quoted gradient URLs |
| Drawing and path editing | Rectangle, ellipse, line, text, cubic pen, anchor/handle movement, node insertion/deletion and path closure; resize handles and numeric styles |
| Common editing | Group/ungroup, preserved coordinates, alignment/distribution, native clipboard, undo/redo and draft cancellation |
| Layer editing | Actual Electron in-app rename dialog; sample group selected through layer panel |
| Desktop files | Real IPC, file writes, file reopen, new-document save-path reset; only path selection in native dialog is controlled |
| Bundled welcome example | Startup artwork, restore original after edits, cancel unsaved discard, blank new documents and example save-path reset |
| Open project format | SVG/resources/workspace/extensions roundtrip, invalid version atomic rejection, real Electron project save/reopen |
| Rich appearance | Four editable gradient types, stop selection, canvas-handle dragging and undo, stroke cap/dash attributes |
| Embedded images/fonts | Real PNG file input and saved manifest; full vs HarfBuzz subset TTF size, CSS font registration and load after project reopening |
| Keyframe motion | Native exported SVG animation at expected position, nested transforms, easing/step interpolation, tracks/undo, UI scrub/play/export and untouched source |
| Example library | All six documents opened; bundled motion example scrubs and plays |
| Identity systems | 36-way matrix, master resize propagation, undo/redo, independent detach and preserved colors, linked copies, unique IDs, project/mode roundtrip, 42 delivered SVGs and real native ZIP save |
| Retypo | Actual Arial outline match at 100% similarity; multipart Hangul recognition for 가나한빛, logotype master preservation and native glyph dimensions, editable SVG text with embedded full font; font file input and restricted system-font IPC |
| Context menus | Header, layers, selection duplication, text-field selection; actual packaged context menu opens Retypo |
| Windows EXE | electron-builder portable x64 build; actual packaged application and portable wrapper launched and edited |

## Packaged application checks

`node scripts/verify-package.mjs` passed on `release/win-unpacked/Drawing.exe`:
window display, sample SVG import, layer rename, native clipboard, undo, shape
editing, actual Drawing project saving, node insertion/deletion and path closure, plus actual packaged HarfBuzz WASM font
subsetting and project saving. No renderer errors were recorded. The same packaged app also passed 42 identity variants, native system-font reporting, Retypo matching/conversion and editing the recovered text. The rendered
sample is captured in `docs/preview.png`.

`node scripts/verify-portable.mjs` passed on the actual distribution file
`release/Drawing-1.2.0-win-x64.exe`: bundled startup artwork, blank new document, rectangle drawing, Alt-drag
duplication, undo, example gallery, motion scrub and playback. The portable EXE also passed 42 identity variants, native font reporting, 100% Arial outline matching, text recovery and re-editing, and context-menu operation. No renderer errors occurred. Screenshots are in `docs/identity.png` and `docs/retypo.png`. Product metadata reports **Drawing 1.2.0**.

Distribution bytes: **143180152**.

SHA-256:

```text
846e27590fc4fde61f3c9e032d0174b77a13942f714d7e6b6f25297d34737038
```

## External check limitation

GitHub Actions did not start a runner. GitHub reports:
“The job was not started because your account is locked due to a billing issue.”
This was the external account state observed during earlier 1.0 verification.
This is distinct from the passing local checks. The workflow remains available
for use when the account restriction is resolved.

The portable executable is unsigned. Supported functionality and unsupported
professional Illustrator features are documented in README.
