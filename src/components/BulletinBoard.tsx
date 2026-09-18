import { format } from "date-fns";
import { ja } from "date-fns/locale/ja";
import { ChevronLeft, ChevronRight, MessageSquareText } from "lucide-react";
import { LeaveRequest } from "../types";
import { Button } from "@/components/ui/button";

export function BulletinBoard({ requests, monthLabel, isEditor, locked, onPrevious, onNext }: { requests: LeaveRequest[]; monthLabel: string; isEditor: boolean; locked: boolean; onPrevious?: () => void; onNext?: () => void }) {
  const visible = requests.filter(item => item.status !== "取消" && (isEditor || item.commentVisibility !== "editors"));
  return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <Button variant="ghost" size="icon" onClick={onPrevious} disabled={!onPrevious}><ChevronLeft className="h-4 w-4" /></Button>
      <div className="text-center"><h2 className="flex items-center justify-center gap-2 font-black text-slate-900"><MessageSquareText className="h-5 w-5 text-amber-600" />お知らせ掲示板</h2><p className="text-xs font-semibold text-slate-500">{monthLabel} {locked ? "・確定済み" : "・希望受付中"}</p></div>
      <Button variant="ghost" size="icon" onClick={onNext} disabled={!onNext}><ChevronRight className="h-4 w-4" /></Button>
    </div>
    <div className="mt-3 space-y-2">{visible.length ? visible.map(item => <article key={item.id} className="rounded-xl bg-white/80 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2"><strong>{item.employeeName}</strong><span>{item.date ? format(new Date(`${item.date}T00:00:00`), "M月d日（E）", { locale: ja }) : "この月"}</span><span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">{item.type}</span></div>
      {item.comment && <p className="mt-1 text-xs text-slate-600">{item.comment}{isEditor && item.commentVisibility === "editors" ? "（編集者のみ）" : ""}</p>}
    </article>) : <p className="py-6 text-center text-sm text-slate-500">この月のお知らせはありません</p>}</div>
  </section>;
}
