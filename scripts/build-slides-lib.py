#!/usr/bin/env python3
"""Writes the batch ops that author brands/analystengine/slides.lib.json through the aerender CLI.

Usage: python3 scripts/build-slides-lib.py > ops.json
       (start from an empty library, then: aerender batch brands/analystengine/slides.lib.json ops.json)
Grid: 1920x1080, margins 128px left/right and 96px top/bottom, content 1664px wide.
"""
import json

T = lambda n: "$t:" + n
VARS = {
    "slide-mx": 128, "slide-my": 96, "slide-gap": 72, "slide-col-gap": 96,
    "slide-display": 132, "slide-h1": 76, "slide-h2": 56, "slide-h3": 42, "slide-statement": 100,
    "slide-lede": 38, "slide-body": 30, "slide-small": 24, "slide-eyebrow": 22, "slide-number": 168,
}


def text(id, name, content, size, weight="normal", fill=None, width="fill_container", **kw):
    n = {"id": id, "type": "text", "name": name, "content": content, "fontFamily": T("ae-font-body"), "fontSize": size,
         "fontWeight": weight, "lineHeight": T("ae-lh-body"), "fill": fill or T("ae-fg-muted")}
    if width:
        n.update(textGrowth="fixed-width", width=width)
    n.update(kw)
    return n


def eyebrow(id, content, name="Eyebrow", fill=None, width=None, **kw):
    return text(id, name, content, "$slide-eyebrow", "700", fill or T("ae-eyebrow"), width=width, textTransform="uppercase",
                letterSpacing=T("ae-tracking-eyebrow"), lineHeight=1.2, **kw)


def headline(id, content, size="$slide-h1", name="Headline", **kw):
    base = dict(fontFamily=T("ae-font-display"), lineHeight=T("ae-lh-heading"), letterSpacing=T("ae-tracking-tight"))
    base.update(kw)
    return text(id, name, content, size, "600", T("ae-fg"), **base)


def header(p, eb, hl, maxw=1500, lede=None):
    kids = [eyebrow(p + "Eb", eb), headline(p + "H", hl, maxWidth=maxw)]
    if lede:
        kids.append(text(p + "Lede", "Lede", lede, "$slide-lede", fill=T("ae-fg-muted"), maxWidth=1300, lineHeight=1.35))
    return {"id": p + "Hdr", "type": "frame", "name": "Header", "width": "fill_container", "layout": "vertical", "gap": 28, "children": kids}


def slide(id, name, col, row, children, **kw):
    n = {"id": id, "type": "frame", "name": name, "reusable": True, "slide": True, "x": col * 2020, "y": row * 1180,
         "width": 1920, "height": 1080, "clip": True, "fill": T("ae-bg"), "layout": "vertical",
         "padding": ["$slide-my", "$slide-mx"], "gap": "$slide-gap"}
    n.update(kw)
    n["children"] = children
    return n


def stroke(fill, thickness=1, align="inner"):
    return {"fill": fill, "thickness": thickness, "align": align}


def column_rule(sides=None):
    return {"stroke": stroke(T("ae-rule-strong"), sides or {"top": 1})}


# ---------- diagram kit (reusable parts, placed on a canvas with x/y) ----------
def label(id, content, size=28, weight="600", fill=None):
    return text(id, "Label", content, size, weight, fill or T("ae-fg"), textAlign="center", lineHeight=1.2)


kit = [
    {"id": "dProcess", "type": "frame", "name": "Diagram/Process", "reusable": True, "x": 0, "y": 4720, "width": 280, "height": 112,
     "fill": T("ae-bg-elev"), "stroke": stroke(T("ae-rule-strong"), 1), "cornerRadius": T("ae-r-1"), "padding": [16, 24],
     "justifyContent": "center", "alignItems": "center", "children": [label("dProcessL", "Process step")]},
    {"id": "dKey", "type": "frame", "name": "Diagram/Key step", "reusable": True, "x": 360, "y": 4720, "width": 280, "height": 112,
     "fill": T("ae-bg-elev"), "stroke": stroke(T("ae-accent"), 2), "cornerRadius": T("ae-r-1"), "padding": [16, 24],
     "justifyContent": "center", "alignItems": "center", "children": [label("dKeyL", "The step that matters")]},
    {"id": "dDecision", "type": "frame", "name": "Diagram/Decision", "reusable": True, "x": 720, "y": 4720, "width": 240, "height": 168,
     "shape": "diamond", "fill": T("ae-bg-elev"), "stroke": stroke(T("ae-rule-strong"), 1), "padding": 40,
     "justifyContent": "center", "alignItems": "center", "children": [label("dDecisionL", "Decision?", 26)]},
    {"id": "dTerminator", "type": "frame", "name": "Diagram/Terminator", "reusable": True, "x": 1040, "y": 4720, "width": 240, "height": 88,
     "shape": "pill", "fill": T("ae-bg"), "stroke": stroke(T("ae-rule-strong"), 1), "padding": [12, 28],
     "justifyContent": "center", "alignItems": "center", "children": [label("dTerminatorL", "Start", 26, "500", T("ae-fg-muted"))]},
    {"id": "dNote", "type": "frame", "name": "Diagram/Note", "reusable": True, "x": 1360, "y": 4720, "width": 300,
     "stroke": stroke(T("ae-rule-strong"), {"left": 2}), "padding": [4, 0, 4, 20],
     "layout": "vertical", "children": [text("dNoteT", "Text", "An annotation explains one point on the diagram.", 22, fill=T("ae-fg-dim"), lineHeight=1.4)]},
    {"id": "dLane", "type": "frame", "name": "Diagram/Lane", "reusable": True, "x": 1740, "y": 4720, "width": 900, "height": 300,
     "fill": T("ae-bg-section"), "stroke": stroke(T("ae-rule"), 1), "cornerRadius": T("ae-r-2"), "padding": 24,
     "layout": "vertical", "gap": 16, "children": [
         eyebrow("dLaneEb", "Lane name", fill=T("ae-fg-dim")),
         {"id": "dLaneC", "type": "frame", "name": "Lane content", "slot": ["dProcess", "dDecision", "dTerminator", "dNote"],
          "width": "fill_container", "height": "fill_container", "layout": "none", "children": []}]},
]


def inst(id, ref, name, x, y, content, w=None, h=None):
    lab = {"dProcess": "dProcessL", "dKey": "dKeyL", "dDecision": "dDecisionL", "dTerminator": "dTerminatorL"}[ref]
    n = {"id": id, "type": "ref", "ref": ref, "name": name, "x": x, "y": y + 56, "descendants": {lab: {"content": content}}}
    if w: n["width"] = w
    if h: n["height"] = h
    return n


def conn(id, a, b, **kw):
    return {"id": id, "type": "connector", "from": a, "to": b, "route": "elbow", "stroke": stroke(T("ae-fg-dim"), 1.5, "center"),
            "fontFamily": T("ae-font-body"), "fontSize": 22, "labelFill": T("ae-fg-muted"), **kw}


flow = [
    inst("gReq", "dTerminator", "Request", 0, 272, "Request"),
    inst("gTri", "dProcess", "Triage", 320, 260, "Triage"),
    inst("gDec", "dDecision", "Decision", 700, 232, "Acceptable risk?"),
    inst("gApp", "dKey", "Approve", 1040, 84, "Approve with conditions"),
    inst("gRej", "dProcess", "Reject", 1040, 436, "Reject with reason"),
    inst("gMon", "dProcess", "Monitor", 1384, 84, "Monitor in use"),
    {"id": "gNote", "type": "ref", "ref": "dNote", "name": "Note", "x": 1384, "y": 492, "width": 280,
     "descendants": {"dNoteT": {"content": "Every rejection names an approved alternative."}}},
    conn("gc1", "Request", "Triage"), conn("gc2", "Triage", "Decision"),
    conn("gc3", "Decision", "Approve", fromSide="top", toSide="left", label="Yes"),
    conn("gc4", "Decision", "Reject", fromSide="bottom", toSide="left", label="No"),
    conn("gc5", "Approve", "Monitor"),
    conn("gc6", "Monitor", "Triage", fromSide="top", toSide="top", dash="8 8", label="Re-review each quarter"),
]

# ---------- slide layouts ----------
title = slide("sTitle", "Slide/Title", 0, 0, [
    text("sTitleMark", "Wordmark", "AnalystEngine", 30, "800", T("ae-fg"), width=None, letterSpacing="-0.03em", lineHeight=1),
    {"id": "sTitleBlock", "type": "frame", "name": "Title block", "width": "fill_container", "layout": "vertical", "gap": 40, "children": [
        eyebrow("sTitleEb", "Northbridge Building Society · Board risk committee"),
        headline("sTitleH", "AI security readiness", "$slide-display", lineHeight=T("ae-lh-display"), letterSpacing=T("ae-tracking-display"), maxWidth=1500),
        text("sTitleSub", "Subtitle", "Findings and recommendations from a six-week review", "$slide-lede", fill=T("ae-fg-muted"), maxWidth=1300, lineHeight=1.3),
        {"id": "sTitleMeta", "type": "frame", "name": "Meta", "gap": 56, "padding": [24, 0, 0, 0], "children": [
            eyebrow("sTitleDate", "17 October 2026", name="Date"),
            eyebrow("sTitleAud", "Board and executive", name="Audience"),
            eyebrow("sTitleConf", "Confidential", name="Classification", fill=T("ae-accent"))]}]}],
    justifyContent="space_between")

section = slide("sSection", "Slide/Section", 1, 0, [
    text("sSecNum", "Number", "02", "$slide-number", "700", T("ae-accent"), width=None, fontFamily=T("ae-font-display"),
         lineHeight=0.9, letterSpacing=T("ae-tracking-display")),
    {"id": "sSecBlock", "type": "frame", "name": "Section block", "width": "fill_container", "layout": "vertical", "gap": 36, "children": [
        headline("sSecH", "Shadow AI and data exposure", 104, maxWidth=1500, name="Title", lineHeight=T("ae-lh-display"), letterSpacing=T("ae-tracking-display")),
        text("sSecLede", "Lede", "Where staff use AI today, and what leaves the building with it.", "$slide-lede", fill=T("ae-fg-muted"), maxWidth=1200, lineHeight=1.3),
        text("sSecContents", "Contents", "Current state  ·  Cause  ·  Plan  ·  Timeline", "$slide-small", fill=T("ae-fg-dim"))]}],
    justifyContent="space_between")

split = slide("sSplit", "Slide/Headline Body", 0, 1, [
    header("sSplit", "Key finding", "Most AI use bypasses the controls you already run"),
    {"id": "sSplitRow", "type": "frame", "name": "Body 60/40", "width": "fill_container", "height": "fill_container", "gap": "$slide-col-gap", "padding": [0, 0, 24, 0], "children": [
        {"id": "sSplitL", "type": "frame", "name": "Narrative 60", "width": 941, "layout": "vertical", "gap": 32, "children": [
            text("sSplitLede", "Lede", "Staff in four of six departments use generative AI every week. Few of those tools went through procurement or security review.",
                 44, fill=T("ae-fg"), lineHeight=1.3),
            text("sSplitBody", "Body", "The acceptable use policy predates these tools and does not name them. Data loss rules do not inspect prompts, so member data leaves without a record.",
                 32, lineHeight=1.5)]},
        {"id": "sSplitR", "type": "frame", "name": "Evidence 40", "width": "fill_container", "height": "fill_container", "layout": "vertical", "gap": 32, "padding": 48, "justifyContent": "space_between",
         "fill": T("ae-bg-elev"), "stroke": stroke(T("ae-rule"), 1), "cornerRadius": T("ae-r-2"), "children": [
            eyebrow("sSplitEvEb", "Evidence"),
            text("sSplitEv1", "Fact 1", "14 AI tools found in proxy logs; 11 never reviewed.", 36, fill=T("ae-fg"), lineHeight=1.3),
            text("sSplitEv2", "Fact 2", "38% of 400 sampled prompts held member data.", 36, fill=T("ae-fg"), lineHeight=1.3),
            text("sSplitEv3", "Source", "Source: proxy logs and prompt sample, September 2026.", "$slide-small", fill=T("ae-fg-dim"), lineHeight=1.4)]}]}])

def action(i, act, why, meta, last=False):
    p = f"sList{i}"
    return {"id": p, "type": "frame", "name": f"Action {i}", "width": "fill_container", "height": "fill_container", "alignItems": "center", "gap": 40,
            "padding": [24, 0], **column_rule({"top": 1, "bottom": 1} if last else {"top": 1}), "children": [
        text(p + "N", "Number", f"{i:02d}", 40, "600", T("ae-fg-dim"), width=88, lineHeight=1.2, fontFamily=T("ae-font-display")),
        {"id": p + "T", "type": "frame", "name": "Text", "width": "fill_container", "layout": "vertical", "gap": 8, "children": [
            text(p + "A", "Action", act, 40, "600", T("ae-fg"), lineHeight=1.2, fontFamily=T("ae-font-display")),
            text(p + "W", "Reason", why, 26, fill=T("ae-fg-muted"), lineHeight=1.4)]},
        text(p + "M", "Owner and date", meta, "$slide-small", fill=T("ae-fg-muted"), width=380, textAlign="right", lineHeight=1.3)]}

listing = slide("sList", "Slide/Numbered Actions", 1, 1, [
    header("sList", "Recommendation", "Four actions close the largest gaps by March"),
    {"id": "sListRows", "type": "frame", "name": "Actions", "width": "fill_container", "height": "fill_container", "layout": "vertical", "children": [
        action(1, "Name an executive owner for AI risk", "Decisions about AI stop falling between three functions.", "Board · November 2026"),
        action(2, "Route every AI tool through one review", "New tools reach staff only after security and data checks.", "CISO · December 2026"),
        action(3, "Inspect prompts with data loss rules", "Member data in prompts is blocked or logged, not lost.", "Security operations · January 2027"),
        action(4, "Re-assess against ISO/IEC 42001", "An outside view confirms the controls hold.", "Internal audit · March 2027", last=True)]}])

def claim_col(p, eb, cl, body, size):
    return {"id": p, "type": "frame", "name": "Column", "width": "fill_container", "layout": "vertical", "gap": 28,
            "padding": [36, 0, 0, 0], **column_rule(), "children": [
                eyebrow(p + "Eb", eb), headline(p + "C", cl, size, name="Claim", lineHeight=1.12),
                text(p + "B", "Body", body, 32, lineHeight=1.45)]}


def bottom(id, row):
    """Holds a content row on the bottom margin, leaving the space under the header as breathing room."""
    return {"id": id, "type": "frame", "name": "Content", "width": "fill_container", "height": "fill_container", "layout": "vertical",
            "justifyContent": "end", "children": [row]}


three = slide("sThree", "Slide/Three Claims", 0, 2, [
    header("sThree", "What we found", "Three gaps carry most of the risk",
           lede="Each one is fixable with controls Northbridge already owns; none needs a new platform."),
    bottom("sThreeB", {"id": "sThreeRow", "type": "frame", "name": "Columns", "width": "fill_container", "gap": 72, "children": [
        claim_col("sCol1", "01 · Shadow AI", "11 of 14 tools in use were never reviewed", "Staff adopted them faster than procurement could respond, mostly through browser extensions.", 52),
        claim_col("sCol2", "02 · Data exposure", "Member data appears in prompts", "38% of 400 sampled prompts held names, account numbers or addresses.", 52),
        claim_col("sCol3", "03 · Ownership", "No one owns AI risk at board level", "Decisions fall between IT, data protection and risk, so none of them is made.", 52)]})])

two = slide("sTwo", "Slide/Two Claims", 1, 2, [
    header("sTwo", "What this means", "Two decisions shape the next six months",
           lede="Both sit with the board; the rest of the programme follows from them."),
    bottom("sTwoB", {"id": "sTwoRow", "type": "frame", "name": "Columns", "width": "fill_container", "gap": "$slide-col-gap", "children": [
        claim_col("sTwo1", "Decision 1", "Approve tools centrally, not team by team", "One review gate costs less than eleven separate exceptions and closes the shadow AI gap.", 64),
        claim_col("sTwo2", "Decision 2", "Fund prompt inspection this financial year", "Existing data loss tooling covers it with a licence change; no new platform is needed.", 64)]})])

quote = slide("sQuote", "Slide/Statement", 0, 3, [
    eyebrow("sQuoteEb", "In one sentence"),
    headline("sQuoteH", "Northbridge can keep using AI safely if it reviews tools before staff adopt them.", "$slide-statement",
             maxWidth=1560, name="Statement", lineHeight=1.06, letterSpacing=T("ae-tracking-display")),
    text("sQuoteAttr", "Attribution", "Summary of findings, section 2", "$slide-body", fill=T("ae-fg-dim"))],
    justifyContent="center", gap=48)

image = slide("sImage", "Slide/Image Text", 1, 3, [
    {"id": "sImg", "type": "frame", "name": "Image 60", "width": 1152, "height": "fill_container", "imageFilter": "mono",
     "fill": {"type": "image", "url": "./assets/editorial-placeholder.jpg", "mode": "fill"}},
    {"id": "sImgText", "type": "frame", "name": "Text 40", "width": "fill_container", "height": "fill_container", "layout": "vertical",
     "padding": ["$slide-my", "$slide-mx", "$slide-my", 96], "justifyContent": "space_between", "children": [
        {"id": "sImgTop", "type": "frame", "name": "Copy", "width": "fill_container", "layout": "vertical", "gap": 28, "children": [
            eyebrow("sImgEb", "Context"),
            headline("sImgH", "AI arrived through everyday tools", 68),
            text("sImgB", "Body", "Most use came through browser extensions and features switched on in software Northbridge already licenses.", 34, lineHeight=1.45),
            text("sImgB2", "Body 2", "No one decided to adopt AI. It was already there.", 34, fill=T("ae-fg"), lineHeight=1.45)]},
        text("sImgCredit", "Credit", "Photo: placeholder", 18, fill=T("ae-fg-dim"), lineHeight=1.3)]}],
    layout="horizontal", padding=0, gap=0)

diagram = slide("sDiagram", "Slide/Diagram", 0, 4, [
    header("sDiagram", "Proposed process", "One review gate for every new AI tool"),
    {"id": "sDiagCanvas", "type": "frame", "name": "Canvas", "slot": ["dProcess", "dKey", "dDecision", "dTerminator", "dNote", "dLane"],
     "width": "fill_container", "height": "fill_container", "layout": "none", "children": flow}])

def row(p, cells, head=False, last=False):
    widths = [360, "fill_container", "fill_container", 220]
    kids = []
    for i, c in enumerate(cells):
        w = widths[i]
        if head:
            kids.append(eyebrow(f"{p}c{i}", c, name="Cell", width=w))
        else:
            fill = T("ae-fg") if i in (0, 3) else T("ae-fg-muted")
            kids.append(text(f"{p}c{i}", "Cell", c, 32, "600" if i in (0, 3) else "normal", fill, width=w, lineHeight=1.35))
    sw = {"top": 1, "bottom": 1} if last else {"top": 1}
    return {"id": p, "type": "frame", "name": "Header row" if head else "Row", "width": "fill_container", "gap": 48, "alignItems": "center",
            **({} if head else {"height": "fill_container"}),
            "padding": [20 if head else 26, 0], **({} if head else column_rule(sw)), "children": kids}

table = slide("sTable", "Slide/Comparison", 1, 4, [
    header("sTable", "Where Northbridge stands", "Gaps are widest where AI meets member data"),
    {"id": "sTableT", "type": "frame", "name": "Table", "width": "fill_container", "height": "fill_container", "layout": "vertical", "padding": [0, 0, 24, 0], "children": [
        row("sTr0", ["Area", "Today", "Expected by regulators", "Gap"], head=True),
        row("sTr1", ["Tool approval", "Teams adopt tools directly", "Central review before use", "High"]),
        row("sTr2", ["Data protection", "Prompts are not inspected", "Member data blocked or logged", "High"]),
        row("sTr3", ["Ownership", "Split across three functions", "Named executive owner", "Medium"]),
        row("sTr4", ["Supplier checks", "Generic IT questionnaire", "AI-specific due diligence", "Medium"], last=True)]}])

slides = [title, section, split, listing, three, two, quote, image, diagram, table]
ops = [{"op": "set", "path": "@vars", "props": VARS}]
ops += [{"op": "insert", "parent": "/", "node": n} for n in kit + slides]
print(json.dumps(ops, indent=1))
