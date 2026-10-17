// Loads scene and library files and their imports, and normalises them into one internal shape.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brandLibraries } from "./brands.js";

/** Root of the installed package; built-in brands live in its brands/ folder. */
export const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LIB_ALIAS = "aerender:";
export const SCENE_EXT = ".scene.json";
export const LIB_EXT = ".lib.json";
export const SCHEMA = 1;

/** Resolve an import: "aerender:<brand>/<name>" is a library of a discovered brand; anything else is relative to the importing file. */
export function resolveImport(rel: string, from: string): string {
  if (rel.startsWith(LIB_ALIAS)) {
    const libs = brandLibraries();
    const hit = libs.find((l) => l.alias === rel);
    if (!hit) throw new Error(`no library "${rel}". Available: ${libs.map((l) => l.alias).join(", ")}. Run: aerender libs`);
    return hit.file;
  }
  const f = path.resolve(path.dirname(from), rel);
  if (!f.endsWith(LIB_EXT)) throw new Error(`import "${rel}" must point at a ${LIB_EXT} library`);
  return f;
}

/** Check a parsed file is an aerender document. */
function checkDocument(raw: Json, file: string) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${file} is not an aerender document: expected a JSON object`);
  if (raw.aerender !== SCHEMA) {
    throw new Error(`${file} is not an aerender document: add "aerender": ${SCHEMA} at the top level${raw.aerender !== undefined ? ` (found ${JSON.stringify(raw.aerender)})` : ""}`);
  }
}

export type Json = any;

export interface Loaded {
  file: string;
  raw: Json; // the main document exactly as parsed; edits mutate this
  libs: Record<string, { file: string; raw: Json }>;
}

export function readJson(file: string): Json {
  const text = fs.readFileSync(file, "utf8");
  try {
    return JSON.parse(text);
  } catch {
    // Scenes may contain comments; strip // and /* */ outside strings.
    return JSON.parse(stripComments(text));
  }
}

function stripComments(s: string): string {
  let out = "", i = 0, inStr = false;
  while (i < s.length) {
    const c = s[i];
    if (inStr) {
      out += c;
      if (c === "\\") { out += s[i + 1]; i += 2; continue; }
      if (c === '"') inStr = false;
      i++;
    } else if (c === '"') { inStr = true; out += c; i++; }
    else if (c === "/" && s[i + 1] === "/") { while (i < s.length && s[i] !== "\n") i++; }
    else if (c === "/" && s[i + 1] === "*") { i = s.indexOf("*/", i + 2) + 2; }
    else { out += c; i++; }
  }
  return out;
}

export function load(file: string): Loaded {
  const abs = file.startsWith(LIB_ALIAS) ? resolveImport(file, process.cwd()) : path.resolve(file);
  if (!abs.endsWith(SCENE_EXT) && !abs.endsWith(LIB_EXT)) throw new Error(`${file}: aerender reads ${SCENE_EXT} scenes and ${LIB_EXT} libraries`);
  if (!fs.existsSync(abs)) throw new Error(`${file}: file not found`);
  const raw = readJson(abs);
  checkDocument(raw, file);
  const libs: Loaded["libs"] = {};
  // Imports are transitive and share one prefix namespace: a library that imports "t" makes "t:" visible too.
  const queue: [string, string, string][] = Object.entries<string>(raw.imports ?? {}).map(([p, rel]) => [p, rel, abs]);
  while (queue.length) {
    const [prefix, rel, from] = queue.shift()!;
    const lf = resolveImport(rel, from);
    if (libs[prefix]) {
      if (libs[prefix].file !== lf) throw new Error(`import prefix "${prefix}" points at two files: ${libs[prefix].file} and ${lf}; rename one prefix`);
      continue;
    }
    if (!fs.existsSync(lf)) throw new Error(`import "${prefix}": file not found: ${lf}`);
    libs[prefix] = { file: lf, raw: readJson(lf) };
    checkDocument(libs[prefix].raw, rel);
    for (const [p, r] of Object.entries<string>(libs[prefix].raw.imports ?? {})) queue.push([p, r, lf]);
  }
  return { file: abs, raw, libs };
}

export function save(doc: Loaded) {
  fs.writeFileSync(doc.file, JSON.stringify(doc.raw, null, 2) + "\n");
}

// ---------- import prefixing ----------

let libVars: Set<string> = new Set();
const isLibVar = (s: string) => {
  const name = s.slice(1);
  return libVars.has(name) || libVars.has(name.replace(/\/\d*\.?\d+%?$/, ""));
};
const prefixVar = (v: any, P: string): any => {
  if (typeof v === "string" && v.startsWith("$") && !v.slice(1).includes(":") && isLibVar(v)) return "$" + P + ":" + v.slice(1);
  if (Array.isArray(v)) return v.map((x) => prefixVar(x, P));
  if (v && typeof v === "object") {
    const o: any = {};
    for (const [k, x] of Object.entries(v)) o[k] = prefixVar(x, P);
    return o;
  }
  return v;
};

const pid = (id: string, P: string) => (id.includes(":") ? id : `${P}:${id}`);

/** Rewrites a library node tree so its ids, refs and variables live under `P:`. */
export function prefixNode(n: Json, P: string): Json {
  const o: any = {};
  for (const [k, v] of Object.entries<any>(n)) {
    if (k === "id" && typeof v === "string") o.id = pid(v, P);
    else if (k === "ref" && typeof v === "string") o.ref = pid(v, P);
    else if (k === "children" && Array.isArray(v)) o.children = v.map((c) => prefixNode(c, P));
    else if (k === "descendants" && v && typeof v === "object") {
      o.descendants = {};
      for (const [dk, dv] of Object.entries<any>(v)) {
        o.descendants[dk.split("/").map((s) => pid(s, P)).join("/")] = prefixNode(dv, P);
      }
    } else if (k === "slot" && Array.isArray(v)) o.slot = v.map((s: string) => pid(s, P));
    else o[k] = prefixVar(v, P);
  }
  return o;
}

export function prefixVariables(vars: Json, P: string): Json {
  const o: any = {};
  for (const [k, v] of Object.entries<any>(vars ?? {})) o[`${P}:${k}`] = prefixVar(v, P);
  return o;
}

// ---------- normalisation ----------

const ALIGN: Record<string, string> = { inside: "inner", inner: "inner", center: "center", centre: "center", outside: "outer", outer: "outer" };

/** Normalise one node or override object. `rawMap` records which normalised object came from which raw object. */
export function normalise(n: Json, rawMap?: WeakMap<object, object>): Json {
  if (!n || typeof n !== "object") return n;
  const o: any = {};
  for (const [k, v] of Object.entries<any>(n)) {
    if (k === "children" && Array.isArray(v)) o.children = v.map((c) => normalise(c, rawMap));
    else if (k === "descendants" && v && typeof v === "object") {
      o.descendants = {};
      for (const [dk, dv] of Object.entries<any>(v)) o.descendants[dk] = normalise(dv, rawMap);
    } else o[k] = v;
  }
  // A stroke {fill, thickness, align, cap, join} replaces the whole stroke; the compiler reads it as flat fields.
  const s = o.stroke;
  if (s && typeof s === "object" && !Array.isArray(s)) {
    o.stroke = s.fill ?? [];
    o.strokeWidth = s.thickness ?? 1;
    o.strokeAlignment = ALIGN[s.align] ?? "inner";
    o.strokeLinecap = s.cap;
    o.strokeLinejoin = s.join;
  }
  if (o.effect && !Array.isArray(o.effect)) o.effect = [o.effect];
  if (rawMap) rawMap.set(o, n);
  return o;
}

/** Image fill urls in a library are relative to the library file; make them absolute. */
function absoluteImages(v: any, dir: string): any {
  if (Array.isArray(v)) v.forEach((x) => absoluteImages(x, dir));
  else if (v && typeof v === "object") {
    if (v.type === "image" && typeof v.url === "string" && !/^(https?|data|file|aerender):|^\//.test(v.url)) v.url = path.resolve(dir, v.url);
    Object.values(v).forEach((x) => absoluteImages(x, dir));
  }
  return v;
}

export interface Scene {
  roots: Json[]; // normalised main-document roots
  registry: Map<string, Json>; // id -> normalised node (main doc and prefixed libraries)
  variables: Record<string, { type: string; value: any }>; // main + prefixed library variables
  localVars: Set<string>;
  themes: Record<string, string[]>;
  rawMap: WeakMap<object, object>;
  baseDir: string;
  doc: Loaded;
}

export function buildScene(doc: Loaded): Scene {
  const rawMap = new WeakMap<object, object>();
  const registry = new Map<string, Json>();
  const variables: Scene["variables"] = {};
  const themes: Record<string, string[]> = {};
  const index = (n: Json) => {
    if (n.id && !registry.has(n.id)) registry.set(n.id, n);
    for (const c of n.children ?? []) index(c);
  };
  for (const [P, lib] of Object.entries(doc.libs)) {
    libVars = new Set(Object.keys(lib.raw.variables ?? {}));
    const roots = (lib.raw.children ?? []).map((c: Json) => normalise(absoluteImages(prefixNode(c, P), path.dirname(lib.file))));
    roots.forEach(index);
    Object.assign(variables, prefixVariables(lib.raw.variables, P));
    for (const [ax, vals] of Object.entries<any>(lib.raw.themes ?? {})) themes[ax] ??= vals;
  }
  const roots = (doc.raw.children ?? []).map((c: Json) => normalise(c, rawMap));
  roots.forEach(index);
  const localVars = new Set(Object.keys(doc.raw.variables ?? {}));
  Object.assign(variables, doc.raw.variables ?? {});
  Object.assign(themes, doc.raw.themes ?? {});
  return { roots, registry, variables, localVars, themes, rawMap, baseDir: path.dirname(doc.file), doc };
}

/** Short random id that cannot contain '/'. */
export function newId(existing: Set<string>): string {
  const abc = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (;;) {
    let s = "";
    for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
    if (!existing.has(s)) { existing.add(s); return s; }
  }
}
