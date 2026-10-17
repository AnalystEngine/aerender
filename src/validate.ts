// Schema checks with JSON paths and fix hints. Hand-written so messages can teach the format.
import { load, buildScene, Loaded, Json } from "./doc.js";
import { expandAll, Problems, parseVarRef } from "./resolve.js";
import { lucideNames, closeMatches, knownFonts } from "./assets.js";
import { selectNodes } from "./address.js";

const COMMON = ["id", "type", "name", "reusable", "theme", "enabled", "opacity", "flipX", "flipY", "layoutPosition", "rotation", "x", "y", "slide"];
const SIZE = ["width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight"];
const GRAPHICS = ["fill", "stroke", "effect"];
const TEXTSTYLE = ["fontFamily", "fontSize", "fontWeight", "letterSpacing", "fontStyle", "underline", "lineHeight", "textAlign", "textAlignVertical", "strikethrough", "textTransform"];
const LAYOUT = ["layout", "gap", "padding", "justifyContent", "alignItems"];
export const PROPS: Record<string, string[]> = {
  frame: [...COMMON, ...SIZE, ...GRAPHICS, ...LAYOUT, "cornerRadius", "children", "clip", "slot", "shape", "imageFilter"],
  group: [...COMMON, "children", "effect"],
  rectangle: [...COMMON, ...SIZE, ...GRAPHICS, "cornerRadius", "imageFilter"],
  ellipse: [...COMMON, ...SIZE, ...GRAPHICS],
  path: [...COMMON, ...SIZE, ...GRAPHICS, "fillRule", "geometry", "viewBox"],
  line: [...COMMON, ...SIZE, "stroke"],
  text: [...COMMON, ...SIZE, "fill", "effect", ...TEXTSTYLE, "content", "textGrowth"],
  icon: [...COMMON, ...SIZE, "effect", "library", "icon", "fill", "lineWidth"],
  connector: [...COMMON, "from", "to", "fromSide", "toSide", "route", "startArrow", "endArrow", "stroke", "dash", "label", "labelFill", "fontFamily", "fontSize", "fontWeight", "letterSpacing", "textTransform"],
};
const STROKE_KEYS = ["fill", "thickness", "align", "cap", "join"];
const ALL_PROPS = [...new Set(Object.values(PROPS).flat())];
const ENUMS: Record<string, string[]> = {
  layout: ["none", "vertical", "horizontal"],
  justifyContent: ["start", "center", "end", "space_between", "space_around"],
  alignItems: ["start", "center", "end"],
  textGrowth: ["auto", "fixed-width", "fixed-width-height"],
  textAlign: ["left", "center", "right", "justify"],
  textAlignVertical: ["top", "middle", "bottom"],
  layoutPosition: ["auto", "absolute"],
  textTransform: ["none", "uppercase", "lowercase", "capitalize"],
  shape: ["rect", "diamond", "pill", "ellipse"],
  imageFilter: ["none", "mono", "desaturate", "dark"],
  route: ["straight", "elbow"],
  fromSide: ["auto", "top", "right", "bottom", "left"],
  toSide: ["auto", "top", "right", "bottom", "left"],
  startArrow: ["none", "arrow", "dot"],
  endArrow: ["none", "arrow", "dot"],
};
const SIZE_RE = /^(fill_container|fit_content)(\(-?\d*\.?\d+\))?$/;
const COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

interface Issue { level: "error" | "warn"; path: string; msg: string; hint?: string }

export function validateLoaded(doc: Loaded): { ok: boolean; text: string; warnings: number; issues: Issue[] } {
  const issues: Issue[] = [];
  const raw = doc.raw;
  const sc = buildScene(doc);
  const add = (level: Issue["level"], path: string, msg: string, hint?: string) => issues.push({ level, path, msg, hint });
  if (raw.aerender !== 1) add("error", "aerender", 'missing schema field', 'add "aerender": 1 at the top level');
  if (!Array.isArray(raw.children)) add("error", "children", "document needs a children array");
  const seen = new Map<string, string>();
  const icons = new Set(lucideNames());

  const checkVar = (v: string, p: string, want?: string) => {
    const r = parseVarRef(v, sc);
    if (!r) return;
    const def = sc.variables[r.name];
    if (!def) {
      const near = closeMatches(r.name, Object.keys(sc.variables), 3);
      add("error", p, `unknown variable "$${r.name}"`, near.length ? `did you mean ${near.map((x) => "$" + x).join(", ")}?` : "define it under variables");
    } else if (want && def.type !== want && !(want === "number" && def.type === "string")) {
      add("warn", p, `variable "$${r.name}" is a ${def.type}, expected ${want}`);
    }
  };
  const checkLen = (v: any, p: string) => {
    if (typeof v === "number") return;
    if (typeof v === "string" && v.startsWith("$")) return checkVar(v, p, "number");
    if (typeof v === "string" && /^-?\d*\.?\d+(px|em)$/.test(v)) return;
    add("error", p, `expected a number or $variable, got ${JSON.stringify(v)}`);
  };
  const checkColor = (v: any, p: string) => {
    if (typeof v === "string") {
      if (v.startsWith("$")) return checkVar(v, p, "color");
      if (!COLOR_RE.test(v)) add("error", p, `invalid colour ${JSON.stringify(v)}`, "use #RGB, #RRGGBB, #RRGGBBAA or $variable (alpha: $name/50%)");
    } else if (v && typeof v === "object") {
      if (v.type === "color") checkColor(v.color, p + ".color");
      else if (v.type === "gradient") (v.colors ?? []).forEach((c: any, i: number) => checkColor(c.color, `${p}.colors[${i}].color`));
      else if (v.type === "image") { if (!v.url) add("warn", p, "image fill has no url; it draws nothing"); if (v.mode && !["cover", "contain", "stretch", "fill", "fit"].includes(v.mode)) add("error", p + ".mode", `invalid image mode "${v.mode}"`, "fill (cover), fit (contain) or stretch"); }
      else add("error", p, `unknown fill type ${JSON.stringify(v.type)}`, "color, gradient or image");
    } else add("error", p, `invalid fill ${JSON.stringify(v)}`);
  };
  const checkFills = (v: any, p: string) => (Array.isArray(v) ? v.forEach((f, i) => checkColor(f, `${p}[${i}]`)) : checkColor(v, p));

  const checkProps = (n: Json, type: string, p: string, parentLayout: string | null, isOverride: boolean) => {
    const allowed = PROPS[type];
    for (const [k, v] of Object.entries<any>(n)) {
      const kp = `${p}.${k}`;
      if (allowed && !allowed.includes(k) && !(type === "ref") && !["children", "descendants", "ref"].includes(k)) {
        const near = closeMatches(k, ALL_PROPS.filter((p) => p !== k), 2);
        add(isOverride ? "warn" : "error", kp, `"${k}" is not a ${type} property`, near.length ? `did you mean ${near.join(" or ")}?` : undefined);
        continue;
      }
      if (ENUMS[k] && typeof v === "string" && !ENUMS[k].includes(v)) add("error", kp, `invalid ${k} ${JSON.stringify(v)}`, `one of: ${ENUMS[k].join(", ")}`);
      else if ((k === "width" || k === "height") && !(typeof v === "string" && SIZE_RE.test(v))) checkLen(v, kp);
      else if (["minWidth", "maxWidth", "minHeight", "maxHeight", "gap", "fontSize", "rotation"].includes(k)) checkLen(v, kp);
      else if (k === "letterSpacing" || k === "lineHeight" || k === "opacity") { if (typeof v !== "number") checkLen(v, kp); }
      else if (k === "padding") (Array.isArray(v) ? (v.length === 2 || v.length === 4 ? v : (add("error", kp, "padding array needs 2 or 4 values"), [])) : [v]).forEach((x: any, i: number) => checkLen(x, `${kp}[${i}]`));
      else if (k === "cornerRadius") (Array.isArray(v) ? v : [v]).forEach((x: any, i: number) => checkLen(x, `${kp}[${i}]`));
      else if (k === "fill") checkFills(v, kp);
      else if (k === "stroke") {
        if (!v || typeof v !== "object" || Array.isArray(v)) { add("error", kp, "stroke must be an object", '{"fill": "$colour", "thickness": 1, "align": "inner"}'); continue; }
        for (const sk of Object.keys(v)) if (!STROKE_KEYS.includes(sk)) add("error", `${kp}.${sk}`, `"${sk}" is not a stroke field`, `stroke fields: ${STROKE_KEYS.join(", ")}`);
        if (v.fill !== undefined) checkFills(v.fill, kp + ".fill");
        if (v.thickness !== undefined) (typeof v.thickness === "object" ? Object.values(v.thickness) : [v.thickness]).forEach((x: any) => checkLen(x, kp + ".thickness"));
        if (v.align !== undefined && !["inner", "center", "outer"].includes(v.align)) add("error", kp + ".align", `invalid align ${JSON.stringify(v.align)}`, "inner, center or outer");
      } else if (k === "lineWidth") checkLen(v, kp);
      else if (k === "fontFamily" && typeof v === "string") {
        if (v.startsWith("$")) checkVar(v, kp, "string");
        else if (!v.split(",").some((f) => knownFonts().includes(f.trim().replace(/['"]/g, "")))) add("warn", kp, `font "${v}" is not bundled; the fallback will draw it`, `bundled: ${knownFonts().join(", ")}`);
      } else if (k === "icon" && typeof v === "string" && !v.startsWith("$") && (n.library ?? "lucide") === "lucide" && !icons.has(v)) {
        add("error", kp, `unknown lucide icon "${v}"`, `close matches: ${closeMatches(v, [...icons]).join(", ")}`);
      } else if (k === "effect") {
        // Variables can sit anywhere inside an effect (colour, offsets, blur).
        const walkVars = (x: any, xp: string) => {
          if (typeof x === "string" && x.startsWith("$")) checkVar(x, xp);
          else if (x && typeof x === "object") for (const [ek, ev] of Object.entries(x)) walkVars(ev, `${xp}.${ek}`);
        };
        walkVars(v, kp);
      } else if (typeof v === "string" && v.startsWith("$") && !["content"].includes(k)) checkVar(v, kp);
      else if (k === "content" && typeof v === "string" && v.startsWith("$") && !sc.variables[v.slice(1)]) add("warn", kp, `content ${JSON.stringify(v)} matches no variable, so it renders as literal text`);
    }
    if (!isOverride && type === "text" && (n.width !== undefined || n.height !== undefined) && !n.textGrowth) {
      add("warn", p, "text width/height is ignored without textGrowth", 'add "textGrowth": "fixed-width" to wrap at a width');
    }
    if (!isOverride && parentLayout && parentLayout !== "none" && (n.x !== undefined || n.y !== undefined) && n.layoutPosition !== "absolute" && (n.x || n.y)) {
      add("warn", p, "x/y are ignored inside a flex layout", 'set layoutPosition "absolute" or parent layout "none"');
    }
  };

  const walk = (n: Json, p: string, parentLayout: string | null) => {
    if (!n || typeof n !== "object") return add("error", p, "node must be an object");
    if (typeof n.id !== "string" || !n.id) add("error", p, "missing id", "every node needs a unique id (insert generates one)");
    else {
      if (n.id.includes("/")) add("error", p + ".id", `id "${n.id}" contains "/"`);
      if (seen.has(n.id)) add("error", p + ".id", `duplicate id "${n.id}" (also at ${seen.get(n.id)})`);
      seen.set(n.id, p);
    }
    if (!n.type) return add("error", p, "missing type");
    if (n.type !== "ref" && !PROPS[n.type]) return add("error", p + ".type", `unknown type "${n.type}"`, `one of: ${Object.keys(PROPS).join(", ")}, ref`);
    if (n.type === "ref") {
      if (!sc.registry.has(n.ref)) add("error", p + ".ref", `ref "${n.ref}" matches no component`, n.ref?.includes(":") ? "check the import prefix and id" : "imported components need their prefix, e.g. Y:abc");
      const comp = sc.registry.get(n.ref);
      let ct = comp?.type;
      for (let c = comp; c?.type === "ref"; c = sc.registry.get(c.ref)) ct = sc.registry.get(c.ref)?.type;
      checkProps(n, ct ?? "ref", p, parentLayout, true);
      for (const [dk, dv] of Object.entries<any>(n.descendants ?? {})) {
        const dp = `${p}.descendants["${dk}"]`;
        if (dv?.type) walk(dv, dp, null);
        else { checkProps(dv ?? {}, "ref", dp, null, true); (dv?.children ?? []).forEach((c: Json, i: number) => walk(c, `${dp}.children[${i}]`, "horizontal")); }
      }
    } else checkProps(n, n.type, p, parentLayout, false);
    (n.children ?? []).forEach((c: Json, i: number) => walk(c, `${p}.children[${i}]`, n.type === "frame" ? n.layout ?? "horizontal" : n.type === "ref" ? null : "none"));
  };
  (raw.children ?? []).forEach((c: Json, i: number) => walk(c, `children[${i}]`, null));

  for (const [k, v] of Object.entries<any>(raw.variables ?? {})) {
    if (!v || !["color", "number", "string", "boolean"].includes(v.type)) add("error", `variables["${k}"]`, "variable needs type color|number|string|boolean");
    if (k.includes(":")) add("error", `variables["${k}"]`, "variable names cannot contain ':'");
  }

  const probs = new Problems();
  try {
    const roots = expandAll(sc, probs);
    // Connector endpoints must name exactly one node in the same top-level frame.
    const visit = (n: any, root: any) => {
      if (n.type === "connector" && n.enabled !== false) {
        for (const k of ["from", "to"]) {
          try {
            const hits = selectNodes([root], n[k] ?? "");
            if (hits.length > 1) add("error", `#${n.id}.${k}`, `connector ${k} "${n[k]}" matches ${hits.length} nodes`, "use an id or a longer name path");
          } catch (e: any) { add("error", `#${n.id}.${k}`, `connector ${k}: ${e.message}`); }
        }
      }
      for (const c of n.children ?? []) visit(c, root);
    };
    roots.forEach((r) => visit(r, r));
  } catch (e: any) { add("error", "", `expansion failed: ${e.message}`); }
  for (const x of probs.list) if (!issues.some((i) => i.msg === x.msg)) add(x.level, `#${x.node ?? "?"}`, x.msg);

  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.length - errors.length;
  const text = issues.length
    ? issues.map((i) => `${i.level}: ${i.path}: ${i.msg}${i.hint ? ` (hint: ${i.hint})` : ""}`).join("\n") + `\n${errors.length} errors, ${warnings} warnings`
    : "ok: no problems";
  return { ok: errors.length === 0, text, warnings, issues };
}

export function validate(file: string) {
  return validateLoaded(load(file));
}
