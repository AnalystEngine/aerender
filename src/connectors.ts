// In-page script that draws connector nodes after layout. Shipped as a string so exported HTML draws them too.
export const CONNECTOR_SCRIPT = String.raw`
window.__aeDraw = function () {
  document.querySelectorAll(".ae-conn-layer, .ae-conn-label").forEach((e) => e.remove());
  let seq = 0;
  const G = 32;
  const dir = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };
  const bg = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const c = getComputedStyle(e).backgroundColor;
      if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c;
    }
    return "transparent";
  };
  for (const c of document.querySelectorAll('[data-t="connector"]')) {
    const host = c.parentElement;
    const a = document.querySelector('[data-uid="' + c.dataset.from + '"]');
    const b = document.querySelector('[data-uid="' + c.dataset.to + '"]');
    if (!a || !b || !host) continue;
    const hr = host.getBoundingClientRect();
    const box = (e) => {
      const r = e.getBoundingClientRect();
      return { l: r.left - hr.left, t: r.top - hr.top, r: r.right - hr.left, b: r.bottom - hr.top, cx: (r.left + r.right) / 2 - hr.left, cy: (r.top + r.bottom) / 2 - hr.top };
    };
    const A = box(a), B = box(b);
    const dx = B.cx - A.cx, dy = B.cy - A.cy;
    const horiz = Math.abs(dx) >= Math.abs(dy);
    let fs = c.dataset.fs || "auto", ts = c.dataset.ts || "auto";
    if (fs === "auto") fs = horiz ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "bottom" : "top");
    if (ts === "auto") ts = horiz ? (dx >= 0 ? "left" : "right") : (dy >= 0 ? "top" : "bottom");
    const pt = (R, s) => (s === "top" ? [R.cx, R.t] : s === "bottom" ? [R.cx, R.b] : s === "left" ? [R.l, R.cy] : [R.r, R.cy]);
    const p1 = pt(A, fs), p2 = pt(B, ts), d1 = dir[fs], d2 = dir[ts];
    let pts;
    if (c.dataset.route !== "elbow") pts = [p1, p2];
    else {
      const h1 = d1[0] !== 0, h2 = d2[0] !== 0;
      const ahead = (p, q, d) => (q[0] - p[0]) * d[0] + (q[1] - p[1]) * d[1] > 0;
      if (h1 === h2 && d1[0] === -d2[0] && d1[1] === -d2[1] && ahead(p1, p2, d1)) {
        // Facing sides: one dog-leg through the midpoint.
        if (h1) { const m = (p1[0] + p2[0]) / 2; pts = [p1, [m, p1[1]], [m, p2[1]], p2]; }
        else { const m = (p1[1] + p2[1]) / 2; pts = [p1, [p1[0], m], [p2[0], m], p2]; }
      } else if (h1 === h2 && d1[0] === d2[0] && d1[1] === d2[1]) {
        // Same side (loop-back): go out past both boxes, across, and back in.
        if (h1) { const x = d1[0] > 0 ? Math.max(A.r, B.r) + G : Math.min(A.l, B.l) - G; pts = [p1, [x, p1[1]], [x, p2[1]], p2]; }
        else { const y = d1[1] > 0 ? Math.max(A.b, B.b) + G : Math.min(A.t, B.t) - G; pts = [p1, [p1[0], y], [p2[0], y], p2]; }
      } else if (h1 !== h2 && ahead(p1, p2, d1) && ahead(p2, p1, d2)) {
        pts = h1 ? [p1, [p2[0], p1[1]], p2] : [p1, [p1[0], p2[1]], p2];
      } else {
        const s = [p1[0] + d1[0] * G, p1[1] + d1[1] * G], e = [p2[0] + d2[0] * G, p2[1] + d2[1] * G];
        pts = [p1, s, h1 ? [s[0], e[1]] : [e[0], s[1]], e, p2];
      }
    }
    pts = pts.filter((p, i) => i === 0 || Math.abs(p[0] - pts[i - 1][0]) + Math.abs(p[1] - pts[i - 1][1]) > 0.01);
    c.dataset.points = JSON.stringify(pts.map((p) => [Math.round(p[0] + hr.left), Math.round(p[1] + hr.top)]));
    const cs = getComputedStyle(c);
    const colour = cs.color, sw = parseFloat(c.dataset.sw || "1.5");
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "ae-conn-layer");
    svg.setAttribute("style", "position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible;pointer-events:none;z-index:5");
    const defs = document.createElementNS(NS, "defs");
    const marker = (kind) => {
      if (!kind || kind === "none") return null;
      const id = "aem" + seq++;
      const m = document.createElementNS(NS, "marker");
      const size = Math.max(13, sw * 7);
      m.setAttribute("id", id); m.setAttribute("viewBox", "0 0 10 10"); m.setAttribute("markerUnits", "userSpaceOnUse");
      m.setAttribute("markerWidth", size); m.setAttribute("markerHeight", size); m.setAttribute("orient", "auto-start-reverse");
      m.setAttribute("refY", "5"); m.setAttribute("refX", kind === "dot" ? "5" : "9.5");
      const shape = document.createElementNS(NS, kind === "dot" ? "circle" : "path");
      if (kind === "dot") { shape.setAttribute("cx", "5"); shape.setAttribute("cy", "5"); shape.setAttribute("r", "3.5"); }
      else shape.setAttribute("d", "M0.5,1 L9.5,5 L0.5,9 Z");
      shape.setAttribute("fill", colour);
      m.appendChild(shape); defs.appendChild(m);
      return "url(#" + id + ")";
    };
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", "M" + pts.map((p) => p[0] + "," + p[1]).join(" L"));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", colour);
    path.setAttribute("stroke-width", sw);
    path.setAttribute("stroke-linejoin", "round");
    if (c.dataset.dash) path.setAttribute("stroke-dasharray", c.dataset.dash);
    const ms = marker(c.dataset.sa), me = marker(c.dataset.ea ?? "arrow");
    if (ms) path.setAttribute("marker-start", ms);
    if (me) path.setAttribute("marker-end", me);
    svg.appendChild(defs); svg.appendChild(path);
    host.appendChild(svg);
    const label = c.dataset.label;
    if (label) {
      // Place the label at the middle of the route, on the canvas colour so the line breaks behind it.
      const segs = pts.slice(1).map((p, i) => [pts[i], p, Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1])]);
      let half = segs.reduce((s, x) => s + x[2], 0) / 2, at = pts[0];
      for (const [p, q, len] of segs) { if (half <= len) { at = [p[0] + (q[0] - p[0]) * half / len, p[1] + (q[1] - p[1]) * half / len]; break; } half -= len; }
      const div = document.createElement("div");
      div.className = "ae-conn-label";
      div.textContent = label;
      div.setAttribute("style", "position:absolute;z-index:6;white-space:nowrap;transform:translate(-50%,-50%);padding:2px 10px;left:" + at[0] + "px;top:" + at[1] + "px;background:" + bg(host) + ";color:" + (c.dataset.lc || colour) + ";font-family:" + cs.fontFamily + ";font-size:" + cs.fontSize + ";font-weight:" + cs.fontWeight + ";letter-spacing:" + cs.letterSpacing + ";text-transform:" + cs.textTransform);
      host.appendChild(div);
    }
  }
};
window.addEventListener("load", () => window.__aeDraw());
`;
