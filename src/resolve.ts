// Expands component instances into a concrete node tree and resolves variables.
import { Json, Scene } from "./doc.js";

export interface Meta {
  raw?: Json; // raw object in the main document that defines this node (edit it directly)
  inst?: Json; // raw `ref` node whose descendants map must hold overrides for this node
  ipath?: string; // override path of this node inside `inst`
  isInst?: boolean; // node is the root of an expanded instance
  comp?: string; // component name, for instances
  refId?: string;
  parent?: RNode;
  uid?: number; // set per compile; unique DOM handle (ids repeat across instances)
}
export type RNode = Json & { _m: Meta; children?: RNode[] };

export class Problems {
  list: { level: "error" | "warn"; msg: string; node?: string }[] = [];
  err(msg: string, node?: string) { this.list.push({ level: "error", msg, node }); }
  warn(msg: string, node?: string) { this.list.push({ level: "warn", msg, node }); }
}

const SKIP_ROOT = new Set(["id", "type", "ref", "descendants", "children", "reusable"]);

function search(node: RNode, seg: string, crossInstances: boolean): { node: RNode; parent: RNode; index: number } | null {
  const kids = node.children ?? [];
  for (let i = 0; i < kids.length; i++) if (kids[i].id === seg) return { node: kids[i], parent: node, index: i };
  for (const c of kids) {
    if (c._m.isInst && !crossInstances) continue;
    const r = search(c, seg, crossInstances);
    if (r) return r;
  }
  return null;
}

export function findByPath(root: RNode, key: string) {
  let cur: any = { node: root };
  for (const seg of key.split("/")) {
    cur = search(cur.node, seg, false) ?? search(cur.node, seg, true);
    if (!cur) return null;
  }
  return cur as { node: RNode; parent: RNode; index: number };
}

export function expand(n: Json, sc: Scene, probs: Problems, inComp = false, stack: string[] = []): RNode {
  if (n.type !== "ref") {
    const o: RNode = { ...n, _m: { raw: inComp ? undefined : sc.rawMap.get(n) } };
    if (n.children) o.children = n.children.map((c: Json) => expand(c, sc, probs, inComp, stack));
    return o;
  }
  const comp = sc.registry.get(n.ref);
  if (!comp || stack.includes(n.ref)) {
    probs.err(comp ? `component cycle through "${n.ref}"` : `ref "${n.ref}" does not match any node id${n.ref?.includes(":") ? "" : " (imported ids need their prefix, e.g. Y:abc)"}`, n.id);
    return { id: n.id, name: n.name, type: "frame", width: 0, height: 0, _m: { raw: inComp ? undefined : sc.rawMap.get(n), isInst: true } };
  }
  if (!comp.reusable) probs.warn(`ref "${n.ref}" points at a node that is not reusable`, n.id);
  const base = expand(comp, sc, probs, true, [...stack, n.ref]);
  for (const [k, v] of Object.entries(n)) if (!SKIP_ROOT.has(k)) base[k] = v;
  base.id = n.id;
  base.name = n.name ?? base.name;
  if (n.reusable) base.reusable = true; else delete base.reusable;
  base._m = { raw: inComp ? undefined : sc.rawMap.get(n), isInst: true, comp: comp.name ?? n.ref, refId: n.ref };
  if (n.children) base.children = n.children.map((c: Json) => expand(c, sc, probs, inComp, stack));
  for (const [key, ov] of Object.entries<any>(n.descendants ?? {})) {
    const hit = findByPath(base, key) ?? findByPath(base, prefixKey(key, n.ref));
    if (!hit) { probs.warn(`descendants key "${key}" matches nothing inside ${comp.name ?? n.ref}${staleHint(n.descendants, key)}`, n.id); continue; }
    if (ov && ov.type) {
      hit.parent.children![hit.index] = expand(ov, sc, probs, inComp, stack);
      continue;
    }
    for (const [k, v] of Object.entries<any>(ov ?? {})) if (k !== "children" && k !== "id") hit.node[k] = v;
    if (ov?.children) hit.node.children = ov.children.map((c: Json) => expand(c, sc, probs, inComp, stack));
  }
  if (!inComp) assignOrigins(base, "", sc.rawMap.get(n) ?? n);
  return base;
}

/** Keys into an imported component need its prefix ("Y:abc"); accept them without it too. */
export function prefixKey(key: string, ref: string): string {
  const i = ref.indexOf(":");
  if (i < 0) return key;
  const P = ref.slice(0, i + 1);
  return key.split("/").map((s) => (s.includes(":") ? s : P + s)).join("/");
}

function staleHint(desc: Record<string, any>, key: string): string {
  const parent = Object.keys(desc).find((k) => k !== key && desc[k]?.children && key.startsWith(k.split("/")[0]));
  return parent ? ` (stale: "${parent}" replaced its children)` : "";
}

function assignOrigins(node: RNode, prefix: string, inst: Json) {
  for (const c of node.children ?? []) {
    if (c._m.raw) continue;
    const p = prefix + c.id;
    c._m.inst = inst;
    c._m.ipath = p;
    assignOrigins(c, c._m.isInst ? p + "/" : prefix, inst);
  }
}

export function setParents(n: RNode, parent?: RNode) {
  n._m.parent = parent;
  for (const c of n.children ?? []) setParents(c, n);
}

export function expandAll(sc: Scene, probs: Problems): RNode[] {
  const roots = sc.roots.map((r) => expand(r, sc, probs));
  roots.forEach((r) => setParents(r));
  return roots;
}

// ---------- variables ----------

export function defaultTheme(sc: Scene): Record<string, string> {
  const t: Record<string, string> = {};
  for (const [ax, vals] of Object.entries(sc.themes)) if (vals.length) t[ax] = vals[0];
  return t;
}

/** Variable reference parts: "$name" or the alpha extension "$name/50%" | "$name/0.5". */
export function parseVarRef(s: string, sc: Scene): { name: string; alpha?: number } | null {
  if (typeof s !== "string" || !s.startsWith("$")) return null;
  const name = s.slice(1);
  if (name in sc.variables) return { name };
  const m = name.match(/^(.*)\/(\d*\.?\d+)(%?)$/);
  if (m && m[1] in sc.variables) return { name: m[1], alpha: m[3] ? +m[2] / 100 : +m[2] };
  return { name };
}

export function pickValue(def: any, theme: Record<string, string>): any {
  if (!Array.isArray(def.value)) return def.value;
  let v: any;
  for (const e of def.value) {
    const ok = Object.entries<string>(e.theme ?? {}).every(([ax, val]) => theme[ax] === val);
    if (ok) v = e.value;
  }
  return v ?? def.value[0]?.value;
}

export function resolveVar(name: string, sc: Scene, theme: Record<string, string>, depth = 0): any {
  const def = sc.variables[name];
  if (!def || depth > 20) return undefined;
  const v = pickValue(def, theme);
  if (typeof v === "string" && v.startsWith("$")) return resolveVar(v.slice(1), sc, theme, depth + 1);
  return v;
}

/** Resolve any value (literal or variable reference) to a JS value. */
export function resolveValue(v: any, sc: Scene, theme: Record<string, string>): any {
  const r = typeof v === "string" ? parseVarRef(v, sc) : null;
  return r ? resolveVar(r.name, sc, theme) : v;
}

export function displayName(n: RNode): string {
  return n.name ?? (n.type === "text" ? "text" : n.type === "icon" ? `icon:${n.icon}` : n.type) + `#${n.id}`;
}
