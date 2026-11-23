import { describe, expect, test } from "bun:test";
import { busAge } from "../lib/age";
import { parseCsv } from "../lib/csv";
import { formatPlate, normalizeKey, plateCountries } from "../lib/normalize";

describe("parseCsv", () => {
  test("reads quoted fields, escaped quotes and CRLF line endings", () => {
    const rows = parseCsv('Feed_ID,model\r\nse-ul,"Lion\'s City, 18G"\r\n\r\nse-sl,"Say ""hi"""\r\n');
    expect(rows).toEqual([
      { line: 2, values: { feed_id: "se-ul", model: "Lion's City, 18G" } },
      { line: 4, values: { feed_id: "se-sl", model: 'Say "hi"' } },
    ]);
  });

  test("reads a row under the committed changes file header", async () => {
    const text = await Bun.file(new URL("../data/changes.csv", import.meta.url)).text();
    const [row] = parseCsv(`${text.trimEnd()}\nse-ul,452`).slice(-1);
    expect(row.values.feed_id).toBe("se-ul");
    expect(row.values.match_fleet).toBe("452");
    expect(row.values.status).toBe("");
  });
});

describe("plates", () => {
  test("normalises and formats plates per country", () => {
    expect(normalizeKey(" abc-12d ")).toBe("ABC12D");
    expect(plateCountries(normalizeKey("AB12 CDE"))).toContain("GB");
    expect(formatPlate("ab12cde", "GB")).toBe("AB12 CDE");
    expect(formatPlate("abc12d", "SE")).toBe("ABC 12D");
  });
});

describe("busAge", () => {
  test("prefers the registration date and falls back to the build year", () => {
    const now = new Date(2026, 10, 23);
    expect(busAge("2020-03", 2019, now)).toEqual({ years: 6, months: 8, approximate: false });
    expect(busAge(null, 2019, now)).toEqual({ years: 7, months: 0, approximate: true });
    expect(busAge(null, null, now)).toBeNull();
  });
});
