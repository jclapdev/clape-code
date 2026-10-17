// Effective settings: which value Claude Code uses and which file it came from.
// Order, highest first: managed, local, project, user (command-line --settings is per launch and not on disk).
// Lists are combined across files; fallbackModel and modelPicker take the whole value from the highest file.

export type Source = "managed" | "local" | "project" | "user";
export const ORDER: Source[] = ["managed", "local", "project", "user"];

const WHOLE_VALUE = new Set(["fallbackModel", "modelPicker"]);

export interface EffectiveEntry {
  key: string;
  value: unknown;
  from: Source | "combined";
  setIn: Source[];
  overridden: { source: Source; value: unknown }[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Merge lower into higher: higher scalars win, lists combine, objects merge key by key. */
export function mergeValues(higher: unknown, lower: unknown, key = ""): unknown {
  if (WHOLE_VALUE.has(key)) return higher;
  if (Array.isArray(higher) && Array.isArray(lower)) {
    const out = [...higher];
    for (const v of lower) if (!out.some((x) => JSON.stringify(x) === JSON.stringify(v))) out.push(v);
    return out;
  }
  if (isObj(higher) && isObj(lower)) {
    const out: Record<string, unknown> = { ...lower };
    for (const [k, v] of Object.entries(higher)) out[k] = k in lower ? mergeValues(v, lower[k], k) : v;
    return out;
  }
  return higher;
}

// `permissions` is shown per sub-key because its lists are what people look for.
function flatten(s: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === "permissions" && isObj(v)) for (const [pk, pv] of Object.entries(v)) out[`permissions.${pk}`] = pv;
    else out[k] = v;
  }
  return out;
}

export function effective(files: Partial<Record<Source, Record<string, unknown> | null>>): EffectiveEntry[] {
  const flat: Partial<Record<Source, Record<string, unknown>>> = {};
  for (const src of ORDER) if (files[src]) flat[src] = flatten(files[src]!);
  const keys = new Set(ORDER.flatMap((s) => Object.keys(flat[s] ?? {})));
  const out: EffectiveEntry[] = [];
  for (const key of [...keys].sort()) {
    const setIn = ORDER.filter((s) => flat[s] && key in flat[s]!);
    const values = setIn.map((s) => flat[s]![key]);
    const mergeable = !WHOLE_VALUE.has(key) && values.every((v) => Array.isArray(v) || isObj(v));
    let value = values[0];
    if (mergeable) for (const v of values.slice(1)) value = mergeValues(value, v, key);
    out.push({
      key,
      value,
      from: mergeable && setIn.length > 1 ? "combined" : setIn[0],
      setIn,
      overridden: mergeable ? [] : setIn.slice(1).map((s) => ({ source: s, value: flat[s]![key] })),
    });
  }
  return out;
}
