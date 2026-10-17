// Hand-off outputs: HTML that keeps CSS custom properties, and a compact spec for downstream build agents.
import fs from "node:fs";
import { load, buildScene } from "./doc.js";
import { expandAll, Problems, RNode, resolveVar, defaultTheme, parseVarRef } from "./resolve.js";
import { Compiler } from "./compile.js";
import { selectOne, namePath } from "./address.js";

function target(file: string, node?: string) {
  const sc = buildScene(load(file));
  const probs = new Problems();
  const roots = expandAll(sc, probs);
  const t = node ? selectOne(roots, node) : roots.find((r) => !r.reusable) ?? roots[0];
  if (!t) throw new Error("document has no nodes");
  return { sc, probs, t };
}

export function exportHtml(file: string, node?: string, out?: string): string {
  const { sc, probs, t } = target(file, node);
  const html = new Compiler(sc, probs, { mode: "export" }).document([t]);
  if (!out) return html;
  fs.writeFileSync(out, html);
  return out;
}

export function exportSpec(file: string, node: string | undefined, format: string): string {
  const { sc, t } = target(file, node);
  const theme = defaultTheme(sc);
  const tokens = new Map<string, any>();
  const comps = new Map<string, number>();
  const lines: string[] = [];
  const noteVars = (v: any) => {
    if (typeof v === "string") {
      const r = parseVarRef(v, sc);
      if (r && sc.variables[r.name]) tokens.set(r.name, resolveVar(r.name, sc, theme));
    } else if (Array.isArray(v)) v.forEach(noteVars);
    else if (v && typeof v === "object") Object.values(v).forEach(noteVars);
  };
  const tok = (v: any) => (typeof v === "string" && v.startsWith("$") ? v : v === undefined ? "" : String(v));
  const outline: any[] = [];
  const walk = (n: RNode, d: number, parentOut: any[]) => {
    if (n.enabled === false) return;
    for (const [k, v] of Object.entries(n)) if (k !== "children" && k !== "_m" && k !== "content") noteVars(v);
    const item: any = { name: n.name ?? n.id, type: n.type };
    let line = `${"  ".repeat(d)}- ${n.name ?? n.type}`;
    if (n._m.isInst) { comps.set(n._m.comp!, (comps.get(n._m.comp!) ?? 0) + 1); item.component = n._m.comp; line += ` (component ${n._m.comp})`; }
    if (n.type === "text") {
      item.text = n.content; item.font = [tok(n.fontSize), tok(n.fontWeight), tok(n.fill), n.textTransform ?? ""].filter(Boolean).join(" ");
      line += `: "${n.content}" [${item.font}]`;
    } else if (n.type === "icon") { item.icon = n.icon; line += `: icon ${n.icon}`; }
    else if (n.type === "frame") {
      const img = (Array.isArray(n.fill) ? n.fill : [n.fill]).find((f: any) => f?.type === "image");
      if (img) { item.image = img.url; line += `: image ${img.url}`; }
      const lay = n.layout === "vertical" ? "column" : n.layout === "none" ? "absolute" : "row";
      if ((n.children ?? []).length) line += ` <${lay}${n.gap !== undefined ? ` gap ${tok(n.gap)}` : ""}>`;
    }
    parentOut.push(item);
    // Inside instances only content matters to a builder; skip pure structure.
    const kids = n.children ?? [];
    if (kids.length) {
      item.children = [];
      lines.push(line);
      for (const c of kids) walk(c, d + 1, item.children);
      if (!item.children.length) delete item.children;
    } else lines.push(line);
  };
  walk(t, 0, outline);
  const size = `${typeof t.width === "number" ? t.width : t.width ?? "fit"}x${typeof t.height === "number" ? t.height : t.height ?? "fit"}`;
  if (format === "json") {
    return JSON.stringify({ name: t.name, path: namePath(t), size, components: Object.fromEntries(comps), tokens: Object.fromEntries(tokens), outline }, null, 1);
  }
  const tokLines = [...tokens].map(([k, v]) => `${k}=${v}`).join(", ");
  return [
    `# ${t.name ?? t.id} (${size})`,
    `Source: ${file} → ${namePath(t)}`,
    comps.size ? `Components: ${[...comps].map(([k, v]) => (v > 1 ? `${k} x${v}` : k)).join(", ")}` : "",
    tokens.size ? `Tokens: ${tokLines}` : "",
    "",
    "## Outline",
    ...lines.filter((l) => !/^\s*- (frame|Spacer)$/.test(l)),
  ].filter((l) => l !== "").join("\n");
}
