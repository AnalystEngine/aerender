# The aerender scene format

A scene (`*.scene.json`) or library (`*.lib.json`) is one JSON object. aerender reads only these two extensions, and every file must carry `"aerender": 1`.

```json
{
  "aerender": 1,
  "imports": { "t": "aerender:analystengine/tokens", "my": "./my-components.lib.json" },
  "variables": { "brand-red": { "type": "color", "value": "#D7263D" } },
  "children": [ { "id": "card", "type": "frame", "name": "Card", "width": 1200, "height": 630 } ]
}
```

Each top-level frame is one visual: a screen, a graphic, a page or a slide. `render` writes one PNG per top-level frame.

## Nodes

Every node has an `id` (unique, no `/`) and a `type`; edit commands generate ids. Give each node a `name`.

| Type | Use | Key properties |
|---|---|---|
| `frame` | Containers and boxes | layout, size, fill, stroke, effect, cornerRadius, clip, children, `shape`, `imageFilter`, `slot` |
| `text` | Copy | content, font properties, `textGrowth` |
| `icon` | Lucide icons | `icon` (name), `width`, `height`, `fill`, `lineWidth` (24-unit space, default 2) |
| `rectangle`, `ellipse` | Plain shapes | size, fill, stroke |
| `line` | A rule | width, `stroke` |
| `path` | SVG path data | `geometry`, `viewBox`, fill, stroke |
| `group` | Loose grouping with `x`/`y` children | children |
| `ref` | An instance of a component | `ref`, overrides, `descendants` |
| `connector` | A line between two nodes, drawn after layout | see Diagrams |

Common to all nodes: `name`, `enabled` (false removes it from layout), `opacity`, `rotation`, `flipX`, `flipY`, `x`/`y` (inside `layout:"none"` frames or with `layoutPosition:"absolute"`), `theme`, `reusable`.

## Layout

Frames are flexbox.
- `layout`: `horizontal` (default), `vertical`, or `none` (children are placed with `x`/`y`).
- `gap`; `padding` as n, `[vertical, horizontal]` or `[top, right, bottom, left]`.
- `justifyContent`: `start | center | end | space_between | space_around`. `space_between` ignores `gap`.
- `alignItems`: `start | center | end`.

Sizes (`width`, `height`):
- a number, or a number variable (`"$t:ae-s-10"`)
- `"fill_container"`: share the parent's free space on the main axis, or stretch on the cross axis
- `"fit_content"`: hug the children (the frame default)
- `"fill_container(480)"`: the number in brackets applies outside a layout

`minWidth`, `maxWidth`, `minHeight` and `maxHeight` cap a size.

## Text

`content`, `fontFamily` (a variable, a name or a fallback stack such as `"Aptos, Inter Tight"`), `fontSize`, `fontWeight` (`"400"` to `"800"`), `lineHeight` (a multiple of the size), `letterSpacing` (px or a CSS length such as `"0.16em"`), `textAlign`, `textAlignVertical`, `textTransform` (`uppercase | lowercase | capitalize`), `underline`, `strikethrough`, `fill`.

`textGrowth` controls wrapping:
- `auto`: one line that hugs its content (the default)
- `fixed-width`: wraps at `width`
- `fixed-width-height`: a fixed box

`width` is ignored without `textGrowth`.

Bundled fonts: Inter Tight, Inter, JetBrains Mono, Noto Sans. Other fonts fall back through the stack.

## Paint

- **`fill`**: a colour (`#RGB`, `#RRGGBB`, `#RRGGBBAA`), a variable (`"$t:ae-bg"`), a variable with alpha (`"$t:ae-accent/25%"`), an image `{"type":"image","url":"./assets/photo.jpg","mode":"fill|fit|stretch"}`, a linear or radial gradient, or an array of layers (the last is drawn on top).
- **`stroke`**: always an object, and it replaces the whole stroke.
  - `fill` sets the colour.
  - `thickness` is a number or `{top, right, bottom, left}`.
  - `align` is `inner` (the default), `center` or `outer`.
  - `cap` and `join` apply to paths and lines.

  For example, `{"fill":"$t:ae-rule","thickness":{"bottom":1},"align":"inner"}`. Strokes never take layout space.
- **`effect`**: a list of shadows, `{"type":"shadow","shadowType":"inner|outer","offset":{"x":0,"y":2},"blur":8,"spread":0,"color":"#00000059"}`, plus `blur` and `background_blur`.
- **`imageFilter`** on a frame with an image fill: `mono`, `desaturate` or `dark`. The filter treats the photo and leaves the frame's children untouched.
- **`shape`** on a frame: `diamond`, `pill` or `ellipse`. Children stay centred inside.

## Variables and themes

Define variables as `{"type":"color|number|string|boolean","value":...}` and reference them with `"$name"`, or `"$prefix:name"` when imported. Imported variables are read-only. A variable can alias another variable (`"value":"$ae-fg-dim"`).

For themes, give `themes: {"mode": ["dark", "light"]}` at the top level and themed values such as `"value": [{"value":"#fff","theme":{"mode":"light"}}, ...]`. Then set `"theme": {"mode": "light"}` on a node to switch its whole subtree.

## Components, instances and overrides

- Mark a node `reusable: true` to make it a component.
- Instance it with `{"type":"ref","ref":"<id>"}`, or `"ref":"<prefix>:<id>"` from an import.
- Properties on the ref (`width`, `fill`, `name` ...) override the component root.
- `descendants` overrides nodes inside the instance. Keys are descendant ids or id paths through nested instances (`"row/label"`), with the import prefix (`"ui:uKpiV"`). Each value is one of:
  - property overrides: `{"content":"41"}`
  - a full replacement (it has `type`): `{"type":"ref","ref":"ui:uChipPositive"}`
  - `{"children":[...]}` to replace a frame's children
- `children` on the ref replaces the component root's children.
- A frame marked `slot` invites replacement content; `insert` into a slot empties it first.

Imports are a path relative to the importing file (ending `.lib.json`) or an alias `aerender:<brand>/<library>`. Imports are transitive: a scene that imports `s` (slides), which imports `t` (tokens), sees both prefixes. One prefix must not point at two files.

## Diagrams

Place shapes on a `layout:"none"` frame with `x`/`y`, or in a flex row. Join them with connectors:

```json
{"type":"connector","from":"Triage","to":"Decision","route":"elbow",
 "fromSide":"auto","toSide":"auto","startArrow":"none","endArrow":"arrow",
 "stroke":{"fill":"$t:ae-fg-dim","thickness":1.5},"dash":"8 8","label":"Yes",
 "fontSize":20,"labelFill":"$t:ae-fg-muted"}
```

- `from`/`to`: a name path or id. Each must match exactly one node in the same top-level frame; `validate` checks this.
- `route`: `straight` or `elbow` (right angles). Sides default to `auto`, meaning the facing sides. A loop-back uses the same side at both ends (`"fromSide":"top","toSide":"top"`) and runs outside both boxes.
- `startArrow`/`endArrow`: `arrow`, `dot` or `none`. `dash: true` gives `6 6`.
- Connectors follow the real box positions after layout and take no layout space. Lint warns when one passes through a box it does not connect.

## Rendering outputs

- `render <file>` writes one PNG per top-level frame (`--scale 2` by default) into `renders/` beside the file, or `--out dir`. `--format pdf` puts each frame on its own page.
- `render --deck` treats top-level frames or instances sized 16:9, or marked `slide: true`, as slides in document order. It writes:
  - `NN-name@2x.png` for each slide
  - a PDF
  - `deck.html`, every slide stacked on a grey backdrop with a "03 · Findings" label
  - `deck.png`, the same page as one image
- `export spec` writes a compact outline (text, components, tokens) for a build agent. `export html` writes HTML that keeps CSS custom properties.

## Images

Image urls are relative to the file that contains the node, or `aerender:<brand>/<path>` for an image in a brand folder (for example `aerender:analystengine/assets/data-centre-roof.jpg`).

`asset add <url-or-path> --scene file.scene.json` downloads the image (falling back to curl, which uses the system certificate store), checks it is a real image, and saves it in `assets/` beside the scene. It prints the url to use, and `--credit` records attribution in `assets/CREDITS.txt`. A remote `https://` url also works at render time when the server returns an image, but local assets are deterministic.
