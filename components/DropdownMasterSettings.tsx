import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SpecialDayBehavior, SpecialDayColor, SpecialDayRule } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const COLORS: { value: SpecialDayColor; label: string }[] = [
  { value: "red", label: "赤帯" }, { value: "blue", label: "青帯" }, { value: "green", label: "緑帯" },
  { value: "amber", label: "黄帯" }, { value: "purple", label: "紫帯" }, { value: "gray", label: "灰帯" }
];

interface Props { rules: SpecialDayRule[]; loading: boolean; onSave: (rules: SpecialDayRule[]) => Promise<void>; }

export function DropdownMasterSettings({ rules, loading, onSave }: Props) {
  const [drafts, setDrafts] = useState<SpecialDayRule[]>([]);
  useEffect(() => setDrafts([...rules].sort((a, b) => (a.order ?? 999) - (b.order ?? 999))), [rules]);

  const update = (id: string, patch: Partial<SpecialDayRule>) => setDrafts(current => current.map(rule => rule.id === id ? { ...rule, ...patch } : rule));
  const move = (index: number, direction: -1 | 1) => setDrafts(current => {
    const target = index + direction;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const add = () => setDrafts(current => [...current, {
    id: crypto.randomUUID(), name: "新しい項目", color: "amber", behavior: "information", enabled: true,
    mode: "annual", weekday: 0, weeks: [1], dates: [], order: current.length
  }]);
  const save = async () => {
    const normalized = drafts.map((rule, order) => ({ ...rule, name: rule.name.trim(), order }));
    await onSave(normalized);
    toast.success("プルダウンマスターを保存しました");
  };

  return <section className="space-y-5">
    <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-slate-700">
      <b>「なし」と「自由コメント」は固定項目</b>です。ここでは、それ以外の店舗独自項目を設定します。有効な項目だけが全体シフトのプルダウンに表示されます。
    </div>
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_110px_150px_76px_92px] gap-2 px-3 text-[11px] font-bold text-slate-500 max-md:hidden"><span>表示名</span><span>帯色</span><span>日の扱い</span><span>使用</span><span>並び順</span></div>
      {drafts.map((rule, index) => <div key={rule.id} className="grid grid-cols-[1fr_110px_150px_76px_92px] gap-2 rounded-xl border bg-white p-3 shadow-sm max-md:grid-cols-1">
        <Input value={rule.name} onChange={event => update(rule.id, { name: event.target.value })} aria-label="表示名" />
        <select className="h-10 rounded-md border bg-white px-2 text-sm" value={rule.color} onChange={event => update(rule.id, { color: event.target.value as SpecialDayColor })}>{COLORS.map(color => <option key={color.value} value={color.value}>{color.label}</option>)}</select>
        <select className="h-10 rounded-md border bg-white px-2 text-sm" value={rule.behavior} onChange={event => update(rule.id, { behavior: event.target.value as SpecialDayBehavior })}><option value="information">情報表示のみ</option><option value="all-off">全員休み</option><option value="duty">勤務を優先</option></select>
        <label className="flex h-10 items-center gap-2 text-sm font-bold"><input type="checkbox" checked={rule.enabled} onChange={event => update(rule.id, { enabled: event.target.checked })} />{rule.enabled ? "有効" : "無効"}</label>
        <div className="flex gap-1">
          <Button type="button" variant="outline" size="icon" disabled={index === 0} onClick={() => move(index, -1)} aria-label="上へ"><ArrowUp className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="icon" disabled={index === drafts.length - 1} onClick={() => move(index, 1)} aria-label="下へ"><ArrowDown className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" size="icon" className="text-red-600" onClick={() => window.confirm(`「${rule.name}」を削除しますか？\n登録済みの日付設定も削除されます。`) && setDrafts(current => current.filter(item => item.id !== rule.id))} aria-label="削除"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>)}
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <Button type="button" variant="outline" className="h-11 font-bold" onClick={add}><Plus className="mr-2 h-4 w-4" />項目を追加</Button>
      <Button type="button" className="h-11 font-bold" disabled={loading || drafts.some(rule => !rule.name.trim())} onClick={() => void save()}><Save className="mr-2 h-4 w-4" />変更内容を保存</Button>
    </div>
  </section>;
}
