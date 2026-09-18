import { useState } from "react";
import { LockKeyhole, LogIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect } from "react";
import { fetchShiftLoginEmployees, loginEditor, loginEmployee, ShiftSession } from "../lib/auth-sync";
import { EmployeeMasterItem } from "../lib/employee-master-sync";

export function ShiftLogin({ employees, onLogin }: { employees: EmployeeMasterItem[]; onLogin: (session: ShiftSession) => void }) {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [operatorOptions, setOperatorOptions] = useState(employees);
  useEffect(() => { fetchShiftLoginEmployees().then(items => { if (items.length) setOperatorOptions(items.map((item, index) => ({ ...item, displayOrder: index + 1, aliases: [], role: "事務員" }))); }).catch(() => undefined); }, []);
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    if (!loginId.trim() || !password || !operatorId) return toast.error("ID・パスワード・操作員を入力してください");
    const operator = operatorOptions.find(item => item.id === operatorId);
    if (!operator) return toast.error("操作員を選択してください");
    setLoading(true);
    try {
      let session: ShiftSession;
      try { session = await loginEmployee(loginId.trim(), password, operator.id, operator.displayName || operator.name); }
      catch { session = await loginEditor(loginId.trim(), password, operator.id, operator.displayName || operator.name); }
      setPassword("");
      onLogin(session);
    } catch (error) { toast.error(error instanceof Error ? error.message : "ログインできませんでした"); }
    finally { setLoading(false); }
  };
  return <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 p-5 font-sans">
    <section className="w-full max-w-md rounded-3xl border border-white/80 bg-white p-7 shadow-2xl shadow-blue-950/10">
      <div className="mb-6 flex items-center gap-4"><img className="h-14 w-14 rounded-2xl shadow-sm" src="/shift-kanri-tool/icon-192.png" alt="" /><div><span className="text-[11px] font-black tracking-[.18em] text-blue-600">PHARMACY SHIFT</span><h1 className="text-2xl font-black text-slate-900">シフト管理</h1></div></div>
      <div className="mb-5 flex items-start gap-3 rounded-2xl bg-blue-50 p-4 text-sm text-blue-950"><LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" /><p className="leading-6">一般用または編集者用のIDでログインし、今回操作する人の名前を必ず選択してください。</p></div>
      <label className="text-xs font-bold text-slate-600">ログインID</label><Input value={loginId} onChange={event => setLoginId(event.target.value)} autoComplete="username" className="mt-2 h-12 rounded-xl" />
      <label className="mt-4 block text-xs font-bold text-slate-600">パスワード</label><Input type="password" value={password} onChange={event => setPassword(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void submit(); }} autoComplete="current-password" className="mt-2 h-12 rounded-xl" />
      <label className="mt-4 block text-xs font-bold text-slate-600">操作する人</label>
      <select className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={operatorId} onChange={event => setOperatorId(event.target.value)}>
        <option value="">名前を選択してください</option>
        {operatorOptions.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.displayName || item.name}</option>)}
      </select>
      <Button className="mt-6 h-12 w-full rounded-xl font-bold" disabled={loading} onClick={() => void submit()}><LogIn className="mr-2 h-4 w-4" />{loading ? "確認中…" : "ログイン"}</Button>
      <p className="mt-4 text-center text-[11px] text-slate-400">ID・パスワードを忘れた場合は管理者へ確認してください。</p>
    </section>
  </main>;
}
