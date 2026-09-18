import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmployeeMasterItem } from "../lib/employee-master-sync";

export function EmployeeMasterSettings({ employees, onSave }: { employees: EmployeeMasterItem[]; onSave: (items: EmployeeMasterItem[]) => Promise<void> }) {
  const [drafts, setDrafts] = useState(employees);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDrafts(employees), [employees]);
  const update = (id: string, patch: Partial<EmployeeMasterItem>) => setDrafts(items => items.map(item => item.id === id ? { ...item, ...patch } : item));
  const move = (index: number, direction: -1 | 1) => setDrafts(items => { const nextIndex = index + direction; if (nextIndex < 0 || nextIndex >= items.length) return items; const next = [...items]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]; return next.map((item, order) => ({ ...item, displayOrder: order + 1 })); });
  const add = () => setDrafts(items => [...items, { id: crypto.randomUUID(), name: "", displayName: "", displayOrder: items.length + 1, active: true, aliases: [], role: "事務員" }]);
  const remove = (id: string) => {
    const target = drafts.find(item => item.id === id);
    if (!target || !window.confirm(`「${target.displayName || target.name || "新しい従業員"}」を一覧から削除しますか？\n過去のNotionデータは削除されません。`)) return;
    update(id, { active: false });
  };
  const submit = async () => {
    if (drafts.some(item => item.active && (!item.name.trim() || !item.displayName.trim()))) return toast.error("氏名と表示名を入力してください");
    const duplicateNames = drafts.filter(item => item.active).filter((item, index, items) => items.findIndex(other => other.displayName.trim() === item.displayName.trim()) !== index);
    if (duplicateNames.length) return toast.error("同じ表示名があります。識別できる表示名に変更してください");
    setSaving(true);
    try { await onSave(drafts.map((item, index) => ({ ...item, displayOrder: index + 1 }))); toast.success("従業員マスターを保存しました"); }
    finally { setSaving(false); }
  };
  const activeDrafts = drafts.filter(item => item.active);
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
    <div className="flex items-center justify-between gap-3"><div><h4 className="font-black text-slate-900">従業員マスター</h4><p className="mt-1 text-xs text-slate-500">この順番が全体シフト・個人選択・Excelへ反映されます。</p></div><Button variant="outline" onClick={add}><Plus className="mr-1 h-4 w-4" />従業員追加</Button></div>
    <div className="space-y-2">{activeDrafts.map((item, index) => <div key={item.id} className="grid items-center gap-2 rounded-xl border bg-white p-3 sm:grid-cols-[42px_1fr_1fr_150px_auto]">
      <div className="flex h-10 items-center justify-center rounded-lg bg-slate-100 text-sm font-black text-slate-600">{index + 1}</div>
      <Input value={item.name} placeholder="氏名" onChange={event => { const old = item.name; const name = event.target.value; update(item.id, { name, displayName: item.displayName === old ? name : item.displayName, aliases: old && old !== name ? [...new Set([...(item.aliases || []), old])] : item.aliases }); }} />
      <Input value={item.displayName} placeholder="画面の表示名（同姓同名の識別用）" onChange={event => update(item.id, { displayName: event.target.value })} />
      <select className="h-10 rounded-md border bg-white px-3 text-sm" value={item.role || "事務員"} onChange={event => update(item.id, { role: event.target.value as EmployeeMasterItem["role"] })}><option>薬剤師</option><option>事務員</option><option>登録販売者</option></select>
      <div className="flex gap-1"><Button variant="outline" size="icon" disabled={index === 0} onClick={() => move(drafts.indexOf(item), -1)}><ArrowUp className="h-4 w-4" /></Button><Button variant="outline" size="icon" disabled={index === activeDrafts.length - 1} onClick={() => move(drafts.indexOf(item), 1)}><ArrowDown className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => remove(item.id)}><Trash2 className="h-4 w-4" /></Button></div>
    </div>)}</div>
    <Button className="h-11 w-full font-bold" disabled={saving} onClick={() => void submit()}><Save className="mr-2 h-4 w-4" />{saving ? "保存中…" : "従業員マスターを保存"}</Button>
  </section>;
}
