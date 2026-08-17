# DevCollab frontend design system — "merge"

The UI is a warm terminal-dark system built around DevCollab's differentiator:
**evidence** — merged PRs, contributed repos, reviews, stars/forks — real
engineering data, presented as data. The visual language borrows from the
developer's own surface: terminals, merge commits, and git readouts.

## Palette

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#0b0f0e` | warm black page background |
| `--bg-soft` | `#0e1311` | elevated background (shells, strips) |
| `--surface` | `#121816` | cards, panels |
| `--surface-2` | `#1b231f` | inputs, hover fills |
| `--surface-3` | `#243027` | tags, chips |
| `--line` | `#2e3b34` | hairlines / borders |
| `--ink` | `#e8f0ea` | primary text |
| `--ink-soft` | `#a9bcaf` | secondary text |
| `--ink-muted` | `#77897d` | captions, metadata |
| `--merge` | `#4ade80` | signature accent — "shipped/merged" green |
| `--merge-deep` | `#16a34a` | pressed/active states |
| `--rebase` | `#a78bfa` | secondary violet |
| `--amber` / `--danger` | `#fbbf24` / `#fb7185` | status colors |

Deliberate departure from the previous violet-on-navy scheme: the neutrals are
warm/green-tinted rather than blue-black, and the single accent is merge green,
the color developers already read as *code that shipped*.

## Typography

- **IBM Plex Mono** — display of *data*: eyebrows, labels, readouts, badges,
  timestamps, stat values, section markers. Carries the terminal personality.
- **Newsreader** — serif display for page titles and the hero headline.
  Editorial contrast that keeps the design from reading as "another dark
  dashboard".
- **Inter** — body and UI copy.

Fluid type scale via `--step-*` custom properties (`clamp()`); base size
`--step-0` ≈ 16px. Scale is defined once in `index.css` and consumed through
`text-[length:var(--step-N)]` so every heading derives from the same system.

## Signature element

**Mono evidence readouts** (`StatStrip` / `.readout`): uppercase terminal lines
such as `STARS 12 · FORKS 3 · REVIEWS 7` or `PROJECTS SHARED · REVIEWS POSTED`.
Real data, typeset like a git status line, appears on project cards, project
details, and the hero. This is the one memorable element; everything else stays
quiet.

## Layout

- Signed-in shell: compact top bar (brand + search + account) and a
  **persistent desktop sidebar rail** (`lg:` breakpoint); mobile gets the
  existing slide-in drawer. One nav list, two presentations.
- Every page uses `PageShell` (mono eyebrow + serif display title + optional
  actions) → identical header rhythm across the app.
- `SectionHeader` (mono uppercase + hairline rule + count chip) for list
  sections. `StatStrip` for evidence rows. `Avatar` for consistent initial
  tiles.
- `Surface` cards replace the old gradient-shadowed cards; hover is a hairline
  green border + slight lift, no glow.

## Motion & a11y

- Sparse: page fade-in, toast/scale-in, a blinking cursor only where a cursor
  belongs. `prefers-reduced-motion` disables all animation globally.
- Visible keyboard focus ring in merge green; focus-visible only.
- Responsive down to 360px: single-column grids, wrapping readouts, scrollable
  admin tables, fluid type.

## Design tokens

All colors/type live in `tailwind.config.js` (utility classes: `bg-surface`,
`text-ink-muted`, `border-line`, `text-merge`, `font-mono`, `font-display`)
and as CSS custom properties in `index.css` (`@layer base`). Component classes
(`.surface`, `.field`, `.badge`, `.nav-link`, `.eyebrow`, `.display`,
`.readout`) are defined in `@layer components`.
