#!/usr/bin/env python3
"""Writes the batch ops that author brands/example/assets.lib.json, a social card for the fictional Brightwater brand.

Usage: python3 scripts/build-example-brand.py > ops.json
       (start from an empty library, then: aerender batch brands/example/assets.lib.json ops.json)
"""
import json

T = lambda n: "$t:bw-" + n


def text(id, name, content, size, weight="normal", fill=T("ink"), **kw):
    n = {"id": id, "type": "text", "name": name, "content": content, "fontFamily": T("font"), "fontSize": size,
         "fontWeight": weight, "lineHeight": T("lh-body"), "fill": fill, "textGrowth": "fixed-width", "width": "fill_container"}
    n.update(kw)
    return n


card = {"id": "bwSocial", "type": "frame", "name": "Social card", "reusable": True, "x": 0, "y": 0, "width": 1200, "height": 630,
        "clip": True, "fill": T("bg"), "padding": T("space-l"), "gap": T("space-l"), "alignItems": "center", "children": [
    {"id": "bwSocialText", "type": "frame", "name": "Text", "width": "fill_container", "layout": "vertical", "gap": T("space-m"), "children": [
        {"id": "bwSocialTag", "type": "frame", "name": "Tag", "padding": [8, 16], "cornerRadius": 999, "fill": T("surface"), "children": [
            {"id": "bwSocialTagT", "type": "text", "name": "Label", "content": "Community energy", "fontFamily": T("font"), "fontSize": T("fs-label"),
             "fontWeight": "700", "textTransform": "uppercase", "letterSpacing": T("tracking-label"), "fill": T("label")}]},
        text("bwSocialH", "Headline", "Solar for every school roof in the valley by 2028", T("fs-display"), "700", lineHeight=T("lh-tight")),
        text("bwSocialSub", "Subtitle", "How 40 schools will share one battery and cut their bills by a third.", T("fs-body"), fill=T("ink-muted"))]},
    {"id": "bwSocialPanel", "type": "frame", "name": "Panel", "width": 360, "height": "fill_container", "cornerRadius": T("radius"), "fill": T("accent"),
     "layout": "vertical", "justifyContent": "space_between", "padding": T("space-m"), "children": [
        {"id": "bwSocialIcon", "type": "icon", "name": "Icon", "icon": "sun", "width": 72, "height": 72, "lineWidth": 1.5, "fill": T("accent-ink")},
        {"id": "bwSocialStat", "type": "frame", "name": "Figure", "width": "fill_container", "layout": "vertical", "gap": 8, "children": [
            text("bwSocialStatV", "Value", "40 schools", 44, "700", T("accent-ink"), lineHeight=T("lh-tight")),
            text("bwSocialStatL", "Label", "one shared battery", T("fs-body"), fill=T("accent-ink"))]},
        {"id": "bwSocialMark", "type": "frame", "name": "Wordmark", "gap": 10, "alignItems": "center", "children": [
            {"id": "bwSocialDot", "type": "ellipse", "name": "Dot", "width": 14, "height": 14, "fill": T("highlight")},
            {"id": "bwSocialName", "type": "text", "name": "Name", "content": "Brightwater", "fontFamily": T("font"), "fontSize": 24, "fontWeight": "700", "fill": T("accent-ink")}]}]}]}

print(json.dumps([{"op": "insert", "parent": "/", "node": card}], indent=1))
