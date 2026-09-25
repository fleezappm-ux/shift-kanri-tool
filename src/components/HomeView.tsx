import { format } from "date-fns";
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, UserRound, Users } from "lucide-react";
import { motion } from "motion/react";
import { Employee, GlobalRemark, LeaveRequest } from "../types";
import { WorkforceHeatmap } from "./WorkforceHeatmap";
import { Button } from "@/components/ui/button";
import { BulletinBoard } from "./BulletinBoard";

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
  onInstall: () => void;
  installLabel: string;
  operatorName: string;
  requests: LeaveRequest[];
  boardMonthLabel: string;
  boardLocked: boolean;
  boardVisibility: "immediate" | "after_approval" | "private";
  correctionVisibility: "all" | "private";
  isEditor: boolean;
  onOpenBoard: () => void;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
export function sortEmployeesForDisplay(employees: Employee[]): Employee[] {
  // 店舗固有の氏名ではなく、共有従業員マスターの並び順だけを正本にします。
  return [...employees].sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));
}

function shiftLabel(employee: Employee, date: string): string {
  const shift = employee.shifts.find(item => item.date === date);
  if (!shift?.shift) return "未入力";
  if (shift.shift === "任意入力") return shift.customShiftText || "任意入力";
  return shift.shift;
}

export function HomeView({
  employees, remarks, weekDates, selectedDate, today, weekOffset, heatmapEnabled, monthDates,
  onWeekOffsetChange, onDateSelect, onShowDashboard, onEmployeeSelect, onOpenLeaveRequest, onInstall, installLabel,
  operatorName, requests, boardMonthLabel, boardLocked, boardVisibility, correctionVisibility, isEditor, onOpenBoard
}: HomeViewProps) {
  const orderedEmployees = sortEmployeesForDisplay(employees);
  const selectedDateObject = new Date(`${selectedDate}T00:00:00`);
  const selectedRemark = remarks.find(item => item.date === selectedDate);
  const workingCount = orderedEmployees.filter(employee => {
    const label = shiftLabel(employee, selectedDate);
    return label !== "未入力" && label !== "休み" && label !== "有休";
  }).length;
  const pharmacists = orderedEmployees.filter(employee => employee.role === "薬剤師");
  const supportStaff = orderedEmployees.filter(employee => employee.role === "事務員" || employee.role === "登録販売者");
  const unassignedStaff = orderedEmployees.filter(employee => !employee.role);
  const renderRoster = (group: Employee[]) => group.map(employee => {
    const shift = employee.shifts.find(item => item.date === selectedDate);
    const label = shiftLabel(employee, selectedDate);
    const isOff = label === "休み" || label === "有休";
    if (!shift?.shift || isOff) return null;
    return <button key={employee.id} className="home-roster-row" onClick={() => onEmployeeSelect(employee.id)}><span className="home-employee-name">{employee.displayName || employee.name}</span><span className="home-shift-value">{label}</span><ChevronRight className="w-4 h-4 text-slate-300" /></button>;
  });

  return (
    <motion.div key="home" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }} className="space-y-4 pb-4">
      <header className="home-brand-header">
        <div className="home-brand-cluster">
          <button type="button" className="home-app-icon" onClick={onInstall} title={installLabel} aria-label={installLabel}><img src="/shift-kanri-tool/icon-192.png" alt="薬局シフトをホーム画面に追加" /></button>
          <div className="home-brand-copy">
            <span>PHARMACY SHIFT</span>
            <div className="home-title-line">
              <h1>薬局シフト</h1>
              <span className="home-operator"><UserRound className="h-4 w-4" />操作員：{operatorName}</span>
            </div>
          </div>
        </div>
        <div className="home-header-week">
          <Button variant="outline" size="sm" className="home-week-button" onClick={() => onWeekOffsetChange(weekOffset - 1)}><ChevronLeft className="w-4 h-4" /> 前週</Button>
          <div className="home-header-period">
            <strong>{format(weekDates[0], "M月d日")}〜{format(weekDates[6], "M月d日")}</strong>
            {weekOffset !== 0 && <button onClick={() => onWeekOffsetChange(0)}>今週へ戻る</button>}
          </div>
          <Button variant="outline" size="sm" className="home-week-button" onClick={() => onWeekOffsetChange(weekOffset + 1)}>次週 <ChevronRight className="w-4 h-4" /></Button>
        </div>
      </header>

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
            <button key={dateStr} onClick={() => onDateSelect(dateStr)} className={`home-day ${dateStr === selectedDate ? "is-selected" : ""} ${dateStr === today ? "is-today" : ""} ${remark?.color ? `special-${remark.color}` : ""}`} title={remark?.type}>
              <span className={isHoliday ? "text-red-500" : "text-slate-500"}>{WEEKDAYS[date.getDay()]}</span>
              <strong>{date.getDate()}</strong>
              <small>{count}人</small>
            </button>
          );
        })}
      </div>

      <section className="home-roster">
        <div className="home-roster-header">
          <div className="home-roster-heading"><h2>{selectedDate === today ? "今日のシフト" : "この日のシフト"}</h2><div className="home-roster-count"><Users className="w-4 h-4" /> 出勤 {workingCount}人</div></div>
          <p className="home-roster-date">{format(selectedDateObject, "M月d日")}（{WEEKDAYS[selectedDateObject.getDay()]}）</p>
          <span className="home-roster-header-spacer" aria-hidden="true" />
        </div>
        {selectedRemark && selectedRemark.type !== "なし" && <div className="home-remark">{selectedRemark.type}{selectedRemark.text ? `：${selectedRemark.text}` : ""}</div>}
        <div className="grid grid-cols-2 gap-3">
          <div>{renderRoster(pharmacists)}</div>
          <div className="border-l pl-3">{renderRoster(supportStaff)}</div>
        </div>
        {unassignedStaff.length > 0 && <div className="home-role-warning">役職未設定：{unassignedStaff.map(employee => employee.displayName || employee.name).join("、")}（設定画面で役職を登録してください）</div>}
        <Button variant="outline" className="w-full mt-3 h-10 font-bold" onClick={onShowDashboard}>月の全体シフトを見る <ArrowRight className="w-4 h-4 ml-2" /></Button>
      </section>

      <div><BulletinBoard compact periods={[{ label: boardMonthLabel, locked: boardLocked, requests }]} isEditor={isEditor} visibility={boardVisibility} correctionVisibility={correctionVisibility} operatorName={operatorName} /><button type="button" onClick={onOpenBoard} className="mt-2 text-sm font-bold text-blue-600">掲示板を開く ›</button></div>

      <button className="home-leave-request" onClick={onOpenLeaveRequest}>
        <CalendarDays className="w-5 h-5" /><div><strong>休み希望日を提出する</strong><span>希望受付中のシフト案に提出できます</span></div><ArrowRight className="w-5 h-5" />
      </button>

      {heatmapEnabled && <WorkforceHeatmap dates={monthDates} employees={employees} remarks={remarks} />}
    </motion.div>
  );
}
