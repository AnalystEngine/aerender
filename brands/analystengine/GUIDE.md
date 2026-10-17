# AnalystEngine

Dark-mode technical editorial: a near-black canvas, one yellow-green accent, one type family and left-aligned grids.

Use this brand for every visual that carries the AnalystEngine name: product screens and dashboards, social and LinkedIn graphics, web heroes, A4 one-pagers and report covers, flow diagrams and slide decks.

## Which library for which asset

| Asset | Import | Start from |
|---|---|---|
| Product screen or dashboard (1440x900) | `"ui": "aerender:analystengine/ui"` | `uSidebar`, `uTopBar`, `uPageHeader`, `uKpi`, `uTable` ... |
| Social card 1200x630, LinkedIn square 1080x1080, web hero 1440x720 | `"a": "aerender:analystengine/assets"` | `aSocial`, `aSquare`, `aHero` |
| A4 report cover, A4 one-pager | `"a": "aerender:analystengine/assets"` | `aCover`, `aOnePager` |
| Slide deck (1920x1080) | `"s": "aerender:analystengine/slides"` | `sTitle`, `sSplit`, `sThree`, `sList`, `sDiagram` ... |
| Flow diagram | `"s": "aerender:analystengine/slides"` | kit parts `dProcess`, `dKey`, `dDecision`, `dTerminator`, `dNote`, `dLane` |
| Anything custom | `"t": "aerender:analystengine/tokens"` | frames bound to `$t:ae-*` variables |

Every library imports the tokens as `t`, so `$t:ae-*` variables work in any scene that imports one of them. `aerender brand analystengine --components` prints the full catalogue, with component ids and the text keys to override. Images in `assets/` are available as `aerender:analystengine/assets/<file>`.

Typical start:

```
echo '{"aerender":1,"imports":{"a":"aerender:analystengine/assets"},"children":[]}' > post.scene.json
aerender insert post.scene.json / '{"type":"ref","ref":"a:aSocial","name":"Card"}'
aerender set post.scene.json "Card/Headline" content="Review AI tools before staff adopt them"
aerender render post.scene.json
```

## Non-negotiable rules

- **Canvas** is `$t:ae-bg` (#181818), never pure black. Surfaces step up through `ae-bg-section` and `ae-bg-elev`. Cards always have a 1px `ae-rule` border.
- **One accent** (`$t:ae-accent`, #E6FC20) per visual, on the one thing that matters: a primary call to action, a live marker, the active navigation item, the key step in a diagram, or a classification. Never use it as a large fill or for body text.
- **One type family**: Inter Tight (`$t:ae-font-display`, `$t:ae-font-body`). Emphasis comes from weight, case and tracking, not colour.
- **Eyebrows** are capitals, bold, tracked 0.16em (`$t:ae-tracking-eyebrow`), in `$t:ae-eyebrow`. Use `textTransform: "uppercase"` rather than typing capitals.
- **Layout** is left-aligned on a grid, with 60/40 splits before 50/50. Centre only an isolated statement. Content fills about 60% of the surface.
- **Radii** are near-square: 2px for controls, 4px for cards, and 8px at most. Pills are only for status chips and diagram terminators.
- **No decoration**: no gradients, patterns, noise, drop shadows on headings, decorative icons or emoji.
- **Photography** is monochrome (`"imageFilter": "mono"`), with dark regions falling toward the canvas. Use editorial, never stock-looking, images.
- **Icons** are Lucide outlines at `lineWidth: 1.5`, sized 16, 20, 24 or 32.
- **Decks and documents** have no page numbers, footer logos or branding bars after the cover.

## Voice

- Write like a senior engineer briefing a client: concrete, unhyped, specific numbers.
- UK English, sentence case, headlines of nine words or fewer, body blocks of up to three sentences, and no sentence over 22 words.
- Banned: em dashes as sentence breaks, "it's not X, it's Y", "unlock", "empower", "next-gen", "leverage", "solutions", emoji, and rounded marketing numbers without a source.
- Client reports are reports, not pitches. Lead with the finding, give evidence in sentences and tables, and state recommendations as imperatives with an owner. No hero statistics, card grids of numbers or slogan titles.

## Before you deliver

1. `aerender validate <file>` is clean.
2. `aerender lint <file> --brand analystengine` is clean. It flags any colour outside the brand palette, as well as layout problems.
3. Render and look at every visual at full size, and check:
   - Exactly one accent use per visual.
   - Eyebrows are capitals and tracked; headlines state the point in nine words or fewer.
   - Nothing is cramped against an edge, and no area is empty by accident.
   - Photos are monochrome and credited where the licence requires.
   - No real names, emails or client data that the user did not supply.
4. Hand off with `aerender export spec <file> --node <frame>`.

## Files

| File | Alias | Contents |
|---|---|---|
| `tokens.css` | | The source design tokens |
| `tokens.lib.json` | `aerender:analystengine/tokens` | The tokens as variables, generated with `aerender tokens import tokens.css` |
| `ui.lib.json` | `aerender:analystengine/ui` | Screen and dashboard components |
| `assets.lib.json` | `aerender:analystengine/assets` | Social card, LinkedIn square, A4 report cover, A4 one-pager, web hero |
| `slides.lib.json` | `aerender:analystengine/slides` | 1920x1080 slide layouts and a diagram kit |
| `components.md` | | Component ids and override keys |
| `assets/` | `aerender:analystengine/assets/<file>` | Images used by the templates (see `CREDITS.txt`) |
