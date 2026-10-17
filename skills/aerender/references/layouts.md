# Composing visuals with aerender

How to lay out screens, graphics, documents and slides so a mockup reads as a competent first draft. Format details are in [format.md](format.md).

## Principles for every visual

- **One idea per visual.** A slide, a social card or a page section makes one point. If you need two headlines, you need two visuals.
- **Lead with the point.** The headline states the takeaway ("Most AI use bypasses existing controls"), not the topic ("AI usage"). A label above it can name the topic.
- **Start from a template or component** in the brand's libraries and change its copy. Templates already carry the grid, margins and type scale. Only build from frames when no template fits.
- **Keep the grid.** Use the brand's spacing tokens for margins and gaps. Align everything to a left edge unless the visual is a single centred statement.
- **Fill space with substance, not decoration.** Add a supporting sentence, a source, an owner and date, or a short table. Never add ornaments to fill corners. Around 60% of the surface should carry content.
- **Do not shrink type to fit.** Cut words, split the visual, or move detail to a second page.
- **Make prose and evidence agree.** A headline must not claim more than its table, chart or diagram shows.
- **Check it yourself.** Render, look at the PNG at full size, and fix anything sparse, crowded or unbalanced before you hand over.

## Screens and dashboards

- Compose a screen from the UI library: sidebar, top bar, page header, then content sections.
- Set the screen frame to a real viewport (1440x900 for a desktop app) with `clip: true`, so overflow shows.
- Use `fill_container` for columns and cards in a row; fix only the widths that must be fixed (sidebar, narrow table columns).
- Put status, counts and dates in components (chips, KPI cards, table rows), and swap variants through `descendants` replacements rather than restyling.
- One primary action per screen.

## Social and marketing graphics

| Format | Size |
|---|---|
| Social card (Open Graph, X, LinkedIn link) | 1200x630 |
| LinkedIn or Instagram square | 1080x1080 |
| Web hero | 1440x720 |

- Keep the headline to about eight words and the supporting line to one sentence. Graphics are read in a second.
- Keep text away from the edges (64px or more at these sizes). Platforms crop and overlay.
- Use one image, treated to the brand. One accent, on the thing you want noticed.

## Documents: A4 pages and report covers

- A4 at 96 dpi is 794x1123. Use 48–64px margins. Body text is 13–15px, labels 10–12px.
- Use a one-pager for an executive summary: title block, key finding, two columns (what we found, what we recommend), evidence table, and a band with duration, fees and exclusions.
- A cover carries the title, subtitle, date and classification. Leave it quiet.
- For more than one page, add one top-level frame per page; `render --format pdf` writes them as pages.

## Slides

- Use 1920x1080. Keep generous fixed margins (about 128px each side, 96px top and bottom), a headline on a fixed top line, and a content block that fills the rest.
- Size type to be read across a room: headlines 64–80px, body 28–36px, labels about 22px.
- Pick the layout by the job: title, section divider, headline with body (60/40), numbered actions, two or three claims, a statement, image with text, diagram, or comparison table.
- Avoid conclusion boxes at the bottom of a slide; the point belongs in the headline.
- Render with `--deck` and review the whole deck in `deck.html` or `deck.png`.

## Diagrams

1. Use a `layout:"none"` canvas frame and place boxes with `x`/`y`, or put boxes in a flex row for a simple chain.
2. Use the brand's diagram kit where there is one (process box, key step, decision, terminator, note, lane). Override each part's label.
3. Join parts with `connector` nodes addressed by name: `{"type":"connector","from":"Triage","to":"Decision","route":"elbow","label":"Yes"}`.
4. Lay a flow out left to right. Put a decision's branches above and below it with `fromSide` `top`/`bottom` and `toSide` `left`. Draw a loop-back from `top` to `top` with a dash.
5. Leave about 80px between boxes for labels and keep labels to five words.
6. Run `lint`: it warns when a connector crosses a box. Move the box or set the sides.

Draw a cross-cutting concern (governance, change control) as a lane or a dashed loop, not as another step.

## Photos

1. Download into the scene's folder: `aerender asset add <url> --scene file.scene.json --credit "..."`. Prefer public-domain (CC0) images or the client's own; record the licence.
2. Put the image on a frame's fill: `{"type":"image","url":"./assets/photo.jpg","mode":"fill"}`. `fit` letterboxes; `stretch` distorts.
3. Apply the brand's treatment with `imageFilter` (`mono`, `desaturate` or `dark`). Text on top keeps its colour.
4. Credit the photographer on the visual when the licence requires it.

## Before you hand over

- `aerender validate` and `aerender lint --brand <tokens.css>` are clean.
- Every visual has been rendered and looked at full size.
- `aerender export spec` gives the build agent the content and tokens.
