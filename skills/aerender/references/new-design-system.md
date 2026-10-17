# Building a brand for a new design system

Use this when `aerender brands` does not list the brand you need. You end with a brand folder that aerender discovers: a guide, tokens, libraries that any scene imports as `aerender:<id>/<library>`, and a palette that `lint --brand <id>` checks against. The worked example is `aerender brand example --path`: Brightwater, a fictional energy company.

Work in a folder named after the brand id (lowercase letters, digits and hyphens), shown here as `acme/`.

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
aerender tokens import acme/tokens.css --out acme/tokens.lib.json
```

The command prints how each awkward value was handled. Check the fonts: aerender bundles Inter Tight, Inter, JetBrains Mono and Noto Sans, and other families fall back through the stack. Pick the closest bundled family first in the stack for faithful renders.

## 3. Build the libraries you need

Create one library per job, each importing the tokens as `t` and binding every colour, size and font to a variable:

```
echo '{"aerender":1,"imports":{"t":"tokens.lib.json"},"variables":{},"children":[]}' > acme/assets.lib.json
aerender batch acme/assets.lib.json ops.json
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
aerender validate acme/assets.lib.json
aerender lint acme/assets.lib.json --brand acme/tokens.css
aerender render acme/assets.lib.json --out renders
```

Look at every template at full size. Then write one example scene that imports the library by relative path and changes the copy, to prove the overrides work:

```json
{ "aerender": 1, "imports": { "b": "./acme/assets.lib.json" },
  "children": [ { "id": "post", "type": "ref", "ref": "b:bwSocial", "name": "Post",
                  "descendants": { "b:bwSocialH": { "content": "Your tariff changes on 1 April" } } } ] }
```

## 5. Write the guide

Write `GUIDE.md` beside the libraries. `aerender brands` shows its title and first paragraph, and `aerender brand <id>` prints it whole:

```markdown
# Acme

One line saying what the brand looks like and what it is for.

## Which library for which asset
## Non-negotiable rules
## Voice
## Before you deliver
```

Cover the palette and when to use the accent, type rules, imagery treatment, voice, a pre-delivery checklist, and anything agents get wrong. Brand rules that tokens cannot express (one accent per visual, sentence case, photo style) belong here. For a large kit, list component ids and override keys in `components.md`.

## 6. Add it as a brand

Never commit a private brand to the aerender repository. Put the folder in a private brands directory and list that directory in `AERENDER_BRANDS` (colon-separated; `$VAR` and `*` are expanded):

```
brands/                 the directory listed in AERENDER_BRANDS, e.g. AERENDER_BRANDS=$HOME/brands
  acme/                 folder name = brand id
    GUIDE.md            required: "# <Display name>", a one-line description, then the guide
    tokens.lib.json     required: aerender tokens import tokens.css --out tokens.lib.json
    tokens.css          optional: the token source
    ui.lib.json, slides.lib.json, assets.lib.json   optional
    components.md       optional component catalogue
    assets/             optional images, used as aerender:acme/assets/<file>
```

Inside the folder, libraries import each other by relative path (`"t": "tokens.lib.json"`) and image urls are relative to the library (`./assets/photo.jpg`). Folders starting with `_` or `.` are ignored, so keep a template as `_template/`. Earlier directories in `AERENDER_BRANDS` win over later ones and over the built-in brands.

Check that aerender finds it:

```
aerender brands                 # acme is listed, with no warnings
aerender brand acme | head -5
aerender lint <scene>.scene.json --brand acme
```
