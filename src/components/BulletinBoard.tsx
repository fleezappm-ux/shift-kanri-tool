import { format } from "date-fns";
import { ja } from "date-fns/locale/ja";
import { MessageSquareText } from "lucide-react";
import { LeaveRequest } from "../types";

export type BoardVisibility = "immediate" | "after_approval" | "private";
export interface BoardPeriod { label: string; locked: boolean; requests: LeaveRequest[]; }

export function BulletinBoard({ periods, isEditor, visibility = "immediate", operatorName }: { periods: BoardPeriod[]; isEditor: boolean; visibility?: BoardVisibility; operatorName?: string }) {
  const canShow = (item: LeaveRequest) => {
    if (item.status === "取消") return false;
    const own = item.employeeName === operatorName;
    if (item.commentVisibility === "editors" && !isEditor && !own) return false;
    if (visibility === "private") return isEditor || own;
    if (visibility === "after_approval") return isEditor || own || item.status === "承認";
    return true;
  };
  return <section className="bulletin-board-page space-y-4">
    <header className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <h1 className="flex items-center gap-2 text-xl font-black text-slate-900"><MessageSquareText className="h-6 w-6 text-amber-600" />お知らせ掲示板</h1>
      <p className="mt-1 text-xs font-semibold text-slate-500">現在のシフト期間から3期間分をまとめて表示</p>
    </header>
    {periods.map(period => {
      const visible = period.requests.filter(canShow);
      return <section key={period.label} className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b pb-3"><strong className="text-base font-black">{period.label}</strong><span className={`rounded-full px-2 py-1 text-[10px] font-black ${period.locked ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{period.locked ? "確定" : "希望受付中"}</span></div>
        <div className="mt-3 space-y-2">{visible.length ? visible.map(item => <article key={item.id} className="rounded-xl bg-slate-50 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2"><strong>{item.employeeName}</strong><span>{item.date ? format(new Date(`${item.date}T00:00:00`), "M/d（E）", { locale: ja }) : "この期間"}</span><span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">{item.type}</span></div>
          {item.comment && <p className="mt-1 text-xs text-slate-600">{item.comment}{isEditor && item.commentVisibility === "editors" ? "（編集者のみ）" : ""}</p>}
        </article>) : <p className="py-5 text-center text-sm text-slate-400">この期間のお知らせはありません</p>}</div>
      </section>;
    })}
  </section>;
}
