// Compact outline of a design, addressed by name paths. The cheap way for an agent to read a file.
import { load, buildScene } from "./doc.js";
import { expandAll, Problems, RNode, findByPath, prefixKey } from "./resolve.js";
import { selectOne } from "./address.js";

const q = (s: any) => JSON.stringify(String(s).length > 60 ? String(s).slice(0, 57) + "..." : String(s));

function sizeHint(n: RNode): string {
  const f = (v: any) => (v === undefined ? "" : typeof v === "number" ? String(v) : String(v).replace("fill_container", "fill").replace("fit_content", "fit"));
  const w = f(n.width), h = f(n.height);
  return w || h ? ` ${w || "fit"}x${h || "fit"}` : "";
}

let showIds = false;
function label(n: RNode): string {
  const nm = n.name ?? "";
  const idTag = n.name && !showIds && !n.reusable ? "" : ` #${n.id}`;
  switch (n.type) {
    case "text": return `${nm || "text"}${idTag} ${q(n.content ?? "")}`;
    case "icon": return `${nm || "icon"}${idTag} icon:${n.icon}`;
    case "frame": {
      const lay = n.layout === "vertical" ? "v" : n.layout === "none" ? "abs" : "h";
      return `${nm || "frame"}${idTag} [${lay}${sizeHint(n)}${n.reusable ? " component" : ""}${n.slot ? " slot" : ""}]`;
    }
    default: return `${nm || n.type}${idTag} [${n.type}${sizeHint(n)}]`;
  }
}

/** Overrides on an instance, shown with descendant names instead of ids. */
function overrides(n: RNode, sc: any): string {
  const raw = n._m.raw;
  if (!raw?.descendants) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries<any>(raw.descendants)) {
    if (v?.type) { parts.push(`${v.name ?? k}=>${v.type === "ref" ? "→" + (sc.registry.get(v.ref)?.name ?? v.ref) : v.type}`); continue; }
    const hit = findByPath(n, k) ?? findByPath(n, prefixKey(k, raw.ref));
    if (!hit) { parts.push(`stale:${k}`); continue; }
    const nm = (hit.node.name ?? hit.node.type) + (showIds ? `#${hit.node.id}` : "");
    for (const [pk, pv] of Object.entries<any>(v ?? {})) {
      if (pk === "children") continue;
      if (pk === "enabled" && pv === false) parts.push(`-${nm}`);
      else if (pk === "content") parts.push(`${nm}=${q(pv)}`);
      else if (pk === "icon") parts.push(`${nm}=icon:${pv}`);
      else parts.push(`${nm}.${pk}=${typeof pv === "object" ? JSON.stringify(pv) : pv}`);
    }
  }
  return parts.length ? ` {${parts.join(", ")}}` : "";
}

export function tree(file: string, opts: { node?: string; depth?: number; all?: boolean; ids?: boolean }): string {
  showIds = !!opts.ids;
  const doc = load(file);
  const sc = buildScene(doc);
  const roots = expandAll(sc, new Problems());
  const start = opts.node ? [selectOne(roots, opts.node)] : roots;
  const lines: string[] = [];
  const max = opts.depth ?? Infinity;
  const visit = (n: RNode, d: number, insideInst: boolean) => {
    if (n.enabled === false && !opts.all) return;
    let line = "  ".repeat(d) + label(n);
    if (n._m.isInst) line = "  ".repeat(d) + `${n.name ?? ""}${showIds || !n.name || n.reusable ? ` #${n.id}` : ""} → ${n._m.comp} (${n._m.refId})${overrides(n, sc)}`;
    lines.push(line);
    if (d + 1 > max) return;
    for (const c of n.children ?? []) {
      // Instance internals are hidden unless --all; slot contents placed by this document are shown.
      const internal = (n._m.isInst || insideInst) && !c._m.raw;
      if (internal && !opts.all) { if (hasRaw(c)) visit(c, d + 1, true); continue; }
      visit(c, d + 1, insideInst || n._m.isInst === true);
    }
  };
  for (const r of start) visit(r, 0, false);
  return lines.join("\n");
}

function hasRaw(n: RNode): boolean {
  return (n.children ?? []).some((c) => c._m.raw || hasRaw(c));
}
