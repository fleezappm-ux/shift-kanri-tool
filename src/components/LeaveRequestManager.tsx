import { format } from "date-fns";
import { ja } from "date-fns/locale/ja";
import { AlertTriangle, Check, X } from "lucide-react";
import { LeaveRequest, LeaveRequestStatus } from "../types";

interface Props {
  requests: LeaveRequest[];
  loading: boolean;
  onStatusChange: (request: LeaveRequest, status: LeaveRequestStatus) => Promise<void>;
}

export function LeaveRequestManager({ requests, loading, onStatusChange }: Props) {
  const visible = requests.filter(item => item.status !== "取消");
  const pending = visible.filter(item => item.status === "申請中" && item.type !== "希望なし").length;
  const counts = visible.filter(item => item.date).reduce<Record<string, number>>((result, item) => ({ ...result, [item.date]: (result[item.date] || 0) + 1 }), {});
  return <section className="leave-manager">
    <div className="leave-manager-header"><div><strong>休み希望の調整</strong><span>申請中 {pending}件</span></div>{Object.values(counts).some(count => count >= 2) && <div className="leave-conflict"><AlertTriangle className="w-4 h-4" />同日希望あり</div>}</div>
    {visible.length === 0 ? <p>この期間の希望申請はありません</p> : <div className="leave-manager-list">
      {visible.sort((a, b) => a.date.localeCompare(b.date)).map(item => <div key={item.id} className={`leave-manager-row status-${item.status}`}>
        <div className="leave-manager-date"><strong>{item.date ? format(new Date(`${item.date}T00:00:00`), "M/d", { locale: ja }) : "希望"}</strong><span>{item.date ? format(new Date(`${item.date}T00:00:00`), "E", { locale: ja }) : "なし"}</span></div>
        <div className="leave-manager-person"><strong>{item.employeeName}</strong><span>{item.type}{item.comment ? `・${item.comment}` : ""}</span></div>
        <span className="leave-status">{item.status}</span>
        {item.status === "申請中" && item.type !== "希望なし" && <div className="leave-manager-actions"><button disabled={loading} onClick={() => onStatusChange(item, "承認")}><Check className="w-4 h-4" />承認</button><button disabled={loading} onClick={() => onStatusChange(item, "却下")}><X className="w-4 h-4" />却下</button></div>}
      </div>)}
    </div>}
  </section>;
}
