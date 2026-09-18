import { useEffect, useState } from "react";
import { CalendarPlus, Check, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SpecialDayBehavior, SpecialDayColor, SpecialDayRule } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const COLORS: { value: SpecialDayColor; label: string }[] = [
  { value: "red", label: "赤帯" }, { value: "blue", label: "青帯" }, { value: "green", label: "緑帯" },
  { value: "amber", label: "黄帯" }, { value: "purple", label: "紫帯" }, { value: "gray", label: "灰帯" }
];
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
interface Props { rules: SpecialDayRule[]; loading: boolean; onSave: (rules: SpecialDayRule[]) => Promise<void>; }

function displayDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

export function SpecialDaySettings({ rules, loading, onSave }: Props) {
  const [drafts, setDrafts] = useState<SpecialDayRule[]>(rules);
  const [dateInputs, setDateInputs] = useState<Record<string, string>>({});
  const [addLocked, setAddLocked] = useState(false);
  const [newRuleId, setNewRuleId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  useEffect(() => setDrafts(rules), [rules]);

  const update = (id: string, patch: Partial<SpecialDayRule>) => setDrafts(current => current.map(rule => rule.id === id ? { ...rule, ...patch } : rule));
  const add = () => {
    if (addLocked) return;
    const id = crypto.randomUUID();
    const rule: SpecialDayRule = { id, name: "新しい特殊日", color: "amber", behavior: "information", enabled: true, mode: "annual", weekday: 0, weeks: [1], dates: [] };
    setDrafts(current => [rule, ...current]);
    setNewRuleId(id);
    setAddLocked(true);
    toast.success("新しい特殊日を一番上に追加しました");
    window.setTimeout(() => {
      document.getElementById(`special-rule-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setAddLocked(false);
    }, 250);
    window.setTimeout(() => setNewRuleId(""), 1600);
  };

  const removeRule = async (id: string) => {
    const target = drafts.find(rule => rule.id === id);
    if (!target || !window.confirm(`「${target.name}」を完全に削除しますか？`)) return;
    const before = drafts;
    const next = drafts.filter(rule => rule.id !== id);
    setDrafts(next);
    setDeletingId(id);
    try {
      await onSave(next);
      toast.success(`「${target.name}」を削除しました`);
    } catch {
      setDrafts(before);
    } finally { setDeletingId(""); }
  };

  const addDate = (rule: SpecialDayRule) => {
    const value = dateInputs[rule.id] || "";
    if (!value) return toast.error("日付を選んでください");
    if (rule.dates.includes(value)) return toast.info("その日付は登録済みです");
    update(rule.id, { dates: [...rule.dates, value].sort() });
    setDateInputs(current => ({ ...current, [rule.id]: "" }));
    toast.success(`${displayDate(value)}を追加しました`);
  };

  return <section className="special-day-settings">
    <div className="special-settings-title">
      <div><CalendarPlus className="w-5 h-5" /><div><strong>薬局ごとの特殊日設定</strong><span>全カレンダーの備考・帯色へ自動反映します</span></div></div>
      <Button variant="outline" disabled={addLocked || loading} onClick={add} className={addLocked ? "special-add-done" : ""}>{addLocked ? <Check className="w-4 h-4 mr-1" /> : <Plus className="w-4 h-4 mr-1" />}{addLocked ? "追加しました" : "特殊日を追加"}</Button>
    </div>
    <p className="special-save-guide">項目を変更したら、一番下の「変更内容を保存」を押してください。ゴミ箱による削除だけは、その場で保存されます。</p>
    <div className="special-rule-list">
      {drafts.map(rule => <div id={`special-rule-${rule.id}`} key={rule.id} className={`special-rule-card ${newRuleId === rule.id ? "is-new" : ""}`}>
        {newRuleId === rule.id && <div className="special-new-label">ここに追加しました</div>}
        <div className="special-rule-main"><Input value={rule.name} aria-label="特殊日の名前" onChange={event => update(rule.id, { name: event.target.value })} /><select aria-label="帯色" value={rule.color} onChange={event => update(rule.id, { color: event.target.value as SpecialDayColor })}>{COLORS.map(color => <option key={color.value} value={color.value}>{color.label}</option>)}</select><select aria-label="日の扱い" value={rule.behavior} onChange={event => update(rule.id, { behavior: event.target.value as SpecialDayBehavior })}><option value="information">情報表示のみ</option><option value="all-off">全員休みにする</option><option value="duty">当番・勤務を優先</option></select><label><input type="checkbox" checked={rule.enabled} onChange={event => update(rule.id, { enabled: event.target.checked })} />有効</label><button type="button" className="special-delete" disabled={loading || deletingId === rule.id} aria-label={`${rule.name}を削除`} onClick={() => removeRule(rule.id)}><Trash2 className="w-4 h-4" /></button></div>
        <div className="special-mode-tabs"><button type="button" className={rule.mode === "recurring" ? "active" : ""} onClick={() => update(rule.id, { mode: "recurring" })}>毎月繰り返し</button><button type="button" className={rule.mode === "annual" ? "active" : ""} onClick={() => update(rule.id, { mode: "annual" })}>年間指定日</button></div>
        {rule.mode === "recurring" ? <div className="special-recurring"><select value={rule.weekday} onChange={event => update(rule.id, { weekday: Number(event.target.value) })}>{WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}曜日</option>)}</select><div>{[1,2,3,4,5].map(week => <label key={week}><input type="checkbox" checked={rule.weeks.includes(week)} onChange={event => update(rule.id, { weeks: event.target.checked ? [...rule.weeks, week].sort() : rule.weeks.filter(value => value !== week) })} />第{week}</label>)}</div></div> : <div className="special-annual">
          <label className="special-date-label">反映する日付</label>
          <div className="special-date-entry"><input type="date" value={dateInputs[rule.id] || ""} onChange={event => setDateInputs(current => ({ ...current, [rule.id]: event.target.value }))} /><Button type="button" variant="outline" onClick={() => addDate(rule)}><Plus className="w-4 h-4 mr-1" />この日を追加</Button></div>
          <div className="special-date-list">{rule.dates.length ? rule.dates.map((date, index) => <div key={date} className="special-date-chip"><span><b>{index + 1}</b>{displayDate(date)}</span><button type="button" aria-label={`${date}を削除`} onClick={() => update(rule.id, { dates: rule.dates.filter(value => value !== date) })}><Trash2 className="w-3.5 h-3.5" /></button></div>) : <small>登録日はまだありません</small>}</div>
        </div>}
      </div>)}
    </div>
    <Button className="w-full h-11 font-bold" disabled={loading || drafts.some(rule => !rule.name.trim())} onClick={() => onSave(drafts)}><Save className="w-4 h-4 mr-2" />変更内容を保存</Button>
  </section>;
}
