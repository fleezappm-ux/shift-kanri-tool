import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale/ja";
import { CalendarDays, CheckCircle2, Send, Trash2 } from "lucide-react";
import { CommentVisibility, Employee, GlobalRemark, LeaveRequest, LeaveRequestType } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TYPES: LeaveRequestType[] = ["有給希望", "休み希望", "午前休希望", "午後休希望"];

interface Props {
  employees: Employee[];
  dates: Date[];
  requests: LeaveRequest[];
  remarks: GlobalRemark[];
  locked: boolean;
  loading: boolean;
  operatorId: string;
  onSubmit: (input: { employeeId: string; employeeName: string; date: string; type: LeaveRequestType; comment: string; commentVisibility: CommentVisibility }) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
  monthOptions: { key: string; label: string; locked: boolean }[];
  currentMonthKey: string;
  onMonthSelect: (key: string) => void;
}

export function LeaveRequestView({ employees, dates, requests, remarks, locked, loading, operatorId, onSubmit, onCancel, monthOptions, currentMonthKey, onMonthSelect }: Props) {
  const operator = employees.find(item => item.id === operatorId);
  const employeeName = operator?.displayName || operator?.name || "";
  const [selectedDate, setSelectedDate] = useState("");
  const [type, setType] = useState<LeaveRequestType>("有給希望");
  const [comment, setComment] = useState("");
  const [commentVisibility, setCommentVisibility] = useState<CommentVisibility>("all");
  const [confirming, setConfirming] = useState(false);
  const mine = useMemo(() => requests.filter(item => item.employeeName === employeeName && item.status !== "取消"), [requests, employeeName]);
  const requestByDate = new Map(mine.map(item => [item.date, item]));

  const submit = async () => {
    if (!employeeName || !selectedDate) return;
    if (!confirming) { setConfirming(true); return; }
    await onSubmit({ employeeId: operatorId, employeeName, date: selectedDate, type, comment, commentVisibility });
    setComment("");
    setConfirming(false);
  };

  return (
    <div className="leave-request-page space-y-4 pb-5">
      <header className="leave-request-hero">
        <div className="leave-request-title"><span>SHIFT REQUEST</span><h1>休み希望を提出</h1><p>希望受付中のシフト案に申請します</p></div>
        <CalendarDays className="leave-request-icon w-9 h-9" />
      </header>

      <section className="leave-month-panel">
        <small>希望を出す月</small>
        <div className="leave-request-months">{monthOptions.map(month => <Button key={month.key} className={`${month.locked ? "is-final" : "is-open"} ${month.key === currentMonthKey ? "is-current" : ""}`} variant="outline" onClick={() => { setSelectedDate(""); setConfirming(false); onMonthSelect(month.key); }}>{month.label}</Button>)}</div>
        <p className="leave-status-guide">確定シフトは黒、その他は白で表示されます。確定シフトの変更・休み希望の提出はできません。</p>
      </section>

      <section className="leave-request-card">
        <><label className="leave-field-label">操作員</label><div className="rounded-xl bg-slate-100 p-3 text-sm font-black">{employeeName || "未選択"}</div></>
        <p className="leave-period-note">現在の表示期間：{format(dates[0], "yyyy/M/d")}〜{format(dates[dates.length - 1], "M/d")}</p>

        {employeeName && <>
          <label className="leave-field-label">希望日をタップ</label>
          <div className="leave-calendar-grid">
            {dates.map(date => {
              const key = format(date, "yyyy-MM-dd");
              const existing = requestByDate.get(key);
              const remark = remarks.find(item => item.date === key);
              const color = remark?.color || (date.getDay() === 0 || remark?.type === "祝日" || remark?.type === "店休日" ? "red" : "");
              return <button key={key} disabled={locked} className={`${selectedDate === key ? "is-selected" : ""} ${existing ? "has-request" : ""} ${locked ? "is-locked" : ""} ${color ? `special-${color}` : ""}`} onClick={() => setSelectedDate(key)} title={locked ? "確定シフトのため選択できません" : remark?.type}>
                <small>{format(date, "E", { locale: ja })}</small><strong>{format(date, "d")}</strong>{remark && <em>{remark.type}</em>}{existing && <span>希望済</span>}
              </button>;
            })}
          </div>

          {!locked && <>
          <label className="leave-field-label">希望内容</label>
          <div className="leave-type-grid">
            {TYPES.map(value => <button key={value} className={type === value ? "is-selected" : ""} onClick={() => setType(value)}>{value}</button>)}
          </div>
          <Input value={comment} onChange={event => setComment(event.target.value)} placeholder="理由・連絡事項（任意）" className="h-11" />
          <label className="leave-field-label">コメントの公開範囲</label><select className="leave-native-select" value={commentVisibility} onChange={event => setCommentVisibility(event.target.value as CommentVisibility)}><option value="all">全員に表示</option><option value="editors">編集者のみに表示</option></select>
          {confirming && <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4 text-sm"><strong>提出内容を確認してください</strong><p className="mt-2">{employeeName}／{selectedDate}／{type}</p>{comment && <p className="mt-1">{comment}</p>}<p className="mt-1 text-xs text-slate-500">公開範囲：{commentVisibility === "all" ? "全員" : "編集者のみ"}</p></div>}
          <Button className="w-full h-12 font-bold" disabled={!selectedDate || loading} onClick={submit}><Send className="w-4 h-4 mr-2" />{confirming ? "提出する" : "提出内容を確認"}</Button>
          <Button variant="outline" className="w-full h-11 font-bold" disabled={loading || mine.some(item => item.type === "希望なし")} onClick={() => onSubmit({ employeeId: operatorId, employeeName, date: "", type: "希望なし", comment: "", commentVisibility: "all" })}><CheckCircle2 className="w-4 h-4 mr-2" />この月は希望なし</Button>
          </>}
        </>}
      </section>

      {employeeName && <section className="leave-request-card">
        <h2>提出した希望</h2>
        {mine.length === 0 ? <p className="leave-empty">まだ提出されていません</p> : <div className="leave-submitted-list">
          {mine.map(item => <div key={item.id}>
            <div><strong>{item.type}</strong><span>{item.date ? format(new Date(`${item.date}T00:00:00`), "M月d日（E）", { locale: ja }) : "この月"}</span>{item.comment && <small>{item.comment}</small>}</div>
            <span className={`leave-status status-${item.status}`}>{item.status}</span>
            {!locked && item.status === "申請中" && <button aria-label="希望を取り消す" onClick={() => onCancel(item.id)}><Trash2 className="w-4 h-4" /></button>}
          </div>)}
        </div>}
      </section>}
      <p className="leave-auth-note">現在の操作員として希望を提出します。</p>
    </div>
  );
}
