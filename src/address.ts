// Addresses nodes in the expanded tree by id or by name path ("Screen/Header/Title").
import { RNode, displayName } from "./resolve.js";

export const slug = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "node";

function* walk(n: RNode): Generator<RNode> {
  yield n;
  for (const c of n.children ?? []) yield* walk(c);
}

export function namePath(n: RNode): string {
  const parts: string[] = [];
  for (let c: RNode | undefined = n; c; c = c._m.parent) parts.unshift(c.name ?? c.id);
  return parts.join("/");
}

const matches = (n: RNode, seg: string, ci: boolean) => {
  const m = seg.match(/^(.*)\[(\d+)\]$/);
  const s = m ? m[1] : seg;
  if (n.id === s || n.id === s.replace(/^#/, "")) return true;
  if (!n.name) return false;
  return ci ? n.name.toLowerCase() === s.toLowerCase() : n.name === s;
};

/** Breadth-first: matches at the shallowest depth below each candidate. */
function findBelow(cands: RNode[], seg: string, includeSelf: boolean): RNode[] {
  for (const ci of [false, true]) {
    const out: RNode[] = [];
    for (const c of cands) {
      let level = includeSelf ? [c] : c.children ?? [];
      while (level.length) {
        const hit = level.filter((n) => matches(n, seg, ci));
        if (hit.length) { out.push(...hit); break; }
        level = level.flatMap((n) => n.children ?? []);
      }
    }
    if (out.length) {
      const idx = seg.match(/\[(\d+)\]$/);
      return idx ? (out[+idx[1]] ? [out[+idx[1]]] : []) : [...new Set(out)];
    }
  }
  return [];
}

function step(cands: RNode[], parts: string[], first: boolean): RNode[] {
  if (!parts.length) return cands;
  for (let k = parts.length; k >= 1; k--) {
    const seg = parts.slice(0, k).join("/");
    const hit = findBelow(cands, seg, first);
    if (hit.length) {
      const r = step(hit, parts.slice(k), false);
      if (r.length) return r;
    }
  }
  return [];
}

/** All nodes matching a query. A bare id wins over names. */
export function selectNodes(roots: RNode[], q: string): RNode[] {
  const all = roots.flatMap((r) => [...walk(r)]);
  const id = q.replace(/^#/, "");
  const byId = all.filter((n) => n.id === id);
  if (byId.length) {
    const raw = byId.filter((n) => n._m.raw);
    return raw.length ? [raw[0]] : byId;
  }
  const res = step(roots, q.split("/"), true);
  if (!res.length) {
    const last = q.split("/").pop()!.toLowerCase();
    const near = all.filter((n) => (n.name ?? "").toLowerCase().includes(last)).slice(0, 6).map(namePath);
    throw new Error(`no node matches "${q}"${near.length ? `. Did you mean: ${near.join(" | ")}` : ""}`);
  }
  return res;
}

export function selectOne(roots: RNode[], q: string): RNode {
  const r = selectNodes(roots, q);
  if (r.length > 1) {
    throw new Error(`"${q}" is ambiguous (${r.length} matches): ${r.slice(0, 8).map((n) => `${namePath(n)} (#${n.id})`).join(" | ")}. Add a parent segment, an [index], or use the id.`);
  }
  return r[0];
}

export { displayName };
