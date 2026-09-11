import { format } from "date-fns";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { Employee, GlobalRemark } from "../types";
import { WorkforceHeatmap } from "./WorkforceHeatmap";
import { Button } from "@/components/ui/button";

interface HomeViewProps {
  employees: Employee[];
  remarks: GlobalRemark[];
  weekDates: Date[];
  today: string;
  weekOffset: number;
  heatmapEnabled: boolean;
  monthDates: Date[];
  onWeekOffsetChange: (offset: number) => void;
  onShowDashboard: () => void;
  onEmployeeSelect: (employeeId: string) => void;
}

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function dateTone(remark: GlobalRemark | undefined, isSunday: boolean, isToday: boolean): "today" | "holiday" | "clinic" | "normal" {
  if (isToday) return "today";
  if (remark?.type === "祝日" || remark?.type === "店休日" || isSunday) return "holiday";
  if (remark?.type === "谷川整形休診") return "clinic";
  return "normal";
}

const HEADER_CLASS: Record<string, string> = {
  today: "bg-primary/10 text-primary",
  holiday: "text-red-600",
  clinic: "text-blue-600",
  normal: "text-slate-500"
};

const CELL_BG_CLASS: Record<string, string> = {
  today: "bg-primary/5",
  holiday: "bg-red-50",
  clinic: "bg-blue-50",
  normal: ""
};

export function HomeView({
  employees, remarks, weekDates, today, weekOffset, heatmapEnabled, monthDates,
  onWeekOffsetChange, onShowDashboard, onEmployeeSelect
}: HomeViewProps) {
  const remarkFor = (dateStr: string) => remarks.find(item => item.date === dateStr);

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

      <div className="border border-border rounded-xl overflow-x-auto">
        <table className="border-collapse text-[11px] whitespace-nowrap w-full">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card text-left font-semibold text-slate-600 px-3 py-2 border-r border-b border-border min-w-[76px]">
                氏名
              </th>
              {weekDates.map(date => {
                const dateStr = format(date, "yyyy-MM-dd");
                const remark = remarkFor(dateStr);
                const tone = dateTone(remark, date.getDay() === 0, dateStr === today);
                return (
                  <th key={dateStr} className={`px-2 py-2 border-b border-border font-semibold min-w-[64px] ${HEADER_CLASS[tone]}`}>
                    <div>{WEEKDAY_LABELS[date.getDay()]}</div>
                    <div className="text-sm">{date.getDate()}</div>
                    {remark && remark.type !== "コメント" && (
                      <div className="text-[9px] font-normal truncate max-w-[60px] mx-auto">{remark.type}</div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => (
              <tr key={emp.id}>
                <td className="sticky left-0 z-10 bg-card text-left px-3 py-2 border-r border-b border-border">
                  <button className="font-semibold text-slate-700 hover:underline" onClick={() => onEmployeeSelect(emp.id)}>
                    {emp.name}
                  </button>
                  {emp.role && <div className="text-[9px] text-muted-foreground font-normal">{emp.role}</div>}
                </td>
                {weekDates.map(date => {
                  const dateStr = format(date, "yyyy-MM-dd");
                  const remark = remarkFor(dateStr);
                  const tone = dateTone(remark, date.getDay() === 0, dateStr === today);
                  const shift = emp.shifts.find(item => item.date === dateStr);
                  const label = shift?.shift === "任意入力" ? (shift.customShiftText || "") : (shift?.shift || "");
                  const isOff = label === "休み" || !label;
                  return (
                    <td key={dateStr} className={`px-2 py-2 border-b border-border text-center ${CELL_BG_CLASS[tone]} ${isOff ? "text-muted-foreground" : "font-medium text-slate-700"}`}>
                      {label || "-"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground px-1">← 横にスクロールすると全員ぶん確認できます</p>

      {heatmapEnabled && <WorkforceHeatmap dates={monthDates} employees={employees} remarks={remarks} />}
    </motion.div>
  );
}
