// CHANGELOG.md in either of two styles, newest first:
//  - dated: `## 17 October 2026` sections holding `- ` bullets (a "What's new" page);
//  - Keep a Changelog: `## Unreleased` and `## <version or date>` sections, bullets grouped under `### Added`, `### Fixed` ….

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const dateHeading = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

export interface ChangelogDay {
  date: string;
  line: number;
  entries: string[];
  /** The `### Added` / `### Fixed` … group of each entry, in Keep a Changelog files; null otherwise. */
  kinds: (string | null)[];
}

export const CHANGE_KINDS = ["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"];

export function parseChangelog(text: string): { title: string | null; days: ChangelogDay[] } {
  const lines = text.split(/\r?\n/);
  let title: string | null = null;
  const days: ChangelogDay[] = [];
  let cur: ChangelogDay | null = null;
  let kind: string | null = null;
  lines.forEach((l, i) => {
    if (/^# /.test(l) && title === null) title = l.slice(2).trim();
    else if (/^## /.test(l)) {
      cur = { date: l.slice(3).trim().replace(/^\[([^\]]+)\]/, "$1"), line: i, entries: [], kinds: [] };
      kind = null;
      days.push(cur);
    } else if (cur && /^### /.test(l)) kind = l.slice(4).trim();
    else if (cur && /^[-*] /.test(l)) {
      (cur as ChangelogDay).entries.push(l.slice(2).trim());
      (cur as ChangelogDay).kinds.push(kind);
    }
    else if (cur && /^\s+\S/.test(l) && (cur as ChangelogDay).entries.length) {
      const e = (cur as ChangelogDay).entries;
      e[e.length - 1] += " " + l.trim();
    }
  });
  return { title, days };
}

/** True when the file keeps an `## Unreleased` section, as Keep a Changelog does. */
export const isKeepAChangelog = (text: string) => /^## \[?Unreleased\]?\s*$/im.test(text);

/**
 * Add a bullet. In a Keep a Changelog file it goes under `## Unreleased`, in the `### <kind>` group
 * (created in the standard order if missing); otherwise under today's dated heading.
 */
export function addEntry(text: string, entry: string, today = new Date(), kind = "Changed"): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const heading = dateHeading(today);
  const bullet = `- ${entry.replace(/\r?\n/g, " ").trim()}`;
  const { days } = parseChangelog(text);
  if (isKeepAChangelog(text)) {
    if (!CHANGE_KINDS.includes(kind)) kind = "Changed";
    const un = days.find((d) => /^unreleased$/i.test(d.date))!;
    const next = days.find((d) => d.line > un.line);
    const end = next ? next.line : lines.length;
    let at = -1;
    for (let i = un.line + 1; i < end; i++) if (lines[i] === `### ${kind}`) at = i;
    if (at >= 0) {
      // After the group's last bullet (and any wrapped lines under it).
      let j = at + 1;
      while (j < end && !/^#{2,3} /.test(lines[j]!)) j++;
      while (j > at + 1 && !lines[j - 1]!.trim()) j--;
      lines.splice(j, 0, bullet);
      return lines.join(eol);
    }
    // New group: before the first group that comes later in the standard order, else at the end of Unreleased.
    const order = CHANGE_KINDS.indexOf(kind);
    let insert = end;
    for (let i = un.line + 1; i < end; i++) {
      const m = /^### (.+)$/.exec(lines[i]!);
      if (m && CHANGE_KINDS.indexOf(m[1]!) > order) {
        insert = i;
        break;
      }
    }
    if (insert === end) while (insert > un.line + 1 && !lines[insert - 1]!.trim()) insert--;
    // Exactly one blank line on each side of the new group, without touching the lines around it.
    const block = [`### ${kind}`, "", bullet];
    if (lines[insert - 1]?.trim()) block.unshift("");
    if (insert < lines.length && lines[insert]?.trim()) block.push("");
    else if (insert >= lines.length) block.push("");
    lines.splice(insert, 0, ...block);
    return lines.join(eol);
  }
  const day = days.find((d) => d.date === heading);

  if (day) {
    const next = days.find((d) => d.line > day.line);
    let end = next ? next.line : lines.length;
    while (end > day.line + 1 && !lines[end - 1].trim()) end--;
    lines.splice(end, 0, bullet);
    return lines.join(eol);
  }
  if (days.length) {
    lines.splice(days[0].line, 0, `## ${heading}`, "", bullet, "");
    return lines.join(eol);
  }
  // No dated sections yet: append one at the end.
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (lines.length) lines.push("");
  lines.push(`## ${heading}`, "", bullet, "");
  return lines.join(eol);
}
