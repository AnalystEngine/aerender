---
name: aerender
description: Mock up any visual as a JSON scene and render it, so an agent and a human can agree it before an expensive build. Covers UI screens and dashboards, social and marketing graphics, A4 documents and report covers, flow diagrams and slide decks. Use it for branded assets (including AnalystEngine-branded work, and any brand listed by `aerender brands`) and for generic, unbranded mockups. Use it to draft, revise and hand off a visual direction cheaply. Do not use it to write production front-end code, produce final PowerPoint or print files, chart real data, or edit photos.
---

# aerender

aerender renders a JSON scene (`*.scene.json`) of frames, text, shapes, icons and component instances to PNG, PDF or a scrollable deck view. You change the scene with small commands, so a revision costs a few hundred characters rather than a rebuild. Libraries (`*.lib.json`) hold a brand's tokens and components.

## Setup (do this first)

1. Run `aerender --version`. If the command is missing, run `npm install -g github:AnalystEngine/aerender`.
2. Run `aerender doctor` and apply every fix it prints. It checks Node 22+, Chrome, fonts, icons and the brand libraries, and renders a test scene.

## Choose the brand

Before committing to a design, run `aerender brands` and choose the brand. AnalystEngine's own material uses `analystengine`. Then run `aerender brand <id>` and follow its guide; finish with `aerender lint --brand <id>`.

If the brand you need is not listed, tell the user and offer to build it with [references/new-design-system.md](references/new-design-system.md). Do not imitate a brand from memory. For a generic mockup, pick the closest listed brand and tell the user which one you chose.

## Workflow

1. Start a scene. Import a brand's libraries by alias and place a template or component:
   ```
   echo '{"aerender":1,"imports":{"a":"aerender:analystengine/assets"},"children":[]}' > post.scene.json
   aerender insert post.scene.json / '{"type":"ref","ref":"a:aSocial","name":"Card"}'
   ```
   `aerender libs` lists every brand's libraries. `aerender tree aerender:<brand>/<library> --depth 1` lists a library's components with ids.
2. Read before you write: `aerender tree <file>` (`--node X --depth N` to narrow, `--ids` for ids, `--all` to open instances). Do not read raw JSON to orient yourself.
3. Change the design with `set`, `insert`, `delete`, `move`, `copy` or `batch`. Prefer `set` on an existing node to rebuilding.
4. Render and look at the result yourself: `aerender render <file>` writes one PNG per top-level frame into `renders/`. Use `--deck` for slides.
5. Run `aerender validate <file>` and `aerender lint <file> --brand <id>`. Fix every error, then render again.
6. Hand off with `aerender export spec` (content and tokens for a build agent) or `aerender export html`.

## Addressing nodes

- A name path: `"Card/Headline"`. Each segment matches the nearest descendant with that name or id, so you can skip intermediate frames. `[n]` picks the nth match: `"Findings/Column[0]/Claim"`.
- An id: `aBc12` or `#aBc12`.
- Paths go through instances. `set` on a node inside an instance writes an override into that instance; the library is never changed.
- An ambiguous path fails and lists the matches. Add a parent segment, an index, or use the id.
- Name every node you create. Names are how you, connectors and later agents find things.

## Commands

```
aerender tree post.scene.json --depth 2
aerender get post.scene.json "Card/Headline"
aerender set post.scene.json "Card/Headline" content="Review AI tools before staff adopt them"
aerender set post.scene.json "Panel" 'padding=[24,32]' 'fill="$t:ae-bg-elev"'   # values parse as JSON, else as text
aerender set post.scene.json "Panel" cornerRadius=null                          # null removes a property
aerender set post.scene.json @vars accent-soft='"#E6FC2040"'                    # local variables
aerender insert post.scene.json "Panel" '{"type":"text","name":"Note","content":"..."}' --index 0
aerender delete post.scene.json "Note"
aerender move deck.scene.json "Recommendations" / --index 2   # "/" is the document root
aerender copy deck.scene.json "Findings" / --name "Findings 2"
aerender batch post.scene.json ops.json                        # or an inline JSON array, or - for stdin
aerender render post.scene.json [--node X]... [--scale 2] [--format png|pdf] [--out dir]
aerender render deck.scene.json --deck                         # slide PNGs, PDF, deck.html, deck.png
aerender validate post.scene.json
aerender lint post.scene.json [--brand analystengine | tokens.css]
aerender asset add <url-or-path> --scene post.scene.json [--credit "..."]
aerender export spec post.scene.json --node "Card" [--format md|json]
aerender export html screen.scene.json --node "Screen" --out screen.html
aerender tokens import brand.css --out brand-tokens.lib.json
aerender brands [--json]                                       # id, name, description, source
aerender brand analystengine [--components | --path]           # the brand's guide, catalogue or folder
aerender libs | doctor | --version | <command> --help
```

`batch` ops:
- `{"op":"set","path":P,"props":{...}}`
- `{"op":"insert","parent":P,"node":{...}|[...],"index":n}`
- `{"op":"delete","path":P}`
- `{"op":"move","path":P,"to":P,"index":n}`
- `{"op":"copy","path":P,"to":P,"name":N}`

A batch applies all of its ops or none. Every edit is validated, and an edit that adds an error writes nothing. Ids are generated for you.

When you insert into a frame inside an instance, the result depends on the frame:
- A slot (marked `slot` in `tree`) is emptied by the first insert, so its sample content is replaced.
- Any other frame keeps its children and gains yours.

## Brands

A brand is a folder with a `GUIDE.md`, a `tokens.lib.json` and optional libraries, a `components.md` catalogue and `assets/`. aerender ships `analystengine` and `example` (Brightwater, a fictional brand), and finds private brands in the directories listed in `AERENDER_BRANDS`. Import a brand's library as `aerender:<id>/<library>` (for example `aerender:analystengine/ui`) and its images as `aerender:<id>/assets/<file>`. Imported variables carry the import prefix, such as `$t:ae-fg`.

## Gotchas

- Imported ids and variables carry the import prefix: `"ref":"a:aSocial"`, `"$t:ae-fg"`. Use the prefix in `descendants` keys too (`"a:aSocialH"`); `tree` and `set` print the prefixed form.
- `stroke` is always an object: `{"fill":"$t:ae-rule","thickness":1,"align":"inner"}`. It replaces the whole stroke.
- `x`/`y` work only in a `layout:"none"` frame or with `layoutPosition:"absolute"`.
- `space_between` ignores `gap`. Text nodes take no padding; wrap them in a frame.
- Text with `textGrowth:"auto"` never wraps. Lint reports overflow, clipping, collapsed frames and connectors that cross boxes.
- `enabled:false` removes a node from layout. Deleting a node inside an instance hides it this way.
- Render stops on errors (unknown variable, icon, ref or connector endpoint). Fix them, or pass `--force` to see the partial result.

## References (read when needed)

- [references/format.md](references/format.md): the scene format, node types, properties, connectors and the deck view.
- [references/layouts.md](references/layouts.md): composing screens, graphics, documents and slides; diagrams; photos.
- [references/new-design-system.md](references/new-design-system.md): building a brand from a client's CSS, brand guide or website, and adding it as a brand folder.
