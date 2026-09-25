import { useEffect, useState } from "react";
import { CalendarCheck2, ChevronRight, Save, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Employee, LeaveRequest, PaidLeaveBalance } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function MyPage({ employee, requests, locked, initialBalance, onSaveBalance, onCancel }: { employee?: Employee; requests: LeaveRequest[]; locked: boolean; initialBalance: PaidLeaveBalance | null; onSaveBalance: (balance: PaidLeaveBalance) => Promise<void>; onCancel: (id: string) => Promise<void>; onEdit?: (request: LeaveRequest) => void }) {
  const [balance, setBalance] = useState<PaidLeaveBalance>(() => initialBalance || { employeeId: employee?.id || "", enabled: false, remainingDays: 0, renewalDate: "", grantDays: 0, updatedAt: "" });
  const [showLeaveSettings, setShowLeaveSettings] = useState(false);
  useEffect(() => setBalance(initialBalance || { employeeId: employee?.id || "", enabled: false, remainingDays: 0, renewalDate: "", grantDays: 0, updatedAt: "" }), [initialBalance, employee?.id]);
  if (!employee) return <p className="p-6 text-center text-slate-500">操作員が見つかりません</p>;
  const mine = requests.filter(item => (item.employeeId ? item.employeeId === employee.id : item.employeeName === (employee.displayName || employee.name)) && item.status !== "取消");
  const save = async () => { await onSaveBalance({ ...balance, employeeId: employee.id, updatedAt: new Date().toISOString() }); toast.success("有給情報を反映しました"); };

  if (showLeaveSettings) return <div className="space-y-4 pb-6">
    <Button variant="outline" onClick={() => setShowLeaveSettings(false)}>← マイページへ戻る</Button>
    <section className="rounded-2xl border bg-white p-5">
      <h1 className="text-xl font-black">有休詳細設定</h1><p className="mt-1 text-xs text-slate-500">本人の任意入力による参考値です。正式な残日数は会社の管理記録を確認してください。</p>
      <div className="mt-5 grid gap-4">
        <div className="flex items-center justify-between"><strong>有休残数を表示</strong><Button variant={balance.enabled ? "default" : "outline"} onClick={() => setBalance(value => ({ ...value, enabled: !value.enabled }))}>{balance.enabled ? "ON" : "OFF"}</Button></div>
        <label className="text-xs font-bold text-slate-600">残り有給日数<Input type="number" min="0" step="0.5" value={balance.remainingDays} onChange={e => setBalance(value => ({ ...value, remainingDays: Number(e.target.value) }))} className="mt-1" /></label>
        <label className="text-xs font-bold text-slate-600">更新日<Input type="date" value={balance.renewalDate} onChange={e => setBalance(value => ({ ...value, renewalDate: e.target.value }))} className="mt-1" /></label>
        <label className="text-xs font-bold text-slate-600">付与日数<Input type="number" min="0" step="0.5" value={balance.grantDays} onChange={e => setBalance(value => ({ ...value, grantDays: Number(e.target.value) }))} className="mt-1" /></label>
        <Button className="h-11 font-bold" onClick={() => void save()}><Save className="mr-2 h-4 w-4" />設定を反映する</Button>
      </div>
    </section>
  </div>;

  return <div className="space-y-4 pb-6">
    <section className="rounded-2xl border bg-white p-5"><div className="mypage-profile-line"><div className="flex items-center gap-3"><UserRound className="h-9 w-9 text-blue-600" /><div><h1 className="text-xl font-black">{employee.displayName || employee.name}</h1><p className="text-sm text-slate-500">{employee.role || "事務員"}</p></div></div>{balance.enabled && <span className="mypage-balance-badge">有休残 {balance.remainingDays}日</span>}</div></section>
    <button type="button" className="w-full rounded-2xl border bg-white p-5 text-left" onClick={() => setShowLeaveSettings(true)}><div className="flex items-center justify-between"><div><strong>有休詳細・設定</strong><p className="mt-1 text-xs text-slate-500">残数・更新日・付与日数を設定</p></div><ChevronRight className="h-5 w-5 text-slate-400" /></div></button>
    <section className="rounded-2xl border bg-white p-5"><h2 className="flex items-center gap-2 font-black"><CalendarCheck2 className="h-5 w-5 text-blue-600" />有給・休み希望詳細</h2><div className="mt-3 space-y-2">{mine.length ? mine.map(item => <div key={item.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><div className="min-w-0 flex-1"><strong className="text-sm">{item.date || "この期間"}　{item.type}</strong>{item.comment && <p className="truncate text-xs text-slate-500">{item.comment}</p>}</div><span className="text-xs font-bold text-slate-500">{item.status}</span>{!locked && item.status === "申請中" && <Button size="icon" variant="ghost" className="text-red-600" onClick={() => { if (window.confirm(`${item.date || "この期間"}の${item.type}を取り下げますか？`)) void onCancel(item.id); }}><Trash2 className="h-4 w-4" /></Button>}</div>) : <p className="py-6 text-center text-sm text-slate-500">提出済みの希望はありません</p>}</div></section>
  </div>;
}
