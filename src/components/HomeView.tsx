import { format } from "date-fns";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { Employee, GlobalRemark } from "../types";
import { WorkforceHeatmap } from "./WorkforceHeatmap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
}

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

/** 日付の背景色（祝日・店休日・日曜=赤、谷川整形休診=青）。ダッシュボードの色分けと揃えています。 */
function dayColorClass(remark: GlobalRemark | undefined, isSunday: boolean, isSelected: boolean): string {
  if (remark?.type === "祝日" || remark?.type === "店休日" || isSunday) {
    return isSelected ? "bg-red-500 text-white border-red-500" : "bg-red-100 text-red-700 border-red-200";
  }
  if (remark?.type === "谷川整形休診") {
    return isSelected ? "bg-blue-500 text-white border-blue-500" : "bg-blue-100 text-blue-700 border-blue-200";
  }
  return isSelected ? "bg-primary text-primary-foreground border-primary" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50";
}

function remarkBadgeClass(type: GlobalRemark["type"]): string {
  if (type === "祝日" || type === "店休日") return "border-red-200 bg-red-50 text-red-700";
  if (type === "谷川整形休診") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export function HomeView({
  employees, remarks, weekDates, selectedDate, today, weekOffset, heatmapEnabled, monthDates,
  onWeekOffsetChange, onDateSelect, onShowDashboard, onEmployeeSelect
}: HomeViewProps) {
  const remarkFor = (dateStr: string) => remarks.find(item => item.date === dateStr);
  const selectedDateObj = new Date(`${selectedDate}T00:00:00`);
  const selectedRemark = remarkFor(selectedDate);

  return (
    <motion.div
      key="home"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="space-y-4 pb-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl border border-border/50">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg" onClick={() => onWeekOffsetChange(weekOffset - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="px-1.5 text-xs sm:text-sm font-bold text-slate-700 whitespace-nowrap">
            {format(weekDates[0], "M/d")} 〜 {format(weekDates[6], "M/d")}
          </span>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg" onClick={() => onWeekOffsetChange(weekOffset + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          {weekOffset !== 0 && (
            <Button variant="ghost" size="sm" className="h-8 px-2 text-[11px]" onClick={() => onWeekOffsetChange(0)}>今週</Button>
          )}
        </div>
        <Button variant="outline" size="sm" className="h-8 text-[11px] shrink-0" onClick={onShowDashboard}>
          全体表示 <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </div>

      {/* 週間の日付ストリップ（ファーマシーOSのカレンダーに合わせた1行表示） */}
      <div className="grid grid-cols-7 gap-1.5">
        {weekDates.map(date => {
          const dateStr = format(date, "yyyy-MM-dd");
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;
          const remark = remarkFor(dateStr);
          const isSunday = date.getDay() === 0;
          return (
            <button
              key={dateStr}
              onClick={() => onDateSelect(dateStr)}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-xl border py-2 transition-all ${dayColorClass(remark, isSunday, isSelected)} ${isToday && !isSelected ? "ring-2 ring-blue-400 ring-offset-1" : ""}`}
            >
              <span className="text-[10px] opacity-80">{WEEKDAY_LABELS[date.getDay()]}</span>
              <span className="text-base font-bold leading-none">{date.getDate()}</span>
            </button>
          );
        })}
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="py-3 border-b border-border">
          <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
            <span>{format(selectedDateObj, "M月d日")}（{WEEKDAY_LABELS[selectedDateObj.getDay()]}）</span>
            {selectedRemark && selectedRemark.type !== "コメント" && (
              <Badge variant="outline" className={`text-[10px] ${remarkBadgeClass(selectedRemark.type)}`}>
                {selectedRemark.type}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-4">
          <div className="space-y-1">
            {employees.map(emp => {
              const shift = emp.shifts.find(item => item.date === selectedDate);
              const label = shift?.shift === "任意入力" ? (shift.customShiftText || "") : (shift?.shift || "");
              return (
                <div key={emp.id} className="flex items-center justify-between text-xs border-b border-slate-100 last:border-0 py-2 gap-2">
                  <div className="flex items-center gap-2 shrink-0">
                    {emp.role && <Badge variant="outline" className="text-[9px] px-1.5 shrink-0">{emp.role}</Badge>}
                    <button className="font-semibold text-slate-700 hover:underline whitespace-nowrap" onClick={() => onEmployeeSelect(emp.id)}>{emp.name}</button>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 text-slate-500 flex-wrap justify-end">
                    <span className={!label ? "text-muted-foreground" : "font-medium"}>{label || "未入力"}</span>
                    {shift?.shift && shift.shift !== "休み" && shift.shift !== "有休" && (
                      <span className="text-[10px] whitespace-nowrap">休憩{shift.breakTime}／実働{shift.workTime}</span>
                    )}
                    {shift?.comment && <span className="italic text-slate-400 text-[10px]">{shift.comment}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {heatmapEnabled && <WorkforceHeatmap dates={monthDates} employees={employees} remarks={remarks} />}
    </motion.div>
  );
}
