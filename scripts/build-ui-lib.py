#!/usr/bin/env python3
"""Writes the batch ops that author brands/analystengine/ui.lib.json through the aerender CLI.

Usage: python3 scripts/build-ui-lib.py > ops.json
       (start from an empty library, then: aerender batch brands/analystengine/ui.lib.json ops.json)
Every value binds to the AnalystEngine tokens (prefix t). Accent appears only on the
primary button and the active navigation bar.
"""
import json

T = lambda n: "$t:ae-" + n
FONT = T("font-body")


def text(id, name, content, size=T("fs-small"), weight="normal", fill=T("fg"), **kw):
    n = {"id": id, "type": "text", "name": name, "content": content, "fontFamily": FONT, "fontSize": size,
         "fontWeight": weight, "lineHeight": T("lh-body"), "fill": fill}
    n.update(kw)
    return n


def eyebrow(id, content, name="Eyebrow", size=T("fs-eyebrow"), fill=T("eyebrow")):
    return text(id, name, content, size, "700", fill, letterSpacing=T("tracking-eyebrow"), textTransform="uppercase")


def icon(id, name, glyph, size=16, fill=T("fg")):
    return {"id": id, "type": "icon", "name": name, "icon": glyph, "library": "lucide", "width": size, "height": size,
            "lineWidth": 1.5, "fill": fill}


def rule(sides):
    return {"stroke": stroke(T("rule"), sides)}


def stroke(fill, thickness=1, align="inner"):
    return {"fill": fill, "thickness": thickness, "align": align}


def comp(id, name, col, row, node):
    node.update(id=id, name=name, reusable=True, x=col * 520, y=row * 240)
    return node


def frame(**kw):
    n = {"type": "frame"}
    n.update(kw)
    return n


def ref(id, r, name, **kw):
    n = {"id": id, "type": "ref", "ref": r, "name": name}
    n.update(kw)
    return n


lib = []

# ---------- primitives ----------
lib.append(comp("uAvatar", "Avatar", 0, 0, frame(width=32, height=32, fill=T("bg-elev"), cornerRadius=T("r-2"), **rule(1),
    justifyContent="center", alignItems="center", children=[text("uAvatarT", "Initials", "AM", T("fs-micro"), "600")])))

def button(id, name, col, label, glyph, fill=None, fg=T("fg"), weight="500", border=None):
    n = frame(cornerRadius=T("r-1"), gap=T("s-2"), padding=[T("s-2"), T("s-4")], alignItems="center",
              children=[icon(id + "I", "Icon", glyph, 16, fg), text(id + "L", "Label", label, T("fs-small"), weight, fg)])
    if fill: n["fill"] = fill
    if border: n.update(stroke=stroke(border, 1))
    return comp(id, name, col, 1, n)

lib.append(button("uBtnPrimary", "Button/Primary", 0, "New engagement", "plus", fill=T("accent"), fg=T("bg"), weight="600"))
lib.append(button("uBtnSecondary", "Button/Secondary", 1, "Export", "download", border=T("rule-strong")))
lib.append(button("uBtnGhost", "Button/Ghost", 2, "View all", "arrow-right", fg=T("fg-muted")))
lib.append(comp("uBtnIcon", "Button/Icon", 3, 1, frame(width=32, height=32, cornerRadius=T("r-1"), stroke=stroke(T("rule-strong"), 1), justifyContent="center", alignItems="center", children=[icon("uBtnIconI", "Icon", "ellipsis", 16, T("fg-muted"))])))

def chip(id, name, col, label, colour):
    return comp(id, name, col, 2, frame(cornerRadius=T("r-pill"), stroke=stroke(colour, 1),
        gap=T("s-2"), padding=[T("s-1"), T("s-3")], alignItems="center", children=[
            {"id": id + "D", "type": "ellipse", "name": "Dot", "width": 8, "height": 8, "fill": colour},
            eyebrow(id + "L", label, "Label", T("fs-micro"), colour)]))

lib.append(chip("uChipPositive", "Status/Positive", 0, "On track", T("success")))
lib.append(chip("uChipWarning", "Status/Warning", 1, "At risk", T("warning")))
lib.append(chip("uChipNegative", "Status/Negative", 2, "Overdue", T("danger")))
lib.append(chip("uChipInfo", "Status/Info", 3, "In review", T("info")))
lib.append(chip("uChipNeutral", "Status/Neutral", 4, "Scoping", T("fg-dim")))

lib.append(comp("uInput", "Input", 0, 3, frame(width=280, layout="vertical", gap=T("s-2"), children=[
    text("uInputL", "Label", "Client name", T("fs-small"), "500", T("fg-muted")),
    frame(id="uInputF", name="Field", width="fill_container", fill=T("bg-sunken"), cornerRadius=T("r-1"), **rule(1),
          gap=T("s-2"), padding=[T("s-2"), T("s-3")], alignItems="center", children=[
              icon("uInputI", "Icon", "search", 16, T("fg-dim")),
              text("uInputV", "Value", "Search clients", fill=T("fg-dim"), textGrowth="fixed-width", width="fill_container")])])))

# ---------- navigation ----------
def nav(id, name, col, label, glyph, active=False):
    n = frame(width=240, cornerRadius=T("r-1"), gap=T("s-3"), padding=[T("s-2"), T("s-3")], alignItems="center", children=[
        icon(id + "I", "Icon", glyph, 20, T("fg") if active else T("fg-muted")),
        text(id + "L", "Label", label, T("fs-small"), "600" if active else "500", T("fg") if active else T("fg-muted"))])
    if active:
        n.update(fill=T("bg-elev"), stroke=stroke(T("accent"), {"left": 2}))
    return comp(id, name, col, 4, n)

lib.append(nav("uNavItem", "Nav Item/Default", 0, "Overview", "layout-dashboard"))
lib.append(nav("uNavItemActive", "Nav Item/Active", 1, "Engagements", "briefcase", True))
lib.append(comp("uNavSection", "Nav Section Title", 2, 4, frame(width=240, padding=[0, T("s-3"), T("s-2"), T("s-3")],
    children=[eyebrow("uNavSectionL", "Delivery", "Label")])))
lib.append(comp("uSidebarHeader", "Sidebar Header", 3, 4, frame(width=256, height=56, padding=[0, T("s-5")], alignItems="center",
    **rule({"bottom": 1}), children=[text("uSidebarHeaderW", "Wordmark", "AnalystEngine", T("fs-h4"), "800", letterSpacing="-0.03em")])))

lib.append(comp("uSidebar", "Sidebar", 0, 5, frame(width=256, height=900, fill=T("bg"), layout="vertical", **rule({"right": 1}), children=[
    ref("uSidebarH", "uSidebarHeader", "Header", width="fill_container"),
    frame(id="uSidebarC", name="Content", slot=["uNavSection", "uNavItem", "uNavItemActive"], width="fill_container", height="fill_container",
          layout="vertical", gap=T("s-1"), padding=[T("s-5"), T("s-3")], children=[
              ref("uSidebarS1", "uNavSection", "Section", width="fill_container"),
              ref("uSidebarN1", "uNavItem", "Nav 1", width="fill_container"),
              ref("uSidebarN2", "uNavItemActive", "Nav 2", width="fill_container")]),
    frame(id="uSidebarF", name="Footer", slot=["uNavItem"], width="fill_container", layout="vertical", padding=T("s-3"), **rule({"top": 1}), children=[
        ref("uSidebarFN", "uNavItem", "Settings", width="fill_container", descendants={"uNavItemI": {"icon": "settings"}, "uNavItemL": {"content": "Settings"}})])])))

lib.append(comp("uTopBar", "Top Bar", 1, 5, frame(width=1184, height=56, fill=T("bg"), gap=T("s-4"), padding=[0, T("s-5")], alignItems="center",
    **rule({"bottom": 1}), children=[
        icon("uTopBarT", "Sidebar Trigger", "panel-left", 20, T("fg-muted")),
        frame(id="uTopBarSp", name="Spacer", width="fill_container", height=4),
        frame(id="uTopBarS", name="Search", width=240, fill=T("bg-sunken"), cornerRadius=T("r-1"), **rule(1), gap=T("s-2"),
              padding=[T("s-1"), T("s-3")], alignItems="center", children=[
                  icon("uTopBarSI", "Icon", "search", 16, T("fg-dim")),
                  text("uTopBarSP", "Placeholder", "Search or jump to", fill=T("fg-dim"), textGrowth="fixed-width", width="fill_container"),
                  text("uTopBarSK", "Shortcut", "⌘K", T("fs-micro"), fill=T("fg-dim"), fontFamily=T("font-mono"))]),
        icon("uTopBarN", "Notifications", "bell", 20, T("fg-muted")),
        ref("uTopBarA", "uAvatar", "Avatar")])))

lib.append(comp("uBreadcrumb", "Breadcrumb", 0, 6, frame(gap=T("s-3"), alignItems="center", children=[
    eyebrow("uBreadcrumb1", "Delivery", "Parent"),
    icon("uBreadcrumbI", "Separator", "chevron-right", 14, T("fg-dim")),
    eyebrow("uBreadcrumb2", "Client engagements", "Current", fill=T("fg-muted"))])))

lib.append(comp("uPageHeader", "Page Header", 1, 6, frame(width=1120, layout="vertical", gap=T("s-3"), children=[
    ref("uPageHeaderB", "uBreadcrumb", "Breadcrumb"),
    frame(id="uPageHeaderR", name="Title row", width="fill_container", justifyContent="space_between", alignItems="end", children=[
        frame(id="uPageHeaderT", name="Text", layout="vertical", gap=T("s-2"), children=[
            text("uPageHeaderH", "Title", "Client engagements", T("fs-h2"), "600", lineHeight=T("lh-heading"), letterSpacing=T("tracking-tight")),
            text("uPageHeaderD", "Description", "Live delivery across security and AI advisory clients.", T("fs-body"), fill=T("fg-muted"))]),
        frame(id="uPageHeaderA", name="Actions", slot=["uBtnPrimary", "uBtnSecondary", "uBtnGhost"], gap=T("s-3"), alignItems="center",
              children=[ref("uPageHeaderP", "uBtnPrimary", "Primary action")])])])))

# ---------- content ----------
card_body = dict(fill=T("bg-elev"), cornerRadius=T("r-2"), stroke=stroke(T("rule"), 1),
                 effect=[{"type": "shadow", "shadowType": "inner", "color": T("shadow-1-inner-color"), "offset": {"x": 0, "y": 1}, "blur": 0},
                         {"type": "shadow", "shadowType": "outer", "color": T("shadow-1-outer-color"), "offset": {"x": 0, "y": 2}, "blur": 8}])

lib.append(comp("uKpi", "KPI Card", 0, 7, frame(width=320, layout="vertical", gap=T("s-3"), children=[
    eyebrow("uKpiH", "Active engagements", "Heading"),
    frame(id="uKpiB", name="Body", width="fill_container", layout="vertical", gap=T("s-2"), padding=T("s-5"), **card_body, children=[
        text("uKpiV", "Value", "14", T("fs-h2"), "600", lineHeight=T("lh-heading"), letterSpacing=T("tracking-tight")),
        text("uKpiD", "Detail", "2 more than September", fill=T("fg-dim"))])])))

lib.append(comp("uCard", "Card", 1, 7, frame(width=360, layout="vertical", gap=T("s-3"), children=[
    eyebrow("uCardH", "Card heading", "Heading"),
    frame(id="uCardB", name="Body", slot=[], width="fill_container", layout="vertical", gap=T("s-2"), padding=T("s-5"), **card_body, children=[
        text("uCardT", "Title", "Card title", T("fs-h4"), "600"),
        text("uCardX", "Text", "One short paragraph of supporting text.", fill=T("fg-muted"), textGrowth="fixed-width", width="fill_container")])])))

COLS = [("Client", "fill_container"), ("Type", "fill_container"), ("Status", 160), ("Owner", 160), ("Due", 128)]

def head_row():
    return frame(width=1120, gap=T("s-4"), padding=[T("s-3"), T("s-5")], alignItems="center", **rule({"bottom": 1}), children=[
        frame(id=f"uTh{c}", name=f"Cell {c}", width=w, children=[eyebrow(f"uTh{c}L", c, "Label", T("fs-micro"))]) for c, w in COLS])

def body_row():
    cells = []
    for c, w in COLS:
        if c == "Status":
            kid = ref("uTrChip", "uChipNeutral", "Status")
        else:
            kid = text(f"uTr{c}L", "Value", {"Client": "Client name", "Type": "Engagement type", "Owner": "Owner name", "Due": "1 Jan 2027"}[c],
                       T("fs-small"), "500" if c == "Client" else "normal", T("fg") if c == "Client" else T("fg-muted"))
        cells.append(frame(id=f"uTr{c}", name=f"Cell {c}", width=w, alignItems="center", children=[kid]))
    return frame(width=1120, gap=T("s-4"), padding=[T("s-3"), T("s-5")], alignItems="center", **rule({"bottom": 1}), children=cells)

lib.append(comp("uTableHead", "Table/Header Row", 0, 8, head_row()))
lib.append(comp("uTableRow", "Table/Row", 0, 9, body_row()))
lib.append(comp("uTable", "Table", 0, 10, frame(width=1120, layout="vertical", fill=T("bg-elev"), cornerRadius=T("r-2"), stroke=stroke(T("rule")),
    clip=True, slot=["uTableHead", "uTableRow"], children=[
        ref("uTableH", "uTableHead", "Header", width="fill_container"),
        ref("uTableR1", "uTableRow", "Row 1", width="fill_container")])))

def page(id, label, active=False):
    n = frame(id=id, name=f"Page {label}", width=32, height=32, cornerRadius=T("r-1"), justifyContent="center", alignItems="center",
              children=[text(id + "L", "Label", label, T("fs-small"), "600" if active else "normal", T("fg") if active else T("fg-muted"))])
    if active:
        n.update(fill=T("bg-elev"), stroke=stroke(T("rule-strong"), 1))
    return n

lib.append(comp("uPagination", "Pagination", 0, 11, frame(width=1120, gap=T("s-2"), alignItems="center", children=[
    text("uPagS", "Summary", "Showing 1 to 5 of 14", fill=T("fg-dim")),
    frame(id="uPagSp", name="Spacer", width="fill_container", height=4),
    ref("uPagPrev", "uBtnIcon", "Previous", descendants={"uBtnIconI": {"icon": "chevron-left"}}),
    page("uPag1", "1", True), page("uPag2", "2"), page("uPag3", "3"),
    ref("uPagNext", "uBtnIcon", "Next", descendants={"uBtnIconI": {"icon": "chevron-right"}})])))

ops = [{"op": "insert", "parent": "/", "node": n} for n in lib]
print(json.dumps(ops, indent=1))
