# Example brand: Brightwater

Brightwater Energy is a fictional company. Its kit shows how to turn a client's CSS into an aerender design system. The full guide is `skills/aerender/references/new-design-system.md`.

1. `tokens.css` holds the brand's custom properties: colours, one font stack, a display size, spacing and a radius.
2. `aerender tokens import brands/example/tokens.css --out brands/example/tokens.lib.json` turns them into variables (prefix `bw-`).
3. `assets.lib.json` holds one template, a 1200x630 social card bound to those variables. `scripts/build-example-brand.py` writes it through `aerender batch`.
4. `examples/example-brand/social.scene.json` imports it as `aerender:example/assets` and changes the copy.
5. `aerender lint examples/example-brand/social.scene.json --brand aerender:example` checks every colour against the palette.

Unlike AnalystEngine's dark editorial style, Brightwater is light, rounded and uses a teal accent. That shows one renderer serving different brands.
