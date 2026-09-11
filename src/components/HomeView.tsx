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

// 表示順の固定リスト。ここに無い名前は末尾に追加されます。
const DISPLAY_ORDER = ["降旗", "藤川", "金井", "本道", "児玉"];

const AVATAR_COLORS = ["bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-violet-500", "bg-rose-500", "bg-cyan-600"];

function sortEmployees(employees: Employee[]): Employee[] {
  return [...employees].sort((a, b) => {
    const ia = DISPLAY_ORDER.indexOf(a.name);
    const ib = DISPLAY_ORDER.indexOf(b.name);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function dateTone(remark: GlobalRemark | undefined, isSunday: boolean, isToday: boolean): "today" | "holiday" | "clinic" | "normal" {
  if (isToday) return "today";
  if (remark?.type === "祝日" || remark?.type === "店休日" || isSunday) return "holiday";
  if (remark?.type === "谷川整形休診") return "clinic";
  return "normal";
}

const HEADER_BG: Record<string, string> = {
  today: "bg-blue-600 text-white",
  holiday: "bg-red-50 text-red-600",
  clinic: "bg-blue-50 text-blue-600",
  normal: "bg-slate-50 text-slate-500"
};

const CELL_TINT: Record<string, string> = {
  today: "bg-blue-50/60",
  holiday: "bg-red-50/50",
  clinic: "bg-blue-50/40",
  normal: ""
};

function shiftChipClass(label: string): string {
  if (!label || label === "休み") return "text-slate-300";
  if (label === "有休") return "bg-amber-100 text-amber-700";
  return "bg-sky-100 text-sky-800";
}

export function HomeView({
  employees, remarks, weekDates, today, weekOffset, heatmapEnabled, monthDates,
  onWeekOffsetChange, onShowDashboard, onEmployeeSelect
}: HomeViewProps) {
  const remarkFor = (dateStr: string) => remarks.find(item => item.date === dateStr);
  const orderedEmployees = sortEmployees(employees);

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

      <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-white">
        <div className="overflow-x-auto">
          <table style={{ borderCollapse: "separate", borderSpacing: 0 }} className="w-full text-[11px] whitespace-nowrap">
            <thead>
              <tr>
                <th
                  style={{ position: "sticky", left: 0, zIndex: 20, backgroundColor: "#ffffff", boxShadow: "2px 0 6px -2px rgba(15,23,42,0.15)" }}
                  className="text-left font-semibold text-slate-500 px-3 py-2.5 min-w-[84px] border-b border-slate-200"
                >
                  氏名
                </th>
                {weekDates.map(date => {
                  const dateStr = format(date, "yyyy-MM-dd");
                  const remark = remarkFor(dateStr);
                  const tone = dateTone(remark, date.getDay() === 0, dateStr === today);
                  return (
                    <th key={dateStr} className={`px-2 py-2 border-b border-slate-200 font-semibold min-w-[62px] ${HEADER_BG[tone]}`}>
                      <div className="text-[10px] opacity-80">{WEEKDAY_LABELS[date.getDay()]}</div>
                      <div className="text-sm leading-tight">{date.getDate()}</div>
                      {remark && remark.type !== "コメント" && (
                        <div className="text-[8px] font-normal truncate max-w-[56px] mx-auto mt-0.5 opacity-90">{remark.type}</div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {orderedEmployees.map((emp, idx) => (
                <tr key={emp.id} className={idx % 2 === 1 ? "bg-slate-50/60" : ""}>
                  <td
                    style={{ position: "sticky", left: 0, zIndex: 20, backgroundColor: idx % 2 === 1 ? "#f8fafc" : "#ffffff", boxShadow: "2px 0 6px -2px rgba(15,23,42,0.15)" }}
                    className="px-2.5 py-2 border-b border-slate-100"
                  >
                    <button className="flex items-center gap-1.5 text-left" onClick={() => onEmployeeSelect(emp.id)}>
                      <span className={`w-6 h-6 rounded-full ${AVATAR_COLORS[idx % AVATAR_COLORS.length]} text-white text-[10px] font-bold flex items-center justify-center shrink-0`}>
                        {emp.name.slice(0, 1)}
                      </span>
                      <span>
                        <span className="block font-semibold text-slate-700 hover:underline">{emp.name}</span>
                        {emp.role && <span className="block text-[9px] text-muted-foreground font-normal">{emp.role}</span>}
                      </span>
                    </button>
                  </td>
                  {weekDates.map(date => {
                    const dateStr = format(date, "yyyy-MM-dd");
                    const remark = remarkFor(dateStr);
                    const tone = dateTone(remark, date.getDay() === 0, dateStr === today);
                    const shift = emp.shifts.find(item => item.date === dateStr);
                    const label = shift?.shift === "任意入力" ? (shift.customShiftText || "") : (shift?.shift || "");
                    return (
                      <td key={dateStr} className={`px-1.5 py-2 border-b border-slate-100 text-center ${CELL_TINT[tone]}`}>
                        <span className={`inline-block rounded-md px-1.5 py-1 font-medium ${shiftChipClass(label)}`}>
                          {label === "休み" ? "休み" : (label || "-")}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground px-1">← 横にスクロールすると全員ぶん確認できます</p>

      {heatmapEnabled && <WorkforceHeatmap dates={monthDates} employees={employees} remarks={remarks} />}
    </motion.div>
  );
}
