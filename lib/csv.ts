/**
 * Parses CSV text (RFC 4180: commas, double-quoted fields, "" for a literal quote) into rows keyed by the header.
 * @param text The whole CSV file.
 * @returns One object per non-empty data row, with each value trimmed, plus its line number in the file.
 */
export function parseCsv(text: string): { line: number; values: Record<string, string> }[] {
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let start = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        if (ch === "\n") line++;
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cells.push(cell);
      records.push({ line: start, cells });
      cells = [];
      cell = "";
      line++;
      start = line;
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || cells.length > 0) {
    cells.push(cell);
    records.push({ line: start, cells });
  }
  const [header, ...rows] = records.filter((r) => r.cells.some((c) => c.trim() !== ""));
  if (!header) return [];
  const names = header.cells.map((c) => c.trim().toLowerCase());
  return rows.map((r) => ({
    line: r.line,
    values: Object.fromEntries(names.map((name, i) => [name, (r.cells[i] ?? "").trim()])),
  }));
}
