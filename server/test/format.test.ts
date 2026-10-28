// The date under a plan's title on Plans (spec 004 A1): a day, never a time or a file name.
import { describe, expect, test } from "bun:test";
import { day } from "../../web/src/lib/format";

describe("day", () => {
  test("today, yesterday, this year and an earlier year", () => {
    const now = new Date();
    expect(day(now.getTime())).toBe("today");
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    expect(day(y.toISOString())).toBe("yesterday");
    const earlier = new Date(now.getFullYear() - 1, 9, 12, 13, 10);
    expect(day(earlier.getTime())).toBe(`12 Oct ${now.getFullYear() - 1}`);
    const thisYear = new Date(now.getFullYear(), now.getMonth() === 0 ? 1 : 0, 3);
    if (thisYear.getTime() < y.getTime()) expect(day(thisYear.getTime())).toMatch(/^3 (Jan|Feb)$/);
  });

  test("nothing for a missing or broken date", () => {
    expect(day(null)).toBe("");
    expect(day("not a date")).toBe("");
  });
});
