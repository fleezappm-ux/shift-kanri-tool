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

export function HomeView({
  employees, remarks, weekDates, selectedDate, today, weekOffset, heatmapEnabled, monthDates,
  onWeekOffsetChange, onDateSelect, onShowDashboard, onEmployeeSelect
}: HomeViewProps) {
  const remarkFor = (dateStr: string) => remarks.find(item => item.date === dateStr);

  return (
    <motion.div
      key="home"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl border border-border/50">
          <Button variant="ghost" size="sm" className="h-9 px-3 rounded-lg" onClick={() => onWeekOffsetChange(weekOffset - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="px-3 text-sm font-bold text-slate-700">
            {format(weekDates[0], "M月d日")} 〜 {format(weekDates[6], "M月d日")}
          </span>
          <Button variant="ghost" size="sm" className="h-9 px-3 rounded-lg" onClick={() => onWeekOffsetChange(weekOffset + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          {weekOffset !== 0 && (
            <Button variant="ghost" size="sm" className="h-9 px-2 text-xs" onClick={() => onWeekOffsetChange(0)}>今週</Button>
          )}
        </div>
        <Button variant="outline" size="sm" className="h-9 text-xs" onClick={onShowDashboard}>
          全体表示 <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {weekDates.map(date => {
          const dateStr = format(date, "yyyy-MM-dd");
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;
          const remark = remarkFor(dateStr);
          const working = employees
            .map(emp => ({ emp, shift: emp.shifts.find(shift => shift.date === dateStr) }))
            .filter(({ shift }) => shift?.shift && shift.shift !== "休み");
          return (
            <button
              key={dateStr}
              onClick={() => onDateSelect(dateStr)}
              className={`text-left rounded-xl border p-3 transition-all ${isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"} ${isToday ? "ring-1 ring-blue-300" : ""}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500">{format(date, "M/d")}（{["日", "月", "火", "水", "木", "金", "土"][date.getDay()]}）</span>
                {remark && remark.type !== "コメント" && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-red-200 text-red-600">{remark.type}</Badge>
                )}
              </div>
              <div className="space-y-1 min-h-[40px]">
                {working.length === 0 ? <span className="text-[10px] text-muted-foreground">予定なし</span> : working.map(({ emp }) => (
                  <div key={emp.id} className="text-[11px] leading-tight">
                    {emp.role && <span className="text-slate-400 mr-1">{emp.role}</span>}
                    <span className="font-semibold text-slate-700">{emp.name}</span>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="py-4 border-b border-border">
          <CardTitle className="text-sm">
            {format(new Date(`${selectedDate}T00:00:00`), "M月d日")}（{["日", "月", "火", "水", "木", "金", "土"][new Date(`${selectedDate}T00:00:00`).getDay()]}）の詳細
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="space-y-2">
            {employees.map(emp => {
              const shift = emp.shifts.find(item => item.date === selectedDate);
              const label = shift?.shift === "任意入力" ? (shift.customShiftText || "") : (shift?.shift || "");
              return (
                <div key={emp.id} className="flex items-center justify-between text-xs border-b border-slate-100 last:border-0 py-2">
                  <div className="flex items-center gap-2">
                    {emp.role && <Badge variant="outline" className="text-[9px] px-1.5">{emp.role}</Badge>}
                    <button className="font-semibold text-slate-700 hover:underline" onClick={() => onEmployeeSelect(emp.id)}>{emp.name}</button>
                  </div>
                  <div className="flex items-center gap-3 text-slate-500">
                    <span className={!label ? "text-muted-foreground" : ""}>{label || "未入力"}</span>
                    {shift?.shift && shift.shift !== "休み" && shift.shift !== "有給" && (
                      <><span>休憩 {shift.breakTime}</span><span>実働 {shift.workTime}</span></>
                    )}
                    {shift?.comment && <span className="italic text-slate-400">{shift.comment}</span>}
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
