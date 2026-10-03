# Drawing 1.0.0 verification

Date: 2026-10-04 (Asia/Seoul). Platform: Windows x64.

## Automated checks

`npm test` completed successfully: TypeScript check, Vite production build and
**21 Playwright tests passed**. Tests use real Chromium and Electron.

| Requirement | Evidence |
| --- | --- |
| SVG-native document and export | Import/sanitize/roundtrip tests; desktop real-file save and reopen; exported SVG excludes overlays |
| Pathfinder union/subtract/intersection/XOR | Independent rectangle area expectations 15000/5000/5000/10000, nested transforms, holes, curves and empty intersection |
| Safe transparent selection/deletion | Defaults, none paints, alpha zero, ancestor opacity, stroke-only paths, hidden layers and referenced definitions; UI deletion and undo |
| Alt duplication and references | Real pointer Alt-drag, undo/redo, unique IDs, internal references and quoted gradient URLs |
| Drawing and path editing | Rectangle, ellipse, line, text, cubic pen and anchor movement; resize handles and numeric styles |
| Common editing | Group/ungroup, preserved coordinates, alignment/distribution, native clipboard, undo/redo and draft cancellation |
| Layer editing | Actual Electron in-app rename dialog; sample group selected through layer panel |
| Desktop files | Real IPC, file writes, file reopen, new-document save-path reset; only path selection in native dialog is controlled |
| Windows EXE | electron-builder portable x64 build; actual packaged application and portable wrapper launched and edited |

## Packaged application checks

`node scripts/verify-package.mjs` passed on `release/win-unpacked/Drawing.exe`:
window display, sample SVG import, layer rename, native clipboard, undo, shape
editing and actual SVG saving. No renderer errors were recorded. The rendered
sample is captured in `docs/preview.png`.

`node scripts/verify-portable.mjs` passed on the actual distribution file
`release/Drawing-1.0.0-win-x64.exe`: window display, rectangle drawing, Alt-drag
duplication and undo. Product metadata reports **Drawing 1.0.0**.

Distribution bytes: **142772835**.

SHA-256:

```text
29d74d57f35603df06d70f1849bf6f2e6bb0e98dd659f1bcc1f5e079a35dd747
```

## External check limitation

GitHub Actions did not start a runner. GitHub reports:
“The job was not started because your account is locked due to a billing issue.”
This is distinct from the passing local checks. The workflow remains available
for use when the account restriction is resolved.

The portable executable is unsigned. Supported functionality and unsupported
professional Illustrator features are documented in README.
