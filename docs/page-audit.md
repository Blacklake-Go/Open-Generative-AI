# Page audit — first snapshot

Date: 2026-09-23. Only public Studio entry and Image Studio chooser were inspected live. Other pages remain unaudited.

| Page | Route | Status | Evidence / issue | Priority |
|---|---|---|---|---|
| Studio entry | `/` -> `/studio` | PARTIAL | Shell rendered; fresh session signed out | P1 verification |
| Image Studio | `/studio/image` | PARTIAL | Visible chooser: 77 T2I / 74 I2I; no generation submitted | P1 verification |
| AI Headshot | `/zh/studio/headshot` | PARTIAL | UI rendered; no upload/generation submitted | P1 verification |
| History / asset library | `/creations`, `/studio/assets` | UNVERIFIED | Persistence, ownership, download untested | P1 |
| Pricing / checkout | `/pricing`, `/coins`, `/subscription` | UNVERIFIED | Plans API reachable; checkout untested | P1 |
| Login / registration | `/login`, `/register` | UNVERIFIED | Signed-out Studio showed Log in; forms/callbacks untested | P1 |
| Admin | `/admin/*` | UNVERIFIED | No admin session used | P1 |
| Community / legal / support | `/community`, `/privacy`, `/terms`, `/refund`, `/content-policy` | UNVERIFIED | Not visited | P2 |

A visible Generate control is not proof of a successful provider result. No model row is PASS without terminal output and debit evidence.
