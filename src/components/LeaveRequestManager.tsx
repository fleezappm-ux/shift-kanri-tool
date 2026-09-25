import { useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale/ja";
import { AlertTriangle, Check, X } from "lucide-react";
import { LeaveRequest, LeaveRequestStatus } from "../types";
import { Button } from "@/components/ui/button";

interface Props {
  requests: LeaveRequest[];
  loading: boolean;
  onStatusChange: (request: LeaveRequest, status: LeaveRequestStatus, rejectionReason?: string) => Promise<void>;
}

export function LeaveRequestManager({ requests, loading, onStatusChange }: Props) {
  const [target, setTarget] = useState<{ request: LeaveRequest; status: "承認" | "却下" } | null>(null);
  const [reason, setReason] = useState("");
  const visible = requests.filter(item => item.status !== "取消");
  const pending = visible.filter(item => item.status === "申請中" && item.type !== "希望なし").length;
  const counts = visible.filter(item => item.date).reduce<Record<string, number>>((r, item) => ({ ...r, [item.date]: (r[item.date] || 0) + 1 }), {});
  const confirm = async () => {
    if (!target) return;
    await onStatusChange(target.request, target.status, target.status === "却下" ? reason.trim() : "");
    setTarget(null); setReason("");
  };
  return <section className="leave-manager">
    <div className="leave-manager-header"><div><strong>休み希望の調整</strong><span>申請中 {pending}件</span></div>{Object.values(counts).some(c => c >= 2) && <div className="leave-conflict"><AlertTriangle className="w-4 h-4" />同日希望あり</div>}</div>
    {visible.length === 0 ? <p>この期間の希望申請はありません</p> : <div className="leave-manager-list">
      {visible.sort((a,b)=>a.date.localeCompare(b.date)).map(item => <div key={item.id} className={`leave-manager-row status-${item.status}`}>
        <div className="leave-manager-date"><strong>{item.date ? format(new Date(`${item.date}T00:00:00`),"M/d",{locale:ja}) : "希望"}</strong><span>{item.date ? format(new Date(`${item.date}T00:00:00`),"E",{locale:ja}) : "なし"}</span></div>
        <div className="leave-manager-person"><strong>{item.employeeName}</strong><span>{item.type}{item.comment ? `・${item.comment}` : ""}</span>{item.rejectionReason && <small className="text-red-600">却下理由：{item.rejectionReason}</small>}</div>
        <span className="leave-status">{item.status === "申請中" ? "確認中" : item.status}</span>
        {item.status === "申請中" && item.type !== "希望なし" && <div className="leave-manager-actions"><button disabled={loading} onClick={()=>setTarget({request:item,status:"承認"})}><Check className="w-4 h-4"/>承認</button><button disabled={loading} onClick={()=>setTarget({request:item,status:"却下"})}><X className="w-4 h-4"/>却下</button></div>}
      </div>)}
    </div>}
    {target && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"><h3 className="text-lg font-black">{target.status === "承認" ? "この希望を承認しますか？" : "この希望を却下しますか？"}</h3><p className="mt-2 text-sm text-slate-600">{target.request.employeeName}　{target.request.date}　{target.request.type}</p>{target.status === "却下" && <label className="mt-4 block text-sm font-bold">却下理由（任意）<textarea className="mt-2 min-h-24 w-full rounded-xl border p-3 font-normal" value={reason} onChange={e=>setReason(e.target.value)} placeholder="例：人員調整のため" /></label>}<div className="mt-5 grid grid-cols-2 gap-2"><Button variant="outline" onClick={()=>{setTarget(null);setReason("");}}>戻る</Button><Button className={target.status === "却下" ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"} disabled={loading} onClick={()=>void confirm()}>{target.status === "承認" ? "承認する" : "却下する"}</Button></div></div></div>}
  </section>;
}