# Building a brand kit for a new design system

Use this when a client's brand is not bundled. You end with a folder of libraries that any scene can import, and a `tokens.css` that `lint --brand` checks against. The worked example is `brands/example/` in the aerender repository: Brightwater, a fictional energy company.

## 1. Collect the brand's tokens as CSS

Write a `tokens.css` with one `:root` block of custom properties. Take the values from, in order of preference:

1. the client's own CSS or design tokens (`:root { --brand-... }` in their site, or a tokens export)
2. their brand guide (colours, fonts, type sizes, spacing, radii)
3. their public website: read the computed colours and fonts of the main elements

Name the properties consistently, with a short prefix:

```css
:root {
  --bw-bg: #FFFFFF;
  --bw-ink: #0F2430;
  --bw-accent: #0E9F8E;
  --bw-label: var(--bw-accent);                 /* aliases stay linked */
  --bw-font: 'Inter', 'Noto Sans', sans-serif;  /* stacks are kept */
  --bw-fs-display: clamp(44px, 5vw, 72px);      /* evaluated at 1440px */
  --bw-tracking-label: 0.08em;                  /* em tracking is kept */
  --bw-radius: 12px;
}
```

Hex and `rgba()` become colour variables, px and unitless numbers become number variables, and em lengths and font stacks become strings. Multi-layer `box-shadow` values are split into parts (`-x`, `-y`, `-blur`, `-spread`, `-color`). Durations and easings are skipped.

## 2. Import the tokens

```
aerender tokens import brand/tokens.css --out brand/tokens.lib.json
```

The command prints how each awkward value was handled. Check the fonts: aerender bundles Inter Tight, Inter, JetBrains Mono and Noto Sans, and other families fall back through the stack. Pick the closest bundled family first in the stack for faithful renders.

## 3. Build the libraries you need

Create one library per job, each importing the tokens as `t` and binding every colour, size and font to a variable:

```
echo '{"aerender":1,"imports":{"t":"tokens.lib.json"},"variables":{},"children":[]}' > brand/assets.lib.json
aerender batch brand/assets.lib.json ops.json
```

- **assets**: templates for the graphics the client publishes (social card, square post, report cover, one-pager, web hero).
- **ui**: components for screens (navigation, header, buttons, inputs, status chips, cards, table rows).
- **slides**: 1920x1080 layouts if the client presents.

Mark each template or component `reusable: true` and give it a stable, readable `id`. Scenes reference these ids, so keep them unchanged across rebuilds. Keep the ops in a script under version control, so the library can be regenerated. The repository's `scripts/build-*.py` files show the pattern.

Rules that keep a kit usable:
- Bind values to tokens; literal colours fail `lint --brand` when they are off-palette.
- Name every node that an agent will override ("Headline", "Value", "Label"), and keep one text node per piece of copy.
- Mark content areas meant for replacement as `slot`.
- Use the brand's accent once per template.

## 4. Check it

```
aerender validate brand/assets.lib.json
aerender lint brand/assets.lib.json --brand brand/tokens.css
aerender render brand/assets.lib.json --out renders
```

Look at every template at full size. Then write one example scene that imports the library by relative path and changes the copy, to prove the overrides work:

```json
{ "aerender": 1, "imports": { "b": "./brand/assets.lib.json" },
  "children": [ { "id": "post", "type": "ref", "ref": "b:bwSocial", "name": "Post",
                  "descendants": { "b:bwSocialH": { "content": "Your tariff changes on 1 April" } } } ] }
```

## 5. Record the brand rules

Write a short README beside the libraries: the palette and when to use the accent, type rules, imagery treatment, voice, and anything agents get wrong. Brand rules that tokens cannot express (one accent per visual, sentence case, photo style) belong there.
