import { format } from "date-fns";
import { ja } from "date-fns/locale/ja";
import { CalendarDays, Clock3 } from "lucide-react";
import { Employee, GlobalRemark } from "../types";

interface Props { employee: Employee; dates: Date[]; remarks: GlobalRemark[]; }

export function PersonalShiftList({ employee, dates, remarks }: Props) {
  return <div className="personal-shift-list">
    {dates.map(date => {
      const key = format(date, "yyyy-MM-dd");
      const shift = employee.shifts.find(item => item.date.slice(0, 10) === key);
      const remark = remarks.find(item => item.date === key);
      const label = shift?.shift === "任意入力" ? shift.customShiftText || "任意入力" : shift?.shift || "未入力";
      const isOff = label === "休み" || label === "有休";
      return <div key={key} className={`personal-shift-row ${date.getDay() === 0 || remark?.type === "祝日" || remark?.type === "店休日" ? "is-holiday" : ""} ${remark?.color ? `special-${remark.color}` : ""}`}>
        <div className="personal-date"><strong>{format(date, "M/d")}</strong><span>{format(date, "E", { locale: ja })}</span></div>
        <div className={`personal-shift-value ${isOff ? "is-off" : ""}`}>{label}</div>
        {!isOff && shift?.workTime && <div className="personal-work"><Clock3 className="w-3.5 h-3.5" />実働 {shift.workTime}</div>}
        {remark && remark.type !== "なし" && <div className="personal-global-remark"><CalendarDays className="w-3.5 h-3.5" />{remark.type}{remark.text ? `：${remark.text}` : ""}</div>}
        {shift?.comment && <div className="personal-comment">連絡：{shift.comment}</div>}
      </div>;
    })}
  </div>;
}
