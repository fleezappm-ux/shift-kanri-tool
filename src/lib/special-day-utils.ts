import { format } from "date-fns";
import { GlobalRemark, SpecialDayRule } from "../types";

export const DEFAULT_SPECIAL_DAY_RULES: SpecialDayRule[] = [{
  id: "tanikawa-closed",
  name: "谷川整形休診",
  color: "blue",
  behavior: "information",
  enabled: true,
  mode: "recurring",
  weekday: 6,
  weeks: [1, 3],
  dates: []
}];

export function matchesSpecialDayRule(date: Date, rule: SpecialDayRule): boolean {
  if (!rule.enabled) return false;
  const key = format(date, "yyyy-MM-dd");
  if (rule.mode === "annual") return rule.dates.includes(key);
  const week = Math.ceil(date.getDate() / 7);
  return date.getDay() === rule.weekday && rule.weeks.includes(week);
}

export function buildDisplayRemarks(manualRemarks: GlobalRemark[], rules: SpecialDayRule[], dates: Date[]): GlobalRemark[] {
  const byDate = new Map<string, GlobalRemark>(manualRemarks.map(remark => [remark.date, { ...remark, source: "manual" }]));
  dates.forEach(date => {
    const key = format(date, "yyyy-MM-dd");
    if (byDate.has(key)) return;
    const matching = rules.find(rule => matchesSpecialDayRule(date, rule));
    if (matching) byDate.set(key, { date: key, type: matching.name, text: "", color: matching.color, source: "rule" });
  });
  return Array.from(byDate.values());
}

export function findSpecialDayRule(date: Date, rules: SpecialDayRule[]) {
  return rules.find(rule => matchesSpecialDayRule(date, rule));
}

export function colorForRemark(remark: GlobalRemark | undefined, rules: SpecialDayRule[]) {
  if (!remark) return undefined;
  if (remark.color) return remark.color;
  if (remark.type === "祝日" || remark.type === "店休日") return "red";
  if (remark.type === "谷川整形休診") return "blue";
  if (remark.type === "当番薬局") return "green";
  return rules.find(rule => rule.name === remark.type)?.color;
}
