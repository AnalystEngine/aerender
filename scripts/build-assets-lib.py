#!/usr/bin/env python3
"""Writes the batch ops that author brands/analystengine/assets.lib.json through the aerender CLI.

Usage: python3 scripts/build-assets-lib.py > ops.json
       (start from an empty library, then: aerender batch brands/analystengine/assets.lib.json ops.json)
Templates: social card 1200x630, LinkedIn square 1080x1080, A4 report cover and A4 one-pager
(794x1123, A4 at 96 dpi) and web hero 1440x720. One accent per template.
"""
import json

T = lambda n: "$t:ae-" + n
PHOTO = {"type": "image", "url": "./assets/data-centre-roof.jpg", "mode": "fill"}


def text(id, name, content, size, weight="normal", fill=T("fg"), width="fill_container", **kw):
    n = {"id": id, "type": "text", "name": name, "content": content, "fontFamily": T("font-body"), "fontSize": size,
         "fontWeight": weight, "lineHeight": T("lh-body"), "fill": fill}
    if width:
        n.update(textGrowth="fixed-width", width=width)
    n.update(kw)
    return n


def eyebrow(id, content, size=16, fill=T("eyebrow"), name="Eyebrow"):
    return text(id, name, content, size, "700", fill, width=None, textTransform="uppercase", letterSpacing=T("tracking-eyebrow"), lineHeight=1.2)


def headline(id, content, size, name="Headline", **kw):
    base = dict(fontFamily=T("font-display"), lineHeight=T("lh-heading"), letterSpacing=T("tracking-tight"))
    base.update(kw)
    return text(id, name, content, size, "600", T("fg"), **base)


def wordmark(id, size):
    return text(id, "Wordmark", "AnalystEngine", size, "800", T("fg"), width=None, letterSpacing="-0.03em", lineHeight=1)


def marker_row(id, label, size):
    return {"id": id, "type": "frame", "name": "Marker row", "gap": 14, "alignItems": "center", "children": [
        {"id": id + "M", "type": "frame", "name": "Live marker", "width": 10, "height": 10, "fill": T("accent")},
        eyebrow(id + "E", label, size)]}


def template(id, name, x, y, w, h, children, **kw):
    n = {"id": id, "type": "frame", "name": name, "reusable": True, "x": x, "y": y, "width": w, "height": h, "clip": True,
         "fill": T("bg"), "layout": "vertical"}
    n.update(kw)
    n["children"] = children
    return n


def photo(id, name, w, h, **kw):
    n = {"id": id, "type": "frame", "name": name, "width": w, "height": h, "imageFilter": "mono", "fill": PHOTO}
    n.update(kw)
    return n


social = template("aSocial", "Social card", 0, 0, 1200, 630, [
    {"id": "aSocialText", "type": "frame", "name": "Text", "width": "fill_container", "height": "fill_container", "layout": "vertical",
     "padding": 64, "justifyContent": "space_between", "children": [
        wordmark("aSocialW", 26),
        {"id": "aSocialBlock", "type": "frame", "name": "Message", "width": "fill_container", "layout": "vertical", "gap": 24, "children": [
            marker_row("aSocialEb", "Research note", 16),
            headline("aSocialH", "Review AI tools before staff adopt them", 58),
            text("aSocialSub", "Subtitle", "What a six-week review of one building society found.", 24, fill=T("fg-muted"), lineHeight=1.35)]}]},
    photo("aSocialImg", "Photo", 400, "fill_container")], layout="horizontal")

square = template("aSquare", "LinkedIn square", 1300, 0, 1080, 1080, [
    photo("aSquareImg", "Photo", "fill_container", 400),
    {"id": "aSquareText", "type": "frame", "name": "Text", "width": "fill_container", "height": "fill_container", "layout": "vertical",
     "padding": [64, 80, 72, 80], "justifyContent": "space_between", "children": [
        {"id": "aSquareBlock", "type": "frame", "name": "Message", "width": "fill_container", "layout": "vertical", "gap": 28, "children": [
            marker_row("aSquareEb", "Briefing", 18),
            headline("aSquareH", "Most AI use bypasses the controls you already run", 64)]},
        {"id": "aSquareFoot", "type": "frame", "name": "Footer", "width": "fill_container", "justifyContent": "space_between", "alignItems": "center", "children": [
            wordmark("aSquareW", 28),
            eyebrow("aSquareMeta", "October 2026", 16, name="Meta")]}]}])

cover = template("aCover", "A4 report cover", 0, 1200, 794, 1123, [
    photo("aCoverImg", "Photo", "fill_container", 560),
    {"id": "aCoverText", "type": "frame", "name": "Text", "width": "fill_container", "height": "fill_container", "layout": "vertical",
     "padding": [56, 64, 56, 64], "justifyContent": "space_between", "children": [
        {"id": "aCoverBlock", "type": "frame", "name": "Title block", "width": "fill_container", "layout": "vertical", "gap": 22, "children": [
            eyebrow("aCoverEb", "Client report", 14),
            headline("aCoverH", "AI security readiness", 54, lineHeight=T("lh-display"), letterSpacing=T("tracking-display")),
            text("aCoverSub", "Subtitle", "Findings and recommendations for the board of a regional building society", 19, fill=T("fg-muted"), lineHeight=1.4)]},
        {"id": "aCoverFoot", "type": "frame", "name": "Footer", "width": "fill_container", "justifyContent": "space_between", "alignItems": "end", "children": [
            {"id": "aCoverMeta", "type": "frame", "name": "Meta", "layout": "vertical", "gap": 8, "children": [
                eyebrow("aCoverDate", "17 October 2026", 12, name="Date"),
                eyebrow("aCoverConf", "Confidential", 12, T("accent"), name="Classification")]},
            wordmark("aCoverW", 22)]}]}])

def column(id, label, kids, width):
    return {"id": id, "type": "frame", "name": label.title(), "width": width, "layout": "vertical", "gap": 14,
            "children": [eyebrow(id + "Eb", label, 11)] + kids}

def para(id, content, name="Paragraph", fill=T("fg-muted")):
    return text(id, name, content, 14.5, fill=fill, lineHeight=1.6)

def numbered(id, n, content):
    return {"id": id, "type": "frame", "name": f"Action {n}", "width": "fill_container", "gap": 12, "children": [
        text(id + "N", "Number", f"{n:02d}", 14.5, "600", T("fg-dim"), width=26, lineHeight=1.6),
        text(id + "T", "Text", content, 14.5, "500", T("fg"), lineHeight=1.6)]}

def trow(id, cells, head=False, last=False):
    widths = [150, "fill_container", "fill_container", 70]
    kids = []
    for i, c in enumerate(cells):
        if head:
            kids.append({**eyebrow(f"{id}c{i}", c, 10.5), "textGrowth": "fixed-width", "width": widths[i]})
        else:
            kids.append(text(f"{id}c{i}", "Cell", c, 14, "600" if i in (0, 3) else "normal", T("fg") if i in (0, 3) else T("fg-muted"), width=widths[i], lineHeight=1.4))
    n = {"id": id, "type": "frame", "name": "Header row" if head else "Row", "width": "fill_container", "gap": 16, "padding": [13, 0], "alignItems": "center", "children": kids}
    if not head:
        n["stroke"] = {"fill": T("rule"), "thickness": {"top": 1, "bottom": 1} if last else {"top": 1}, "align": "inner"}
    return n

evidence = {"id": "aOpEv", "type": "frame", "name": "Evidence", "width": "fill_container", "layout": "vertical", "gap": 10, "children": [
    eyebrow("aOpEvEb", "Where the organisation stands", 11),
    {"id": "aOpEvT", "type": "frame", "name": "Table", "width": "fill_container", "layout": "vertical", "children": [
        trow("aOpEv0", ["Area", "Today", "Expected", "Gap"], head=True),
        trow("aOpEv1", ["Tool approval", "Teams adopt tools directly", "Central review before use", "High"]),
        trow("aOpEv2", ["Data protection", "Prompts are not inspected", "Member data blocked or logged", "High"]),
        trow("aOpEv3", ["Ownership", "Split across three functions", "Named executive owner", "Medium"]),
        trow("aOpEv4", ["Suppliers", "Generic IT questionnaire", "AI-specific due diligence", "Medium"], last=True)]}]}

onepager = template("aOnePager", "A4 one-pager", 900, 1200, 794, 1123, [
    {"id": "aOpHead", "type": "frame", "name": "Header", "width": "fill_container", "justifyContent": "space_between", "alignItems": "center", "children": [
        wordmark("aOpW", 18), eyebrow("aOpConf", "Confidential", 11, name="Classification")]},
    {"id": "aOpTitle", "type": "frame", "name": "Title block", "width": "fill_container", "layout": "vertical", "gap": 12, "children": [
        eyebrow("aOpEb", "AI security readiness · Summary", 11),
        headline("aOpH", "AI use has outgrown the controls around it", 34),
        text("aOpLede", "Lede", "A six-week review of AI tools, data flows and controls across retail and mortgage operations.", 16, fill=T("fg-muted"), lineHeight=1.45)]},
    {"id": "aOpKey", "type": "frame", "name": "Key finding", "width": "fill_container", "layout": "vertical", "gap": 8, "padding": [18, 22],
     "fill": T("bg-elev"), "cornerRadius": T("r-2"), "stroke": {"fill": T("rule"), "thickness": 1, "align": "inner"}, "children": [
        eyebrow("aOpKeyEb", "Key finding", 11),
        text("aOpKeyT", "Finding", "Eleven of fourteen AI tools in use were never reviewed, and 38% of sampled prompts held member data.", 16, "600", T("fg"), lineHeight=1.45)]},
    {"id": "aOpCols", "type": "frame", "name": "Columns", "width": "fill_container", "gap": 36, "children": [
        column("aOpFound", "What we found", [
            para("aOpF1", "Staff in four of six departments use generative AI every week, mostly through browser extensions and features switched on in existing software."),
            para("aOpF2", "The acceptable use policy predates these tools. Data loss rules do not inspect prompts, so member data leaves without a record."),
            para("aOpF3", "No executive owns AI risk. Decisions fall between IT, data protection and risk, so none of them is made.")], 380),
        column("aOpRec", "What we recommend", [
            numbered("aOpR1", 1, "Name an executive owner for AI risk."),
            numbered("aOpR2", 2, "Route every AI tool through one review."),
            numbered("aOpR3", 3, "Inspect prompts with data loss rules."),
            numbered("aOpR4", 4, "Re-assess against ISO/IEC 42001 in March.")], "fill_container")]},
    evidence,
    {"id": "aOpSpacer", "type": "frame", "name": "Spacer", "width": 1, "height": "fill_container"},
    {"id": "aOpBand", "type": "frame", "name": "Programme band", "width": "fill_container", "gap": 28, "alignItems": "center", "padding": [16, 0, 0, 0],
     "stroke": {"fill": T("rule-strong"), "thickness": {"top": 1}, "align": "inner"}, "children": [
        eyebrow("aOpBandEb", "Programme", 11),
        text("aOpBand1", "Duration", "12 weeks", 13.5, "600", T("fg"), width=None),
        text("aOpBand2", "Fees", "Set at scoping in November", 13.5, fill=T("fg-muted"), width=None),
        text("aOpBand3", "Exclusions", "No model development", 13.5, fill=T("fg-muted"), width=None)]}],
    padding=[52, 56], gap=36)

def button(id, label, primary):
    n = {"id": id, "type": "frame", "name": "Primary button" if primary else "Secondary button", "padding": [14, 24], "cornerRadius": T("r-1"),
         "alignItems": "center", "children": [text(id + "L", "Label", label, 18, "600" if primary else "500", T("bg") if primary else T("fg"), width=None)]}
    n.update({"fill": T("accent")} if primary else {"stroke": {"fill": T("rule-strong"), "thickness": 1, "align": "inner"}})
    return n

hero = template("aHero", "Web hero", 0, 2420, 1440, 720, [
    {"id": "aHeroText", "type": "frame", "name": "Text", "width": 864, "height": "fill_container", "layout": "vertical", "padding": [0, 72, 0, 120],
     "justifyContent": "center", "gap": 32, "children": [
        eyebrow("aHeroEb", "Practitioner-led AI advisory", 16),
        headline("aHeroH", "Secure AI adoption, built by engineers", 72, lineHeight=T("lh-display"), letterSpacing=T("tracking-display")),
        text("aHeroSub", "Subtitle", "Assessments, red teaming and governance for organisations that already run AI in production.", 22, fill=T("fg-muted"), lineHeight=1.45),
        {"id": "aHeroCtas", "type": "frame", "name": "Actions", "gap": 16, "padding": [8, 0, 0, 0], "children": [
            button("aHeroP", "Book a briefing", True), button("aHeroS", "Read the research", False)]}]},
    photo("aHeroImg", "Photo", "fill_container", "fill_container")], layout="horizontal")

ops = [{"op": "insert", "parent": "/", "node": n} for n in [social, square, cover, onepager, hero]]
print(json.dumps(ops, indent=1))
