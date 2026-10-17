# Brightwater

A fictional energy company's light, rounded brand with a teal accent, showing how to build a brand from a CSS file.

## Libraries

| Import | Contents |
|---|---|
| `"t": "aerender:example/tokens"` | Colours, one font stack, a display size, spacing and a radius (prefix `bw-`), imported from `tokens.css` |
| `"b": "aerender:example/assets"` | `bwSocial`, a 1200x630 social card bound to the tokens |

`examples/example-brand/social.scene.json` in the aerender repository imports the card and changes its copy.

## Rules

- White canvas (`bw-bg`) with ink text (`bw-ink`). Use the teal accent (`bw-accent`) once per visual; keep the amber highlight (`bw-highlight`) for a single data point.
- One type family through `$t:bw-font`. Labels are tracked 0.08em.
- Corners are rounded (`bw-radius`, 12px).

## Voice

Plain, warm UK English for households: short sentences and concrete dates and amounts.

## Before you deliver

1. `aerender lint <file> --brand example` is clean.
2. Render and check one accent use per visual and no clipped text.
