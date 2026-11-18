import { outputMetaLayout } from "../src/lib/excel-meta";
const assert = (c: boolean, m: string) => { console.log((c ? "PASS: " : "FAIL: ") + m); if (!c) process.exit(1); };
let ok = true;
for (let people = 0; people <= 20; people++) {
  const totalCols = people + 2; // 日付 + 従業員 + 備考
  const l = outputMetaLayout(totalCols, "集計期間", "出力日");
  const inside = l.cells.length === totalCols && l.dateColumn <= totalCols && l.merges.every(([a, b]) => a >= 1 && b <= totalCols && a <= b);
  const overlap = l.merges.some(([a, b], i) => l.merges.some(([c, d], j) => i < j && a <= d && c <= b));
  const dateShown = l.cells.slice(l.dateColumn - 1).join("").includes("出力日");
  if (!inside || overlap || !dateShown) { ok = false; console.log("NG people=", people, JSON.stringify(l)); }
}
assert(ok, "出力日: 従業員0〜20人のどの人数でも、表の幅の中に収まり、結合も重ならない");
