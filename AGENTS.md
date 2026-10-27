# KOYO Studio project instructions

## Canvas repository workflow

- All `canvas.supdance.com` frontend work belongs to the separate repo `Blacklake-Go/canvas`, checked out at `/Users/seelucency/Documents/dev/canvas-web`.
- Commit and push canvas changes directly to that repo's only remote branch, `koyo-canvas-ui-i18n` (`git push blacklake HEAD:koyo-canvas-ui-i18n`); never create or push additional remote branches.
- After any canvas edit, sync it to `Blacklake-Go/canvas` in the same task instead of leaving local-only commits.
- This repo only supplies the canvas backend under `app/api/canvas/**`; do not duplicate canvas frontend code here.

## UI and visual changes

- Before making any UI or visual change, read and follow both `docs/UI_DESIGN_SYSTEM.md` and `docs/UI_REPAIR_INSTRUCTION.md`. This applies to new pages, components, studio workbenches, and visual fixes.
- `docs/UI_DESIGN_SYSTEM.md` is the master visual contract for brand, color, typography, spacing, radius, surfaces, elevation, motion, and component appearance. Its `app/globals.css` `:root` block remains the token source of truth.
- `docs/UI_REPAIR_INSTRUCTION.md` is mandatory for capsule geometry, layered shadows, pointer-event safety, and click/keyboard behavior. Its narrow "this round" scope and delivery checklist apply when performing the capsule-radius/page-click regression repair described there.
- If these two current documents conflict with older UI guidance, including `docs/UI_SPEC.md`, use these two documents for visual decisions. Keep non-conflicting technical references and historical audit material intact.
