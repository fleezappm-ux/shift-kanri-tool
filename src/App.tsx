import { useState, useEffect, useRef } from "react";
import { format, addMonths } from "date-fns";
import { ja } from "date-fns/locale/ja";
import { 
  Bell,
  Trash2,
  PlusCircle, 
  Download, 
  Users, 
  FileCode,
  ChevronRight,
  ChevronLeft,
  Info,
  Grid3X3,
  ArrowLeft,
  ArrowRight,
  Home,
  CloudUpload
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";

import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";

import { Employee, ShiftType, GlobalRemark } from "./types";
import { SHIFT_OPTIONS, EDITOR_PASSWORD, DEFAULT_CYCLE_PATTERNS, CyclePatterns } from "./constants";
import { calculateTimes, generateDateRange, normalizeShiftInput, finalizeShiftText, resolveCycleShift } from "./lib/shift-utils";
import { fetchShiftsFromServer, saveMonthToServer, fetchHolidaysFromServer } from "./lib/shift-sync";
import { chooseOutputFolder, getRememberedFolderName, saveBufferToRememberedFolder } from "./lib/output-destination";

const DEFAULT_EMPLOYEES = ["従業員A", "従業員B", "従業員C", "従業員D", "従業員E"];
const GLOBAL_REMARK_TYPES = ["谷川整形休診", "祝日", "当番薬局", "店休日", "コメント", "なし"] as const;

export default function App() {
  const [employees, setEmployees] = useState<Employee[]>(() => {
    const saved = localStorage.getItem("shift_data");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        const uniqueMap = new Map();
        data.forEach((item: any) => {
          if (item && item.id) uniqueMap.set(item.id, item);
        });
        const initialData = Array.from(uniqueMap.values()) as Employee[];
        if (initialData.length > 0) return initialData;
      } catch (e) {
        console.error("Failed to parse saved data", e);
      }
    }
    return DEFAULT_EMPLOYEES.map(name => ({
      id: Math.random().toString(36).substr(2, 9),
      name,
      shifts: []
    }));
  });
  const [globalRemarks, setGlobalRemarks] = useState<GlobalRemark[]>(() => {
    const saved = localStorage.getItem("global_remarks");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse global remarks", e);
      }
    }
    return [];
  });
  const [currentMonth, setCurrentMonth] = useState(() => {
    const saved = localStorage.getItem("current_month");
    return saved ? new Date(saved) : new Date();
  });
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem("active_tab") || "home";
  });
  const [lockedMonths, setLockedMonths] = useState<string[]>(() => {
    const saved = localStorage.getItem("locked_months");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse locked months", e);
      }
    }
    return [];
  });
  const [dashboardTitle, setDashboardTitle] = useState(() => {
    return localStorage.getItem("dashboard_title") || "全体シフト集約";
  });
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isFromAdmin, setIsFromAdmin] = useState(() => {
    const savedActiveTab = localStorage.getItem("active_tab");
    return savedActiveTab === "admin";
  });
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showNotificationPopup, setShowNotificationPopup] = useState(false);
  const [cycleNames, setCycleNames] = useState<Record<number, string>>(() => {
    const saved = localStorage.getItem("cycle_names");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse cycle names", e);
      }
    }
    return {
      1: "クール1",
      2: "クール2",
      3: "クール3",
      4: "クール4",
      5: "クール5",
      6: "クール6",
      7: "クール7"
    };
  });
  const [cycleAssignments, setCycleAssignments] = useState<Record<string, { cycleType: number; anchorDate: string }>>(() => {
    const saved = localStorage.getItem("cycle_assignments");
    if (!saved) return {};
    try { return JSON.parse(saved); } catch { return {}; }
  });
  const [cyclePatterns, setCyclePatterns] = useState<CyclePatterns>(() => {
    const saved = localStorage.getItem("cycle_patterns");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_CYCLE_PATTERNS, ...parsed };
      } catch (e) {
        console.error("Failed to parse cycle patterns", e);
      }
    }
    return DEFAULT_CYCLE_PATTERNS;
  });
  const [syncState, setSyncState] = useState<"loading" | "saved" | "dirty" | "saving" | "offline">("loading");

  // 編集モード（従業員マスター・個別シート編集・アプリ詳細設定）へ入るための簡易パスワードゲート。
  // ブラウザのタブ/セッションを閉じるまで有効です（sessionStorageに保存）。
  const [hasEditAccess, setHasEditAccess] = useState(() => sessionStorage.getItem("edit_access") === "granted");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const pendingEditActionRef = useRef<(() => void) | null>(null);

  const requestEditAccess = (action: () => void) => {
    if (hasEditAccess) {
      action();
      return;
    }
    pendingEditActionRef.current = action;
    setPasswordInput("");
    setShowPasswordModal(true);
  };

  // ページ再読み込み時、前回「アプリ詳細・環境設定」等の編集モードだった場合でも、
  // このセッションでまだパスワードを入力していなければ編集モードを解除します。
  useEffect(() => {
    if (!hasEditAccess && isFromAdmin) {
      setIsFromAdmin(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitEditPassword = () => {
    if (passwordInput === EDITOR_PASSWORD) {
      setHasEditAccess(true);
      sessionStorage.setItem("edit_access", "granted");
      setShowPasswordModal(false);
      const action = pendingEditActionRef.current;
      pendingEditActionRef.current = null;
      setPasswordInput("");
      if (action) action();
    } else {
      toast.error("パスワードが違います");
    }
  };

  // 保存先フォルダ（エクセル出力用）を覚えているか確認
  const [outputFolderName, setOutputFolderName] = useState<string | null>(null);
  useEffect(() => {
    getRememberedFolderName().then(setOutputFolderName);
  }, []);

  // ホーム画面（週間カレンダー）用の状態
  const [homeWeekOffset, setHomeWeekOffset] = useState(0);
  const [homeSelectedDate, setHomeSelectedDate] = useState<string | null>(null);

  const currentMonthKey = format(currentMonth, "yyyy-MM");
  const isLocked = lockedMonths.includes(currentMonthKey);

  const getDateStr = (date: Date) => format(date, "yyyy-MM-dd");

  // 起動時に、他の端末で保存されたシフトをNotion（ファーマシーOS経由）から読み込みます。
  // 取得できた場合はそちらを優先し、取得できない場合（オフライン等）はlocalStorageの内容のまま使います。
  const syncReadyRef = useRef(false);
  const skipDirtyRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const merged = await fetchShiftsFromServer(employees);
      if (!cancelled) {
        if (merged) {
          skipDirtyRef.current = true;
          setEmployees(merged);
        }
        syncReadyRef.current = true;
        setSyncState(merged ? "saved" : "offline");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 編集内容はまず端末内へ保存し、Notionへの反映は「Notionへ保存」ボタンでだけ行います。
  useEffect(() => {
    if (employees.length > 0) {
      localStorage.setItem("shift_data", JSON.stringify(employees));
    }
    if (!syncReadyRef.current) return;
    if (skipDirtyRef.current) {
      skipDirtyRef.current = false;
      return;
    }
    setSyncState("dirty");
  }, [employees]);

  useEffect(() => {
    localStorage.setItem("locked_months", JSON.stringify(lockedMonths));
  }, [lockedMonths]);

  useEffect(() => {
    localStorage.setItem("global_remarks", JSON.stringify(globalRemarks));
  }, [globalRemarks]);

  useEffect(() => {
    localStorage.setItem("dashboard_title", dashboardTitle);
  }, [dashboardTitle]);

  useEffect(() => {
    localStorage.setItem("cycle_names", JSON.stringify(cycleNames));
  }, [cycleNames]);

  useEffect(() => {
    localStorage.setItem("cycle_assignments", JSON.stringify(cycleAssignments));
  }, [cycleAssignments]);

  useEffect(() => {
    localStorage.setItem("cycle_patterns", JSON.stringify(cyclePatterns));
  }, [cyclePatterns]);


  useEffect(() => {
    localStorage.setItem("current_month", currentMonth.toISOString());
  }, [currentMonth]);

  useEffect(() => {
    localStorage.setItem("active_tab", activeTab);
  }, [activeTab]);

  const toggleLock = () => {
    if (isLocked) {
      setLockedMonths(prev => prev.filter(m => m !== currentMonthKey));
      toast.info(`${format(currentMonth, "yyyy年MM月")}の編集ロックを解除しました`);
    } else {
      const conflicts = dateRange.reduce((total, date) => {
        const remark = getGlobalRemark(date);
        if (remark?.type !== "祝日" && remark?.type !== "店休日") return total;
        return total + employees.filter(emp => {
          const shift = emp.shifts.find(s => s.date === getDateStr(date))?.shift;
          return Boolean(shift && shift !== "休み" && shift !== "有給");
        }).length;
      }, 0);
      if (conflicts > 0) toast.warning(`店休日・祝日に勤務が${conflicts}件あります。内容は変更せず確定しました`);

      setLockedMonths(prev => [...prev, currentMonthKey]);
      toast.success(`${format(currentMonth, "yyyy年MM月")}のシフトを確定しました`);
    }
  };

  const getCycleShift = (date: Date, cycleType: number, anchorDateStr: string): ShiftType => {
    const [ay, am, ad] = anchorDateStr.split("-").map(Number);
    const anchor = new Date(ay, am - 1, ad);
    const anchorMonday = new Date(anchor);
    anchorMonday.setDate(anchor.getDate() + (anchor.getDay() === 0 ? -6 : 1 - anchor.getDay()));
    anchorMonday.setHours(0, 0, 0, 0);
    const current = new Date(date); current.setHours(0, 0, 0, 0);
    const weeksDiff = Math.floor((current.getTime() - anchorMonday.getTime()) / (7 * 86400000));
    const isWeek2 = ((weeksDiff % 2) + 2) % 2 === 1;
    return resolveCycleShift(cyclePatterns, cycleType, date.getDay(), isWeek2);
  };

  const createNextMonthShifts = () => {
    // 翌月分作成 (21日~20日)
    const nextMonthDate = addMonths(currentMonth, 1);
    const nextYear = nextMonthDate.getFullYear();
    const nextMonthNum = nextMonthDate.getMonth() + 1;
    const nextDateRange = generateDateRange(nextYear, nextMonthNum);
    
    setEmployees(prev => prev.map(emp => {
      const newShifts = [...emp.shifts];
      const assignment = cycleAssignments[emp.id];
      if (!assignment) return emp;
      nextDateRange.forEach(date => {
        const dateStr = getDateStr(date);
        const shift = getCycleShift(date, assignment.cycleType, assignment.anchorDate);
        if (shift) {
          const { breakTime, workTime } = calculateTimes(shift);
          const existingIdx = newShifts.findIndex(s => s.date === dateStr);
          if (existingIdx >= 0) {
            newShifts[existingIdx] = { ...newShifts[existingIdx], shift, breakTime, workTime, customShiftText: undefined, comment: "" };
          } else {
            newShifts.push({ date: dateStr, shift, breakTime, workTime, comment: "" });
          }
        }
      });
      
      return { ...emp, shifts: newShifts };
    }));

    // 表示月を切り替え
    setCurrentMonth(nextMonthDate);
    const unassigned = employees.filter(emp => !cycleAssignments[emp.id]).length;
    if (unassigned) toast.warning(`勤務パターン未設定の${unassigned}名は作成していません`);
    else toast.success(`${nextMonthNum}月分を勤務パターンから作成しました`);
  };

  const dateRange = generateDateRange(currentMonth.getFullYear(), currentMonth.getMonth() + 1);

  // ホーム画面用: 今日を含む週（月〜日）を、homeWeekOffset週分ずらして計算します。
  const homeWeekDates: Date[] = (() => {
    const today = new Date();
    const day = today.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMon + homeWeekOffset * 7);
    monday.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  })();
  const todayStr = getDateStr(new Date());
  const homeSelectedDateStr = homeSelectedDate && homeWeekDates.some(d => getDateStr(d) === homeSelectedDate)
    ? homeSelectedDate
    : (homeWeekDates.some(d => getDateStr(d) === todayStr) ? todayStr : getDateStr(homeWeekDates[0]));

  // 表示中の期間について、日曜・祝日・年末年始をファーマシーOS側の判定ロジックで自動取得し、
  // まだ備考が付いていない日にだけ「祝日」を自動でセットします（既存の備考は上書きしません）。
  useEffect(() => {
    if (dateRange.length === 0) return;
    let cancelled = false;
    const start = getDateStr(dateRange[0]);
    const end = getDateStr(dateRange[dateRange.length - 1]);
    (async () => {
      const holidays = await fetchHolidaysFromServer(start, end);
      if (cancelled || holidays.length === 0) return;
      const newlyAdded: string[] = [];
      setGlobalRemarks(prev => {
        const existingDates = new Set(prev.map(r => r.date));
        const additions: GlobalRemark[] = [];
        holidays.forEach(d => {
          if (!existingDates.has(d)) {
            additions.push({ date: d, type: "祝日", text: "" });
            newlyAdded.push(d);
          }
        });
        if (additions.length === 0) return prev;
        return [...prev, ...additions];
      });
      newlyAdded.forEach(d => setAllEmployeesOff(d));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonthKey]);

  const saveCurrentMonth = async () => {
    if (syncState === "saving" || dateRange.length === 0) return;
    setSyncState("saving");
    try {
      const result = await saveMonthToServer(
        employees,
        getDateStr(dateRange[0]),
        getDateStr(dateRange[dateRange.length - 1])
      );
      setSyncState("saved");
      toast.success(`${format(currentMonth, "yyyy年MM月")}をNotionへ保存しました（新規${result.created}・更新${result.updated}）`);
    } catch (error) {
      console.error("月次一括保存に失敗しました:", error);
      setSyncState("offline");
      toast.error("Notionへの保存に失敗しました。編集内容は端末内に残っています");
    }
  };

  const handleShiftChange = (employeeId: string, date: string, shift: ShiftType | "none") => {
    if (isLocked) {
      toast.error("この月は確定済みのため編集できません");
      return;
    }
    const finalShift = shift === "none" ? "" : shift;
    setEmployees(prev => prev.map(emp => {
      if (emp.id !== employeeId) return emp;
      
      const existingShiftIndex = emp.shifts.findIndex(s => s.date === date);
      const { breakTime, workTime } = calculateTimes(finalShift as ShiftType);
      
      const newShifts = [...emp.shifts];
      if (existingShiftIndex >= 0) {
        newShifts[existingShiftIndex] = { 
          ...newShifts[existingShiftIndex], 
          shift: finalShift as ShiftType, 
          breakTime: finalShift === "任意入力" ? newShifts[existingShiftIndex].breakTime : breakTime, 
          workTime: finalShift === "任意入力" ? newShifts[existingShiftIndex].workTime : workTime 
        };
      } else {
        newShifts.push({ date, shift: finalShift as ShiftType, breakTime, workTime, comment: "" });
      }
      
      return { ...emp, shifts: newShifts };
    }));
  };

  const handleCustomShiftTextChange = (employeeId: string, date: string, text: string) => {
    if (isLocked) return;
    const input = normalizeShiftInput(text);
    setEmployees(prev => prev.map(emp => {
      if (emp.id !== employeeId) return emp;
      const existingShiftIndex = emp.shifts.findIndex(s => s.date === date);
      const { breakTime, workTime } = calculateTimes(input);
      
      const newShifts = [...emp.shifts];
      if (existingShiftIndex >= 0) {
        newShifts[existingShiftIndex] = { 
          ...newShifts[existingShiftIndex], 
          customShiftText: input,
          breakTime: breakTime !== "0:00" ? breakTime : newShifts[existingShiftIndex].breakTime,
          workTime: workTime !== "0:00" ? workTime : newShifts[existingShiftIndex].workTime
        };
      } else {
        newShifts.push({ date, shift: "任意入力", customShiftText: input, breakTime, workTime, comment: "" });
      }
      return { ...emp, shifts: newShifts };
    }));
  };

  const finalizeCustomShiftText = (employeeId: string, date: string) => {
    if (isLocked) return;
    setEmployees(prev => prev.map(emp => {
      if (emp.id !== employeeId) return emp;
      const existingShiftIndex = emp.shifts.findIndex(s => s.date === date);
      if (existingShiftIndex === -1) return emp;

      const currentShift = emp.shifts[existingShiftIndex];
      const finalized = finalizeShiftText(currentShift.customShiftText || "");
      if (finalized === currentShift.customShiftText) return emp;

      const { breakTime, workTime } = calculateTimes(finalized);
      const newShifts = [...emp.shifts];
      newShifts[existingShiftIndex] = {
        ...currentShift,
        customShiftText: finalized,
        breakTime: breakTime !== "0:00" ? breakTime : currentShift.breakTime,
        workTime: workTime !== "0:00" ? workTime : currentShift.workTime
      };
      return { ...emp, shifts: newShifts };
    }));
  };

  const renameEmployee = (id: string, newName: string) => {
    setEmployees(prev => prev.map(emp => emp.id === id ? { ...emp, name: newName } : emp));
    toast.success("名前を変更しました");
  };

  const setEmployeeRole = (id: string, role: string) => {
    setEmployees(prev => prev.map(emp => emp.id === id ? { ...emp, role } : emp));
  };

  const handleCustomTimeChange = (employeeId: string, date: string, field: "breakTime" | "workTime", value: string) => {
    if (isLocked) return;
    setEmployees(prev => prev.map(emp => {
      if (emp.id !== employeeId) return emp;
      const existingShiftIndex = emp.shifts.findIndex(s => s.date === date);
      const newShifts = [...emp.shifts];
      if (existingShiftIndex >= 0) {
        newShifts[existingShiftIndex] = { ...newShifts[existingShiftIndex], [field]: value };
      } else {
        newShifts.push({ date, shift: "任意入力", breakTime: field === "breakTime" ? value : "0:00", workTime: field === "workTime" ? value : "0:00", comment: "" });
      }
      return { ...emp, shifts: newShifts };
    }));
  };

  const copyShiftDown = (employeeId: string, startDate: string) => {
    if (isLocked) return;
    if (activeTab === employeeId && !isFromAdmin) {
      toast.error("管理者画面からのみコピー機能を使用できます");
      return;
    }
    const emp = employees.find(e => e.id === employeeId);
    if (!emp) return;
    
    const sourceShift = emp.shifts.find(s => s.date === startDate);
    const shiftToCopy = sourceShift?.shift || "";
    const breakToCopy = sourceShift?.breakTime || "0:00";
    const workToCopy = sourceShift?.workTime || "0:00";
    const customShiftTextToCopy = sourceShift?.customShiftText;

    const datesToUpdate = dateRange
      .map(d => getDateStr(d))
      .filter(d => d > startDate);

    setEmployees(prev => prev.map(e => {
      if (e.id !== employeeId) return e;
      const newShifts = [...e.shifts];
      datesToUpdate.forEach(date => {
        const idx = newShifts.findIndex(s => s.date === date);
        if (idx >= 0) {
          newShifts[idx] = { ...newShifts[idx], shift: shiftToCopy as ShiftType, breakTime: breakToCopy, workTime: workToCopy, customShiftText: customShiftTextToCopy };
        } else {
          newShifts.push({ date, shift: shiftToCopy as ShiftType, breakTime: breakToCopy, workTime: workToCopy, customShiftText: customShiftTextToCopy, comment: "" });
        }
      });
      return { ...e, shifts: newShifts };
    }));
    toast.success("下の行にコピーしました");
  };

  const applyCycle = (employeeId: string, startDateStr: string, cycleType: number) => {
    if (isLocked) return;
    const emp = employees.find(e => e.id === employeeId);
    if (!emp) return;

    // Use local date parsing
    const [y, m, d] = startDateStr.split("-").map(Number);
    const startDate = new Date(y, m - 1, d);
    
    const day = startDate.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const week1Mon = new Date(startDate);
    week1Mon.setDate(startDate.getDate() + diffToMon);
    week1Mon.setHours(0, 0, 0, 0);

    const datesToUpdate = dateRange
      .map(d => getDateStr(d))
      .filter(d => d >= startDateStr);

    setEmployees(prev => prev.map(e => {
      if (e.id !== employeeId) return e;
      const newShifts = [...e.shifts];
      
      datesToUpdate.forEach(dateStr => {
        const [currY, currM, currD] = dateStr.split("-").map(Number);
        const date = new Date(currY, currM - 1, currD);
        const dayOfWeek = date.getDay();
        const msDiff = date.getTime() - week1Mon.getTime();
        const weeksDiff = Math.floor(msDiff / (7 * 24 * 60 * 60 * 1000));
        const isWeek2 = weeksDiff % 2 === 1;

        const shift: ShiftType = resolveCycleShift(cyclePatterns, cycleType, dayOfWeek, isWeek2);

        if (shift) {
          const { breakTime, workTime } = calculateTimes(shift);
          const idx = newShifts.findIndex(s => s.date === dateStr);
          if (idx >= 0) {
            newShifts[idx] = { ...newShifts[idx], shift, breakTime, workTime };
          } else {
            newShifts.push({ date: dateStr, shift, breakTime, workTime, comment: "" });
          }
        }
      });
      
      return { ...e, shifts: newShifts };
    }));
    
    setCycleAssignments(prev => ({ ...prev, [employeeId]: { cycleType, anchorDate: startDateStr } }));
    toast.success(`${cycleNames[cycleType]}を適用しました`);
  };

  const handleCommentChange = (employeeId: string, date: string, comment: string) => {
    if (isLocked) return;
    setEmployees(prev => prev.map(emp => {
      if (emp.id !== employeeId) return emp;
      
      const existingShiftIndex = emp.shifts.findIndex(s => s.date === date);
      const newShifts = [...emp.shifts];
      if (existingShiftIndex >= 0) {
        newShifts[existingShiftIndex] = { ...newShifts[existingShiftIndex], comment };
      } else {
        newShifts.push({ date, shift: "", breakTime: "0:00", workTime: "0:00", comment });
      }
      
      return { ...emp, shifts: newShifts };
    }));
  };

  /** 指定日を、全従業員「休み」にします（既に「休み」「有給」の人は変更しません）。祝日・店休日のデフォルト適用に使います。 */
  const setAllEmployeesOff = (dateStr: string) => {
    setEmployees(prev => prev.map(emp => {
      const idx = emp.shifts.findIndex(s => s.date === dateStr);
      if (idx >= 0) {
        const currentShift = emp.shifts[idx].shift;
        if (currentShift === "休み" || currentShift === "有給") return emp;
        const newShifts = [...emp.shifts];
        newShifts[idx] = { ...newShifts[idx], shift: "休み", customShiftText: undefined, breakTime: "0:00", workTime: "0:00" };
        return { ...emp, shifts: newShifts };
      }
      return { ...emp, shifts: [...emp.shifts, { date: dateStr, shift: "休み" as ShiftType, breakTime: "0:00", workTime: "0:00", comment: "" }] };
    }));
  };

  const handleGlobalRemarkTypeChange = (date: string, type: GlobalRemark["type"]) => {
    if (isLocked) return;
    setGlobalRemarks(prev => {
      // "なし"が選択された場合は、その日の備考レコード自体を削除して確実にリセット
      if (type === "なし") {
        return prev.filter(r => r.date !== date);
      }
      const existingIndex = prev.findIndex(r => r.date === date);
      const newRemarks = [...prev];
      if (existingIndex >= 0) {
        newRemarks[existingIndex] = { ...newRemarks[existingIndex], type };
      } else {
        newRemarks.push({ date, type, text: "" });
      }
      return newRemarks;
    });
    // 祝日・店休日を選んだ場合は、その場で全従業員を休みにします。
    if (type === "祝日" || type === "店休日") {
      setAllEmployeesOff(date);
    }
  };

  const handleGlobalRemarkTextChange = (date: string, text: string) => {
    if (isLocked) return;
    setGlobalRemarks(prev => {
      const existingIndex = prev.findIndex(r => r.date === date);
      const newRemarks = [...prev];
      if (existingIndex >= 0) {
        newRemarks[existingIndex] = { ...newRemarks[existingIndex], text };
      } else {
        newRemarks.push({ date, type: "コメント", text });
      }
      return newRemarks;
    });
  };

  const renameCycle = (num: number, name: string) => {
    setCycleNames(prev => ({ ...prev, [num]: name }));
  };

  const clearMonthShifts = () => {
    if (isLocked) {
      toast.error("この月は確定済みのためクリアできません");
      return;
    }
    
    setEmployees(prev => prev.map(emp => {
      const newShifts = emp.shifts.filter(s => !dateRange.some(d => s.date === getDateStr(d)));
      return { ...emp, shifts: newShifts };
    }));
    setShowClearConfirm(false);
    toast.success(`${format(currentMonth, "yyyy年MM月")}のシフトをすべてクリアしました`);
  };

  const downloadCSV = () => {
    const headers = ["日付", "曜日", ...employees.flatMap(e => [`${e.name}(シフト)`, `${e.name}(備考)`]), "全体備考"];
    const rows = dateRange.map(date => {
      const dateStr = getDateStr(date);
      const gr = getGlobalRemark(date);
      const row = [
        format(date, "MM/dd"),
        format(date, "E", { locale: ja }),
        ...employees.flatMap(e => {
          const s = getShift(e, date);
          const shiftText = s?.shift === "任意入力" ? (s?.customShiftText || "任意入力") : (s?.shift === "休み" ? "" : (s?.shift || "-"));
          return [shiftText, s?.comment || ""];
        }),
        gr ? `${gr.type}${gr.text ? `: ${gr.text}` : ""}` : ""
      ];
      return row;
    });

    const csvContent = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `shift_${currentMonthKey}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSVをダウンロードしました");
  };

  const downloadExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const borderStyle: Partial<ExcelJS.Borders> = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };

    // 1. 全体シフトシートの作成
    const overallSheet = workbook.addWorksheet("全体シフト");
    
    // 印刷設定: 縦向き(portrait)に変更
    overallSheet.pageSetup = {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1, // 1枚に収める
      margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
    };

    const totalCols = employees.length + 2;

    // 題名とメタデータ
    const titleRow = overallSheet.addRow(["全体シフト集約"]);
    titleRow.font = { size: 16, bold: true };
    overallSheet.mergeCells(1, 1, 1, totalCols);
    titleRow.alignment = { horizontal: 'center' };

    const periodStr = `集計期間: ${format(dateRange[0], "yyyy/MM/dd")} 〜 ${format(dateRange[dateRange.length - 1], "yyyy/MM/dd")}`;
    const outputDateStr = `出力日: ${format(new Date(), "yyyy/MM/dd")}`;
    const metaRow = overallSheet.addRow([periodStr, ...Array(employees.length).fill(""), outputDateStr]);
    overallSheet.mergeCells(2, 1, 2, totalCols - 1);
    metaRow.getCell(totalCols).alignment = { horizontal: 'right' };
    overallSheet.addRow([]); // 空行

    const overallHeaders = ["日付", ...employees.map(e => e.name), "備考"];
    const headerRow = overallSheet.addRow(overallHeaders);
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: 'center' };
    headerRow.eachCell({ includeEmpty: true }, cell => {
      cell.border = borderStyle;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF2F2F2' }
      };
    });

    dateRange.forEach(date => {
      const gr = getGlobalRemark(date);
      let remarkText = "";
      if (gr && gr.type !== "なし") {
        if (gr.type === "コメント") {
          remarkText = gr.text;
        } else if (gr.text) {
          remarkText = `${gr.type}: ${gr.text}`;
        } else {
          remarkText = gr.type;
        }
      }

      const rowData = [
        format(date, "M/d(E)", { locale: ja }),
        ...employees.map(e => {
          const s = getShift(e, date);
          return s?.shift === "任意入力" ? (s?.customShiftText || "任意入力") : (s?.shift === "休み" ? "" : (s?.shift || "-"));
        }),
        remarkText
      ];
      const row = overallSheet.addRow(rowData);
      row.height = 22;
      
      const day = date.getDay();
      const isSunday = day === 0;
      const isSaturday = day === 6;
      const isHoliday = gr?.type === "祝日" || gr?.type === "店休日";
      const isClinicClosed = gr?.type === "谷川整形休診";

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = borderStyle;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        
        // 背景色（帯色）の反映
        if (isClinicClosed) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
        } else if (isHoliday || isSunday) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        }

        // 日付列（1列目）のみフォント色を変更
        if (colNumber === 1) {
          if (isSunday || isHoliday) {
            cell.font = { color: { argb: 'FFFF0000' }, bold: true };
          } else if (isSaturday) {
            cell.font = { color: { argb: 'FF00B0F0' }, bold: true };
          }
        }

        // 備考列（最後）は左揃え
        if (colNumber === totalCols) {
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        }
      });
    });

    // 集計行の追加
    overallSheet.addRow([]); // 空行
    
    const attendanceData = ["出勤日数合計"];
    const workHoursData = ["実働時間合計"];
    const paidLeaveData = ["有給日数合計"];

    employees.forEach(emp => {
      const stats = emp.shifts
        .filter(s => dateRange.some(d => s.date.startsWith(getDateStr(d))))
        .reduce((acc, s) => {
          const isWorking = s.shift && s.shift !== "休み" && s.shift !== "有給";
          const [wh, wm] = (s.workTime || "0:00").split(":").map(Number);
          return {
            workHours: acc.workHours + (isNaN(wh) ? 0 : wh + wm/60),
            attendance: acc.attendance + (isWorking ? 1 : 0),
            paid: acc.paid + (s.shift === "有給" ? 1 : 0)
          };
        }, { workHours: 0, attendance: 0, paid: 0 });

      attendanceData.push(`${stats.attendance}日`);
      workHoursData.push(`${stats.workHours.toFixed(1)}h`);
      paidLeaveData.push(`${stats.paid}日`);
    });

    [attendanceData, workHoursData, paidLeaveData].forEach(data => {
      const row = overallSheet.addRow([...data, ""]); // 備考列分空ける
      row.font = { bold: true };
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = borderStyle;
        cell.alignment = { horizontal: 'center' };
        if (colNumber === 1) cell.alignment = { horizontal: 'right' };
      });
    });

    // 列幅の調整 (Portrait用に最適化)
    overallSheet.getColumn(1).width = 10;
    employees.forEach((_, i) => {
      overallSheet.getColumn(i + 2).width = 12; // 少し広げる
    });
    overallSheet.getColumn(totalCols).width = 18; // 備考を狭くする

    // 2. 各個人のシートを作成
    employees.forEach(emp => {
      const empSheet = workbook.addWorksheet(emp.name);
      empSheet.pageSetup = { 
        paperSize: 9, 
        orientation: 'portrait', 
        fitToPage: true, 
        fitToWidth: 1,
        fitToHeight: 1,
        margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0, footer: 0 }
      };
      
      const empTitleRow = empSheet.addRow([`${emp.name} 様 シフト表`]);
      empTitleRow.font = { size: 14, bold: true };
      empSheet.mergeCells(1, 1, 1, 5);
      
      const empMetaRow = empSheet.addRow([periodStr, "", "", "", outputDateStr]);
      empSheet.mergeCells(2, 1, 2, 4);
      empMetaRow.getCell(5).alignment = { horizontal: 'right' };
      empSheet.addRow([]);

      const empHeaders = ["日付", "シフト", "休憩時間", "実働時間", "備考"];
      const empHeaderRow = empSheet.addRow(empHeaders);
      empHeaderRow.font = { bold: true };
      empHeaderRow.alignment = { horizontal: 'center' };
      empHeaderRow.eachCell({ includeEmpty: true }, cell => {
        cell.border = borderStyle;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
      });

      dateRange.forEach(date => {
        const s = getShift(emp, date);
        const gr = getGlobalRemark(date);
        let remarkText = "";
        if (gr && gr.type !== "なし") {
          if (gr.type === "コメント") {
            remarkText = gr.text;
          } else if (gr.text) {
            remarkText = `${gr.type}: ${gr.text}`;
          } else {
            remarkText = gr.type;
          }
        }

        const shiftText = s?.shift === "任意入力" ? (s?.customShiftText || "任意入力") : (s?.shift === "休み" ? "" : (s?.shift || "-"));
        const rowData = [
          format(date, "M/d(E)", { locale: ja }),
          shiftText,
          s?.breakTime || "0:00",
          s?.workTime || "0:00",
          [remarkText, s?.comment].filter(Boolean).join(" / ")
        ];
        const row = empSheet.addRow(rowData);
        row.height = 22;
        const day = date.getDay();
        const isSunday = day === 0;
        const isSaturday = day === 6;
        const isHoliday = gr?.type === "祝日" || gr?.type === "店休日";
        const isClinicClosed = gr?.type === "谷川整形休診";

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.border = borderStyle;
          cell.alignment = { horizontal: 'center', vertical: 'middle' };

          // 背景色（帯色）の反映
          if (isClinicClosed) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
          } else if (isHoliday || isSunday) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
          }

          // 日付列（1列目）のみフォント色を変更
          if (colNumber === 1) {
            if (isSunday || isHoliday) {
              cell.font = { color: { argb: 'FFFF0000' }, bold: true };
            } else if (isSaturday) {
              cell.font = { color: { argb: 'FF00B0F0' }, bold: true };
            }
          }

          if (colNumber === 5) {
            cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
          }
        });
      });

      // 合計行の追加
      const stats = emp.shifts
        .filter(s => dateRange.some(d => s.date.startsWith(getDateStr(d))))
        .reduce((acc, s) => {
          const isWorking = s.shift && s.shift !== "休み" && s.shift !== "有給";
          const [wh, wm] = (s.workTime || "0:00").split(":").map(Number);
          const [bh, bm] = (s.breakTime || "0:00").split(":").map(Number);
          return {
            workHours: acc.workHours + (isNaN(wh) ? 0 : wh + wm/60),
            breakHours: acc.breakHours + (isNaN(bh) ? 0 : bh + bm/60),
            attendance: acc.attendance + (isWorking ? 1 : 0),
            paid: acc.paid + (s.shift === "有給" ? 1 : 0)
          };
        }, { workHours: 0, breakHours: 0, attendance: 0, paid: 0 });

      empSheet.addRow([]);
      const totalRow = empSheet.addRow([
        "月間合計",
        "",
        `${stats.breakHours.toFixed(1)}h`,
        `${stats.workHours.toFixed(1)}h`,
        ""
      ]);
      totalRow.font = { bold: true };
      totalRow.eachCell({ includeEmpty: true }, cell => {
        cell.alignment = { horizontal: 'center' };
        cell.border = borderStyle;
      });

      const detailRow = empSheet.addRow([
        "出勤日数",
        `${stats.attendance}日`,
        "有給日数",
        `${stats.paid}日`,
        ""
      ]);
      detailRow.font = { bold: true };
      detailRow.eachCell({ includeEmpty: true }, cell => {
        cell.alignment = { horizontal: 'center' };
        cell.border = borderStyle;
      });

      empSheet.getColumn(1).width = 10;
      empSheet.getColumn(2).width = 18;
      empSheet.getColumn(3).width = 8;
      empSheet.getColumn(4).width = 8;
      empSheet.getColumn(5).width = 18;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `shift_${currentMonthKey}.xlsx`;
    const savedToFolder = await saveBufferToRememberedFolder(fileName, buffer as ArrayBuffer);
    if (savedToFolder) {
      toast.success(`保存先フォルダに ${fileName} を書き出しました`);
    } else {
      saveAs(new Blob([buffer]), fileName);
    }
    toast.success("Excelファイルをダウンロードしました");
  };

  const getGlobalRemark = (date: Date) => {
    const dateStr = getDateStr(date);
    return globalRemarks.find(r => r.date === dateStr);
  };

  const getRowBgClass = (date: Date) => {
    const gr = getGlobalRemark(date);
    const isSunday = date.getDay() === 0;
    
    // 赤帯（日曜日、またはドロップダウンで祝日・店休日を選択したとき）を最優先にする
    if (gr?.type === "祝日" || gr?.type === "店休日" || isSunday) return "bg-red-100/70";
    
    // 青帯（ドロップダウンで谷川整形休診を選択したときのみ。土曜日は対象外）
    if (gr?.type === "谷川整形休診") return "bg-blue-100/70";
    
    return "";
  };

  const getShift = (employee: Employee | undefined, date: Date) => {
    if (!employee || !employee.shifts) return null;
    const dateStr = getDateStr(date);
    return employee.shifts.find(s => s.date.startsWith(dateStr));
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="shift-shell flex h-screen w-full overflow-hidden bg-background text-foreground font-sans">
      {/* Sidebar */}
      <aside className="shift-sidebar w-64 bg-card border-r border-border p-6 flex flex-col shrink-0 overflow-y-auto">
        <div className="text-xl font-bold text-primary mb-8 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <img src="/shift-kanri-tool/shift-ai-logo.png" alt="" className="w-10 h-10 object-contain" />
            <div className="leading-tight"><span className="block text-base">シフト管理</span><span className="block text-[10px] font-medium opacity-60 mt-1">PHARMACY SHIFT AI</span></div>
          </div>
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full hover:bg-slate-100"
              onClick={(e) => {
                e.stopPropagation();
                setShowNotificationPopup(!showNotificationPopup);
              }}
            >
              <Bell className="w-4 h-4 text-slate-600" />
              {employees.some(e => e.shifts.some(s => s.comment)) && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
              )}
            </Button>
            
            <AnimatePresence>
              {showNotificationPopup && (
                <>
                  <div className="fixed inset-0 z-[90]" onClick={() => setShowNotificationPopup(false)} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, x: 20 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95, x: 20 }}
                    className="fixed left-64 top-6 ml-2 w-72 bg-white rounded-xl shadow-2xl border border-border overflow-hidden z-[100]"
                  >
                    <div className="p-4 bg-slate-50 border-b border-border flex items-center justify-between">
                      <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                        <Bell className="w-4 h-4 text-blue-500" />
                        備考通知一覧
                      </h4>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 rounded-md"
                        onClick={() => setShowNotificationPopup(false)}
                      >
                        ×
                      </Button>
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto">
                      {(() => {
                        const allComments = employees.flatMap(emp => 
                          emp.shifts
                            .filter(s => s.comment && s.comment.trim() !== "")
                            .map(s => ({ 
                              employeeId: emp.id,
                              employeeName: emp.name, 
                              date: s.date, 
                              comment: s.comment 
                            }))
                        ).sort((a, b) => b.date.localeCompare(a.date));

                        if (allComments.length === 0) {
                          return <div className="p-8 text-center text-slate-400 text-xs">新しい備考はありません</div>;
                        }

                        return allComments.map((c, i) => (
                          <div 
                            key={i} 
                            className="p-3 border-b border-border/50 hover:bg-blue-50/50 transition-colors cursor-pointer group"
                            onClick={() => {
                              setActiveTab(c.employeeId);
                              setIsFromAdmin(false);
                              setShowNotificationPopup(false);
                              const [y, m, d] = c.date.split("-").map(Number);
                              setCurrentMonth(new Date(y, m - 1, 1));
                              toast.success(`${c.employeeName}さんのページに移動しました`);
                            }}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-bold text-xs text-slate-700 group-hover:text-blue-600 transition-colors">{c.employeeName}</span>
                              <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap ml-2">
                                {format(new Date(c.date.replace(/-/g, "/")), "M月d日")}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 leading-relaxed bg-white/50 p-2 rounded-md border border-slate-100 group-hover:border-blue-200 transition-colors line-clamp-2">
                              {c.comment}
                            </p>
                          </div>
                        ));
                      })()}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="space-y-8 flex-1">
          <section>
            <h3 className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-4 px-2">
              基本メニュー
            </h3>
            <div className="flex flex-col gap-2.5">
            <Button 
                variant="outline" 
                className={`w-full justify-start h-12 px-4 text-sm font-semibold transition-all group relative overflow-hidden ${(activeTab === "home" && !isFromAdmin) ? "bg-slate-100 border-slate-300 shadow-inner" : "bg-white hover:bg-slate-50 border-slate-200 shadow-xs"}`}
                onClick={() => {
                  setActiveTab("home");
                  setIsFromAdmin(false);
                }}
              >
                <div className={`absolute inset-y-0 left-0 w-1 transform -translate-x-full group-hover:translate-x-0 transition-transform ${(activeTab === "home" && !isFromAdmin) ? "bg-blue-500 translate-x-0" : "bg-slate-400"}`} />
                <Home className="w-4 h-4 mr-3 text-blue-600" />
                ホーム
              </Button>
            </div>
          </section>

          <section className="mb-6">
            <h3 className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-4 px-2">
              アクション
            </h3>
            <div className="flex flex-col gap-2.5">
              <Button 
                variant="outline" 
                className={`w-full justify-start h-12 px-4 text-sm font-semibold transition-all group relative overflow-hidden ${isLocked ? "bg-red-100 hover:bg-red-200 border-red-300 text-red-800 font-bold" : "bg-white hover:bg-slate-50 border-slate-200 shadow-xs"}`}
                onClick={toggleLock}
              >
                <div className={`absolute inset-y-0 left-0 w-1 transform -translate-x-full group-hover:translate-x-0 transition-transform ${isLocked ? "bg-red-500" : "bg-primary"}`} />
                {isLocked ? (
                  <>
                    <Users className="w-4 h-4 mr-3" />
                    確定解除
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4 mr-3" />
                    シフト確定 (編集ロック)
                  </>
                )}
              </Button>
              <Button 
                className="w-full justify-start h-12 px-4 text-sm font-semibold bg-white hover:bg-slate-50 border-slate-200 transition-all group relative overflow-hidden" 
                variant="outline"
                onClick={createNextMonthShifts}
              >
                <div className="absolute inset-y-0 left-0 w-1 bg-blue-500 transform -translate-x-full group-hover:translate-x-0 transition-transform" />
                <PlusCircle className="w-4 h-4 mr-3 text-blue-600" />
                翌月分作成 (21日~20日)
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start h-12 px-4 text-sm font-semibold bg-white hover:bg-slate-50 border-slate-200 transition-all group relative overflow-hidden" 
                  >
                    <div className="absolute inset-y-0 left-0 w-1 bg-green-500 transform -translate-x-full group-hover:translate-x-0 transition-transform" />
                    <Download className="w-4 h-4 mr-3 text-green-600" />
                    データ出力
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="bg-white border-border shadow-2xl z-50 w-56 p-1">
                  <DropdownMenuItem className="text-xs font-medium cursor-pointer py-2 px-3 rounded-md focus:bg-slate-100 transition-colors" onClick={downloadCSV}>
                    <FileCode className="w-3 h-3 mr-2 text-slate-400" /> CSV形式でダウンロード
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs font-medium cursor-pointer py-2 px-3 rounded-md focus:bg-slate-100 transition-colors" onClick={downloadExcel}>
                    <Grid3X3 className="w-3 h-3 mr-2 text-green-600" /> Excel形式でダウンロード
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </section>

          <section>
            <h3 className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-4 px-2">
              システム設定
            </h3>
            <div className="flex flex-col gap-2.5">
              <Button 
                variant="outline" 
                className={`w-full justify-start h-12 px-4 text-sm font-semibold transition-all group relative overflow-hidden ${(activeTab === "admin" && isFromAdmin) ? "bg-slate-100 border-slate-300 shadow-inner" : "bg-white hover:bg-slate-50 border-slate-200 shadow-xs"}`}
                onClick={() => {
                  requestEditAccess(() => {
                    setActiveTab("admin");
                    setIsFromAdmin(true);
                  });
                }}
              >
                <div className={`absolute inset-y-0 left-0 w-1 transform -translate-x-full group-hover:translate-x-0 transition-transform ${(activeTab === "admin" && isFromAdmin) ? "bg-slate-800 translate-x-0" : "bg-slate-400"}`} />
                <FileCode className="w-4 h-4 mr-3 text-slate-600" />
                アプリ詳細・環境設定
              </Button>
            </div>
          </section>
        </div>

        <div className="mt-auto pt-6 space-y-2">
          <Button
            className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm"
            onClick={saveCurrentMonth}
            disabled={syncState === "loading" || syncState === "saving" || syncState === "saved"}
          >
            <CloudUpload className="w-4 h-4 mr-2" />
            {syncState === "saving" ? "保存中…" : "Notionへ保存"}
          </Button>
          <div className="sync-indicator flex items-center gap-2 text-xs">
            <span className={`sync-dot ${syncState}`} />
            {syncState === "loading" ? "Notionを読込中" : syncState === "saving" ? "月単位で保存中" : syncState === "dirty" ? "未保存の変更あり" : syncState === "offline" ? "保存失敗（端末内に保存済み）" : "Notionに保存済み"}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="shift-main flex-1 flex flex-col overflow-hidden p-6 gap-6">
        {activeTab !== "home" && (
        <header className="flex flex-col md:flex-row items-center justify-between shrink-0 gap-4 mb-2">
          <div className="flex items-center gap-1 bg-muted p-1 rounded-xl border border-border/50">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-9 px-3 rounded-lg hover:bg-white hover:shadow-sm transition-all"
              onClick={() => setCurrentMonth(prev => addMonths(prev, -1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            
            <div className="flex items-center gap-3 px-4 py-1.5 bg-white rounded-lg shadow-xs border border-border/40">
              <Select 
                value={currentMonth.getFullYear().toString()} 
                onValueChange={(val) => {
                  const newDate = new Date(currentMonth);
                  newDate.setFullYear(parseInt(val));
                  setCurrentMonth(newDate);
                }}
              >
                <SelectTrigger className="h-6 w-auto border-none shadow-none bg-transparent font-bold text-sm focus:ring-0 p-0 hover:text-primary transition-colors">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-border shadow-2xl">
                  {Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i).map(year => (
                    <SelectItem key={year} value={year.toString()} className="text-xs font-medium">{year}年</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <div className="w-px h-3 bg-border/60" />

              <Select 
                value={(currentMonth.getMonth() + 1).toString()} 
                onValueChange={(val) => {
                  const newDate = new Date(currentMonth);
                  newDate.setMonth(parseInt(val) - 1);
                  setCurrentMonth(newDate);
                }}
              >
                <SelectTrigger className="h-6 w-auto border-none shadow-none bg-transparent font-bold text-sm focus:ring-0 p-0 hover:text-primary transition-colors">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-border shadow-2xl">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                    <SelectItem key={month} value={month.toString()} className="text-xs font-medium">{month}月</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button 
              variant="ghost" 
              size="sm" 
              className="h-9 px-3 rounded-lg hover:bg-white hover:shadow-sm transition-all"
              onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <TabsList className="bg-muted p-1 rounded-xl border border-border/50 h-auto flex flex-wrap justify-center overflow-visible">
            <TabsTrigger 
              value="dashboard" 
              className="px-5 py-2 text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all" 
            >
              全体
            </TabsTrigger>
            {employees.map(emp => (
              <TabsTrigger 
                key={emp.id} 
                value={emp.id} 
                className="px-5 py-2 text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all"
              >
                {emp.name}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex items-center gap-1 bg-muted p-1 rounded-xl border border-border/50 ml-auto md:ml-0">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 rounded-lg hover:bg-white hover:shadow-sm transition-all"
              title="前のタブへ"
              onClick={() => {
                const allTabs = ["dashboard", ...employees.map(e => e.id), "admin"];
                const currentIdx = allTabs.indexOf(activeTab);
                const nextIdx = (currentIdx - 1 + allTabs.length) % allTabs.length;
                const target = allTabs[nextIdx];
                if (target === "admin") {
                  requestEditAccess(() => {
                    setActiveTab(target);
                    setIsFromAdmin(true);
                  });
                } else {
                  setActiveTab(target);
                  if (target === "dashboard") setIsFromAdmin(false);
                }
              }}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 rounded-lg hover:bg-white hover:shadow-sm transition-all"
              title="次のタブへ"
              onClick={() => {
                const allTabs = ["dashboard", ...employees.map(e => e.id), "admin"];
                const currentIdx = allTabs.indexOf(activeTab);
                const nextIdx = (currentIdx + 1) % allTabs.length;
                const target = allTabs[nextIdx];
                if (target === "admin") {
                  requestEditAccess(() => {
                    setActiveTab(target);
                    setIsFromAdmin(true);
                  });
                } else {
                  setActiveTab(target);
                  if (target === "dashboard") setIsFromAdmin(false);
                }
              }}
            >
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>

          {isFromAdmin && (
            <div className="flex items-center gap-1 bg-muted p-1 rounded-xl border border-border/50">
              {showClearConfirm ? (
                <div className="flex items-center gap-1 animate-in fade-in zoom-in duration-200">
                  <span className="text-[10px] font-bold text-red-600 px-2">全消去しますか？</span>
                  <Button 
                    variant="destructive"
                    size="sm" 
                    className="h-7 text-[10px] font-bold rounded-lg px-3 bg-red-600 hover:bg-red-700 text-white border-0 shadow-sm"
                    onClick={clearMonthShifts}
                  >
                    実行
                  </Button>
                  <Button 
                    variant="ghost"
                    size="sm" 
                    className="h-7 text-[10px] font-bold rounded-lg px-3 bg-slate-200 hover:bg-slate-300 text-slate-700 border-0"
                    onClick={() => setShowClearConfirm(false)}
                  >
                    キャンセル
                  </Button>
                </div>
              ) : (
                <Button 
                  variant="destructive"
                  size="sm" 
                  className={`h-8 text-[10px] font-bold rounded-lg px-3 ${isLocked ? "opacity-50 cursor-not-allowed" : ""} bg-red-600 hover:bg-red-700 text-white border-0 shadow-sm`}
                  onClick={() => setShowClearConfirm(true)}
                  disabled={isLocked}
                >
                  当月リセット
                </Button>
              )}
            </div>
          )}
        </header>
        )}

        <div className="flex-1 overflow-y-auto min-h-0 pt-2">
          <AnimatePresence mode="wait">
            {activeTab === "home" ? (
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
                    <Button variant="ghost" size="sm" className="h-9 px-3 rounded-lg" onClick={() => setHomeWeekOffset(w => w - 1)}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="px-3 text-sm font-bold text-slate-700">
                      {format(homeWeekDates[0], "M月d日")} 〜 {format(homeWeekDates[6], "M月d日")}
                    </span>
                    <Button variant="ghost" size="sm" className="h-9 px-3 rounded-lg" onClick={() => setHomeWeekOffset(w => w + 1)}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                    {homeWeekOffset !== 0 && (
                      <Button variant="ghost" size="sm" className="h-9 px-2 text-xs" onClick={() => setHomeWeekOffset(0)}>
                        今週
                      </Button>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs"
                    onClick={() => { setActiveTab("dashboard"); setIsFromAdmin(false); }}
                  >
                    全体表示 <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {homeWeekDates.map(date => {
                    const dateStr = getDateStr(date);
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === homeSelectedDateStr;
                    const remark = getGlobalRemark(date);
                    const working = employees
                      .map(emp => ({ emp, shift: emp.shifts.find(s => s.date === dateStr) }))
                      .filter(({ shift }) => shift?.shift && shift.shift !== "休み");
                    return (
                      <button
                        key={dateStr}
                        onClick={() => setHomeSelectedDate(dateStr)}
                        className={`text-left rounded-xl border p-3 transition-all ${isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"} ${isToday ? "ring-1 ring-blue-300" : ""}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold text-slate-500">{format(date, "M/d")}（{["日", "月", "火", "水", "木", "金", "土"][date.getDay()]}）</span>
                          {remark && remark.type !== "コメント" && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-red-200 text-red-600">{remark.type}</Badge>
                          )}
                        </div>
                        <div className="space-y-1 min-h-[40px]">
                          {working.length === 0 ? (
                            <span className="text-[10px] text-muted-foreground">予定なし</span>
                          ) : working.map(({ emp }) => (
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
                      {format(new Date(homeSelectedDateStr), "M月d日")}（{["日", "月", "火", "水", "木", "金", "土"][new Date(homeSelectedDateStr).getDay()]}）の詳細
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      {employees.map(emp => {
                        const shift = emp.shifts.find(s => s.date === homeSelectedDateStr);
                        const label = shift?.shift === "任意入力" ? (shift.customShiftText || "") : (shift?.shift || "");
                        return (
                          <div key={emp.id} className="flex items-center justify-between text-xs border-b border-slate-100 last:border-0 py-2">
                            <div className="flex items-center gap-2">
                              {emp.role && <Badge variant="outline" className="text-[9px] px-1.5">{emp.role}</Badge>}
                              <span
                                className="font-semibold text-slate-700 cursor-pointer hover:underline"
                                onClick={() => { setActiveTab(emp.id); setIsFromAdmin(false); }}
                                title="この従業員の全体シフトを見る"
                              >
                                {emp.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-slate-500">
                              <span className={!label ? "text-muted-foreground" : ""}>{label || "未入力"}</span>
                              {shift && shift.shift && shift.shift !== "休み" && shift.shift !== "有給" && (
                                <>
                                  <span>休憩 {shift.breakTime}</span>
                                  <span>実働 {shift.workTime}</span>
                                </>
                              )}
                              {shift?.comment && <span className="italic text-slate-400">{shift.comment}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : activeTab === "dashboard" ? (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="border-border shadow-none">
                  <CardHeader className="py-4 border-b border-border flex flex-row items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 group">
                        {isEditingTitle ? (
                          <Input 
                            value={dashboardTitle}
                            onChange={(e) => setDashboardTitle(e.target.value)}
                            onBlur={() => setIsEditingTitle(false)}
                            onKeyDown={(e) => e.key === "Enter" && setIsEditingTitle(false)}
                            className="text-base font-bold h-8 max-w-[300px]"
                            autoFocus
                          />
                        ) : (
                          <CardTitle className="text-base flex items-center gap-2">
                            {dashboardTitle}
                            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setIsEditingTitle(true)}>
                              <FileCode className="w-3 h-3" />
                            </Button>
                          </CardTitle>
                        )}
                      </div>
                      <CardDescription className="text-xs">
                        {dateRange.length > 0 ? `${format(dateRange[0], "yyyy/MM/dd")} - ${format(dateRange[dateRange.length - 1], "MM/dd")}` : "期間未設定"}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] font-normal">閲覧専用</Badge>
                      <span className="text-[10px] text-muted-foreground">最終集約: 10分前</span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table className="text-[13px]">
                        <TableHeader>
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableHead className="w-16 h-10 font-bold text-muted-foreground border-r border-border">日付</TableHead>
                            <TableHead className="w-10 h-10 font-bold text-muted-foreground border-r border-border">曜</TableHead>
                            {employees.map(emp => (
                              <TableHead key={emp.id} className="font-bold text-muted-foreground border-r border-border min-w-[120px]">{emp.name}</TableHead>
                            ))}
                            <TableHead className="font-bold text-muted-foreground min-w-[150px]">備考</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dateRange.map(date => {
                            const dateStr = getDateStr(date);
                            const gr = getGlobalRemark(date);
                            const rowBgClass = getRowBgClass(date);

                            return (
                              <TableRow key={date.toISOString()} className={`h-10 ${rowBgClass}`}>
                                <TableCell className="py-2 border-r border-border">{format(date, "MM/dd")}</TableCell>
                                <TableCell className="py-2 text-muted-foreground border-r border-border">{format(date, "E", { locale: ja })}</TableCell>
                                {employees.map(emp => {
                                  const s = getShift(emp, date);
                                  return (
                                    <TableCell key={emp.id} className="py-1 px-1 border-r border-border">
                                      <div className={`text-[12px] py-1.5 rounded-sm text-center font-bold leading-none ${
                                        s?.shift === "有給" 
                                          ? "bg-red-100 text-red-800 border border-red-200" 
                                          : s?.shift === "休み"
                                            ? ""
                                            : s?.shift === "任意入力"
                                              ? "text-blue-600"
                                              : s?.shift 
                                                ? "text-slate-900"
                                                : "text-muted-foreground"
                                      }`}>
                                        {s?.shift === "任意入力" ? (s?.customShiftText || "任意入力") : (s?.shift === "休み" ? "" : (s?.shift || "-"))}
                                      </div>
                                    </TableCell>
                                  );
                                })}
                                <TableCell className="py-1 px-2">
                                  <div className="flex flex-col gap-1">
                                    <Select 
                                      value={gr?.type || "なし"} 
                                      onValueChange={(val) => handleGlobalRemarkTypeChange(dateStr, val as GlobalRemark["type"])}
                                      disabled={isLocked}
                                    >
                                      <SelectTrigger className="h-7 text-[10px] bg-white/50">
                                        <SelectValue placeholder="備考種別" />
                                      </SelectTrigger>
                                      <SelectContent className="bg-white border-border shadow-xl z-50">
                                        {GLOBAL_REMARK_TYPES.map(type => (
                                          <SelectItem key={type} value={type} className="text-xs">{type}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    {(gr?.type === "コメント" || gr?.type === "当番薬局") && (
                                      <Input 
                                        className="h-7 text-[10px] bg-white/50 border-border" 
                                        placeholder="内容入力..." 
                                        value={gr?.text || ""}
                                        onChange={(e) => handleGlobalRemarkTextChange(dateStr, e.target.value)}
                                        disabled={isLocked}
                                      />
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          {/* Summary Row */}
                          <TableRow className="bg-muted/50 font-bold h-12">
                            <TableCell colSpan={2} className="text-right border-r border-border pr-4">月間合計</TableCell>
                            {employees.map(emp => {
                              const stats = emp.shifts
                                .filter(s => dateRange.some(d => s.date.startsWith(getDateStr(d))))
                                .reduce((acc, s) => {
                                  const isWorking = s.shift && s.shift !== "休み" && s.shift !== "有給";
                                  if (!s.workTime || !s.workTime.includes(":")) {
                                    return { ...acc, attendance: acc.attendance + (isWorking ? 1 : 0), paid: acc.paid + (s.shift === "有給" ? 1 : 0) };
                                  }
                                  const [h, m] = s.workTime.split(":").map(Number);
                                  if (isNaN(h) || isNaN(m)) {
                                    return { ...acc, attendance: acc.attendance + (isWorking ? 1 : 0), paid: acc.paid + (s.shift === "有給" ? 1 : 0) };
                                  }
                                  return {
                                    hours: acc.hours + h + m/60,
                                    paid: acc.paid + (s.shift === "有給" ? 1 : 0),
                                    attendance: acc.attendance + (isWorking ? 1 : 0)
                                  };
                                }, { hours: 0, paid: 0, attendance: 0 });
                              return (
                                <TableCell key={emp.id} className="py-1 px-2 border-r border-border text-center">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-slate-900 font-bold text-[12px]">{stats.hours.toFixed(1)}h</span>
                                    <div className="flex items-center justify-center gap-1">
                                      <span className="text-slate-600 text-[11px] font-medium">{stats.attendance}日</span>
                                      <span className="text-red-700 text-[11px] font-medium">{stats.paid}日(有)</span>
                                    </div>
                                  </div>
                                </TableCell>
                              );
                            })}
                            <TableCell className="bg-muted/30" />
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : activeTab === "admin" ? (
              <motion.div
                key="admin"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-8"
              >
                <div className="grid grid-cols-1 gap-6">
                  <Card className="border-border shadow-sm">
                    <CardHeader className="py-4 border-b border-border bg-slate-50/50 rounded-t-xl">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="w-4 h-4 text-primary" />
                        基本設定
                      </CardTitle>
                      <CardDescription className="text-xs">従業員名やシフトパターンの名称をカスタマイズします</CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 space-y-8">
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">従業員マスター（名前の変更・個別シート編集）</h4>
                          <Badge variant="outline" className="text-[10px] font-medium border-slate-200 text-slate-400">
                            クリックで個別シート編集
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {employees.map(emp => (
                            <div key={emp.id} className="flex gap-2">
                              <Input 
                                defaultValue={emp.name}
                                onBlur={(e) => renameEmployee(emp.id, e.target.value)}
                                className="h-10 text-sm bg-white border-slate-200 focus:border-primary/50 rounded-xl flex-1"
                                placeholder="従業員名"
                              />
                              <Input 
                                defaultValue={emp.role || ""}
                                onBlur={(e) => setEmployeeRole(emp.id, e.target.value)}
                                className="h-10 text-sm bg-white border-slate-200 focus:border-primary/50 rounded-xl w-28"
                                placeholder="役職"
                              />
                              <Button 
                                variant="outline" 
                                size="icon"
                                className="h-10 w-10 shrink-0 rounded-xl border-slate-200 hover:bg-slate-50 hover:text-primary transition-colors"
                                title="この従業員のシートを詳しく編集"
                                onClick={() => {
                                  setActiveTab(emp.id);
                                  setIsFromAdmin(true);
                                }}
                              >
                                <ChevronRight className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-6 border-t border-slate-100">
                        <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">クール名のカスタマイズ</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {[1, 2, 3, 4, 5, 6, 7].map(num => (
                            <div key={num} className="flex items-center shadow-sm">
                              <div className="w-10 h-10 flex items-center justify-center bg-slate-100 text-[10px] font-bold text-slate-500 rounded-l-xl border-y border-l border-slate-200">{num}</div>
                              <Input 
                                value={cycleNames[num]}
                                onChange={(e) => renameCycle(num, e.target.value)}
                                className="h-10 text-sm rounded-l-none rounded-r-xl bg-white border-slate-200"
                                placeholder={`クール${num}`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-6 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">クール内容の編集（曜日ごとの勤務時間）</h4>
                        </div>
                        <div className="space-y-6">
                          {[1, 2, 3, 4, 5, 6, 7].map(num => (
                            <div key={num} className="border border-slate-200 rounded-xl p-4 bg-white">
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-bold text-slate-700">{num}. {cycleNames[num]}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-[10px] px-2"
                                  onClick={() => {
                                    setCyclePatterns(prev => {
                                      const pattern = prev[num].map(entry => ({ ...entry, week2: entry.week1 }));
                                      return { ...prev, [num]: pattern };
                                    });
                                    toast.success("週1の内容を週2にコピーしました");
                                  }}
                                >
                                  週1を週2にコピー
                                </Button>
                              </div>
                              {(["week1", "week2"] as const).map(weekKey => (
                                <div key={weekKey} className="grid grid-cols-7 gap-1.5 mb-1.5">
                                  {["日", "月", "火", "水", "木", "金", "土"].map((label, dayIdx) => (
                                    <div key={dayIdx} className="flex flex-col gap-1">
                                      <span className="text-[9px] text-center text-muted-foreground">{weekKey === "week1" ? "週1" : "週2"}{label}</span>
                                      <Select
                                        value={cyclePatterns[num][dayIdx][weekKey]}
                                        onValueChange={(val) => {
                                          setCyclePatterns(prev => {
                                            const pattern = [...prev[num]];
                                            pattern[dayIdx] = { ...pattern[dayIdx], [weekKey]: val as ShiftType };
                                            return { ...prev, [num]: pattern };
                                          });
                                        }}
                                      >
                                        <SelectTrigger className="h-8 text-[10px] px-1.5">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="">なし</SelectItem>
                                          {SHIFT_OPTIONS.filter(o => o !== "任意入力").map(opt => (
                                            <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  ))}
                                </div>
                              ))}
                              <p className="text-[10px] text-muted-foreground mt-1">
                                {num >= 5 ? "このクールは週1・週2を同じ内容にしておくと、隔週の切り替えなしで毎週同じパターンになります。" : ""}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-6 border-t border-slate-100">
                        <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">エクセル出力の保存先</h4>
                        <div className="flex items-center gap-3">
                          <div className="text-xs text-slate-600 flex-1">
                            {outputFolderName
                              ? <>現在の保存先: <span className="font-bold">{outputFolderName}</span></>
                              : "保存先フォルダは未設定です（毎回ダウンロードフォルダに保存されます）"}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 text-xs"
                            onClick={async () => {
                              const name = await chooseOutputFolder();
                              if (name) {
                                setOutputFolderName(name);
                                toast.success(`保存先を「${name}」に設定しました`);
                              } else {
                                toast.info("この操作に対応していないブラウザか、選択がキャンセルされました");
                              }
                            }}
                          >
                            {outputFolderName ? "変更する" : "フォルダを選ぶ"}
                          </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-2">
                          ※ 対応ブラウザ（Chrome / Edge）限定です。一度設定すると、次回以降は同じフォルダに自動で保存されます。
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                </div>

              </motion.div>
            ) : (
              (() => {
                const emp = employees.find(e => e.id === activeTab);
                if (!emp) return null;
                return (
                  <motion.div
                    key={emp.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card className="border-border shadow-none">
                      <CardHeader className="py-4 border-b border-border flex flex-row items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 group">
                            {isFromAdmin ? (
                              <Input 
                                defaultValue={emp.name}
                                onBlur={(e) => renameEmployee(emp.id, e.target.value)}
                                className="text-base font-bold h-8 max-w-[200px]"
                              />
                            ) : (
                              <CardTitle className="text-base">{emp.name} の個人シート</CardTitle>
                            )}
                          </div>
                          <CardDescription className="text-xs">シフトの入力と休憩・実働時間の確認</CardDescription>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold">出勤日数</span>
                            <Badge variant="secondary" className="bg-slate-50 text-slate-700 border-slate-100 font-bold">
                              {
                                emp.shifts
                                  .filter(s => dateRange.some(d => s.date.startsWith(getDateStr(d))))
                                  .filter(s => s.shift && s.shift !== "休み" && s.shift !== "有給")
                                  .length
                              }日
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold">合計実働</span>
                            <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200 font-bold">
                              {
                                emp.shifts
                                  .filter(s => dateRange.some(d => s.date.startsWith(getDateStr(d))))
                                  .reduce((acc, s) => {
                                    if (!s.workTime || !s.workTime.includes(":")) return acc;
                                    const [h, m] = s.workTime.split(":").map(Number);
                                    if (isNaN(h) || isNaN(m)) return acc;
                                    return acc + h + m/60;
                                  }, 0).toFixed(1)
                              }h
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold">有給合計</span>
                            <Badge variant="secondary" className="bg-red-100 text-red-800 border-red-200 font-bold">
                              {
                                emp.shifts
                                  .filter(s => dateRange.some(d => s.date.startsWith(getDateStr(d))))
                                  .filter(s => s.shift === "有給")
                                  .length
                              }日
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="overflow-x-auto">
                          <Table className="text-[13px]">
                            <TableHeader>
                              <TableRow className="bg-muted/30 hover:bg-muted/30">
                                <TableHead className="w-16 h-10 font-bold text-muted-foreground border-r border-border">日付</TableHead>
                                <TableHead className="w-10 h-10 font-bold text-muted-foreground border-r border-border">曜</TableHead>
                                <TableHead className="w-48 h-10 font-bold text-muted-foreground border-r border-border">シフト</TableHead>
                                <TableHead className="w-24 h-10 font-bold text-muted-foreground border-r border-border">休憩</TableHead>
                                <TableHead className="w-24 h-10 font-bold text-muted-foreground border-r border-border">実働</TableHead>
                                <TableHead className="h-10 font-bold text-muted-foreground">コメント</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {dateRange.map(date => {
                                const dateStr = getDateStr(date);
                                const s = getShift(emp, date);
                                const rowBgClass = getRowBgClass(date);

                                return (
                                  <TableRow key={dateStr} className={`h-12 ${rowBgClass}`}>
                                    <TableCell className="py-1 border-r border-border">{format(date, "MM/dd")}</TableCell>
                                    <TableCell className="py-1 text-muted-foreground border-r border-border">{format(date, "E", { locale: ja })}</TableCell>
                                    <TableCell className="py-1 border-r border-border">
                                      <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1">
                                          <Select 
                                            value={s?.shift || "none"} 
                                            onValueChange={(val) => handleShiftChange(emp.id, dateStr, val as ShiftType | "none")}
                                            disabled={isLocked}
                                          >
                                            <SelectTrigger className={`h-8 text-xs flex-1 ${s?.shift === "有給" ? "bg-red-100 border-red-300 text-red-800" : "bg-white"} ${isLocked ? "opacity-70 cursor-not-allowed" : ""}`}>
                                              <SelectValue placeholder="選択" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-white border-border shadow-xl z-50">
                                              <SelectItem value="none" className="text-xs text-muted-foreground italic">なし</SelectItem>
                                              {SHIFT_OPTIONS.map(opt => (
                                                <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                          {isFromAdmin && !isLocked && (
                                            <DropdownMenu>
                                              <DropdownMenuTrigger asChild>
                                                <Button 
                                                  variant="ghost" 
                                                  size="icon" 
                                                  className="h-7 w-7 text-muted-foreground hover:text-primary"
                                                  title="コピー・クール適用"
                                                >
                                                  <Download className="w-3 h-3 rotate-180" />
                                                </Button>
                                              </DropdownMenuTrigger>
                                              <DropdownMenuContent align="end" className="bg-white border-border shadow-xl z-50 min-w-[140px]">
                                                {[1, 2, 3, 4, 5, 6, 7].map(num => (
                                                  <DropdownMenuItem 
                                                    key={num} 
                                                    className="text-xs cursor-pointer py-2 border-b border-border/30 last:border-0" 
                                                    onClick={() => applyCycle(emp.id, dateStr, num)}
                                                  >
                                                    <span className="font-medium mr-1 text-primary">{num}.</span> {cycleNames[num]}を適用
                                                  </DropdownMenuItem>
                                                ))}
                                                <DropdownMenuItem className="text-xs cursor-pointer font-bold text-slate-800 bg-muted/50 mt-1 py-2 text-center" onClick={() => copyShiftDown(emp.id, dateStr)}>
                                                  下に一括コピー
                                                </DropdownMenuItem>
                                              </DropdownMenuContent>
                                            </DropdownMenu>
                                          )}
                                        </div>
                                        {s?.shift === "任意入力" && (
                                          <Input 
                                            className="h-7 text-[10px] bg-white border-primary/30"
                                            placeholder="例: 9時～17時"
                                            value={s?.customShiftText || ""}
                                            onChange={(e) => handleCustomShiftTextChange(emp.id, dateStr, e.target.value)}
                                            onBlur={() => finalizeCustomShiftText(emp.id, dateStr)}
                                            disabled={isLocked}
                                          />
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell className="py-1 text-muted-foreground text-xs border-r border-border">
                                      {s?.shift === "任意入力" ? (
                                        <Input 
                                          type="text"
                                          className="h-7 text-[10px] w-16 px-1 bg-white border-primary/30 focus:border-primary" 
                                          value={s?.breakTime || ""} 
                                          placeholder="0:00"
                                          onChange={(e) => handleCustomTimeChange(emp.id, dateStr, "breakTime", e.target.value)}
                                          onFocus={(e) => e.target.select()}
                                          disabled={isLocked}
                                        />
                                      ) : (
                                        s?.breakTime || "0:00"
                                      )}
                                    </TableCell>
                                    <TableCell className="py-1 font-semibold text-xs border-r border-border">
                                      {s?.shift === "任意入力" ? (
                                        <Input 
                                          type="text"
                                          className="h-7 text-[10px] w-16 px-1 bg-white border-primary/30 focus:border-primary" 
                                          value={s?.workTime || ""} 
                                          placeholder="0:00"
                                          onChange={(e) => handleCustomTimeChange(emp.id, dateStr, "workTime", e.target.value)}
                                          onFocus={(e) => e.target.select()}
                                          disabled={isLocked}
                                        />
                                      ) : (
                                        s?.workTime || "0:00"
                                      )}
                                    </TableCell>
                                    <TableCell className="py-1">
                                      <Input 
                                        className={`h-8 text-xs bg-white border-border ${isLocked ? "opacity-70 cursor-not-allowed" : ""}`}
                                        placeholder="備考..." 
                                        value={s?.comment || ""}
                                        onChange={(e) => handleCommentChange(emp.id, dateStr, e.target.value)}
                                        disabled={isLocked}
                                      />
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                              {/* Summary Row */}
                              <TableRow className="bg-muted/50 font-bold h-12">
                                <TableCell colSpan={3} className="text-right border-r border-border pr-4">月間合計</TableCell>
                                <TableCell className="py-1 text-muted-foreground text-xs border-r border-border">
                                  {
                                    emp.shifts
                                      .filter(s => dateRange.some(d => s.date.startsWith(getDateStr(d))))
                                      .reduce((acc, s) => {
                                        if (!s.breakTime || !s.breakTime.includes(":")) return acc;
                                        const [h, m] = s.breakTime.split(":").map(Number);
                                        if (isNaN(h) || isNaN(m)) return acc;
                                        return acc + h + m/60;
                                      }, 0).toFixed(1)
                                  }h
                                </TableCell>
                                <TableCell className="py-1 font-semibold text-xs border-r border-border">
                                  <div className="flex flex-col">
                                    <span className="text-slate-900 font-bold">{
                                      emp.shifts
                                        .filter(s => dateRange.some(d => s.date.startsWith(getDateStr(d))))
                                        .reduce((acc, s) => {
                                          if (!s.workTime || !s.workTime.includes(":")) return acc;
                                          const [h, m] = s.workTime.split(":").map(Number);
                                          if (isNaN(h) || isNaN(m)) return acc;
                                          return acc + h + m/60;
                                        }, 0).toFixed(1)
                                    }h</span>
                                    <div className="flex items-center gap-1">
                                      <span className="text-slate-700 text-[10px]">{
                                        emp.shifts
                                          .filter(s => dateRange.some(d => s.date.startsWith(getDateStr(d))))
                                          .filter(s => s.shift && s.shift !== "休み" && s.shift !== "有給")
                                          .length
                                      }日</span>
                                      <span className="text-red-700 text-[10px]">{
                                        emp.shifts
                                          .filter(s => dateRange.some(d => s.date.startsWith(getDateStr(d))))
                                          .filter(s => s.shift === "有給")
                                          .length
                                      }日(有)</span>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="bg-muted/30" />
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })()
            )}
          </AnimatePresence>
        </div>
      </main>
      <Toaster position="top-right" />
      {showPasswordModal && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-800">編集者パスワード</h3>
            <p className="text-xs text-muted-foreground">
              管理薬剤師・SE兼任管理薬剤師・開設者のみ入力してください。
            </p>
            <Input
              type="password"
              autoFocus
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitEditPassword(); }}
              placeholder="パスワードを入力"
              className="h-10 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                className="h-9 text-xs"
                onClick={() => { setShowPasswordModal(false); pendingEditActionRef.current = null; setPasswordInput(""); }}
              >
                キャンセル
              </Button>
              <Button className="h-9 text-xs" onClick={submitEditPassword}>
                確認
              </Button>
            </div>
          </div>
        </div>
      )}
    </Tabs>
  );
}
