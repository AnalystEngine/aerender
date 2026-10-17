// Layout lint: renders the design and measures the DOM for the mistakes agents make most.
import fs from "node:fs";
import path from "node:path";
import { load, buildScene, LIB_ALIAS } from "./doc.js";
import { discoverBrands, findBrand } from "./brands.js";
import { expandAll, Problems, RNode, resolveValue, defaultTheme } from "./resolve.js";
import { Compiler } from "./compile.js";
import { withPage } from "./browser.js";
import { selectNodes, namePath } from "./address.js";
import { validateLoaded } from "./validate.js";

interface Finding { level: "error" | "warn"; kind: string; where: string; msg: string }

const SIZE_FILL = /^fill_container/;
const isFit = (v: any) => v === undefined || (typeof v === "string" && v.startsWith("fit_content"));

/** A fit_content axis whose children all fill it has no size of its own. */
function staticChecks(n: RNode, out: Finding[]) {
  if (n.type === "frame" && n.enabled !== false && (n.layout ?? "horizontal") !== "none") {
    const kids = (n.children ?? []).filter((c) => c.enabled !== false);
    for (const axis of ["width", "height"] as const) {
      const main = (n.layout ?? "horizontal") === "horizontal" ? "width" : "height";
      if (isFit(n[axis]) && kids.length && axis === main && kids.every((c) => SIZE_FILL.test(String(c[axis] ?? "")))) {
        out.push({ level: "warn", kind: "fit-vs-fill", where: namePath(n), msg: `${axis} is fit_content but every child fills it, so it has no size to fit. Give the frame or one child a fixed ${axis}` });
      }
    }
  }
  for (const c of n.children ?? []) staticChecks(c, out);
}

function hexes(css: string): Set<string> {
  const s = new Set<string>();
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    let h = m[1].toUpperCase();
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    s.add("#" + h);
  }
  for (const m of css.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
    s.add("#" + [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, "0")).join("").toUpperCase());
  }
  return s;
}

function colourValues(n: RNode, sc: any, theme: any, out: { c: string; where: string }[]) {
  const push = (v: any) => {
    if (v == null) return;
    if (Array.isArray(v)) return v.forEach(push);
    if (typeof v === "object") { if (v.type === "color") push(v.color); if (v.colors) v.colors.forEach((x: any) => push(x.color)); return; }
    const r = resolveValue(typeof v === "string" ? v.replace(/\/\d*\.?\d+%?$/, "") : v, sc, theme);
    if (typeof r === "string" && r.startsWith("#")) out.push({ c: r, where: namePath(n) });
  };
  if (n.enabled !== false) {
    push(n.fill);
    if (n.stroke != null) push(n.stroke);
    for (const e of n.effect ?? []) if (e?.color) push(e.color);
  }
  for (const c of n.children ?? []) colourValues(c, sc, theme, out);
}

/** Text holding a brand's colours: a brand id (bare or "aerender:<id>") or a tokens file. */
function brandPalette(brand: string): string {
  const bare = /^[a-z0-9][a-z0-9-]*$/.test(brand) && !fs.existsSync(brand) && discoverBrands().brands.some((b) => b.id === brand);
  if (brand.startsWith(LIB_ALIAS) || bare) {
    const b = findBrand(brand);
    const files = ["tokens.css", "tokens.lib.json"].map((f) => path.join(b.dir, f)).filter((f) => fs.existsSync(f));
    if (!files.length) throw new Error(`--brand: brand "${b.id}" has no tokens.css or tokens.lib.json (${b.dir})`);
    return files.map((f) => fs.readFileSync(f, "utf8")).join("\n");
  }
  if (!fs.existsSync(brand)) throw new Error(`--brand: ${brand} is neither a brand nor a file. Brands: ${discoverBrands().brands.map((b) => b.id).join(", ")}`);
  return fs.readFileSync(brand, "utf8");
}

export async function lint(file: string, opts: { nodes?: string[]; brand?: string }) {
  const doc = load(file);
  const findings: Finding[] = [];
  const v = validateLoaded(doc);
  for (const i of v.issues) if (i.level === "error") findings.push({ level: "error", kind: "schema", where: i.path, msg: i.msg });
  const sc = buildScene(doc);
  const probs = new Problems();
  const roots = expandAll(sc, probs);
  const targets = opts.nodes ? opts.nodes.flatMap((q) => selectNodes(roots, q)) : roots.some((r) => !r.reusable) ? roots.filter((r) => !r.reusable) : roots;
  targets.forEach((t) => staticChecks(t, findings));

  if (opts.brand) {
    const palette = hexes(brandPalette(opts.brand));
    const used: { c: string; where: string }[] = [];
    targets.forEach((t) => colourValues(t, sc, defaultTheme(sc), used));
    const seen = new Set<string>();
    for (const u of used) {
      const rgb = u.c.slice(0, 7).toUpperCase();
      const full = rgb.length === 4 ? "#" + rgb.slice(1).split("").map((c) => c + c).join("") : rgb;
      if (!palette.has(full) && !seen.has(full + u.where)) {
        seen.add(full + u.where);
        findings.push({ level: "error", kind: "off-palette", where: u.where, msg: `colour ${u.c} is not in ${opts.brand}` });
      }
    }
  }

  const comp = new Compiler(sc, probs);
  const html = comp.document(targets);
  for (const p of probs.list) if (!findings.some((f) => f.msg === p.msg)) findings.push({ level: p.level, kind: "render", where: `#${p.node ?? "?"}`, msg: p.msg });

  const measured: Finding[] = await withPage(html, 1, (page) =>
    page.evaluate(() => {
      const out: { level: "error" | "warn"; kind: string; where: string; msg: string }[] = [];
      const path = (el: Element) => {
        const parts: string[] = [];
        for (let e: Element | null = el; e; e = e.parentElement?.closest("[data-id]") ?? null) {
          parts.unshift((e as HTMLElement).dataset.name ?? "#" + (e as HTMLElement).dataset.id);
        }
        return parts.join("/");
      };
      const px = (n: number) => Math.round(n * 10) / 10;
      for (const root of document.querySelectorAll<HTMLElement>(".ae-slot > [data-id]")) {
        const rr = root.getBoundingClientRect();
        const flagged = new Set<Element>();
        for (const el of [root, ...root.querySelectorAll<HTMLElement>("[data-id]")]) {
          const t = el.dataset.t!;
          const r = el.getBoundingClientRect();
          const parentFlagged = el.parentElement && flagged.has(el.parentElement.closest("[data-id]")!);
          const cs = getComputedStyle(el);
          const paints = el.children.length > 0 || cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.backgroundImage !== "none" || cs.boxShadow !== "none";
          if (["frame", "rectangle", "ellipse", "icon"].includes(t) && paints && (r.width < 0.5 || r.height < 0.5)) {
            out.push({ level: "error", kind: "collapsed", where: path(el), msg: `renders at ${px(r.width)}x${px(r.height)}; give it a size or content` });
          }
          if (t === "text") {
            const span = el.firstElementChild as HTMLElement;
            if (span.scrollWidth > el.clientWidth + 1 && el.dataset.growth !== "auto") {
              out.push({ level: "error", kind: "text-overflow", where: path(el), msg: `text is ${span.scrollWidth}px wide in a ${el.clientWidth}px box` });
            }
            if (el.dataset.growth === "fixed-width-height" && span.scrollHeight > el.clientHeight + 1) {
              out.push({ level: "error", kind: "text-clipped", where: path(el), msg: `text needs ${span.scrollHeight}px height, box is ${el.clientHeight}px; use textGrowth fixed-width or a taller box` });
            }
            const parent = el.parentElement?.closest("[data-id]");
            if (parent) {
              const pr = parent.getBoundingClientRect();
              const over = Math.max(r.right - pr.right, pr.left - r.left, r.bottom - pr.bottom, pr.top - r.top);
              if (over > 1) out.push({ level: "error", kind: "text-overflow", where: path(el), msg: `text spills ${px(over)}px outside its parent` });
            }
          }
          if (r.width > 0 && r.height > 0 && !parentFlagged) {
            const clipper = el.parentElement?.closest("[data-clip]");
            if (clipper && clipper !== el) {
              const cr = clipper.getBoundingClientRect();
              const over = Math.max(r.right - cr.right, cr.left - r.left, r.bottom - cr.bottom, cr.top - r.top);
              if (over > 1) {
                flagged.add(el);
                out.push({ level: t === "text" ? "error" : "warn", kind: "clipped", where: path(el), msg: `cut off by clipping frame ${path(clipper)} (${px(over)}px hidden)` });
                continue;
              }
            }
            const over = Math.max(r.right - rr.right, rr.left - r.left, r.bottom - rr.bottom, rr.top - r.top);
            if (el !== root && over > 1) {
              flagged.add(el);
              out.push({ level: "error", kind: "outside-frame", where: path(el), msg: `extends ${px(over)}px beyond the screen frame` });
            }
          }
        }
      }
      // Connectors that pass through a box they do not connect.
      for (const c of document.querySelectorAll<HTMLElement>('[data-t="connector"]')) {
        const pts: number[][] = JSON.parse(c.dataset.points ?? "[]");
        const ends = [c.dataset.from, c.dataset.to].map((u) => document.querySelector(`[data-uid="${u}"]`));
        const host = c.parentElement!;
        const boxes = [...host.querySelectorAll<HTMLElement>('[data-t="frame"],[data-t="rectangle"],[data-t="ellipse"],[data-t="text"]')]
          .filter((b) => !ends.some((e) => e && (e === b || e.contains(b) || b.contains(e))));
        for (let i = 1; i < pts.length; i++) {
          const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
          const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 4));
          const hit = boxes.find((b) => {
            const r = b.getBoundingClientRect();
            for (let k = 0; k <= steps; k++) {
              const x = x1 + ((x2 - x1) * k) / steps, y = y1 + ((y2 - y1) * k) / steps;
              if (x > r.left + 2 && x < r.right - 2 && y > r.top + 2 && y < r.bottom - 2) return true;
            }
            return false;
          });
          if (hit) { out.push({ level: "warn", kind: "connector-crossing", where: path(c), msg: `passes through ${path(hit)}; set fromSide/toSide or move the boxes` }); break; }
        }
      }
      return out;
    })
  );
  findings.push(...measured);
  const errors = findings.filter((f) => f.level === "error").length;
  const text = findings.length
    ? findings.map((f) => `${f.level} ${f.kind}: ${f.where}: ${f.msg}`).join("\n") + `\n${errors} errors, ${findings.length - errors} warnings`
    : "ok: no layout problems";
  return { ok: errors === 0, text, findings };
}
