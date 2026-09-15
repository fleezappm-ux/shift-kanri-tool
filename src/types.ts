
export type ShiftType = 
  | "8:45～18:15" 
  | "8:30～18:00" 
  | "8:30～13:30" 
  | "8:30～16:30" 
  | "9:30～13:30" 
  | "9:00～13:00" 
  | "有休" 
  | "休み" 
  | "任意入力"
  | "";

export interface DayShift {
  date: string; // ISO string
  shift: ShiftType;
  customShiftText?: string; // e.g. "9時～17時"
  breakTime: string; // e.g. "1:00"
  workTime: string; // e.g. "8:30"
  comment: string;
}

export interface GlobalRemark {
  date: string;
  type: string;
  text: string;
  color?: SpecialDayColor;
  source?: "manual" | "rule";
}

export type SpecialDayColor = "red" | "blue" | "green" | "amber" | "purple" | "gray";
export type SpecialDayBehavior = "information" | "all-off" | "duty";

export interface SpecialDayRule {
  id: string;
  name: string;
  color: SpecialDayColor;
  behavior: SpecialDayBehavior;
  enabled: boolean;
  mode: "recurring" | "annual";
  weekday: number;
  weeks: number[];
  dates: string[];
}

export interface Employee {
  id: string;
  name: string;
  shifts: DayShift[];
}

export type LeaveRequestType = "有給希望" | "休み希望" | "午前休希望" | "午後休希望" | "希望なし";
export type LeaveRequestStatus = "申請中" | "承認" | "却下" | "取消";

export interface LeaveRequest {
  id: string;
  employeeName: string;
  date: string;
  periodStart: string;
  periodEnd: string;
  type: LeaveRequestType;
  comment: string;
  status: LeaveRequestStatus;
  submittedAt: string;
  updatedAt: string;
}
