import { format } from "date-fns";
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock3, Users } from "lucide-react";
import { motion } from "motion/react";
import { Employee, GlobalRemark } from "../types";
import { WorkforceHeatmap } from "./WorkforceHeatmap";
import { Button } from "@/components/ui/button";

interface HomeViewProps {
  employees: Employee[];
  remarks: GlobalRemark[];
  weekDates: Date[];
  selectedDate: string;
  today: string;
  weekOffset: number;
  heatmapEnabled: boolean;
  monthDates: Date[];
  onWeekOffsetChange: (offset: number) => void;
  onDateSelect: (date: string) => void;
  onShowDashboard: () => void;
  onEmployeeSelect: (employeeId: string) => void;
  onOpenLeaveRequest: () => void;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
export const EMPLOYEE_DISPLAY_ORDER = ["降旗", "藤川", "金井", "本道", "児玉"];

export function sortEmployeesForDisplay(employees: Employee[]): Employee[] {
  return [...employees].sort((a, b) => {
    const aIndex = EMPLOYEE_DISPLAY_ORDER.indexOf(a.name);
    const bIndex = EMPLOYEE_DISPLAY_ORDER.indexOf(b.name);
    if (aIndex < 0 && bIndex < 0) return 0;
    if (aIndex < 0) return 1;
    if (bIndex < 0) return -1;
    return aIndex - bIndex;
  });
}

function shiftLabel(employee: Employee, date: string): string {
  const shift = employee.shifts.find(item => item.date === date);
  if (!shift?.shift) return "未入力";
  if (shift.shift === "任意入力") return shift.customShiftText || "任意入力";
  return shift.shift;
}

export function HomeView({
  employees, remarks, weekDates, selectedDate, today, weekOffset, heatmapEnabled, monthDates,
  onWeekOffsetChange, onDateSelect, onShowDashboard, onEmployeeSelect, onOpenLeaveRequest
}: HomeViewProps) {
  const orderedEmployees = sortEmployeesForDisplay(employees);
  const selectedDateObject = new Date(`${selectedDate}T00:00:00`);
  const selectedRemark = remarks.find(item => item.date === selectedDate);
  const workingCount = orderedEmployees.filter(employee => {
    const label = shiftLabel(employee, selectedDate);
    return label !== "未入力" && label !== "休み" && label !== "有休";
  }).length;

  return (
    <motion.div key="home" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }} className="space-y-4 pb-4">
      <header className="home-brand-header">
        <img src="/shift-kanri-tool/icon-192.png" alt="" />
        <div>
          <span>PHARMACY SHIFT</span>
          <h1>薬局シフト</h1>
        </div>
      </header>
      <div className="home-toolbar">
        <Button variant="outline" size="sm" className="home-week-button" onClick={() => onWeekOffsetChange(weekOffset - 1)}><ChevronLeft className="w-4 h-4" /> 前週</Button>
        <div className="text-center">
          <div className="text-sm font-black text-slate-800">{format(weekDates[0], "M/d")}〜{format(weekDates[6], "M/d")}</div>
          {weekOffset !== 0 && <button className="text-xs text-blue-600 font-semibold" onClick={() => onWeekOffsetChange(0)}>今週へ戻る</button>}
        </div>
        <Button variant="outline" size="sm" className="home-week-button" onClick={() => onWeekOffsetChange(weekOffset + 1)}>次週 <ChevronRight className="w-4 h-4" /></Button>
      </div>

      <button className="home-leave-request" onClick={onOpenLeaveRequest}>
        <CalendarDays className="w-5 h-5" /><div><strong>有給・休み希望を提出</strong><span>希望受付中のシフト案に申請できます</span></div><ArrowRight className="w-5 h-5" />
      </button>

      <div className="home-week-grid">
        {weekDates.map(date => {
          const dateStr = format(date, "yyyy-MM-dd");
          const remark = remarks.find(item => item.date === dateStr);
          const count = orderedEmployees.filter(employee => {
            const label = shiftLabel(employee, dateStr);
            return label !== "未入力" && label !== "休み" && label !== "有休";
          }).length;
          const isHoliday = date.getDay() === 0 || remark?.type === "祝日" || remark?.type === "店休日";
          return (
            <button key={dateStr} onClick={() => onDateSelect(dateStr)} className={`home-day ${dateStr === selectedDate ? "is-selected" : ""} ${dateStr === today ? "is-today" : ""}`}>
              <span className={isHoliday ? "text-red-500" : "text-slate-500"}>{WEEKDAYS[date.getDay()]}</span>
              <strong>{date.getDate()}</strong>
              <small>{count}人</small>
            </button>
          );
        })}
      </div>

      <section className="home-roster">
        <div className="home-roster-header">
          <div><p>{format(selectedDateObject, "M月d日")}（{WEEKDAYS[selectedDateObject.getDay()]}）</p><h2>{selectedDate === today ? "今日のシフト" : "この日のシフト"}</h2></div>
          <div className="home-roster-count"><Users className="w-4 h-4" /> 出勤 {workingCount}人</div>
        </div>
        {selectedRemark && selectedRemark.type !== "なし" && <div className="home-remark">{selectedRemark.type}{selectedRemark.text ? `：${selectedRemark.text}` : ""}</div>}
        <div className="home-roster-list">
          {orderedEmployees.map(employee => {
            const shift = employee.shifts.find(item => item.date === selectedDate);
            const label = shiftLabel(employee, selectedDate);
            const isOff = label === "休み" || label === "有休";
            return (
              <button key={employee.id} className="home-roster-row" onClick={() => onEmployeeSelect(employee.id)}>
                <span className="home-employee-name">{employee.name}</span>
                <span className={`home-shift-value ${isOff ? "is-off" : ""}`}>{label}</span>
                <span className="home-work-time">{shift?.shift && !isOff && shift.shift !== "任意入力" ? <><Clock3 className="w-3.5 h-3.5" /> 実働 {shift.workTime}</> : ""}</span>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </button>
            );
          })}
        </div>
        <Button variant="outline" className="w-full mt-3 h-10 font-bold" onClick={onShowDashboard}>月の全体シフトを見る <ArrowRight className="w-4 h-4 ml-2" /></Button>
      </section>

      {heatmapEnabled && <WorkforceHeatmap dates={monthDates} employees={employees} remarks={remarks} />}
    </motion.div>
  );
}
