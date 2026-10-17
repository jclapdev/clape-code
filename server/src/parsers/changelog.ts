// CHANGELOG.md: `## 17 October 2026` sections, newest first, each holding `- ` bullets.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const dateHeading = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

export interface ChangelogDay {
  date: string;
  line: number;
  entries: string[];
}

export function parseChangelog(text: string): { title: string | null; days: ChangelogDay[] } {
  const lines = text.split(/\r?\n/);
  let title: string | null = null;
  const days: ChangelogDay[] = [];
  let cur: ChangelogDay | null = null;
  lines.forEach((l, i) => {
    if (/^# /.test(l) && title === null) title = l.slice(2).trim();
    else if (/^## /.test(l)) {
      cur = { date: l.slice(3).trim(), line: i, entries: [] };
      days.push(cur);
    } else if (cur && /^[-*] /.test(l)) (cur as ChangelogDay).entries.push(l.slice(2).trim());
    else if (cur && /^\s+\S/.test(l) && (cur as ChangelogDay).entries.length) {
      const e = (cur as ChangelogDay).entries;
      e[e.length - 1] += " " + l.trim();
    }
  });
  return { title, days };
}

/** Add a bullet under today's heading, creating the heading above the newest one if needed. */
export function addEntry(text: string, entry: string, today = new Date()): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const heading = dateHeading(today);
  const bullet = `- ${entry.replace(/\r?\n/g, " ").trim()}`;
  const { days } = parseChangelog(text);
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
