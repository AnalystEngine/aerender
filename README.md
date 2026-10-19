# aerender

Mock up any visual from a JSON scene, so you can agree it before you build it.

aerender is a command-line tool for AI agents and the people they work with. An agent describes a screen, a dashboard, a social graphic, an A4 page, a flow diagram or a slide deck as a small JSON scene, and aerender renders it to PNG or PDF. You look at the picture and ask for changes in plain words, and the agent makes each change with one or two commands of a few hundred characters. Front-end code or the real deck is built only once the mockup is agreed, so revisions happen while they are still cheap.

Every picture below is a scene in `examples/`, rendered by aerender in AnalystEngine's design system. The last one uses Brightwater, a fictional brand built from a 28-line CSS file.

## What it draws

**Product screens and dashboards**

![Dashboard mocked up with the AnalystEngine UI library](docs/images/dashboard.jpg)

**Social and marketing graphics:** a 1200x630 card and a 1080x1080 LinkedIn square

![Social card and LinkedIn square](docs/images/social.jpg)

**A4 documents:** a report cover and a one-page summary, rendered to PDF

![A4 report cover and one-page summary](docs/images/one-pager.jpg)

**Flow diagrams:** connectors are routed from the boxes' positions after layout, so moving a box moves its lines

![Flow diagram with a decision and a loop-back](docs/images/flow.jpg)

**Slide decks:** each slide as a PNG, the deck as a PDF, and a scrollable deck view for review

![Six-slide deck](docs/images/deck.jpg)

**Your own brand:** the same templates and checks, in a brand built from your CSS

![Social card in the fictional Brightwater brand](docs/images/example-brand.jpg)

## Quick start

You need Node 22 or later and Chrome or Chromium.

```
npm install -g github:AnalystEngine/aerender
aerender doctor
```

`doctor` checks Node, Chrome, fonts, icons and the brand libraries, renders a test scene, and prints a fix for anything missing.

Then make your first graphic:

```
echo '{"aerender":1,"imports":{"a":"aerender:analystengine/assets"},"children":[]}' > post.scene.json
aerender insert post.scene.json / '{"type":"ref","ref":"a:aSocial","name":"Card"}'
aerender set post.scene.json "Card/Headline" content="Review AI tools before staff adopt them"
aerender tree post.scene.json
aerender render post.scene.json                       # writes renders/card@2x.png
aerender lint post.scene.json --brand analystengine
```

This creates a scene that imports the AnalystEngine marketing templates, places a social card, changes its headline, prints an outline, renders the card and checks it against the brand.

To render any of the pictures above, run `aerender render` on its scene in `examples/`. Add `--deck` for the slide deck and `--format pdf` for the A4 pages.

### Use it from your agent

The skill teaches an agent the workflow:

```
npx skills add AnalystEngine/aerender
```

Or copy `skills/aerender/` into a project's `.claude/skills/`. If the CLI is missing, the skill's setup step installs it.

## Work with AnalystEngine

AnalystEngine is a London-based AI engineering consultancy that helps firms design, build and integrate AI systems. It built aerender for its own design and reporting work, and the `analystengine` brand in this repository is the design system it uses for every visual that carries its name.

If you need help with AI engineering, [tell AnalystEngine what you are working on](https://www.analystengine.io/contact). Its case studies and its writing on AI engineering, governance and cybersecurity are at [analystengine.io](https://www.analystengine.io/).

## How it works

```
  scene.json ──► resolve components ──► compile to HTML/CSS ──► Chrome ──► PNG · PDF · deck view
      ▲               ▲
      │               └── libraries: brand tokens, components, templates (*.lib.json)
      └── tree · set · insert · batch  (edits addressed by name path, e.g. "Card/Headline")
```

- A **scene** (`*.scene.json`) is a tree of frames, text, shapes, icons and component instances. Frames lay out like flexbox.
- A **library** (`*.lib.json`) holds a brand's tokens as variables, plus its components and templates. Templates and components bind every colour, size and font to those tokens.
- An **edit** addresses a node by its name path, such as `"Findings/Column[0]/Claim"`, including nodes inside component instances. An edit to an instance writes an override into the scene and leaves the library unchanged.
- **Chrome** lays the scene out and renders it. Fonts and icons ship with the package, so a scene renders the same on any machine with Chrome, without a network connection.

A revision to one slide of the example deck looks like this:

```
aerender tree examples/deck/deck.scene.json --node Findings
aerender set examples/deck/deck.scene.json "Findings/Headline" content="Three gaps put member data at risk"
aerender render examples/deck/deck.scene.json --node Findings
```

`batch` makes several changes in one step, and applies all of them or none:

```
aerender batch examples/deck/deck.scene.json '[
  {"op":"set","path":"Findings/Column[0]/Claim","props":{"content":"11 of 14 tools were never reviewed"}},
  {"op":"move","path":"Recommendations","to":"/","index":1}]'
```

## Commands

Run `aerender <command> --help` for any command.

| To | Run |
|---|---|
| See a scene's outline | `aerender tree <file> [--node X] [--depth N] [--all] [--ids]` |
| Read one node | `aerender get <file> <path>` |
| Change properties | `aerender set <file> <path> key=value ...` |
| Add, remove or rearrange nodes | `insert`, `delete`, `move`, `copy` |
| Apply several edits at once | `aerender batch <file> <ops.json \| ->` (all of them or none) |
| Render | `aerender render <file> [--node X]... [--out dir] [--scale 2] [--format png\|pdf] [--deck]` |
| Check the schema | `aerender validate <file>` |
| Check layout and brand | `aerender lint <file> [--node X] [--brand <id> \| tokens.css]` |
| Add a photo | `aerender asset add <url-or-path> [--scene file.scene.json] [--name x] [--credit text]` |
| Turn CSS tokens into a library | `aerender tokens import <tokens.css> --out <name.lib.json>` |
| Hand off to a build agent | `aerender export spec <file> --node X [--format json\|md]` |
| Hand off as HTML | `aerender export html <file> --node X --out f.html` |
| List brands and libraries | `aerender brands [--json]`, `aerender libs` |
| Read a brand's guide | `aerender brand <id> [--components \| --path]` |
| Check the install | `aerender doctor`, `aerender --version` |

`render` writes one PNG per top-level frame into `renders/` beside the scene. With `--deck` it also writes a PDF, a scrollable `deck.html` and a single `deck.png` of every slide. Render stops on errors such as an unknown variable or component; fix them, or pass `--force` to see the partial result.

`lint` flags colours outside the brand palette, clipped or overflowing text, collapsed boxes and connectors that cross boxes.

`export spec` gives a build agent the text, components and tokens of a node. `export html` gives HTML that keeps the tokens as CSS custom properties.

aerender looks for Chrome in `AERENDER_CHROME` first, then on the `PATH` (`google-chrome`, `google-chrome-stable`, `chromium`, `chromium-browser`, `chrome`), then in a Playwright install (`npx playwright install chromium`).

## Brands

A brand is a folder of tokens, libraries and a guide. `aerender brands` lists every brand aerender finds, `aerender brand <id>` prints its guide, and scenes import its libraries as `aerender:<id>/<library>`.

### Built-in brands

| Brand | Libraries | Purpose |
|---|---|---|
| `analystengine` | `aerender:analystengine/tokens`, `/ui`, `/assets`, `/slides` | AnalystEngine's design system, covering screens, marketing graphics, documents, slides and diagrams |
| `example` | `aerender:example/tokens`, `/assets` | Brightwater, a fictional brand built from a 28-line CSS file |

### The brand folder

Other tools build brand folders to this layout, so it changes only deliberately.

```
<brand-id>/                 folder name = brand id (lowercase letters, digits, hyphens)
  GUIDE.md                  required. First line "# <Display name>"; first paragraph = one-line description.
                            Then: which library for which asset, non-negotiable rules, voice, checklist.
  tokens.lib.json           required (generate with `aerender tokens import tokens.css --out tokens.lib.json`)
  tokens.css                optional (token source)
  ui.lib.json, slides.lib.json, assets.lib.json   optional
  components.md             optional component catalogue (`aerender brand <id> --components`)
  assets/                   optional images, used as `aerender:<brand-id>/assets/<file>`
```

Folders starting with `_` or `.` are ignored, so keep templates as `_template/`. `aerender brands` warns about a folder that has no `GUIDE.md` or `tokens.lib.json`.

### Private brands

Keep private and client brands in your own directories and list them in `AERENDER_BRANDS`, separated by colons:

```
export AERENDER_BRANDS='$HOME/brands:$HOME/clients/*/brands'
```

aerender expands `$VAR` and `${VAR}` itself, so the variable works even when set unexpanded, and matches `*` against directory names. It skips an entry that names an unset variable. It searches each entry in order, then the built-in brands, and skips directories that do not exist. When two directories hold the same brand id, the first wins and `aerender brands` notes the one it hides. Never commit a private brand to this repository.

### Creating a new brand

1. Write the brand's colours, fonts, sizes and spacing as CSS custom properties in a `tokens.css`.
2. Run `aerender tokens import tokens.css --out tokens.lib.json`.
3. Build templates and components bound to those variables with `aerender batch`.
4. Write `GUIDE.md`, put the folder in a directory listed in `AERENDER_BRANDS`, and check it with `aerender brands` and `aerender lint <file> --brand <id>`.

The full guide is `skills/aerender/references/new-design-system.md`, and `brands/example/` is the worked example.

## The skill

`skills/aerender/SKILL.md` covers setup, choosing a brand, the edit and render workflow, and the commands. Its references cover the scene format, composing each kind of visual, and building a new brand. Brand rules live in each brand's `GUIDE.md`, not in the skill.

## Limitations

- aerender draws mockups, not production assets. Final decks, print files and front-end code are built from the agreed mockup.
- Charts are not built in; draw simple ones with frames, or leave a placeholder.
- Connectors join the midpoints of box sides and do not route round obstacles; lint warns when a line crosses a box.
- Only the bundled fonts (Inter Tight, Inter, JetBrains Mono, Noto Sans) render exactly; other families fall back.
- Rendering needs Chrome or Chromium on the machine.

## Developing aerender

```
npm ci
npm test            # integration tests: render the examples and fixtures in Chrome
npm run typecheck
```

[CLAUDE.md](CLAUDE.md) describes the architecture, how to add a node type or property, how to regenerate the brand libraries, and the rules for keeping the skill in step with the CLI.

## Licence

aerender is licensed under the [Apache License 2.0](LICENSE). The licence does not grant permission to use the AnalystEngine name, logo or brand, apart from describing where the work came from (section 6).
