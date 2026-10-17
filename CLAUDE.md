# Developing aerender

Guidance for agents working on this repository. Agents that only use aerender should read `skills/aerender/SKILL.md`.

## Architecture

aerender is a compiler, not a layout engine. Every command follows the same pipeline:

1. **Load** (`src/doc.ts`): read a `*.scene.json` or `*.lib.json` file (`"aerender": 1` required) and its imports.
   - `aerender:<brand>/<library>` resolves to `brands/<brand>/<library>.lib.json` in the package.
   - Library ids, refs and variables get their import prefix (`ui:uKpi`, `$t:ae-fg`).
   - Normalising turns the stroke object into the flat fields the compiler reads.
   - Edits always mutate the raw JSON, never the normalised copy.
2. **Resolve** (`src/resolve.ts`): expand `ref` instances into a concrete tree, applying root overrides, `descendants` (property override, replacement or children replacement) and slot fills.
   - Each resolved node records its origin: the raw object that defines it, or the instance and override path an edit must write to.
3. **Compile** (`src/compile.ts`): emit HTML and CSS.
   - Frames map to flexbox and variables to CSS custom properties.
   - Strokes become box-shadows, so they take no layout space.
   - Icons become inline lucide SVG.
   - Connectors become hidden markers.
4. **Chrome** (`src/browser.ts`, `src/chrome.ts`): one browser launch per command.
   - After load, the page waits for fonts and images, rounds text boxes to whole pixels, and runs the connector router (`src/connectors.ts`, shipped as a string so exported HTML draws connectors too).
   - It then screenshots, prints PDF, or measures the page for lint.

Where things live:
- CLI and the render and deck pipeline: `src/cli.ts`
- Addressing by name path: `src/address.ts`
- Edits and `batch`: `src/edit.ts`
- Schema checks: `src/validate.ts`
- Layout lint: `src/lint.ts`
- Outline: `src/tree.ts`
- Hand-off: `src/export.ts`
- Tokens import: `src/tokens.ts`
- Assets: `src/asset.ts`
- Doctor: `src/doctor.ts`
- Fonts and icons: `src/assets.ts`

Repository layout:
- `brands/<brand>/`: brand kits (`tokens.css`, `*.lib.json`, `assets/`, `README.md`).
- `scripts/build-*.py`: generators for the brand libraries.
- `examples/`: one scene per visual type.
- `skills/`: the agent skills.
- `tests/`: the integration runner, fixtures and baselines.

## Adding a node type or property

1. Add the property to `PROPS` in `src/validate.ts`, with an `ENUMS` entry if it takes fixed values.
2. If it needs an internal shape, normalise it in `normalise()` in `src/doc.ts`.
3. Render it in `Compiler.node()` in `src/compile.ts`. If it needs measured positions, as connectors do, render a marker and finish the job in the in-page script.
4. Add lint checks in `src/lint.ts` where agents can get it wrong.
5. Add a small fixture in `tests/fixtures/` and a test in `tests/run.ts` that renders it and measures the page.
6. Document it in `skills/aerender/references/format.md` and, if agents should reach for it, in `SKILL.md` or `references/layouts.md`.

## Tests

```
npm test            # tests/run.ts: integration tests against the examples and fixtures in Chrome (about a minute)
npm run typecheck   # tsc, strict
```

Prefer integration tests that render a fixture and measure the page over unit tests. `tests/baselines/` holds renders of the examples at scale 1; a test fails when a render drifts from them by more than 1% of pixels. After an intended visual change, re-render the affected examples with `--scale 1`, replace the baselines in the same commit, and look at them first. `scripts/compare.py` shows where two renders differ.

## Rules

- **Keep the skills in step with the CLI.** A change to a command, flag, property, library, component id or error message that agents rely on updates `skills/aerender/` or `skills/analystengine-brand/` in the same commit. Keep each `SKILL.md` under about 8 KB; move detail to `references/`.
- **Brand libraries are generated.** To change one, edit its `scripts/build-*.py`, empty the library file, apply the script's ops with `aerender batch`, and render the library to check every template. Keep component ids stable: example scenes and users' scenes reference them.
- **Use only fictional people, companies and contact details** in examples, fixtures, libraries and docs. Use images you can redistribute (CC0 or your own) and record each in the folder's `CREDITS.txt`.
- **Never use absolute paths** in code, libraries, fixtures or docs. Resolve package files from `PKG_ROOT` and user files from the scene's directory.
- Write UK English, and write documentation and comments as current fact.
