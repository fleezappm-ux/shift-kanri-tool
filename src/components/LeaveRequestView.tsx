import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale/ja";
import { CalendarDays, CheckCircle2, Send, Trash2 } from "lucide-react";
import { Employee, LeaveRequest, LeaveRequestType } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TYPES: LeaveRequestType[] = ["有給希望", "休み希望", "午前休希望", "午後休希望"];

interface Props {
  employees: Employee[];
  dates: Date[];
  requests: LeaveRequest[];
  locked: boolean;
  loading: boolean;
  onSubmit: (input: { employeeName: string; date: string; type: LeaveRequestType; comment: string }) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
}

export function LeaveRequestView({ employees, dates, requests, locked, loading, onSubmit, onCancel }: Props) {
  const [employeeName, setEmployeeName] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [type, setType] = useState<LeaveRequestType>("有給希望");
  const [comment, setComment] = useState("");
  const mine = useMemo(() => requests.filter(item => item.employeeName === employeeName && item.status !== "取消"), [requests, employeeName]);
  const requestByDate = new Map(mine.map(item => [item.date, item]));

  const submit = async () => {
    if (!employeeName || !selectedDate) return;
    await onSubmit({ employeeName, date: selectedDate, type, comment });
    setComment("");
  };

  return (
    <div className="leave-request-page space-y-4 pb-5">
      <header className="leave-request-hero">
        <div><span>SHIFT REQUEST</span><h1>休み希望を提出</h1><p>希望受付中のシフト案に申請します</p></div>
        <CalendarDays className="w-9 h-9" />
      </header>

      <section className="leave-request-card">
        <div className={`schedule-stage ${locked ? "is-final" : "is-draft"}`}>
          <strong>{locked ? "確定シフト" : "シフト案・希望受付中"}</strong>
          <span>{locked ? "確定済みのため新しい希望は提出できません" : `${format(dates[0], "yyyy/M/d")}〜${format(dates[dates.length - 1], "M/d")}`}</span>
        </div>

        <label className="leave-field-label">あなたの名前</label>
        <select className="leave-native-select" value={employeeName} onChange={event => setEmployeeName(event.target.value)}>
          <option value="">名前を選択してください</option>
          {employees.map(employee => <option key={employee.id} value={employee.name}>{employee.name}</option>)}
        </select>

        {employeeName && !locked && <>
          <label className="leave-field-label">希望日をタップ</label>
          <div className="leave-calendar-grid">
            {dates.map(date => {
              const key = format(date, "yyyy-MM-dd");
              const existing = requestByDate.get(key);
              return <button key={key} className={`${selectedDate === key ? "is-selected" : ""} ${existing ? "has-request" : ""}`} onClick={() => setSelectedDate(key)}>
                <small>{format(date, "E", { locale: ja })}</small><strong>{format(date, "d")}</strong>{existing && <span>希望済</span>}
              </button>;
            })}
          </div>

          <label className="leave-field-label">希望内容</label>
          <div className="leave-type-grid">
            {TYPES.map(value => <button key={value} className={type === value ? "is-selected" : ""} onClick={() => setType(value)}>{value}</button>)}
          </div>
          <Input value={comment} onChange={event => setComment(event.target.value)} placeholder="理由・連絡事項（任意）" className="h-11" />
          <Button className="w-full h-12 font-bold" disabled={!selectedDate || loading} onClick={submit}><Send className="w-4 h-4 mr-2" />{requestByDate.has(selectedDate) ? "希望を更新する" : "この内容で提出する"}</Button>
          <Button variant="outline" className="w-full h-11 font-bold" disabled={loading || mine.some(item => item.type === "希望なし")} onClick={() => onSubmit({ employeeName, date: "", type: "希望なし", comment: "" })}><CheckCircle2 className="w-4 h-4 mr-2" />この月は希望なし</Button>
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
      <p className="leave-auth-note">※試作版のため本人確認は未実装です。名前を間違えないよう確認して提出してください。</p>
    </div>
  );
}
