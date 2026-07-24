# Sanpo — Design System

A design system for **Sanpo**, a mobile app that turns neighborhood walks into
guided routes — surfacing nearby parks, cafés, libraries, and stations along
the way, and tracking time/distance/steps while you walk.

## Context & sources

This system was built from a single design reference and a written brief —
there was **no attached codebase or Figma file** for this product, so the
component inventory, screen set, and copy below are inferred/authored, not
extracted from an existing source of truth. Treat this as v1: a strong
starting point to refine against real product decisions.

- **Reference image**: `uploads/sanpo-scape.png` (copied into
  `assets/reference/sanpo-scape-reference.png`) — a screenshot of the ナビ
  (active walking navigation) screen: route on a map, colored category pins,
  a live stats footer (elapsed time / distance / steps), and a bottom tab bar.
- **Brief** (paraphrased): a walk-support app; light mode should be "pop and
  bright" — white + sky-blue base with ~3 core colors plus illustration use;
  dark mode is described as light mode's inverse, **without illustrations**.

If you have a Figma file, app codebase, or additional product screens for
Sanpo, attach them and this system should be revised against that ground
truth — see "Open questions" at the bottom.

## Index — what's in this project

- `styles.css` — the single global stylesheet entry (import this one file).
- `tokens/` — `colors.css` (incl. dark mode), `typography.css`, `spacing.css`,
  `effects.css` (shadow/motion), `fonts.css` (`@font-face`/webfont import),
  `base.css` (minimal reset).
- `components/` — 21 React UI primitives across 7 groups: `core/` (Icon,
  Button, IconButton), `forms/` (Input, Select, Checkbox, Radio, Switch),
  `feedback/` (Badge, Tag, Toast, Tooltip), `navigation/` (Tabs, TabBar),
  `overlays/` (Dialog, BottomSheet), `data/` (Card, Avatar, StatBlock,
  ProgressBar), `map/` (MapPin). Each has a sibling `.d.ts` (props),
  `.prompt.md` (usage), and a `@dsCard` showcase HTML.
- `guidelines/` — foundation specimen cards (Colors ×5, Type ×3, Spacing ×4,
  Brand ×3) that populate the Design System tab.
- `ui_kits/sanpo-app/` — a click-through recreation of the app: `index.html`
  boots an iPhone-frame prototype with 5 screens (ホーム / スポット検索 / ナビ
  / 記録 / マイページ) wired to a real bottom `TabBar`, plus a working
  Light/Dark toggle on マイページ.
- `assets/` — `illustrations/walker-preview.png` (cropped illustration
  sample), `reference/sanpo-scape-reference.png` (full source screenshot).

## Content fundamentals

- **Language**: all product copy is Japanese, written in a friendly-but-plain
  register — polite form (です/ます where a sentence completes: e.g. a button
  label like "散歩を始める" stays a plain imperative noun-phrase, not a full
  sentence). Short, task-first labels over descriptive prose: "一時停止",
  "終了する", "設定", "現在地", "ピン追加" — verb/noun fragments, not sentences.
  Menu/tab labels are pure nouns: "ホーム", "スポット検索", "記録", "マイページ".
- **Address the walk, not the user**: copy centers the activity and the
  place ("ゴール：川辺駅", "往復の目安 60分（約4.0km）") rather than "you" —
  there's no visible 2nd-person pronoun in the reference at all. Avoid
  inserting "あなた" — let nouns and numbers carry the sentence.
  Home-screen greetings are the one place a light 2nd-person touch is fine
  ("田中さん、今日も歩きましょう" — name + collective "let's", not a command).
  Data numerals stay bare (00:28:34 / 2.1 km / 3,240歩) — unit characters (分,
  km, 歩) are tiny compared to the numeral, not spelled out as words.
- **Emoji**: none observed in the reference; do not introduce emoji into
  product UI copy. If you need a status glyph, use a Lucide icon instead
  (see Iconography) — e.g. a dot + label Badge rather than 🔥 or ✅.
  Numerals and kanji carry emphasis, not glyphs.
  Icons within pills add meaning (colored pins, tab icons) but always paired
  with a text label — Sanpo doesn't rely on icon-only communication.
- **Tone**: calm, functional, encouraging — closer to a transit/wayfinding app
  than a gamified fitness app. No exclamation points, no hype copy, no
  streak-shaming. A streak ("12日連続") is stated plainly, not celebrated with
  effects.
- **Casing**: sentence-style for Japanese (no concept of letter casing); for
  any Latin/English strings that appear (rare — e.g. a wordmark), keep
  simple Title Case, never ALL CAPS.

## Visual foundations

- **Palette discipline**: light mode is genuinely restrained — white surfaces
  + one light-blue family (`--blue-*`) carry ~90% of the UI; a single warm
  accent (`--orange-*`) exists for future highlight use. The extended
  green/purple/red hues are **reserved for map-pin categories and semantic
  state** (success/danger) — they never become general decorative UI color.
  If a screen feels like it needs a 4th "hero" color, reach for the blue
  scale's tints/shades first.
- **Backgrounds**: flat white/near-white (`--surface-app` = `--ink-050`,
  `#f5f7f9`) — no gradients, no photographic backgrounds, no repeating
  textures. The only imagery is the occasional flat illustration panel
  (see below) and the map canvas itself.
- **Illustration (light mode only)**: one flat, soft-pastel vector style —
  a walking figure in a navy jacket, mint/teal trees, pale blue-grey building
  silhouettes, pale green ground. Used sparingly as a small header accent
  (e.g. the ナビ screen's trip-summary card), never full-bleed, never as a
  background behind text. **Dark mode never shows illustrations** — swap the
  illustration slot for a plain tinted panel + a single Lucide icon instead
  (see `HomeScreen.jsx` / `NavScreen.jsx` for the pattern:
  `{!dark ? <img .../> : <Icon .../>}`).
- **Type**: one family for all UI text — **Noto Sans / Noto Sans JP**
  (Google-hosted, see "Font substitution" below) — used for every
  heading, body, label, button, and data numeral in the product.
  **M PLUS Rounded 1c** is reserved exclusively for the Sanpo logo/
  wordmark (`guidelines/brand-wordmark.card.html`) and must never be
  used for ordinary UI text. Big data numerals (00:28:34, 3,240) are
  heavy-weight and use tabular figures so digits don't jiggle while
  updating live.
- **Spacing**: 4px base grid (`--space-1` … `--space-16`); default card
  padding is 16px, page gutters are 16px.
- **Corner radii**: generously rounded throughout — 14px for standard
  controls, 20–28px for cards/sheets, full pill for every button and tag.
  Nothing in the system uses a sharp 0–4px radius; the smallest radius
  (`--radius-xs`, 6px) is reserved for tiny elements like checkboxes.
- **Shadows**: soft, cool-tinted, low-contrast — every shadow token is a
  blue-grey (`rgba(27,36,48,…)`), never pure black, so elevated cards read as
  "floating on a bright map" rather than "sitting under a heavy UI layer."
  Map pins get a slightly firmer shadow (`--shadow-pin`) so they read as
  physical markers against the flat map.
- **Borders**: hairline (1–1.5px) `--border-subtle` for resting dividers/
  input outlines; buttons and cards generally skip borders in favor of
  shadow + fill. Focus state adds a soft blue ring (`--ring-focus`), not a
  border color change alone.
- **Motion**: gentle and purposeful — `ease-out` (200ms) for ordinary state
  changes, a light `ease-spring` (320ms) for anything that should feel
  physical (toggle thumbs, sheet entrances, the active tab-bar circle
  filling in). Nothing loops indefinitely on real content; no bouncy
  over-animation.
- **Hover / press states**: hover darkens a filled surface one step
  (`--primary` → `--primary-hover`) or introduces a faint tint on ghost/
  outline controls; press darkens further (`--primary-press`) and the
  control scales down very slightly (0.97). No lightening-on-hover, no
  opacity-only hover (opacity is reserved for disabled states).
  Disabled = flat neutral fill (`--ink-200`) + muted text, not a dimmed
  copy of the active state.
- **Transparency & blur**: essentially unused in the product surface itself
  — the map/UI is opaque and flat. The one exception is modal scrims
  (`rgba(27,36,48,0.45)` behind a Dialog).
  The bundled `ios-frame.jsx` device chrome uses iOS's native blur for its
  own status bar/keyboard — that's device chrome, not brand UI, and isn't a
  pattern to reuse inside screens.
- **Imagery color vibe**: cool and clean — pale blues/mint greens/soft
  greys, daylight-bright, no grain, no black-and-white treatment, no heavy
  saturation. Think "clear spring afternoon," not moody or cinematic.
- **Cards**: white fill, 20px radius, soft shadow, no visible border, 16px
  internal padding — the universal container for stats, list rows, and
  floating map controls alike.
- **Layout**: mobile-first, single-column; the bottom tab bar and any
  in-progress action bar (pause/end/pins) are the only fixed elements —
  everything else scrolls in a plain vertical stack.

## Iconography

- **System**: [Lucide](https://lucide.dev) — CDN substitution, not from the
  original product (no icon font/sprite was supplied). The stroke-based,
  rounded-cap, 2px-weight Lucide style is the closest open match to the
  simple line glyphs in the reference (tab bar icons, map-control icons,
  bottom-sheet pause/stop icons).
- **Delivery**: loaded as a `<script src="https://unpkg.com/lucide@0.462.0/dist/umd/lucide.js">`
  UMD build; `components/core/Icon.jsx` wraps it (`<i data-lucide="name">` →
  `lucide.createIcons()` → a real inline `<svg>`), so every icon is a
  colorable, resizable vector — not a raster image or icon font glyph.
  Any page using `Icon` (or any component that uses `Icon` internally, e.g.
  `Button`, `MapPin`, `TabBar`) must load that script tag first.
- **Map pins**: not plain icons — `MapPin` composites a Lucide glyph
  (white) inside a CSS teardrop shape colored by category
  (`--map-park`/`--map-cafe`/`--map-culture`/`--map-station`), matching the
  colored pins in the reference screenshot exactly.
- **No emoji, no unicode-symbol icons** anywhere in the UI.
- **Substitution flag**: 🚩 if Sanpo has its own icon set/sprite, replace the
  CDN reference in `Icon.jsx` and re-export; every consumer of `Icon`
  updates automatically.

## Font substitution — please confirm

No font files were supplied. Fonts are Google-hosted substitutes chosen for
closest character:
- **Noto Sans / Noto Sans JP** (all UI text — headings, body, labels,
  buttons, data) — the one typeface for the entire product UI, per brand
  direction. Every `--font-*` semantic role (`--font-heading`,
  `--font-body`, `--font-label`, `--font-data`, `--font-display`) resolves
  to this family.
- **M PLUS Rounded 1c** (logo/wordmark only) — rounded terminals kept
  strictly for the Sanpo logotype; not wired to any semantic UI role, so
  it can't leak into product text by accident.

🚩 **If Sanpo has licensed/brand fonts, please attach the font files** (or
name them) and this system will be updated to reference the real
`@font-face` sources instead of the Google Fonts CDN.

## Open questions / next iteration

- No codebase or Figma was attached — every component, screen, and copy
  choice above is inferred from one screenshot + the brief. If real product
  screens (Home, Search, Settings, onboarding, etc.) exist, attach them so
  this system can be corrected against ground truth rather than invented.
- Only one illustration sample exists (cropped from the reference). A real
  illustration set (empty states, onboarding, achievement moments) should be
  commissioned/supplied rather than relying on this single crop.
- No logo/wordmark file was supplied — `guidelines/brand-wordmark.card.html`
  is a placeholder built from the type system, not a real logo.
- Dark mode was authored as a systematic token inversion per the brief
  (no illustrations, same hues at adjusted lightness) — worth a design pass
  once real dark-mode screens/preferences are known. The dark scope is a
  plain `[data-theme="dark"]` attribute selector (not `:root[...]`), so it
  can apply to any container, not just the document root — every
  `Components` card in this system renders a Light and Dark panel
  side-by-side using this, and any consumer can preview dark mode on a
  nested element the same way. Toggle it app-wide by setting
  `document.documentElement.dataset.theme`.
