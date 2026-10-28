// The settings reference, fetched live and kept in the app folder, with the copy shipped in the repo
// (scripts/settings-reference.ts) for when the computer is offline.
import { parseSettingsReference, REFERENCE_URL, type SettingsReference } from "../parsers/settingsReference";
import shipped from "../data/settings-reference.json";
import { docsCache } from "./docsCache";

export type { ReferenceOrigin } from "./docsCache";

const cache = docsCache<SettingsReference>({
  url: REFERENCE_URL,
  file: "settings-reference.json",
  parse: parseSettingsReference,
  usable: (r) => Array.isArray(r?.topics) && r.topics.length > 0,
  shipped: shipped as SettingsReference,
});

export const referenceCachePath = cache.path;
export const resetSettingsReference = cache.reset;
export const settingsReference = cache.get;
