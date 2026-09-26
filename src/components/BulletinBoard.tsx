import { useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale/ja";
import { MessageSquareText } from "lucide-react";
import { LeaveRequest } from "../types";

export type BoardVisibility = "immediate" | "after_approval" | "private";
export interface BoardPeriod { label: string; locked: boolean; requests: LeaveRequest[]; }
interface Props { periods: BoardPeriod[]; isEditor: boolean; visibility?: BoardVisibility; correctionVisibility?: "all" | "private"; operatorName?: string; compact?: boolean; pendingCorrections?: LeaveRequest[]; onResolve?: (request: LeaveRequest) => Promise<void>; onShiftPeriod?: (direction: number) => void; onOpenBoard?: () => void; onBack?: () => void; }

export function BulletinBoard({ periods, isEditor, visibility = "immediate", correctionVisibility = "private", operatorName, compact = false, pendingCorrections, onResolve, onShiftPeriod, onOpenBoard, onBack }: Props) {
  const [resolving, setResolving] = useState<string | null>(null);
  const canShow = (item: LeaveRequest) => {
    if (item.status === "取消") return false;
    const own = item.employeeName === operatorName;
    if (item.status === "却下") return isEditor && !compact;
    if (item.type === "訂正依頼") return isEditor || own || correctionVisibility === "all";
    if (item.commentVisibility === "editors" && !isEditor && !own) return false;
    if (visibility === "private") return isEditor || own;
    if (visibility === "after_approval") return isEditor || own || item.status === "承認";
    return true;
  };
  const visiblePeriods = compact ? periods.slice(0, 1) : periods.slice(0, 3);
  const corrections = (compact && pendingCorrections ? pendingCorrections : visiblePeriods.flatMap(period => period.requests)).filter(item => item.type === "訂正依頼" && item.status === "申請中" && canShow(item));
  const renderItem = (item: LeaveRequest) => <article key={item.id} className={`rounded-xl border p-3 text-sm ${item.type === "訂正依頼" && item.status === "申請中" ? "border-red-300 bg-red-50" : "border-amber-100 bg-amber-50"}`}>
    <div className="flex flex-wrap items-center gap-2"><strong>{item.employeeName}</strong><span>{item.date ? format(new Date(`${item.date}T00:00:00`), "M/d（E）", { locale: ja }) : "この期間"}</span><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${item.type === "訂正依頼" ? "bg-red-200 text-red-800" : "bg-amber-100 text-amber-800"}`}>{item.type}</span>{item.status !== "申請中" && <span className={`text-xs font-bold ${item.status === "却下" ? "text-red-700" : "text-green-700"}`}>{item.status === "承認" ? "承認されました" : item.status === "却下" ? "却下されました" : "対応済み"}</span>}</div>
    {item.comment && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{item.comment}{isEditor && item.commentVisibility === "editors" ? "（編集者のみ）" : ""}</p>}
    {item.type === "出勤希望" && item.desiredWorkStart && item.desiredWorkEnd && <p className="mt-1 text-xs">{item.desiredWorkStart}〜{item.desiredWorkEnd}</p>}
    {item.status === "却下" && item.rejectionReason && <p className="mt-1 text-xs text-red-700">却下理由：{item.rejectionReason}</p>}
    {item.type === "訂正依頼" && item.status === "申請中" && isEditor && onResolve && <button type="button" disabled={resolving === item.id} className="mt-2 rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-bold text-red-700" onClick={async () => { setResolving(item.id); try { await onResolve(item); } finally { setResolving(null); } }}>対応済みにする</button>}
  </article>;
  if (compact) {
    const period = visiblePeriods[0];
    const visible = period?.requests.filter(canShow).filter(item => !(item.type === "訂正依頼" && item.status === "申請中")) || [];
    return <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-50 px-5 py-4">
        <h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><MessageSquareText className="h-5 w-5 text-amber-600" />お知らせ掲示板</h2>
        <span className="text-xs font-bold text-amber-800">{period?.label || "期間未設定"}</span>
      </div>
      <div className="space-y-2 p-4">
        {corrections.length > 0 && <section className="space-y-2"><h3 className="font-black text-red-700">未対応の訂正依頼</h3>{corrections.map(renderItem)}</section>}
        {visible.map(renderItem)}
        {!corrections.length && !visible.length && <p className="py-4 text-center text-sm text-slate-400">現在お知らせはありません</p>}
      </div>
      {onOpenBoard && <button type="button" onClick={onOpenBoard} className="w-full border-t border-amber-100 px-5 py-3 text-right text-sm font-bold text-blue-700">お知らせをすべて見る ›</button>}
    </section>;
  }
  return <section className="bulletin-board-page space-y-4">
    <header className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm"><div className="flex items-start justify-between gap-2"><h1 className={`flex items-center gap-2 text-xl font-black ${isEditor ? "text-red-700" : "text-slate-900"}`}><MessageSquareText className="h-6 w-6 text-amber-600" />{isEditor ? "お知らせ掲示板管理者" : "お知らせ掲示板"}</h1>{onBack && <button type="button" onClick={onBack} className="shrink-0 rounded-lg px-2 py-1 text-sm font-bold text-slate-700 hover:bg-amber-100">← 戻る</button>}</div><p className="mt-1 text-xs text-slate-500">選んだ期間から3期間分のお知らせ</p></header>
    {!compact && <nav className="flex items-center justify-between rounded-xl border bg-white p-3" aria-label="掲示板の表示期間"><button onClick={() => onShiftPeriod?.(-1)}>‹ 前の期間</button><strong>{visiblePeriods[0]?.label || "期間未設定"}から3期間</strong><button onClick={() => onShiftPeriod?.(1)}>次の期間 ›</button></nav>}
    {corrections.length > 0 && <section className="space-y-2"><h2 className="font-black text-red-700">未対応の訂正依頼</h2>{corrections.map(renderItem)}</section>}
    {visiblePeriods.filter(period => !period.locked || period.requests.some(item => canShow(item) && !(item.type === "訂正依頼" && item.status === "申請中"))).map(period => { const visible = period.requests.filter(canShow).filter(item => !(item.type === "訂正依頼" && item.status === "申請中")); return <section key={period.label} className="rounded-2xl border bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3 border-b pb-3"><strong className="text-base font-black">{period.label}</strong><span className={`rounded-full px-2 py-1 text-[10px] font-black ${period.locked ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{period.locked ? "確定" : "希望受付中"}</span></div><div className="mt-3 space-y-2">{visible.length ? visible.map(renderItem) : <p className="py-5 text-center text-sm text-slate-400">現在お知らせはありません</p>}</div></section>; })}
    {visiblePeriods.length === 0 && corrections.length === 0 && <p className="py-5 text-center text-sm text-slate-400">現在お知らせはありません</p>}
  </section>;
}
