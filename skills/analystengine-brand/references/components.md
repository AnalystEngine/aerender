# AnalystEngine component and template catalogue

Ids to use in `ref`, and the descendant keys to override (with the import prefix shown). `aerender tree aerender:analystengine/<library> --depth 1` lists the same ids.

## `aerender:analystengine/ui` (prefix `ui`)

| Component | Id | Override |
|---|---|---|
| Sidebar (header, `Content` and `Footer` slots) | `uSidebar` | insert nav refs into `Sidebar/Content` |
| Nav item, default / active | `uNavItem` / `uNavItemActive` | `ui:uNavItemL` label, `ui:uNavItemI` icon (`...ActiveL`, `...ActiveI` for active) |
| Nav section title | `uNavSection` | `ui:uNavSectionL` |
| Top bar with search and avatar | `uTopBar` | `ui:uTopBarSP` placeholder, `ui:uTopBarA/ui:uAvatarT` initials |
| Breadcrumb | `uBreadcrumb` | `ui:uBreadcrumb1`, `ui:uBreadcrumb2` |
| Page header (`Actions` slot) | `uPageHeader` | `ui:uPageHeaderH` title, `ui:uPageHeaderD` description |
| Buttons | `uBtnPrimary` (accent), `uBtnSecondary`, `uBtnGhost`, `uBtnIcon` | `ui:uBtnPrimaryL` label, `ui:uBtnPrimaryI` icon, likewise for the others |
| Input with label | `uInput` | `ui:uInputL` label, `ui:uInputV` value |
| Status chips | `uChipPositive`, `uChipWarning`, `uChipNegative`, `uChipInfo`, `uChipNeutral` | `ui:uChipPositiveL` and so on |
| KPI card | `uKpi` | `ui:uKpiH` heading, `ui:uKpiV` value, `ui:uKpiD` detail |
| Card (`Body` slot) | `uCard` | `ui:uCardH`, `ui:uCardT`, `ui:uCardX` |
| Table (slot), header row, row | `uTable`, `uTableHead`, `uTableRow` | cells `ui:uTrClientL`, `ui:uTrTypeL`, `ui:uTrOwnerL`, `ui:uTrDueL`; swap the chip with `"ui:uTrChip": {"type":"ref","ref":"ui:uChipPositive"}` |
| Pagination | `uPagination` | `ui:uPagS` summary |
| Avatar | `uAvatar` | `ui:uAvatarT` initials |

`examples/dashboard/dashboard.scene.json` composes these into a full 1440x900 screen.

## `aerender:analystengine/assets` (prefix `a`)

| Template | Id | Size | Override |
|---|---|---|---|
| Social card | `aSocial` | 1200x630 | `a:aSocialEbE` label, `a:aSocialH` headline, `a:aSocialSub` subtitle, `a:aSocialImg` photo fill |
| LinkedIn square | `aSquare` | 1080x1080 | `a:aSquareEbE`, `a:aSquareH`, `a:aSquareMeta`, `a:aSquareImg` |
| A4 report cover | `aCover` | 794x1123 | `a:aCoverEb`, `a:aCoverH`, `a:aCoverSub`, `a:aCoverDate`, `a:aCoverConf`, `a:aCoverImg` |
| A4 one-pager | `aOnePager` | 794x1123 | `a:aOpH` headline, `a:aOpLede`, `a:aOpKeyT` key finding, `a:aOpF1`–`a:aOpF3` findings, `a:aOpR1T`–`a:aOpR4T` actions, table cells `a:aOpEv1c0` ..., band `a:aOpBand1`–`a:aOpBand3` |
| Web hero | `aHero` | 1440x720 | `a:aHeroEb`, `a:aHeroH`, `a:aHeroSub`, `a:aHeroPL` / `a:aHeroSL` button labels, `a:aHeroImg` |

The photo frames use `"imageFilter": "mono"` and default to `aerender:analystengine/assets/data-centre-roof.jpg`. To change a photo, override its fill: `"a:aSocialImg": {"fill": {"type":"image","url":"./assets/photo.jpg","mode":"fill"}}`.

## `aerender:analystengine/slides` (prefix `s`)

| Ref | Layout | Use it for |
|---|---|---|
| `s:sTitle` | Title, anchored low-left | Cover: title, subtitle, date, audience, classification |
| `s:sSection` | Section divider | A workstream break: number, title, one-line lede |
| `s:sSplit` | Headline + body, 60/40 | One finding with narrative and an evidence panel |
| `s:sList` | Numbered actions | Recommendations with a reason, owner and date each |
| `s:sThree` / `s:sTwo` | Three or two claims | Parallel findings or decisions |
| `s:sQuote` | Statement | One sentence that must land |
| `s:sImage` | Image + text, 60/40 | Context with a photograph |
| `s:sDiagram` | Headline + canvas | A process or flow (the `Canvas` is a slot) |
| `s:sTable` | Comparison | Current state against expected |

Set slide text by name path: `aerender set deck.scene.json "Findings/Column[0]/Claim" content="..."`. Render with `--deck`.

Diagram kit, for `s:sDiagram` canvases or any `layout:"none"` frame:

| Part | Ref | Label key |
|---|---|---|
| Process box | `s:dProcess` | `s:dProcessL` |
| Key step (accent border) | `s:dKey` | `s:dKeyL` |
| Decision (diamond) | `s:dDecision` | `s:dDecisionL` |
| Terminator (pill) | `s:dTerminator` | `s:dTerminatorL` |
| Note | `s:dNote` | `s:dNoteT` |
| Lane | `s:dLane` | slot `s:dLaneC` |

`examples/flow/flow.scene.json` and the `Proposed review` slide in `examples/deck/deck.scene.json` show complete flows.
