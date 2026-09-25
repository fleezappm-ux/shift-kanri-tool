import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale/ja";
import { Send, Trash2 } from "lucide-react";
import { CommentVisibility, Employee, GlobalRemark, LeaveRequest, LeaveRequestType } from "../types";
import { Button } from "@/components/ui/button";

const TYPES: LeaveRequestType[] = ["有給希望", "休み希望", "出勤希望", "午前休希望", "午後休希望"];

type DraftMap = Record<string, LeaveRequestType>;

interface Props {
  employees: Employee[];
  dates: Date[];
  requests: LeaveRequest[];
  remarks: GlobalRemark[];
  locked: boolean;
  loading: boolean;
  operatorId: string;
  onSubmit: (input: { employeeId: string; employeeName: string; date: string; type: LeaveRequestType; comment: string; commentVisibility: CommentVisibility }) => Promise<LeaveRequest>;
  onCancel: (id: string) => Promise<void>;
  onSaveWorkTime: (id: string, start: string, end: string) => Promise<void>;
}

export function LeaveRequestView({ employees, dates, requests, remarks, locked, loading, operatorId, onSubmit, onCancel, onSaveWorkTime }: Props) {
  const operator = employees.find(item => item.id === operatorId);
  const employeeName = operator?.displayName || operator?.name || "";
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [times, setTimes] = useState<Record<string, { start: string; end: string }>>({});
  const mine = useMemo(() => requests.filter(item => item.employeeName === employeeName && item.status !== "取消"), [requests, employeeName]);
  const requestByDate = new Map<string, LeaveRequest>(mine.filter(item => item.date).map(item => [item.date, item] as [string, LeaveRequest]));
  const periodLabel = dates.length ? `${format(dates[0], "yyyy/M/d")} ～ ${format(dates[dates.length - 1], "M/d")}` : "期間未設定";
  const draftEntries = (Object.entries(drafts) as [string, LeaveRequestType][]).sort(([a], [b]) => a.localeCompare(b));

  const updateDraft = (date: string, value: string) => {
    setDrafts(prev => {
      const next = { ...prev };
      if (!value) delete next[date];
      else next[date] = value as LeaveRequestType;
      return next;
    });
  };

  const submitNote = async () => {
    if (!employeeName || draftEntries.length === 0 || submitting) return;
    if (locked && draftEntries.some(([, type]) => type !== "訂正依頼")) return;
    if (draftEntries.some(([, type]) => type === "訂正依頼") && !comment.trim()) return;
    if (draftEntries.some(([date, type]) => type === "出勤希望" && (!times[date]?.start || !times[date]?.end || times[date].start >= times[date].end))) return;
    const summary = draftEntries.map(([date, type]) => `${format(new Date(`${date}T00:00:00`), "M/d（E）", { locale: ja })}　${type}`).join("\n");
    if (!window.confirm(`以下の希望を提出します。よろしいですか？\n\n${summary}`)) return;
    setSubmitting(true);
    try {
      for (const [date, type] of draftEntries) {
        const saved = await onSubmit({ employeeId: operatorId, employeeName, date, type, comment, commentVisibility: "all" });
        if (type === "出勤希望") await onSaveWorkTime(saved.id, times[date].start, times[date].end);
      }
      setDrafts({});
      setTimes({});
      setComment("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="leave-request-page space-y-4 pb-5">
      <header className="leave-request-hero leave-request-hero-v2">
        <h1>休み希望提出</h1>
        <strong className="leave-request-period">{periodLabel}</strong>
        <span className="leave-request-operator"><small>操作員</small><strong>{employeeName || "未選択"}</strong></span>
      </header>

      <section className="leave-request-card">
        {locked && <p className="leave-locked-message">確定済みの期間です。訂正依頼を提出できます。</p>}
        {employeeName && <>
          <div className="leave-calendar-grid leave-calendar-grid-v2">
            {dates.map(date => {
              const key = format(date, "yyyy-MM-dd");
              const existing = requestByDate.get(key);
              const remark = remarks.find(item => item.date === key);
              const color = remark?.color || (date.getDay() === 0 || remark?.type === "祝日" || remark?.type === "店休日" ? "red" : "");
              const selected = drafts[key] || "";
              return <div key={key} className={`leave-day-card ${existing ? "has-request" : ""} ${selected ? "has-draft" : ""} ${locked ? "is-locked" : ""} ${color ? `special-${color}` : ""}`}>
                <div className="leave-day-date"><strong>{format(date, "M/d")}</strong><small>{format(date, "E", { locale: ja })}</small></div>
                {remark && remark.type !== "なし" && !(date.getDay() === 0 && remark.type === "祝日") && <em>{remark.type}</em>}
                <select value={selected} onChange={event => updateDraft(key, event.target.value)} aria-label={`${format(date, "M/d")}の希望`}>
                  <option value="">希望なし</option>
                  {locked ? <option value="訂正依頼">訂正依頼</option> : TYPES.map(value => <option key={value} value={value}>{value.replace("希望", "")}</option>)}
                </select>
                {existing && !selected && <span className="leave-existing">提出済：{existing.type}</span>}
              </div>;
            })}
          </div>

          <div className="leave-note-card">
            <h2>提出ノート</h2>
            {draftEntries.length === 0 ? <p className="leave-empty">カレンダーの日付から希望種別を選ぶと、ここに追加されます。</p> : <div className="leave-note-lines">
              {draftEntries.map(([date, type]) => <div key={date} className={type === "出勤希望" && (!times[date]?.start || !times[date]?.end) ? "work-time-missing" : ""}><strong>{format(new Date(`${date}T00:00:00`), "M/d（E）", { locale: ja })}</strong><span>{type}</span><button onClick={() => updateDraft(date, "")} aria-label={`${date}を削除`}><Trash2 className="w-4 h-4" /></button>{type === "出勤希望" && <div className="col-span-full mt-2 w-full"><p className="text-xs font-bold text-amber-700">{times[date]?.start && times[date]?.end ? "希望時間" : "希望時間を入力してください"}</p><div className="flex gap-2"><input className="w-1/2 rounded border p-2" type="time" aria-label={`${date}の開始時間`} value={times[date]?.start || ""} onChange={e => setTimes(prev => ({ ...prev, [date]: { start: e.target.value, end: prev[date]?.end || "" } }))} /><input className="w-1/2 rounded border p-2" type="time" aria-label={`${date}の終了時間`} value={times[date]?.end || ""} onChange={e => setTimes(prev => ({ ...prev, [date]: { start: prev[date]?.start || "", end: e.target.value } }))} /></div></div>}</div>)}
            </div>}
            <label className="leave-field-label">{locked ? "訂正したい内容をコメントに書いてください（必須）" : "コメント（任意）"}</label>
            <textarea value={comment} onChange={event => setComment(event.target.value)} placeholder="まとめて伝えたいことがあれば入力してください" rows={3} />
            <Button className="w-full h-12 font-bold" disabled={draftEntries.length === 0 || loading || submitting || (locked && !comment.trim()) || draftEntries.some(([date, type]) => type === "出勤希望" && (!times[date]?.start || !times[date]?.end || times[date].start >= times[date].end))} onClick={submitNote}><Send className="w-4 h-4 mr-2" />{submitting ? "提出中…" : "このノートを提出"}</Button>
          </div>
        </>}
      </section>

      {employeeName && <section className="leave-request-card">
        <h2>提出済みの希望</h2>
        {mine.length === 0 ? <p className="leave-empty">まだ提出されていません</p> : <div className="leave-submitted-list">
          {mine.map(item => <div key={item.id}>
            <div><strong>{item.type}</strong><span>{item.date ? format(new Date(`${item.date}T00:00:00`), "M月d日（E）", { locale: ja }) : "この期間"}</span>{item.comment && <small>{item.comment}</small>}</div>
            <span className={`leave-status status-${item.status}`}>{item.status}</span>
            {item.status === "申請中" && <button aria-label="希望を取り消す" onClick={() => { if (window.confirm(`${item.date || "この期間"}の${item.type}を取り下げますか？`)) void onCancel(item.id); }}><Trash2 className="w-4 h-4" /></button>}
          </div>)}
        </div>}
      </section>}
    </div>
  );
}
