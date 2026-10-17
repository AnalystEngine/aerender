// Surgical edits on the raw document. Nodes inside instances are edited through the instance's `descendants` map.
import fs from "node:fs";
import { load, save, buildScene, Loaded, newId, Json } from "./doc.js";
import { expandAll, Problems, RNode } from "./resolve.js";
import { selectOne, namePath } from "./address.js";
import { validateLoaded } from "./validate.js";

export interface Op { op: string; path?: string; parent?: string; to?: string; node?: Json; props?: Record<string, any>; index?: number; name?: string }

const strip = (n: RNode): Json => {
  const { _m, ...rest } = n;
  if (rest.children) rest.children = rest.children.map(strip);
  return rest;
};

function allIds(raw: Json): Set<string> {
  const s = new Set<string>();
  const walk = (v: any) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      if (typeof v.id === "string" && v.type) s.add(v.id);
      Object.values(v).forEach(walk);
    }
  };
  walk(raw);
  return s;
}

/** Give every node in a fresh subtree an id; replace ids that clash. */
/** Ids that an insert had to change because they were already taken. */
let renamed: string[] = [];

function assignIds(n: Json, ids: Set<string>, fresh = false) {
  if (!n || typeof n !== "object") return;
  if (fresh || typeof n.id !== "string" || ids.has(n.id) || n.id.includes("/")) {
    const old = n.id;
    n.id = newId(ids);
    if (!fresh && typeof old === "string") renamed.push(`${old}->${n.id}`);
  } else ids.add(n.id);
  for (const c of n.children ?? []) assignIds(c, ids, fresh);
  // Nodes placed inside instances (slot fills and replacements) need ids too.
  for (const d of Object.values<any>(n.descendants ?? {})) {
    if (d?.type) assignIds(d, ids, fresh);
    for (const c of d?.children ?? []) assignIds(c, ids, fresh);
  }
}

/** Locate the array that holds a raw object, anywhere in the document. */
function container(raw: Json, obj: Json): { arr: Json[]; index: number } | null {
  let hit: { arr: Json[]; index: number } | null = null;
  const walk = (v: any) => {
    if (hit) return;
    if (Array.isArray(v)) {
      const i = v.indexOf(obj);
      if (i >= 0) { hit = { arr: v, index: i }; return; }
      v.forEach(walk);
    } else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(raw);
  return hit;
}

export function parseValue(v: string): any {
  try { return JSON.parse(v); } catch { return v; }
}

/** A resolved node as standalone JSON (nested instances become plain frames). */
function detach(n: RNode): Json {
  const { _m, ...rest } = n;
  if (rest.type === "ref") rest.type = "frame";
  delete rest.reusable; delete rest.descendants;
  if (rest.children) rest.children = rest.children.map(detach);
  return rest;
}

class Session {
  roots!: RNode[];
  detached = 0;
  baseline: Set<string>;
  constructor(public doc: Loaded) {
    this.refresh();
    this.baseline = errorKeys(validateLoaded(doc).issues);
  }
  refresh() { this.roots = expandAll(buildScene(this.doc), new Problems()); }
  find(q: string) { return selectOne(this.roots, q); }

  /** The raw children array an insert into `parent` should use. */
  childArray(parent: RNode): Json[] {
    const m = parent._m;
    if (m.raw) {
      if (m.raw.type === "ref") {
        if (!m.raw.children) {
          if ((parent.children ?? []).length && !parent.slot) throw new Error(`${namePath(parent)} is an instance whose root is not a slot; insert into one of its slot frames instead`);
          m.raw.children = [];
        }
        return m.raw.children;
      }
      if (!["frame", "group"].includes(m.raw.type)) throw new Error(`${namePath(parent)} is a ${m.raw.type}; only frames and groups take children`);
      return (m.raw.children ??= []);
    }
    if (m.inst) {
      const d = ((m.inst.descendants ??= {})[m.ipath!] ??= {});
      if (d.type) return (d.children ??= []);
      if (!d.children && parent.slot) d.children = []; // a slot's sample content is replaced by the first insert
      if (!d.children) {
        // Not a slot: copy its current children (with overrides applied) into the instance so the insert adds to them.
        const ids = allIds(this.doc.raw);
        d.children = (parent.children ?? []).map((c) => { const j = detach(c); assignIds(j, ids, true); return j; });
        this.detached = (parent.children ?? []).length;
      }
      return d.children;
    }
    throw new Error(`cannot insert into ${namePath(parent)}`);
  }

  /** Drop descendants keys that no longer match anything (e.g. after a children replacement). */
  pruneStale(inst: Json) {
    if (!inst.descendants) return;
    const sc = buildScene(this.doc);
    const probs = new Problems();
    expandAll(sc, probs);
    for (const p of probs.list) {
      const m = p.msg.match(/^descendants key "(.*)" matches nothing/);
      if (m && p.node === inst.id && inst.descendants[m[1]] && !inst.descendants[m[1]].type) delete inst.descendants[m[1]];
    }
  }

  get(q: string): string {
    const n = this.find(q);
    if (n._m.raw) return JSON.stringify(n._m.raw, null, 2);
    const { children, ...props } = strip(n);
    return JSON.stringify({ _inside: n._m.inst?.name ?? n._m.inst?.id, _overrideKey: n._m.ipath, ...props, children: (children ?? []).map((c: Json) => c.name ?? c.id) }, null, 2);
  }

  set(q: string, props: Record<string, any>): string {
    if (q === "@vars" || q === "@variables") return this.setVars(props);
    const n = this.find(q);
    let target: Json;
    if (n._m.raw) target = n._m.raw;
    else if (n._m.inst) target = ((n._m.inst.descendants ??= {})[n._m.ipath!] ??= {});
    else throw new Error(`cannot edit ${namePath(n)}`);
    const ids = allIds(this.doc.raw);
    for (const [k, v] of Object.entries(props)) {
      if (k === "id" || k === "type") throw new Error(`"${k}" cannot be set; delete and insert instead`);
      if (k === "children" && Array.isArray(v)) v.forEach((c) => assignIds(c, ids));
      if (k === "descendants" && v && typeof v === "object") assignIds({ id: "_", descendants: v }, ids);
      if (v === null) delete target[k];
      else target[k] = v;
    }
    if (n._m.inst) this.pruneStale(n._m.inst);
    return `${n._m.raw ? "set" : `set override "${n._m.ipath}" on instance ${n._m.inst?.name ?? n._m.inst?.id}`}: ${namePath(n)} ${Object.keys(props).join(", ")}`;
  }

  setVars(props: Record<string, any>): string {
    const vars = (this.doc.raw.variables ??= {});
    for (const [k, v] of Object.entries(props)) {
      if (k.includes(":")) throw new Error(`"${k}" belongs to an import and is read-only; define a local variable instead`);
      if (v === null) { delete vars[k]; continue; }
      if (v && typeof v === "object" && "type" in v) { vars[k] = v; continue; }
      const type = vars[k]?.type ?? (typeof v === "number" ? "number" : typeof v === "boolean" ? "boolean" : /^#[0-9a-f]{3,8}$/i.test(String(v)) ? "color" : "string");
      vars[k] = { type, value: v };
    }
    return `set variables: ${Object.keys(props).join(", ")}`;
  }

  insert(parentQ: string, node: Json, index?: number): string {
    const top = parentQ === "/";
    const parent = top ? null : this.find(parentQ);
    const arr = parent ? this.childArray(parent) : (this.doc.raw.children ??= []);
    const nodes = Array.isArray(node) ? node : [node];
    const ids = allIds(this.doc.raw);
    renamed = [];
    nodes.forEach((x) => assignIds(x, ids));
    arr.splice(index ?? arr.length, 0, ...nodes);
    const inst = parent?._m.inst ?? (parent?._m.raw?.type === "ref" ? parent._m.raw : null);
    if (inst) this.pruneStale(inst);
    let note = this.detached ? ` (copied its ${this.detached} existing children into the instance)` : "";
    if (renamed.length) note += ` (ids already in use were renamed: ${renamed.join(", ")})`;
    this.detached = 0;
    return `inserted ${nodes.map((x) => `${x.name ?? x.type} #${x.id}`).join(", ")} into ${parent ? namePath(parent) : "document root"}${note}`;
  }

  remove(q: string): string {
    const n = this.find(q);
    if (n._m.raw) {
      const c = container(this.doc.raw, n._m.raw);
      if (!c) throw new Error(`cannot find ${namePath(n)} in the document`);
      c.arr.splice(c.index, 1);
      return `deleted ${namePath(n)}`;
    }
    this.set(q, { enabled: false });
    return `${namePath(n)} is part of instance "${n._m.inst?.name ?? n._m.inst?.id}"; hid it with enabled=false`;
  }

  move(q: string, toQ: string, index?: number): string {
    const n = this.find(q);
    if (!n._m.raw) throw new Error(`${namePath(n)} is part of an instance; copy it instead`);
    const to = toQ === "/" ? null : this.find(toQ);
    for (let p: RNode | undefined | null = to; p; p = p._m.parent) if (p === n) throw new Error("cannot move a node into itself");
    const arr = to ? this.childArray(to) : this.doc.raw.children;
    const c = container(this.doc.raw, n._m.raw)!;
    c.arr.splice(c.index, 1);
    arr.splice(index ?? arr.length, 0, n._m.raw);
    return `moved ${n.name ?? n.id} into ${to ? namePath(to) : "document root"}${index !== undefined ? ` at index ${index}` : ""}`;
  }

  copy(q: string, toQ: string, name?: string, index?: number): string {
    const n = this.find(q);
    const clone = structuredClone(n._m.raw ?? strip(n));
    if (clone.reusable) delete clone.reusable;
    if (name) clone.name = name;
    const to = toQ === "/" ? null : this.find(toQ);
    const arr = to ? this.childArray(to) : this.doc.raw.children;
    assignIds(clone, allIds(this.doc.raw), true);
    arr.splice(index ?? arr.length, 0, clone);
    return `copied ${n.name ?? n.id} to ${to ? namePath(to) : "document root"} as ${clone.name ?? clone.type} #${clone.id}`;
  }

  apply(o: Op): string {
    switch (o.op) {
      case "set": return this.set(o.path!, o.props ?? {});
      case "insert": return this.insert(o.parent ?? o.to!, o.node, o.index);
      case "delete": return this.remove(o.path!);
      case "move": return this.move(o.path!, o.to!, o.index);
      case "copy": return this.copy(o.path!, o.to!, o.name, o.index);
      default: throw new Error(`unknown op "${o.op}" (set, insert, delete, move, copy)`);
    }
  }
}

const errorKeys = (issues: { level: string; msg: string }[]) => new Set(issues.filter((i) => i.level === "error").map((i) => i.msg));

function commit(doc: Loaded, logs: string[], baseline: Set<string>): string {
  const v = validateLoaded(doc);
  const fresh = v.issues.filter((i) => i.level === "error" && !baseline.has(i.msg));
  if (fresh.length) throw new Error(`edit rejected, it would add these errors; nothing written:\n${fresh.map((i) => `error: ${i.path}: ${i.msg}${i.hint ? ` (hint: ${i.hint})` : ""}`).join("\n")}`);
  save(doc);
  return [...logs, v.warnings ? `(${v.warnings} validation warnings; run validate)` : ""].filter(Boolean).join("\n");
}

export function runEdit(cmd: string, args: string[], opts: { index?: string; name?: string }): string {
  const [file, ...rest] = args;
  const s = new Session(load(file));
  const index = opts.index !== undefined ? +opts.index : undefined;
  if (cmd === "get") return s.get(rest[0]);
  let log: string;
  if (cmd === "set") {
    const props: Record<string, any> = {};
    for (const kv of rest.slice(1)) {
      const i = kv.indexOf("=");
      if (i < 1) throw new Error(`expected key=value, got "${kv}"`);
      props[kv.slice(0, i)] = parseValue(kv.slice(i + 1));
    }
    log = s.set(rest[0], props);
  } else if (cmd === "insert") log = s.insert(rest[0], JSON.parse(rest[1]), index);
  else if (cmd === "delete") log = s.remove(rest[0]);
  else if (cmd === "move") log = s.move(rest[0], rest[1], index);
  else log = s.copy(rest[0], rest[1], opts.name, index);
  return commit(s.doc, [log], s.baseline);
}

/** Apply a list of ops in memory; write only if every op succeeds and the result validates. */
export function runBatch(file: string, opsFile: string): string {
  const ops: Op[] = JSON.parse(opsFile === "-" ? fs.readFileSync(0, "utf8") : fs.existsSync(opsFile) ? fs.readFileSync(opsFile, "utf8") : opsFile);
  const s = new Session(load(file));
  const logs: string[] = [];
  ops.forEach((o, i) => {
    try { logs.push(s.apply(o)); } catch (e: any) { throw new Error(`batch op ${i} (${o.op}) failed: ${e.message}; nothing written`); }
    s.refresh();
  });
  return commit(s.doc, logs, s.baseline);
}
