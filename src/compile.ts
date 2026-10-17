// Compiles an expanded scene into HTML/CSS. Flexbox does the layout; variables become CSS custom properties.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Scene, LIB_ALIAS } from "./doc.js";
import { brandFile } from "./brands.js";
import { RNode, Problems, parseVarRef, resolveVar, resolveValue, defaultTheme, pickValue } from "./resolve.js";
import { fontFaceCss, lucideInner, FALLBACK_STACK, IconError } from "./assets.js";
import { CONNECTOR_SCRIPT } from "./connectors.js";
import { selectNodes } from "./address.js";

type Theme = Record<string, string>;
export interface CompileOpts { mode: "render" | "export"; pdf?: boolean }

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const JUSTIFY: Record<string, string> = { start: "flex-start", center: "center", end: "flex-end", space_between: "space-between", space_around: "space-around" };
const ALIGN: Record<string, string> = { start: "flex-start", center: "center", end: "flex-end" };
const WEIGHT: Record<string, string> = { normal: "400", regular: "400", medium: "500", semibold: "600", bold: "700", extrabold: "800", black: "900", light: "300", thin: "100" };
const SIZE_RE = /^(fill_container|fit_content)(?:\((-?\d*\.?\d+)\))?$/;
const INVISIBLE = new Set<string>();
/** Brand photo treatments: monochrome, darkened so shadows fall toward the canvas. */
const IMAGE_FILTERS: Record<string, string> = {
  mono: "grayscale(1) contrast(1.08) brightness(0.72)",
  desaturate: "saturate(0.25) brightness(0.8)",
  dark: "grayscale(1) contrast(1.1) brightness(0.5)",
};

export function cssVarNames(sc: Scene): Map<string, string> {
  const m = new Map<string, string>(), used = new Set<string>();
  const names = Object.keys(sc.variables).sort((a, b) => Number(a.includes(":")) - Number(b.includes(":")));
  for (const full of names) {
    const [pre, local] = full.includes(":") ? [full.slice(0, full.indexOf(":")), full.slice(full.indexOf(":") + 1)] : ["", full];
    const base = local.replace(/^-+/, "").replace(/[^a-zA-Z0-9_-]/g, "-");
    let css = `--${base}`;
    if (used.has(css)) css = `--${pre}-${base}`;
    used.add(css);
    m.set(full, css);
  }
  return m;
}

export class Compiler {
  vars: Map<string, string>;
  usedVars = new Set<string>();
  private root: RNode | null = null;
  constructor(public sc: Scene, public probs: Problems, public opts: CompileOpts = { mode: "render" }) {
    this.vars = cssVarNames(sc);
  }

  // ---------- values ----------
  private varCss(ref: string, node?: RNode): { css: string; name: string; alpha?: number } | null {
    const r = parseVarRef(ref, this.sc);
    if (!r) return null;
    const css = this.vars.get(r.name);
    if (!css) {
      this.probs.err(`unknown variable "$${r.name}"`, node?.id);
      return { css: "", name: r.name };
    }
    this.usedVars.add(r.name);
    return { css: `var(${css})`, name: r.name, alpha: r.alpha };
  }

  /** Length in px, from a number, a `$variable`, or a CSS length string such as "0.16em". */
  len(v: any, node?: RNode, factor = 1): string {
    if (typeof v === "number") return `${+(v * factor).toFixed(4)}px`;
    if (typeof v === "string") {
      const vr = this.varCss(v, node);
      if (vr) {
        if (!vr.css) return "0px";
        // Variables holding CSS lengths ("0.16em") are used as-is; plain numbers are px.
        const val = resolveVar(vr.name, this.sc, defaultTheme(this.sc));
        if (typeof val === "string") return factor === 1 ? vr.css : `calc(${vr.css} * ${factor})`;
        return `calc(${vr.css} * ${factor}px)`;
      }
      if (/^-?\d*\.?\d+(px|em|rem|%)$/.test(v)) return factor === 1 ? v : `calc(${v} * ${factor})`;
      if (/^-?\d*\.?\d+$/.test(v)) return `${+v * factor}px`;
    }
    return "0px";
  }

  num(v: any, node?: RNode): string {
    if (typeof v === "string") {
      const vr = this.varCss(v, node);
      if (vr) return vr.css || "0";
    }
    return String(v);
  }

  color(v: any, node?: RNode): string | null {
    if (v == null) return null;
    if (typeof v === "object" && !Array.isArray(v)) {
      if (v.enabled === false) return null;
      if (v.type === "color") return this.color(v.color, node);
      return null;
    }
    if (typeof v !== "string") return null;
    const vr = this.varCss(v, node);
    if (vr) {
      if (!vr.css) return null;
      return vr.alpha !== undefined ? `color-mix(in srgb, ${vr.css} ${+(vr.alpha * 100).toFixed(2)}%, transparent)` : vr.css;
    }
    if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return v;
    this.probs.err(`invalid colour "${v}" (use #RGB, #RRGGBB, #RRGGBBAA or $variable)`, node?.id);
    return null;
  }

  private bool(v: any, theme: Theme): boolean | undefined {
    const r = resolveValue(v, this.sc, theme);
    return typeof r === "boolean" ? r : undefined;
  }

  private brandUrl(alias: string, node: RNode): string {
    try { return pathToFileURL(brandFile(alias)).href; } catch (e: any) { this.probs.err(e.message, node.id); return alias; }
  }

  /** CSS background layers for a fill (top layer first). */
  background(fill: any, node: RNode, theme: Theme): Record<string, string> {
    const arr = (Array.isArray(fill) ? fill : [fill]).filter((f) => f != null && !(typeof f === "object" && this.bool(f.enabled, theme) === false));
    const layers: string[] = [], extra: Record<string, string> = {};
    let single: string | null = null;
    for (const f of arr) {
      if (typeof f === "string" || f.type === "color") {
        const c = this.color(f, node);
        if (c) { layers.push(`linear-gradient(${c}, ${c})`); single = c; }
      } else if (f.type === "image" && f.url) {
        // "aerender:<brand>/<path>" is a file inside a discovered brand folder.
        const url = /^(https?|data):/.test(f.url) ? f.url
          : f.url.startsWith(LIB_ALIAS) ? this.brandUrl(f.url, node)
          : this.opts.mode === "export" ? f.url : pathToFileURL(path.resolve(this.sc.baseDir, f.url)).href;
        const mode = ({ fill: "cover", fit: "contain" } as Record<string, string>)[f.mode] ?? f.mode ?? "cover";
        layers.push(`url("${url}") center / ${mode === "stretch" ? "100% 100%" : mode} no-repeat`);
      } else if (f.type === "gradient") {
        const stops = (f.colors ?? []).map((s: any) => `${this.color(s.color, node)} ${+(resolveValue(s.position, this.sc, theme) * 100).toFixed(2)}%`).join(", ");
        if (f.gradientType === "radial") layers.push(`radial-gradient(${stops})`);
        else layers.push(`linear-gradient(${(360 - (resolveValue(f.rotation, this.sc, theme) ?? 0) + 360) % 360 + 180}deg, ${stops})`);
      } else {
        this.probs.warn(`fill type "${f.type}" is not supported; skipped`, node.id);
      }
    }
    if (!layers.length) return extra;
    if (layers.length === 1 && single) return { "background-color": single };
    return { background: layers.reverse().join(", ") };
  }

  private strokeColor(n: RNode): string | null {
    const arr = Array.isArray(n.stroke) ? n.stroke : [n.stroke];
    let c: string | null = null;
    for (const f of arr) c = this.color(f, n) ?? c;
    return c;
  }

  /** Strokes become box-shadows so they never take layout space. */
  strokeShadows(n: RNode): string[] {
    if (n.stroke == null) return [];
    const c = this.strokeColor(n);
    if (!c) return [];
    const w = n.strokeWidth ?? 1;
    const align = n.strokeAlignment ?? "inner";
    const out: string[] = [];
    const side = (s: "top" | "right" | "bottom" | "left", v: any) => {
      if (v == null || v === 0) return;
      const pos = this.len(v, n), neg = this.len(v, n, -1);
      const inner = { top: `0 ${pos}`, bottom: `0 ${neg}`, left: `${pos} 0`, right: `${neg} 0` }[s];
      const outer = { top: `0 ${neg}`, bottom: `0 ${pos}`, left: `${neg} 0`, right: `${pos} 0` }[s];
      if (align === "outer") out.push(`${outer} 0 0 ${c}`);
      else out.push(`inset ${inner} 0 0 ${c}`);
    };
    if (typeof w === "object") {
      for (const s of ["top", "right", "bottom", "left"] as const) side(s, w[s]);
    } else if (align === "outer") out.push(`0 0 0 ${this.len(w, n)} ${c}`);
    else if (align === "center") out.push(`inset 0 0 0 ${this.len(w, n, 0.5)} ${c}`, `0 0 0 ${this.len(w, n, 0.5)} ${c}`);
    else out.push(`inset 0 0 0 ${this.len(w, n)} ${c}`);
    return out;
  }

  effects(n: RNode, st: Record<string, string>, theme: Theme): string[] {
    const shadows: string[] = [];
    for (const e of n.effect ?? []) {
      if (!e || this.bool(e.enabled, theme) === false) continue;
      if (e.type === "shadow") {
        const c = this.color(e.color ?? "#00000040", n);
        if (!c) continue;
        shadows.push(`${e.shadowType === "inner" ? "inset " : ""}${this.len(e.offset?.x ?? 0, n)} ${this.len(e.offset?.y ?? 0, n)} ${this.len(e.blur ?? 0, n)} ${this.len(e.spread ?? 0, n)} ${c}`);
      } else if (e.type === "blur") st.filter = `blur(${this.len(e.radius ?? 0, n, 0.5)})`;
      else if (e.type === "background_blur") st["backdrop-filter"] = `blur(${this.len(e.radius ?? 0, n, 0.5)})`;
    }
    return shadows;
  }

  private padding(p: any, n: RNode): string {
    if (Array.isArray(p)) return p.map((x) => this.len(x, n)).join(" ");
    return this.len(p, n);
  }

  private radius(r: any, n: RNode): string {
    if (Array.isArray(r)) return r.map((x) => this.len(x, n)).join(" ");
    return this.len(r, n);
  }

  // ---------- sizing ----------
  private size(n: RNode, axis: "width" | "height", parentLayout: string, st: Record<string, string>, visibleKids: RNode[]) {
    let v = n[axis];
    const isText = n.type === "text";
    if (isText) {
      const g = n.textGrowth;
      if (!g || g === "auto" || (axis === "height" && g === "fixed-width")) return;
    }
    if (v === undefined) {
      if (n.type === "frame" || n.type === "group" || n.type === "text") return;
      if (n.type === "icon") v = 24;
      else return;
    }
    const inFlex = (parentLayout === "horizontal" || parentLayout === "vertical") && n.layoutPosition !== "absolute";
    const main = (parentLayout === "horizontal" && axis === "width") || (parentLayout === "vertical" && axis === "height");
    const m = typeof v === "string" ? v.match(SIZE_RE) : null;
    if (!m) { st[axis] = this.len(v, n); return; }
    const fallback = m[2] !== undefined ? +m[2] : undefined;
    if (m[1] === "fill_container") {
      if (inFlex) {
        if (main) { st.flex = "1 1 0px"; st[`min-${axis}`] = "0"; }
        // A capped fill keeps the parent's cross-axis alignment instead of sticking to the start.
        else if (n[axis === "width" ? "maxWidth" : "maxHeight"] !== undefined) st[axis] = "100%";
        else st["align-self"] = "stretch";
      } else if (fallback !== undefined) st[axis] = `${fallback}px`;
      else if (parentLayout === "none") st[axis] = "100%";
      return;
    }
    // fit_content
    if (!visibleKids.length && fallback !== undefined) st[axis] = `${fallback}px`;
    else if (n.layout === "none" && visibleKids.length) {
      const ext = Math.max(0, ...visibleKids.map((c) => (c[axis === "width" ? "x" : "y"] ?? 0) + (typeof c[axis] === "number" ? c[axis] : 0)));
      st[axis] = `${ext}px`;
    }
  }

  // ---------- nodes ----------
  node(n: RNode, parentLayout: string, theme: Theme): string {
    if (INVISIBLE.has(n.type)) return "";
    if (this.bool(n.enabled, theme) === false) return "";
    if (n.type === "connector") return this.connector(n, theme);
    const st: Record<string, string> = {};
    let t = theme;
    if (n.theme && typeof n.theme === "object") {
      t = { ...theme, ...n.theme };
      Object.assign(st, this.themeVars(theme, t));
    }
    const kids = (n.children ?? []).filter((c) => !INVISIBLE.has(c.type) && this.bool(c.enabled, t) !== false);
    const layout = n.type === "frame" ? n.layout ?? "horizontal" : n.type === "group" ? "none" : "leaf";

    // position
    if (parentLayout === "none" || n.layoutPosition === "absolute") {
      st.position = "absolute";
      st.left = this.len(n.x ?? 0, n);
      st.top = this.len(n.y ?? 0, n);
    } else st.position = "relative";
    if (parentLayout === "horizontal" || parentLayout === "vertical" || parentLayout === "root") st.flex = "0 0 auto";
    this.size(n, "width", parentLayout, st, kids);
    this.size(n, "height", parentLayout, st, kids);
    for (const k of ["minWidth", "maxWidth", "minHeight", "maxHeight"]) {
      if (n[k] !== undefined) st[k.replace(/[A-Z]/, (c) => "-" + c.toLowerCase())] = this.len(n[k], n);
    }
    if (n.opacity !== undefined) st.opacity = this.num(n.opacity, n);
    const tf: string[] = [];
    if (n.rotation) tf.push(`rotate(calc(${this.num(n.rotation, n)} * -1deg))`);
    if (this.bool(n.flipX, t)) tf.push("scaleX(-1)");
    if (this.bool(n.flipY, t)) tf.push("scaleY(-1)");
    if (tf.length) { st.transform = tf.join(" "); st["transform-origin"] = n.rotation ? "0 0" : "center"; }

    const attrs: Record<string, string> = { "data-id": n.id, "data-t": n.type, "data-uid": String(n._m.uid ?? "") };
    if (n.name) attrs["data-name"] = n.name;
    if (n._m?.isInst) attrs["data-comp"] = n._m.comp ?? "";
    let tag = "div", inner = "";

    if (n.type === "text") {
      Object.assign(st, this.textStyle(n, t));
      attrs["data-growth"] = n.textGrowth ?? "auto";
      const c = n.content ?? "";
      const content = typeof c === "string" && c.startsWith("$") && !(c.slice(1) in this.sc.variables) ? c : resolveValue(c, this.sc, t);
      inner = `<span>${esc(content ?? "")}</span>`;
      tag = this.semanticText(n);
    } else if (n.type === "icon") {
      const col = this.color(Array.isArray(n.fill) ? n.fill[n.fill.length - 1] : n.fill, n) ?? "currentColor";
      st.color = col;
      const lib = resolveValue(n.library ?? "lucide", this.sc, t);
      const name = resolveValue(n.icon, this.sc, t);
      if (lib !== "lucide" && lib !== "feather") this.probs.warn(`icon library "${lib}" is not bundled; drawing lucide "${name}"`, n.id);
      let body = "";
      try { body = lucideInner(name); } catch (e) {
        if (e instanceof IconError) this.probs.err(e.message, n.id); else throw e;
      }
      const sw = n.lineWidth !== undefined ? this.num(n.lineWidth, n) : "2";
      inner = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="${esc(sw)}" stroke-linecap="round" stroke-linejoin="round" style="display:block">${body}</svg>`;
      st.display = "block";
      st["box-shadow"] = this.effects(n, st, t).join(", ") || "none";
    } else if (n.type === "path") {
      st.display = "block";
      st.overflow = "visible";
      const fill = this.color(Array.isArray(n.fill) ? n.fill[n.fill.length - 1] : n.fill, n) ?? "none";
      const sc = n.stroke != null ? this.strokeColor(n) : null;
      const sw = typeof n.strokeWidth === "number" ? n.strokeWidth : 1;
      const vb = Array.isArray(n.viewBox) ? `viewBox="${n.viewBox.join(" ")}"` : "data-autobox";
      inner = `<svg xmlns="http://www.w3.org/2000/svg" ${vb} width="100%" height="100%" preserveAspectRatio="none" style="display:block;overflow:visible"><path d="${esc(n.geometry ?? "")}" fill-rule="${n.fillRule ?? "nonzero"}" style="fill:${fill};stroke:${sc ?? "none"};stroke-width:${sw}px;stroke-linecap:${n.strokeLinecap ?? "butt"};stroke-linejoin:${n.strokeLinejoin ?? "miter"}" vector-effect="non-scaling-stroke"/></svg>`;
    } else if (n.type === "line") {
      const c = this.strokeColor(n);
      if (c) st["background-color"] = c;
      st["min-height"] = this.len(typeof n.strokeWidth === "object" ? 1 : n.strokeWidth ?? 1, n);
    } else {
      // frame, rectangle, ellipse, group and anything box-like
      if (layout === "horizontal" || layout === "vertical") {
        st.display = "flex";
        st["flex-direction"] = layout === "vertical" ? "column" : "row";
        st["align-items"] = ALIGN[n.alignItems] ?? "flex-start";
        if (n.justifyContent) st["justify-content"] = JUSTIFY[n.justifyContent] ?? "flex-start";
        // space_between/space_around distribute free space, so gap does not apply.
        if (n.gap !== undefined && !/^space_/.test(n.justifyContent ?? "")) st.gap = this.len(n.gap, n);
      } else st.display = "block";
      if (n.padding !== undefined && layout !== "leaf") st.padding = this.padding(n.padding, n);
      let shapeSvg = "";
      if (n.shape === "diamond") {
        // Diamond: fill and stroke are drawn by an SVG behind the content so the stroke follows the edges.
        const f = this.color(Array.isArray(n.fill) ? n.fill[n.fill.length - 1] : n.fill, n) ?? "none";
        const sc = n.stroke != null ? this.strokeColor(n) : null;
        const sw = typeof n.strokeWidth === "number" ? n.strokeWidth : 1;
        shapeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible"><polygon points="50,0 100,50 50,100 0,50" vector-effect="non-scaling-stroke" style="fill:${f};stroke:${sc ?? "none"};stroke-width:${sw}px;stroke-linejoin:round"/></svg>`;
      } else if (n.fill !== undefined && n.imageFilter && n.imageFilter !== "none") {
        // Photo treatment: the fill moves to a filtered layer behind the children so overlay text keeps its colour.
        const bgCss = Object.entries(this.background(n.fill, n, t)).map(([k, v]) => `${k}:${v}`).join(";");
        const filter = IMAGE_FILTERS[n.imageFilter] ?? IMAGE_FILTERS.mono;
        shapeSvg = `<div class="ae-img" style="${esc(`position:absolute;inset:0;border-radius:inherit;${bgCss};filter:${filter}`)}"></div>`;
      } else if (n.fill !== undefined) Object.assign(st, this.background(n.fill, n, t));
      if (n.type === "ellipse" || n.shape === "ellipse") st["border-radius"] = "50%";
      else if (n.shape === "pill") st["border-radius"] = "9999px";
      else if (n.cornerRadius !== undefined) st["border-radius"] = this.radius(n.cornerRadius, n);
      if (this.bool(n.clip, t)) { st.overflow = "hidden"; attrs["data-clip"] = "1"; }
      const shadows = [...(n.shape === "diamond" ? [] : this.strokeShadows(n)), ...this.effects(n, st, t)];
      if (shadows.length) st["box-shadow"] = shadows.join(", ");
      inner = shapeSvg + kids.map((c) => this.node(c, layout === "leaf" ? "none" : layout, t)).join("");
      tag = this.semanticBox(n);
      if (tag === "button") Object.assign(st, { border: "0", font: "inherit", color: "inherit", "text-align": "inherit", cursor: "pointer" });
    }
    if (n.type === "text") {
      const shadows = [...this.effects(n, st, t)];
      if (shadows.length) st["box-shadow"] = shadows.join(", ");
    }
    const style = Object.entries(st).map(([k, v]) => `${k}:${v}`).join(";");
    const at = this.opts.mode === "export"
      ? (n.name ? ` data-name="${esc(n.name)}"` : "") + (n.type === "text" ? ` class="ae-text"` : "") + ` data-uid="${n._m.uid}"`
      : Object.entries(attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join("");
    return `<${tag}${at} style="${esc(style)}">${inner}</${tag}>`;
  }

  /** A connector is a hidden marker; the in-page script draws it from its endpoints after layout. */
  connector(n: RNode, t: Theme): string {
    const end = (q: any, key: string) => {
      if (typeof q !== "string" || !q) { this.probs.err(`connector ${key} is missing`, n.id); return ""; }
      try {
        const hits = selectNodes(this.root ? [this.root] : [], q);
        if (hits.length > 1) { this.probs.err(`connector ${key} "${q}" is ambiguous (${hits.length} matches); use an id or a longer path`, n.id); return ""; }
        return String(hits[0]._m.uid);
      } catch (e: any) { this.probs.err(`connector ${key}: ${e.message}`, n.id); return ""; }
    };
    const st: Record<string, string> = { display: "none" };
    st.color = this.color(Array.isArray(n.stroke) ? n.stroke[n.stroke.length - 1] : n.stroke ?? "#919191", n) ?? "#919191";
    st["font-family"] = this.fontFamily(n.fontFamily ?? "Inter Tight", n);
    st["font-size"] = this.len(n.fontSize ?? 18, n);
    if (n.fontWeight) st["font-weight"] = WEIGHT[String(n.fontWeight)] ?? String(n.fontWeight);
    if (n.letterSpacing !== undefined) st["letter-spacing"] = this.len(n.letterSpacing, n);
    if (n.textTransform) st["text-transform"] = n.textTransform;
    const data: Record<string, string> = {
      "data-id": n.id, "data-t": "connector", "data-from": end(n.from, "from"), "data-to": end(n.to, "to"),
      "data-route": n.route ?? "straight", "data-fs": n.fromSide ?? "auto", "data-ts": n.toSide ?? "auto",
      "data-sa": n.startArrow ?? "none", "data-ea": n.endArrow ?? "arrow",
      "data-sw": String(resolveValue(n.strokeWidth ?? 1.5, this.sc, t)),
    };
    if (n.name) data["data-name"] = n.name;
    if (n.dash) data["data-dash"] = Array.isArray(n.dash) ? n.dash.join(" ") : n.dash === true ? "6 6" : String(n.dash);
    if (n.label) data["data-label"] = String(resolveValue(n.label, this.sc, t));
    if (n.labelFill) data["data-lc"] = this.color(n.labelFill, n) ?? "";
    const style = Object.entries(st).map(([k, v]) => `${k}:${v}`).join(";");
    return `<div${Object.entries(data).map(([k, v]) => ` ${k}="${esc(v)}"`).join("")} style="${esc(style)}"></div>`;
  }

  textStyle(n: RNode, t: Theme): Record<string, string> {
    const st: Record<string, string> = { display: "flex", "flex-direction": "column" };
    const g = n.textGrowth ?? "auto";
    st["white-space"] = g === "auto" ? "pre" : "pre-wrap";
    if (g !== "auto") st["overflow-wrap"] = "break-word";
    st["justify-content"] = { middle: "center", bottom: "flex-end" }[n.textAlignVertical as string] ?? "flex-start";
    st["font-family"] = this.fontFamily(n.fontFamily, n);
    st["font-size"] = this.len(n.fontSize ?? 14, n);
    if (n.fontWeight !== undefined) {
      const w = typeof n.fontWeight === "string" && n.fontWeight.startsWith("$") ? this.num(n.fontWeight, n) : WEIGHT[String(n.fontWeight).toLowerCase()] ?? String(n.fontWeight);
      st["font-weight"] = w;
    }
    if (n.fontStyle) st["font-style"] = String(resolveValue(n.fontStyle, this.sc, t));
    if (n.letterSpacing !== undefined) st["letter-spacing"] = this.len(n.letterSpacing, n);
    st["line-height"] = n.lineHeight !== undefined ? this.num(n.lineHeight, n) : "normal";
    if (n.textAlign) st["text-align"] = n.textAlign;
    if (n.textTransform) st["text-transform"] = n.textTransform;
    const deco = [this.bool(n.underline, t) && "underline", this.bool(n.strikethrough, t) && "line-through"].filter(Boolean);
    if (deco.length) st["text-decoration"] = deco.join(" ");
    const fill = Array.isArray(n.fill) ? n.fill[n.fill.length - 1] : n.fill;
    st.color = this.color(fill ?? "#000000", n) ?? "transparent";
    return st;
  }

  fontFamily(v: any, n: RNode): string {
    if (v === undefined) return `"Inter", ${FALLBACK_STACK}`;
    const vr = typeof v === "string" ? this.varCss(v, n) : null;
    if (vr) return vr.css ? `${vr.css}, ${FALLBACK_STACK}` : FALLBACK_STACK;
    return `${fontStack(String(v))}, ${FALLBACK_STACK}`;
  }

  private semanticBox(n: RNode): string {
    if (this.opts.mode !== "export" || !n.name) return "div";
    const name = String(n.name);
    if (/^button\b|\bbutton$|^btn\b/i.test(name) || /^Button\//.test(n._m?.comp ?? "")) return "button";
    if (/^sidebar\b/i.test(name)) return "aside";
    if (/^(top ?bar|header)$/i.test(name)) return "header";
    if (/^nav(igation)?\b/i.test(name) && !/item/i.test(name)) return "nav";
    if (/^footer\b/i.test(name)) return "footer";
    if (/^main\b/i.test(name)) return "main";
    return "div";
  }

  private semanticText(n: RNode): string {
    if (this.opts.mode !== "export" || !n.name) return "div";
    if (/^(title|headline|h1)$/i.test(n.name)) return "h1";
    if (/^(section title|heading|h2)$/i.test(n.name)) return "h2";
    if (/^(description|body|paragraph|lede)$/i.test(n.name)) return "p";
    return "div";
  }

  // ---------- document ----------
  varValueCss(name: string, theme: Theme): string | null {
    const def = this.sc.variables[name];
    if (!def) return null;
    const v = pickValue(def, theme);
    if (typeof v === "string" && v.startsWith("$")) {
      const target = this.vars.get(v.slice(1));
      return target ? `var(${target})` : null;
    }
    return this.literalCss(def.type, v);
  }

  private literalCss(type: string, v: any): string | null {
    if (v === undefined || v === null) return null;
    if (type === "string") return /^-?\d*\.?\d+(px|em|rem|%)$/.test(String(v)) ? String(v) : fontStack(String(v));
    if (type === "boolean") return v ? "1" : "0";
    return String(v);
  }

  rootVars(theme: Theme, only?: Set<string>): string {
    const lines: string[] = [];
    if (only) {
      const queue = [...only];
      while (queue.length) {
        const v = pickValue(this.sc.variables[queue.pop()!] ?? {}, theme);
        if (typeof v === "string" && v.startsWith("$") && !only.has(v.slice(1))) { only.add(v.slice(1)); queue.push(v.slice(1)); }
      }
    }
    for (const [name, css] of this.vars) {
      if (only && !only.has(name)) continue;
      const v = this.varValueCss(name, theme);
      if (v !== null) lines.push(`  ${css}: ${v};`);
    }
    return `:root {\n${lines.join("\n")}\n}`;
  }

  themeVars(from: Theme, to: Theme): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [name, css] of this.vars) {
      const a = resolveVar(name, this.sc, from), b = resolveVar(name, this.sc, to);
      if (a !== b && b !== undefined) out[css] = this.literalCss(this.sc.variables[name].type, b) ?? "";
    }
    return out;
  }

  document(roots: RNode[], opts: { pdf?: boolean } = {}): string {
    const theme = defaultTheme(this.sc);
    let uid = 0;
    const number = (n: RNode) => { n._m.uid = ++uid; (n.children ?? []).forEach(number); };
    roots.forEach(number);
    const body = roots.map((r, i) => {
      this.root = r;
      // Each root sits in its own whole-pixel slot so roots never bleed into each other's screenshots.
      let html = `<div class="ae-slot">${this.node(r, "root", theme)}</div>`;
      if (opts.pdf) html = `<div class="page" style="page: p${i}">${html}</div>`;
      return html;
    }).join("\n");
    const pages = opts.pdf ? roots.map((r, i) => `@page p${i} { size: ${num0(r.width, 1920)}px ${num0(r.height, 1080)}px; margin: 0 }`).join("\n") : "";
    const fonts = this.opts.mode === "render" ? fontFaceCss() : "";
    const vars = this.rootVars(theme, this.opts.mode === "export" ? this.usedVars : undefined);
    return `<!doctype html><html><head><meta charset="utf-8"><style>
${fonts}
${vars}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { display: flex; flex-direction: column; align-items: flex-start; gap: ${opts.pdf ? 0 : 64}px; background: transparent; -webkit-font-smoothing: antialiased; text-rendering: geometricPrecision; }
[data-t="text"] > span, .ae-text > span { display: block; }
.ae-slot { display: flex; flex: none; align-items: flex-start; }
${opts.pdf ? `.page { break-after: page; } ${pages}` : ""}
</style></head><body>
${body}
<script>
for (const svg of document.querySelectorAll("svg[data-autobox]")) {
  const b = svg.querySelector("path").getBBox();
  svg.setAttribute("viewBox", [b.x, b.y, Math.max(b.width, 0.001), Math.max(b.height, 0.001)].join(" "));
}
${CONNECTOR_SCRIPT}
</script>
</body></html>`;
  }
}

const num0 = (v: any, d: number) => (typeof v === "number" ? v : d);

function fontStack(v: string): string {
  return v.split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean).map((f) => (/^(sans-serif|serif|monospace|system-ui)$/.test(f) ? f : `"${f}"`)).join(", ");
}
