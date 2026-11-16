/** Pure helpers over Debug Adapter Protocol shapes. No vscode import, so `node out/debug.check.js` can run them. */

export interface Var { name: string; value: string; type?: string; ref: number } // ref = DAP variablesReference, 0 = leaf
export type Fetch = (ref: number) => Promise<Var[]>;

export const MAX_CHILDREN = 200;   // ponytail: hard caps, add paging if someone hits them
export const MAX_DEPTH = 6;

/** The container part of a path being typed: "a.b[0].c" -> "a.b[0]", "a.b[" -> "a.b", "a" -> "". */
export const parentOf = (text: string): string => {
  const i = Math.max(text.lastIndexOf('.'), text.lastIndexOf('['));
  return i > 0 ? text.slice(0, i) : '';
};

const INTERNAL = /^(\[\[.*\]\]|__proto__)$/;                      // js-debug's [[Prototype]] and friends
const leaf = (v: string): unknown => { try { return JSON.parse(v); } catch { return v; } }; // "42" -> 42, '"s"' -> s, else keep the adapter's text

/** Walk a variable tree into a plain JSON value. Arrays are detected by all-numeric child names (plus an optional `length`). */
export async function treeToJson(root: Var, fetch: Fetch, depth = MAX_DEPTH): Promise<unknown> {
  if (!root.ref || depth <= 0) return leaf(root.value);
  const kids = (await fetch(root.ref)).slice(0, MAX_CHILDREN).filter((k) => !INTERNAL.test(k.name));
  const isArr = kids.length > 0 && kids.every((k) => /^\d+$/.test(k.name) || k.name === 'length');
  const items = isArr ? kids.filter((k) => k.name !== 'length') : kids;
  const out: any = isArr ? [] : {};
  for (const k of items) out[isArr ? out.length : k.name] = await treeToJson(k, fetch, depth - 1);
  return out;
}
