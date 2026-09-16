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
  CloudUpload,
  PencilLine,
  LockKeyhole,
  LockOpen,
  RotateCcw,
  Settings
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
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

import { Employee, DayShift, ShiftType, GlobalRemark, LeaveRequest, LeaveRequestStatus, LeaveRequestType, SpecialDayRule } from "./types";
import { SHIFT_OPTIONS, verifyEditorPassword, DEFAULT_CYCLE_PATTERNS, CyclePatterns } from "./constants";
import { calculateTimes, generateConfiguredDateRange, normalizeShiftInput, finalizeShiftText, resolveCycleShift } from "./lib/shift-utils";
import { fetchShiftsFromServer, saveMonthToServer, fetchHolidaysFromServer, fetchShiftPeriodStatus, saveShiftPeriodStatus } from "./lib/shift-sync";
import { getJapaneseHolidayDates } from "./lib/japanese-holidays";
import { chooseOutputFolder, getRememberedFolderName, saveBufferToRememberedFolder } from "./lib/output-destination";
import { HomeView, sortEmployeesForDisplay } from "./components/HomeView";
import { LeaveRequestView } from "./components/LeaveRequestView";
import { LeaveRequestManager } from "./components/LeaveRequestManager";
import { PersonalShiftList } from "./components/PersonalShiftList";
import { cancelLeaveRequest, fetchLeaveRequests, submitLeaveRequest, updateLeaveRequestStatus } from "./lib/leave-request-sync";
import { SpecialDaySettings } from "./components/SpecialDaySettings";
import { fetchSpecialDayRules, saveSpecialDayRules } from "./lib/special-day-sync";
import { buildDisplayRemarks, colorForRemark, DEFAULT_SPECIAL_DAY_RULES, findSpecialDayRule, withDefaultSpecialDayRules } from "./lib/special-day-utils";
import { CalendarPeriodSettings, fetchCalendarPeriodSettings, saveCalendarPeriodSettings } from "./lib/calendar-period-sync";
import { getManagementApiKey, saveManagementApiKey } from "./lib/auth-sync";
import { fetchPublishedDraft, PublishedDraft, publishShiftDraft, unpublishShiftDraft } from "./lib/draft-sync";

const DEFAULT_EMPLOYEES = ["従業員A", "従業員B", "従業員C", "従業員D", "従業員E"];
const BASE_GLOBAL_REMARK_TYPES = ["谷川整形休診", "祝日", "当番薬局", "店休日", "コメント"] as const;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DEFAULT_CALENDAR_PERIOD: CalendarPeriodSettings = { startDay: 21, endDay: 20 };

/** 今日を含む設定済みシフト期間の開始月を返します。 */
function getCurrentShiftMonth(today = new Date(), settings = DEFAULT_CALENDAR_PERIOD) {
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const previousMonth = addMonths(thisMonth, -1);
  const candidates = [thisMonth, previousMonth];
  return candidates.find(anchor => {
    const range = generateConfiguredDateRange(anchor.getFullYear(), anchor.getMonth() + 1, settings.startDay, settings.endDay);
    return range.some(date => format(date, "yyyy-MM-dd") === format(today, "yyyy-MM-dd"));
  }) || thisMonth;
}

export default function App() {
  const [calendarPeriodSettings, setCalendarPeriodSettings] = useState<CalendarPeriodSettings>(() => {
    const saved = localStorage.getItem("calendar_period_settings");
    if (saved) {
      try { return { ...DEFAULT_CALENDAR_PERIOD, ...JSON.parse(saved) }; } catch (_) { /* default */ }
    }
    return DEFAULT_CALENDAR_PERIOD;
  });
  const [calendarPeriodDraft, setCalendarPeriodDraft] = useState<CalendarPeriodSettings>(calendarPeriodSettings);
  const [calendarPeriodSaving, setCalendarPeriodSaving] = useState(false);
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
    return saved ? new Date(saved) : getCurrentShiftMonth(new Date(), calendarPeriodSettings);
  });
  // 起動時は、前回閉じた画面に関係なく必ずホームから開始します。
  const [activeTab, setActiveTab] = useState("home");
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
    const savedTitle = localStorage.getItem("dashboard_title");
    return !savedTitle || savedTitle === "全体シフト集約" ? "全体シフト" : savedTitle;
  });
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isFromAdmin, setIsFromAdmin] = useState(false);
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
  const [saveElapsedSeconds, setSaveElapsedSeconds] = useState(0);
  const [saveFeedback, setSaveFeedback] = useState<{
    kind: "saving" | "success" | "error";
    message: string;
  } | null>(null);
  const [heatmapEnabled, setHeatmapEnabled] = useState(() => localStorage.getItem("heatmap_enabled") === "true");
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leaveRequestLoading, setLeaveRequestLoading] = useState(false);
  const [specialDayRules, setSpecialDayRules] = useState<SpecialDayRule[]>(DEFAULT_SPECIAL_DAY_RULES);
  const [specialDayLoading, setSpecialDayLoading] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [managementApiKey, setManagementApiKey] = useState(() => getManagementApiKey());
  const [draftPublished, setDraftPublished] = useState(false);
  const [draftPublishing, setDraftPublishing] = useState(false);
  const [publishedDraft, setPublishedDraft] = useState<PublishedDraft | null>(null);
  const [viewingPublishedDraft, setViewingPublishedDraft] = useState(false);
  const [dashboardListView, setDashboardListView] = useState(false);
  const [periodStatusLoading, setPeriodStatusLoading] = useState(false);

  useEffect(() => {
    if (syncState !== "saving") {
      setSaveElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setSaveElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [syncState]);

  useEffect(() => {
    let cancelled = false;
    fetchSpecialDayRules()
      .then(rules => { if (!cancelled) setSpecialDayRules(withDefaultSpecialDayRules(rules)); })
      .catch(error => console.error("特殊日設定の取得に失敗しました", error));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchCalendarPeriodSettings()
      .then(settings => {
        if (cancelled || !settings) return;
        setCalendarPeriodSettings(settings);
        setCalendarPeriodDraft(settings);
        localStorage.setItem("calendar_period_settings", JSON.stringify(settings));
        setCurrentMonth(getCurrentShiftMonth(new Date(), settings));
      })
      .catch(error => console.error("カレンダー期間設定の取得に失敗しました", error));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
  }, []);

  // 編集モード（従業員マスター・個別シート編集・アプリ詳細設定）へ入るための簡易パスワードゲート。
  // ブラウザのタブ/セッションを閉じるまで有効です（sessionStorageに保存）。
  const [hasEditAccess, setHasEditAccess] = useState(() => sessionStorage.getItem("edit_access") === "granted");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [editorName, setEditorName] = useState(() => sessionStorage.getItem("editor_name") || "");
  const pendingEditActionRef = useRef<(() => void) | null>(null);
  const previousNavigationRef = useRef({ tab: "home", admin: false });
  const currentNavigationRef = useRef({ tab: activeTab, admin: isFromAdmin });

  useEffect(() => {
    const current = currentNavigationRef.current;
    if (current.tab !== activeTab || current.admin !== isFromAdmin) {
      previousNavigationRef.current = current;
      currentNavigationRef.current = { tab: activeTab, admin: isFromAdmin };
    }
  }, [activeTab, isFromAdmin]);

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

  const submitEditPassword = async () => {
    if (!editorName.trim()) {
      toast.error("編集者名を入力してください");
      return;
    }
    if (await verifyEditorPassword(passwordInput)) {
      setHasEditAccess(true);
      sessionStorage.setItem("edit_access", "granted");
      sessionStorage.setItem("editor_name", editorName.trim());
      setShowPasswordModal(false);
      const action = pendingEditActionRef.current;
      pendingEditActionRef.current = null;
      setPasswordInput("");
      void refreshLeaveRequests();
      if (action) action();
    } else toast.error("編集者パスワードが違います");
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

  useEffect(() => {
    if (!dateRange.length) return;
    fetchPublishedDraft(format(dateRange[0], "yyyy-MM-dd"))
      .then(draft => {
        const normalized = draft ? { ...draft, employees: draft.employees.map(employee => ({ ...employee, id: employees.find(local => local.name === employee.name)?.id || employee.id })) } : null;
        setPublishedDraft(normalized);
        setDraftPublished(Boolean(normalized?.published));
        if (!normalized?.published) setViewingPublishedDraft(false);
      })
      .catch(() => { setPublishedDraft(null); setDraftPublished(false); setViewingPublishedDraft(false); });
    // dateRangeはcurrentMonthKeyから決まるため、月が変わった時だけ取得します。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonthKey]);

  const goHome = () => {
    setCurrentMonth(getCurrentShiftMonth(new Date(), calendarPeriodSettings));
    setHomeWeekOffset(0);
    setHomeSelectedDate(null);
    setActiveTab("home");
    setIsFromAdmin(false);
  };

  const changeHomeWeek = (offset: number) => {
    const today = new Date();
    const diffToMonday = today.getDay() === 0 ? -6 : 1 - today.getDay();
    const displayedMonday = new Date(today);
    displayedMonday.setDate(today.getDate() + diffToMonday + offset * 7);
    displayedMonday.setHours(0, 0, 0, 0);
    setHomeWeekOffset(offset);
    setHomeSelectedDate(null);
    setCurrentMonth(getCurrentShiftMonth(displayedMonday, calendarPeriodSettings));
  };

  const goToCurrentShiftPeriod = () => {
    setCurrentMonth(getCurrentShiftMonth(new Date(), calendarPeriodSettings));
    toast.success("今日を含む当月シフトへ戻りました");
  };

  const installToHomeScreen = async () => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    if (standalone) return toast.info("すでにホーム画面から起動しています");
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") toast.success("ホーム画面へ追加しました");
      setInstallPrompt(null);
      return;
    }
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS) {
      window.alert("iPhoneへの追加方法\n\n1. Safari下部の共有ボタン（□↑）を押す\n2.『ホーム画面に追加』を押す\n3. 右上の『追加』を押す");
    } else {
      window.alert("ブラウザのメニュー（︙）を開き、『ホーム画面に追加』または『アプリをインストール』を押してください。");
    }
  };

  const goBack = () => {
    const previous = previousNavigationRef.current;
    setActiveTab(previous.tab || "home");
    setIsFromAdmin(previous.admin && hasEditAccess);
  };

  const getDateStr = (date: Date) => format(date, "yyyy-MM-dd");

  // 起動時に、他の端末で保存されたシフトをNotion（ファーマシーOS経由）から読み込みます。
  // 取得できた場合はそちらを優先し、取得できない場合（オフライン等）はlocalStorageの内容のまま使います。
  const syncReadyRef = useRef(false);
  const [initialSyncComplete, setInitialSyncComplete] = useState(false);
  const skipDirtyRef = useRef(false);
  const skipRemarkDirtyRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const merged = await fetchShiftsFromServer(employees);
      if (!cancelled) {
        if (merged) {
          skipDirtyRef.current = true;
          setEmployees(merged.employees);
          // GAS更新前のDBには全体補足プロパティがないため、その間は端末内の既存補足を消さない。
          if (merged.supportsGlobalRemarks) {
            skipRemarkDirtyRef.current = true;
            // 祝日取得とNotion読込が同時に終わっても、先に取得できた自動祝日を消さない。
            setGlobalRemarks(previous => {
              const combined = new Map(previous.filter(item => item.type === "祝日").map(item => [item.date, item]));
              merged.globalRemarks.forEach(item => combined.set(item.date, item));
              return Array.from(combined.values());
            });
          }
        }
        syncReadyRef.current = true;
        setSyncState(merged ? "saved" : "offline");
        setInitialSyncComplete(true);
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
    if (!syncReadyRef.current) return;
    if (skipRemarkDirtyRef.current) {
      skipRemarkDirtyRef.current = false;
      return;
    }
    setSyncState("dirty");
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
    localStorage.setItem("heatmap_enabled", String(heatmapEnabled));
  }, [heatmapEnabled]);


  useEffect(() => {
    localStorage.setItem("current_month", currentMonth.toISOString());
  }, [currentMonth]);

  useEffect(() => {
    localStorage.setItem("active_tab", activeTab);
  }, [activeTab]);

  const toggleLock = async () => {
    if (!dateRange.length || periodStatusLoading) return;
    const nextLocked = !isLocked;
    if (nextLocked) {
      const conflicts = dateRange.reduce((total, date) => {
        const remark = getGlobalRemark(date);
        if (remark?.type !== "祝日" && remark?.type !== "店休日") return total;
        return total + employees.filter(emp => {
          const shift = emp.shifts.find(s => s.date === getDateStr(date))?.shift;
          return Boolean(shift && shift !== "休み" && shift !== "有休");
        }).length;
      }, 0);
      if (conflicts > 0) toast.warning(`店休日・祝日に勤務が${conflicts}件あります。内容は変更せず確定しました`);
    }
    setPeriodStatusLoading(true);
    try {
      const savedLocked = await saveShiftPeriodStatus(getDateStr(dateRange[0]), getDateStr(dateRange[dateRange.length - 1]), nextLocked);
      setLockedMonths(prev => savedLocked
        ? [...new Set([...prev, currentMonthKey])]
        : prev.filter(month => month !== currentMonthKey));
      toast.success(savedLocked
        ? `${format(currentMonth, "yyyy年MM月")}を確定シフトとして全端末へ共有しました`
        : `${format(currentMonth, "yyyy年MM月")}をシフト案・作成中に戻しました`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "確定状態を保存できませんでした");
    } finally {
      setPeriodStatusLoading(false);
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
    // 店舗で設定した締め期間の翌月分を作成
    const nextMonthDate = addMonths(currentMonth, 1);
    const nextYear = nextMonthDate.getFullYear();
    const nextMonthNum = nextMonthDate.getMonth() + 1;
    const nextDateRange = generateConfiguredDateRange(nextYear, nextMonthNum, calendarPeriodSettings.startDay, calendarPeriodSettings.endDay);
    
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

  const dateRange = generateConfiguredDateRange(currentMonth.getFullYear(), currentMonth.getMonth() + 1, calendarPeriodSettings.startDay, calendarPeriodSettings.endDay);

  useEffect(() => {
    if (!dateRange.length) return;
    let cancelled = false;
    setPeriodStatusLoading(true);
    fetchShiftPeriodStatus(getDateStr(dateRange[0]))
      .then(locked => {
        if (cancelled) return;
        setLockedMonths(previous => locked
          ? [...new Set([...previous, currentMonthKey])]
          : previous.filter(month => month !== currentMonthKey));
      })
      .catch(error => console.error("確定状態の取得に失敗しました", error))
      .finally(() => { if (!cancelled) setPeriodStatusLoading(false); });
    return () => { cancelled = true; };
    // dateRangeはcurrentMonthKeyと期間設定から決まります。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonthKey, calendarPeriodSettings.startDay, calendarPeriodSettings.endDay]);

  useEffect(() => {
    if (!dateRange.length) return;
    let cancelled = false;
    setLeaveRequestLoading(true);
    fetchLeaveRequests(getDateStr(dateRange[0]), getDateStr(dateRange[dateRange.length - 1]))
      .then(items => { if (!cancelled) setLeaveRequests(items); })
      .catch(error => { if (!cancelled) console.error("希望申請の取得に失敗しました", error); })
      .finally(() => { if (!cancelled) setLeaveRequestLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonthKey, calendarPeriodSettings.startDay, calendarPeriodSettings.endDay]);

  const handleLeaveRequestSubmit = async (input: { employeeName: string; date: string; type: LeaveRequestType; comment: string }) => {
    if (!dateRange.length) return;
    setLeaveRequestLoading(true);
    try {
      const saved = await submitLeaveRequest({ ...input, periodStart: getDateStr(dateRange[0]), periodEnd: getDateStr(dateRange[dateRange.length - 1]) });
      setLeaveRequests(prev => [...prev.filter(item => item.id !== saved.id && !(item.employeeName === saved.employeeName && item.date === saved.date)), saved]);
      toast.success(input.type === "希望なし" ? "希望なしで提出しました" : "希望を提出しました");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "希望を提出できませんでした");
    } finally { setLeaveRequestLoading(false); }
  };

  const refreshLeaveRequests = async () => {
    if (!dateRange.length) return;
    setLeaveRequestLoading(true);
    try { setLeaveRequests(await fetchLeaveRequests(getDateStr(dateRange[0]), getDateStr(dateRange[dateRange.length - 1]))); }
    finally { setLeaveRequestLoading(false); }
  };

  const handleLeaveRequestCancel = async (id: string) => {
    setLeaveRequestLoading(true);
    try {
      const saved = await cancelLeaveRequest(id);
      setLeaveRequests(prev => prev.map(item => item.id === id ? saved : item));
      toast.success("希望を取り消しました");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "取り消せませんでした");
    } finally { setLeaveRequestLoading(false); }
  };

  const handleLeaveRequestStatus = async (request: LeaveRequest, status: LeaveRequestStatus) => {
    setLeaveRequestLoading(true);
    try {
      const saved = await updateLeaveRequestStatus(request.id, status);
      setLeaveRequests(prev => prev.map(item => item.id === saved.id ? saved : item));
      if (status === "承認" && request.date) {
        const shift: ShiftType | null = request.type === "有給希望" ? "有休" : request.type === "休み希望" ? "休み" : null;
        if (shift) handleShiftChange(employees.find(item => item.name === request.employeeName)?.id || "", request.date, shift);
      }
      toast.success(status === "承認" ? "承認しました。勤務表を確認してNotionへ保存してください" : "却下しました");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "状態を更新できませんでした");
    } finally { setLeaveRequestLoading(false); }
  };

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
  const homeSelectedDateStr = homeSelectedDate && homeWeekDates.some(date => getDateStr(date) === homeSelectedDate)
    ? homeSelectedDate
    : (homeWeekDates.some(date => getDateStr(date) === todayStr) ? todayStr : getDateStr(homeWeekDates[0]));
  const homeOutputPeriods = Array.from(
    new Map(homeWeekDates.map(date => {
      const anchor = getCurrentShiftMonth(date, calendarPeriodSettings);
      const range = generateConfiguredDateRange(
        anchor.getFullYear(),
        anchor.getMonth() + 1,
        calendarPeriodSettings.startDay,
        calendarPeriodSettings.endDay
      );
      return [getDateStr(range[0]), range] as const;
    })).values()
  );
  const outputPeriods = activeTab === "home" ? homeOutputPeriods : [dateRange];
  const dashboardEmployees = sortEmployeesForDisplay(viewingPublishedDraft && !isFromAdmin && publishedDraft ? publishedDraft.employees : employees);
  const displayDates = [...dateRange, ...homeWeekDates.filter(homeDate => !dateRange.some(date => getDateStr(date) === getDateStr(homeDate)))];
  const displayRemarks = buildDisplayRemarks(globalRemarks, specialDayRules, displayDates);
  const globalRemarkTypes = [...new Set([...BASE_GLOBAL_REMARK_TYPES, ...specialDayRules.map(rule => rule.name).filter(Boolean), "なし"])];
  const bandLegendItems = [
    { color: "red", label: "日曜・祝日・店休日" },
    ...specialDayRules.filter(rule => rule.enabled).map(rule => ({ color: rule.color, label: rule.name }))
  ].filter((item, index, items) => items.findIndex(candidate => candidate.color === item.color && candidate.label === item.label) === index);

  const handleSaveSpecialDayRules = async (rules: SpecialDayRule[]) => {
    setSpecialDayLoading(true);
    try {
      const saved = await saveSpecialDayRules(rules);
      const effectiveRules = saved.length ? saved : rules;
      setSpecialDayRules(effectiveRules);
      // 以前「祝日」と自動記録された日を当番日に変更した場合は、当番表示を優先します。
      setGlobalRemarks(previous => previous.filter(remark => {
        if (remark.type !== "祝日") return true;
        const date = new Date(`${remark.date}T00:00:00`);
        return findSpecialDayRule(date, effectiveRules)?.behavior !== "duty";
      }));
      toast.success("特殊日設定を保存し、全カレンダーへ反映しました");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "特殊日設定を保存できませんでした");
      throw error;
    } finally {
      setSpecialDayLoading(false);
    }
  };

  const handleSaveCalendarPeriod = async () => {
    const startDay = calendarPeriodDraft.startDay;
    const settings = { startDay, endDay: startDay === 1 ? 0 : startDay - 1 };
    setCalendarPeriodSaving(true);
    try {
      const saved = await saveCalendarPeriodSettings(settings);
      setCalendarPeriodSettings(saved);
      setCalendarPeriodDraft(saved);
      localStorage.setItem("calendar_period_settings", JSON.stringify(saved));
      setCurrentMonth(getCurrentShiftMonth(new Date(), saved));
      toast.success(`シフト期間を「毎月${saved.startDay}日〜${saved.endDay === 0 ? "月末" : `翌月${saved.endDay}日`}」に設定しました`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "カレンダー期間を保存できませんでした");
    } finally {
      setCalendarPeriodSaving(false);
    }
  };

  const handleToggleDraftPublication = async () => {
    if (!dateRange.length) return;
    setDraftPublishing(true);
    try {
      const periodStart = format(dateRange[0], "yyyy-MM-dd");
      if (draftPublished) {
        await unpublishShiftDraft(periodStart);
        setDraftPublished(false);
        setPublishedDraft(null);
        setViewingPublishedDraft(false);
        toast.success("シフト案を非公開にしました");
      } else {
        await publishShiftDraft(employees, displayRemarks, periodStart, format(dateRange[dateRange.length - 1], "yyyy-MM-dd"));
        setDraftPublished(true);
        setPublishedDraft(await fetchPublishedDraft(periodStart));
        toast.success("現在のシフト案を従業員へ公開しました");
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "公開状態を変更できませんでした"); }
    finally { setDraftPublishing(false); }
  };

  // 表示中の期間について、日曜・祝日・年末年始をファーマシーOS側の判定ロジックで自動取得し、
  // まだ備考が付いていない日にだけ「祝日」を自動でセットします（既存の備考は上書きしません）。
  useEffect(() => {
    if (!initialSyncComplete || dateRange.length === 0) return;
    let cancelled = false;
    const start = getDateStr(dateRange[0]);
    const end = getDateStr(dateRange[dateRange.length - 1]);
    (async () => {
      const localHolidays = getJapaneseHolidayDates(dateRange[0], dateRange[dateRange.length - 1]);
      const serverHolidays = await fetchHolidaysFromServer(start, end);
      const holidays = [...new Set([...localHolidays, ...serverHolidays])];
      if (cancelled || holidays.length === 0) return;
      // 当番薬局の日は日曜・祝日でも勤務を優先し、既存の勤務時間を休みに上書きしない。
      const dutyPharmacyDates = new Set([
        ...globalRemarks.filter(remark => remark.type === "当番薬局").map(remark => remark.date),
        ...dateRange.filter(date => findSpecialDayRule(date, specialDayRules)?.behavior === "duty").map(getDateStr)
      ]);
      const closedHolidays = holidays.filter(date => !dutyPharmacyDates.has(date));
      setGlobalRemarks(prev => {
        const byDate = new Map<string, GlobalRemark>(prev.map(remark => [remark.date, remark]));
        holidays.forEach(date => {
          if (!dutyPharmacyDates.has(date) && byDate.get(date)?.type !== "当番薬局") {
            byDate.set(date, { date, type: "祝日", text: byDate.get(date)?.text || "" });
          }
        });
        return Array.from(byDate.values());
      });
      // Notionの読込完了後に適用することで、保存済み勤務に上書きされる競合を防ぐ。
      setEmployees(prev => prev.map(emp => {
        const shifts = [...emp.shifts];
        closedHolidays.forEach(date => {
          const index = shifts.findIndex(shift => shift.date.slice(0, 10) === date);
          const offShift: DayShift = { date, shift: "休み", breakTime: "0:00", workTime: "0:00", comment: index >= 0 ? shifts[index].comment : "" };
          if (index >= 0) shifts[index] = { ...shifts[index], ...offShift, customShiftText: undefined };
          else shifts.push(offShift);
        });
        return { ...emp, shifts };
      }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonthKey, initialSyncComplete, specialDayRules]);

  // 「全員休み」の特殊日ルールは、対象月の勤務初期値にも反映します。
  useEffect(() => {
    if (!initialSyncComplete) return;
    dateRange.forEach(date => {
      if (findSpecialDayRule(date, specialDayRules)?.behavior === "all-off") setAllEmployeesOff(getDateStr(date));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonthKey, initialSyncComplete, specialDayRules]);

  const saveCurrentMonth = async () => {
    if (syncState === "saving" || dateRange.length === 0) return;
    const savingEditor = editorName.trim() || window.prompt("Notionへ保存する人の名前を入力してください")?.trim() || "";
    if (!savingEditor) {
      toast.error("保存者名が必要です");
      return;
    }
    setEditorName(savingEditor);
    sessionStorage.setItem("editor_name", savingEditor);
    setSyncState("saving");
    setSaveFeedback({ kind: "saving", message: "Notionへ保存しています。この画面を閉じずにお待ちください" });
    try {
      const result = await saveMonthToServer(
        employees,
        globalRemarks,
        getDateStr(dateRange[0]),
        getDateStr(dateRange[dateRange.length - 1]),
        savingEditor
      );
      setSyncState("saved");
      const successMessage = `${format(currentMonth, "yyyy年MM月")}をNotionへ保存しました（新規${result.created}・更新${result.updated}・削除${result.cleared}）`;
      setSaveFeedback({ kind: "success", message: successMessage });
      toast.success(successMessage, { duration: 10000 });
    } catch (error) {
      console.error("月次一括保存に失敗しました:", error);
      setSyncState("offline");
      const detail = error instanceof Error ? error.message : "原因不明のエラー";
      setSaveFeedback({ kind: "error", message: `保存できませんでした：${detail}` });
      toast.error(`Notionへの保存に失敗しました：${detail}（編集内容は端末内に残っています）`, {
        duration: 12000
      });
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

  const reapplyCycleToCurrentMonth = (cycleType: number) => {
    if (isLocked) {
      toast.error("この月は確定済みです。確定解除してから再適用してください");
      return;
    }
    const targets = employees.filter(emp => cycleAssignments[emp.id]?.cycleType === cycleType);
    if (!targets.length) {
      toast.info(`現在${cycleNames[cycleType]}が割り当てられている従業員はいません`);
      return;
    }
    if (!window.confirm(`${cycleNames[cycleType]}を${targets.length}名の今月分へ再適用します。手入力した勤務時間も上書きされます。よろしいですか？`)) return;

    setEmployees(prev => prev.map(emp => {
      const assignment = cycleAssignments[emp.id];
      if (!assignment || assignment.cycleType !== cycleType) return emp;
      const newShifts = [...emp.shifts];
      dateRange.forEach(date => {
        const dateStr = getDateStr(date);
        const shift = getCycleShift(date, cycleType, assignment.anchorDate);
        if (!shift) return;
        const { breakTime, workTime } = calculateTimes(shift);
        const index = newShifts.findIndex(item => item.date === dateStr);
        if (index >= 0) {
          newShifts[index] = { ...newShifts[index], shift, breakTime, workTime, customShiftText: undefined };
        } else {
          newShifts.push({ date: dateStr, shift, breakTime, workTime, comment: "" });
        }
      });
      return { ...emp, shifts: newShifts };
    }));
    toast.success(`${cycleNames[cycleType]}を今月分へ再適用しました`);
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

  /** 指定日を、全従業員「休み」にします（既に「休み」「有休」の人は変更しません）。祝日・店休日のデフォルト適用に使います。 */
  const setAllEmployeesOff = (dateStr: string) => {
    setEmployees(prev => prev.map(emp => {
      const idx = emp.shifts.findIndex(s => s.date === dateStr);
      if (idx >= 0) {
        const currentShift = emp.shifts[idx].shift;
        if (currentShift === "休み" || currentShift === "有休") return emp;
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
      const matchingRule = specialDayRules.find(rule => rule.name === type);
      if (existingIndex >= 0) {
        newRemarks[existingIndex] = { ...newRemarks[existingIndex], type, color: matchingRule?.color, source: "manual" };
      } else {
        newRemarks.push({ date, type, text: "", color: matchingRule?.color, source: "manual" });
      }
      return newRemarks;
    });
    // 祝日・店休日を選んだ場合は、その場で全従業員を休みにします。
    if (type === "祝日" || type === "店休日" || specialDayRules.find(rule => rule.name === type)?.behavior === "all-off") {
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

  const downloadCSV = (outputDateRange: Date[] = dateRange) => {
    if (!outputDateRange.length) return;
    const exportEmployees = sortEmployeesForDisplay(employees);
    const headers = ["日付", "曜日", ...exportEmployees.flatMap(e => [`${e.name}(シフト)`, `${e.name}(備考)`]), "全体備考"];
    const rows = outputDateRange.map(date => {
      const dateStr = getDateStr(date);
      const gr = getGlobalRemark(date);
      const row = [
        format(date, "MM/dd"),
        format(date, "E", { locale: ja }),
        ...exportEmployees.flatMap(e => {
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
    link.setAttribute("download", `shift_${getDateStr(outputDateRange[0])}_${getDateStr(outputDateRange[outputDateRange.length - 1])}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSVをダウンロードしました");
  };

  const downloadExcel = async (outputDateRange: Date[] = dateRange) => {
    if (!outputDateRange.length) return;
    const ExcelJS = await import("exceljs");
    const exportEmployees = sortEmployeesForDisplay(employees);
    const workbook = new ExcelJS.Workbook();
    const borderStyle = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    } as const;

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

    const totalCols = exportEmployees.length + 2;

    // 題名とメタデータ
    const titleRow = overallSheet.addRow(["全体シフト"]);
    titleRow.font = { size: 16, bold: true };
    overallSheet.mergeCells(1, 1, 1, totalCols);
    titleRow.alignment = { horizontal: 'center' };

    const periodStr = `集計期間: ${format(outputDateRange[0], "yyyy/MM/dd")} 〜 ${format(outputDateRange[outputDateRange.length - 1], "yyyy/MM/dd")}`;
    const outputDateStr = `出力日: ${format(new Date(), "yyyy/MM/dd")}`;
    const metaRow = overallSheet.addRow([periodStr, ...Array(exportEmployees.length).fill(""), outputDateStr]);
    overallSheet.mergeCells(2, 1, 2, totalCols - 1);
    metaRow.getCell(totalCols).alignment = { horizontal: 'right' };
    overallSheet.addRow([]); // 空行

    const overallHeaders = ["日付", ...exportEmployees.map(e => e.name), "備考"];
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

    outputDateRange.forEach(date => {
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
        ...exportEmployees.map(e => {
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
    const paidLeaveData = ["有休日数合計"];

    exportEmployees.forEach(emp => {
      const stats = emp.shifts
        .filter(s => outputDateRange.some(d => s.date.startsWith(getDateStr(d))))
        .reduce((acc, s) => {
          const isWorking = s.shift && s.shift !== "休み" && s.shift !== "有休";
          const [wh, wm] = (s.workTime || "0:00").split(":").map(Number);
          return {
            workHours: acc.workHours + (isNaN(wh) ? 0 : wh + wm/60),
            attendance: acc.attendance + (isWorking ? 1 : 0),
            paid: acc.paid + (s.shift === "有休" ? 1 : 0)
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
    exportEmployees.forEach((_, i) => {
      overallSheet.getColumn(i + 2).width = 12; // 少し広げる
    });
    overallSheet.getColumn(totalCols).width = 18; // 備考を狭くする

    // 2. 各個人のシートを作成
    exportEmployees.forEach(emp => {
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

      outputDateRange.forEach(date => {
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
        .filter(s => outputDateRange.some(d => s.date.startsWith(getDateStr(d))))
        .reduce((acc, s) => {
          const isWorking = s.shift && s.shift !== "休み" && s.shift !== "有休";
          const [wh, wm] = (s.workTime || "0:00").split(":").map(Number);
          const [bh, bm] = (s.breakTime || "0:00").split(":").map(Number);
          return {
            workHours: acc.workHours + (isNaN(wh) ? 0 : wh + wm/60),
            breakHours: acc.breakHours + (isNaN(bh) ? 0 : bh + bm/60),
            attendance: acc.attendance + (isWorking ? 1 : 0),
            paid: acc.paid + (s.shift === "有休" ? 1 : 0)
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
        "有休日数",
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
    const fileName = `shift_${getDateStr(outputDateRange[0])}_${getDateStr(outputDateRange[outputDateRange.length - 1])}.xlsx`;
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
    return displayRemarks.find(r => r.date === dateStr);
  };

  const getRowBgClass = (date: Date) => {
    const gr = getGlobalRemark(date);
    const isSunday = date.getDay() === 0;
    
    const color = colorForRemark(gr, specialDayRules);
    if (color) return `shift-row-special-${color}`;
    if (isSunday) return "shift-row-holiday";
    
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
      <aside className="shift-sidebar hidden md:flex w-64 bg-card border-r border-border p-6 flex-col shrink-0 overflow-y-auto">
        <div className="text-xl font-bold text-primary mb-8 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <img src="/shift-kanri-tool/icon-192.png" alt="" className="w-10 h-10 object-contain rounded-xl" />
            <div className="leading-tight"><span className="block text-base">シフト管理</span><span className="block text-[10px] font-medium opacity-60 mt-1">PHARMACY SHIFT</span></div>
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
                  goHome();
                }}
              >
                <div className={`absolute inset-y-0 left-0 w-1 transform -translate-x-full group-hover:translate-x-0 transition-transform ${(activeTab === "home" && !isFromAdmin) ? "bg-blue-500 translate-x-0" : "bg-slate-400"}`} />
                <Home className="w-4 h-4 mr-3 text-blue-600" />
                ホーム
              </Button>
              <Button
                variant="outline"
                className={`w-full justify-start h-12 px-4 text-sm font-semibold transition-all group relative overflow-hidden ${(activeTab === "dashboard" && !isFromAdmin) ? "bg-slate-100 border-slate-300 shadow-inner" : "bg-white hover:bg-slate-50 border-slate-200 shadow-xs"}`}
                onClick={() => { setActiveTab("dashboard"); setIsFromAdmin(false); }}
              >
                <div className={`absolute inset-y-0 left-0 w-1 transform -translate-x-full group-hover:translate-x-0 transition-transform ${(activeTab === "dashboard" && !isFromAdmin) ? "bg-blue-500 translate-x-0" : "bg-slate-400"}`} />
                <Grid3X3 className="w-4 h-4 mr-3 text-blue-600" />
                全体シフト
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
                className={`w-full justify-start h-12 px-4 text-sm font-semibold transition-all group relative overflow-hidden ${(activeTab === "dashboard" && isFromAdmin) ? "bg-slate-100 border-slate-300 shadow-inner" : "bg-white hover:bg-slate-50 border-slate-200 shadow-xs"}`}
                onClick={() => requestEditAccess(() => { setActiveTab("dashboard"); setIsFromAdmin(true); })}
              >
                <div className={`absolute inset-y-0 left-0 w-1 transform -translate-x-full group-hover:translate-x-0 transition-transform ${(activeTab === "dashboard" && isFromAdmin) ? "bg-blue-500 translate-x-0" : "bg-slate-400"}`} />
                <PencilLine className="w-4 h-4 mr-3 text-blue-600" />
                シフト作成
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start h-12 px-4 text-sm font-semibold bg-white hover:bg-slate-50 border-slate-200 transition-all group relative overflow-hidden" 
                  >
                    <div className="absolute inset-y-0 left-0 w-1 bg-green-500 transform -translate-x-full group-hover:translate-x-0 transition-transform" />
                    <Download className="w-4 h-4 mr-3 text-green-600" />
                    <span className="flex flex-col items-start leading-tight">
                      <span>データ出力</span>
                      <span className="text-[10px] font-medium opacity-70">
                        {outputPeriods.map(period => `${format(period[0], "MM/dd")}〜${format(period[period.length - 1], "MM/dd")}`).join(" / ")}
                      </span>
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="bg-white border-border shadow-2xl z-50 w-56 p-1">
                  {outputPeriods.map(period => {
                    const periodLabel = `${format(period[0], "MM/dd")}〜${format(period[period.length - 1], "MM/dd")}`;
                    return (
                      <div key={getDateStr(period[0])} className="border-b border-slate-100 last:border-b-0 py-1">
                        <div className="px-3 py-1 text-[10px] font-black text-slate-500">{periodLabel}</div>
                        <DropdownMenuItem className="text-xs font-medium cursor-pointer py-2 px-3 rounded-md focus:bg-slate-100 transition-colors" onClick={() => downloadCSV(period)}>
                          <FileCode className="w-3 h-3 mr-2 text-slate-400" /> CSV形式でダウンロード
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-xs font-medium cursor-pointer py-2 px-3 rounded-md focus:bg-slate-100 transition-colors" onClick={() => void downloadExcel(period)}>
                          <Grid3X3 className="w-3 h-3 mr-2 text-green-600" /> Excel形式でダウンロード
                        </DropdownMenuItem>
                      </div>
                    );
                  })}
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
                <Settings className="w-4 h-4 mr-3 text-slate-600" />
                設定
              </Button>
            </div>
          </section>
        </div>

        <div className="mt-auto pt-6 space-y-2">
          <Button
            className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm"
            onClick={() => requestEditAccess(() => { void saveCurrentMonth(); })}
            disabled={syncState === "loading" || syncState === "saving" || syncState === "saved"}
          >
            <CloudUpload className="w-4 h-4 mr-2" />
            {syncState === "saving" ? `保存中… ${saveElapsedSeconds}秒` : syncState === "saved" ? "保存済み" : "Notionへ保存"}
          </Button>
          <div className="sync-indicator flex items-center gap-2 text-xs">
            <span className={`sync-dot ${syncState}`} />
            {syncState === "loading" ? "Notionを読込中" : syncState === "saving" ? "月単位で保存中" : syncState === "dirty" ? "未保存の変更あり" : syncState === "offline" ? "保存失敗（端末内に保存済み）" : "Notionに保存済み"}
          </div>
        </div>
      </aside>

      {/* Mobile bottom bar (PCはサイドバーのまま) */}
      <nav className="shift-bottom-nav md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border flex items-stretch">
        <button
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold ${(activeTab === "home" && !isFromAdmin) ? "text-blue-600" : "text-slate-500"}`}
          onClick={goHome}
        >
          <Home className="w-5 h-5" />
          ホーム
        </button>
        <button
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold ${(activeTab === "dashboard" && !isFromAdmin) ? "text-blue-600" : "text-slate-500"}`}
          onClick={() => { setActiveTab("dashboard"); setIsFromAdmin(false); }}
        >
          <Grid3X3 className="w-5 h-5" />
          全体
        </button>
        <button
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold ${isFromAdmin && activeTab !== "admin" ? "text-blue-600" : "text-slate-500"}`}
          onClick={() => requestEditAccess(() => {
            setActiveTab("dashboard");
            setIsFromAdmin(true);
          })}
        >
          <PencilLine className="w-5 h-5" />
          シフト作成
        </button>
        <button
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold text-slate-500 relative"
          onClick={() => requestEditAccess(() => { void saveCurrentMonth(); })}
          disabled={syncState === "loading" || syncState === "saving"}
        >
          <span className={`sync-dot ${syncState} absolute top-1 right-1/4`} />
          <CloudUpload className="w-5 h-5" />
          {syncState === "saving" ? `${saveElapsedSeconds}秒` : syncState === "saved" ? "保存済" : "保存"}
        </button>
        <button
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold ${(activeTab === "admin" && isFromAdmin) ? "text-blue-600" : "text-slate-500"}`}
          onClick={() => { requestEditAccess(() => { setActiveTab("admin"); setIsFromAdmin(true); }); }}
        >
          <FileCode className="w-5 h-5" />
          設定
        </button>
      </nav>

      {/* Main Content */}
      <main className={`shift-main flex-1 flex flex-col overflow-hidden p-6 pb-24 md:pb-6 gap-6 ${activeTab === "dashboard" ? "dashboard-active" : ""}`}>
        {activeTab !== "home" && (
        <header className="shift-page-header flex flex-col md:flex-row items-center justify-between shrink-0 gap-4 mb-2">
          <div className="month-navigation flex items-center gap-1 bg-muted p-1 rounded-xl border border-border/50">
            <Button
              variant="ghost"
              size="sm"
              className="page-back-button h-9 px-3 rounded-lg bg-white hover:bg-blue-50 hover:text-blue-700 shadow-xs transition-all"
              onClick={goBack}
              title="前のページへ戻る"
            >
              <ArrowLeft className="w-4 h-4" /><span>戻る</span>
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-9 px-3 rounded-lg hover:bg-white hover:shadow-sm transition-all"
              onClick={() => setCurrentMonth(prev => addMonths(prev, -1))}
            >
              <ChevronLeft className="w-4 h-4" /><span className="mobile-month-label">前月</span>
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
              <span className="mobile-month-label">次月</span><ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <TabsList className={`shift-person-tabs bg-muted p-1 rounded-xl border border-border/50 h-auto flex flex-wrap justify-center overflow-visible ${activeTab === "requests" ? "hidden" : ""}`}>
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

          <div className={`shift-tab-arrows flex items-center gap-1 bg-muted p-1 rounded-xl border border-border/50 ml-auto md:ml-0 ${activeTab === "requests" ? "hidden" : ""}`}>
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

          {isFromAdmin && activeTab !== "admin" && (
            <div className="admin-header-actions flex items-center gap-1 bg-muted p-1 rounded-xl border border-border/50">
              <Button variant="outline" size="sm" className="h-8 text-[10px] font-bold bg-white" onClick={goToCurrentShiftPeriod}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" />当月へ戻る
              </Button>
              <Button disabled={periodStatusLoading} variant={isLocked ? "destructive" : "default"} size="sm" className={`h-8 text-[10px] font-bold ${isLocked ? "" : "bg-emerald-600 hover:bg-emerald-700"}`} onClick={toggleLock}>
                {isLocked ? <LockOpen className="w-3.5 h-3.5 mr-1" /> : <LockKeyhole className="w-3.5 h-3.5 mr-1" />}{isLocked ? "確定解除" : "シフト確定"}
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-[10px] font-bold bg-white" onClick={() => void downloadExcel()}>
                <Download className="w-3.5 h-3.5 mr-1 text-green-600" />Excel出力
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-[10px] font-bold bg-white" onClick={createNextMonthShifts}>
                <PlusCircle className="w-3.5 h-3.5 mr-1 text-blue-600" />翌月シフト作成（自動）
              </Button>
              <Button
                disabled={draftPublishing}
                variant={draftPublished ? "destructive" : "outline"}
                size="sm"
                className="h-8 text-[10px] font-bold bg-white"
                onClick={handleToggleDraftPublication}
              >
                {draftPublishing ? "処理中…" : draftPublished ? "案を非公開" : "案を公開"}
              </Button>
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

        <div className={`flex-1 min-h-0 pt-2 ${activeTab === "dashboard" ? "overflow-y-auto md:overflow-hidden" : "overflow-y-auto"}`}>
          <AnimatePresence mode="wait">
            {activeTab === "home" ? (
              <HomeView
                employees={employees}
                remarks={displayRemarks}
                weekDates={homeWeekDates}
                selectedDate={homeSelectedDateStr}
                today={todayStr}
                weekOffset={homeWeekOffset}
                heatmapEnabled={heatmapEnabled}
                monthDates={dateRange}
                onWeekOffsetChange={changeHomeWeek}
                onDateSelect={setHomeSelectedDate}
                onShowDashboard={() => { setActiveTab("dashboard"); setIsFromAdmin(false); }}
                onEmployeeSelect={(employeeId) => { setActiveTab(employeeId); setIsFromAdmin(false); }}
                onOpenLeaveRequest={() => { setActiveTab("requests"); setIsFromAdmin(false); }}
                onInstall={installToHomeScreen}
              />
            ) : activeTab === "requests" ? (
              <LeaveRequestView employees={dashboardEmployees} dates={dateRange} remarks={displayRemarks} requests={leaveRequests} locked={isLocked} loading={leaveRequestLoading} onSubmit={handleLeaveRequestSubmit} onCancel={handleLeaveRequestCancel} onAuthenticated={refreshLeaveRequests} />
            ) : activeTab === "dashboard" ? (
              <motion.div
                key="dashboard"
                className="md:h-full md:min-h-0"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <Card className={`dashboard-card border-border shadow-none md:h-full md:min-h-0 md:flex md:flex-col ${dashboardListView ? "dashboard-list-view" : ""}`}>
                  <CardHeader className="dashboard-card-header page-blue-header py-4 border-b border-border flex flex-row items-center justify-between">
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
                      <CardDescription className="dashboard-period-label">
                        {dateRange.length > 0 ? `${format(dateRange[0], "yyyy/MM/dd")} - ${format(dateRange[dateRange.length - 1], "MM/dd")}` : "期間未設定"}
                      </CardDescription>
                    </div>
                    <div className="dashboard-card-actions flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="dashboard-list-toggle h-8 text-xs font-bold bg-white text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                        onClick={() => setDashboardListView(value => !value)}
                      >
                        <Grid3X3 className="w-3.5 h-3.5 mr-1.5" />{dashboardListView ? "通常表示" : "30日一覧"}
                      </Button>
                      <Badge className={viewingPublishedDraft ? "bg-blue-600 text-white border-0" : isLocked ? "bg-emerald-500 text-white border-0" : "bg-amber-300 text-amber-950 border-0"}>{viewingPublishedDraft ? "公開中のシフト案" : periodStatusLoading ? "確認中…" : isLocked ? "確定シフト" : "シフト案・作成中"}</Badge>
                      <Badge className={draftPublished ? "bg-emerald-500 text-white border-0" : "bg-white text-slate-600 border border-white/70"}>{draftPublished ? "公開中" : "非公開"}</Badge>
                      {!isFromAdmin && publishedDraft?.published && <Button variant="outline" size="sm" className="h-8 text-xs font-bold bg-white text-blue-700 hover:bg-blue-50 hover:text-blue-800" onClick={() => setViewingPublishedDraft(value => !value)}>{viewingPublishedDraft ? "確定版を見る" : "公開案を見る"}</Button>}
                      {isFromAdmin && <Badge className="bg-blue-600 text-white border-0">{editorName}さんが編集中</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 md:flex-1 md:min-h-0 md:flex md:flex-col">
                    {isFromAdmin && (
                      <div className="dashboard-mobile-edit-hub">
                        <div>
                          <strong>全体編集</strong>
                          <span>編集する人を選択</span>
                        </div>
                        <div className="dashboard-mobile-edit-people">
                          {dashboardEmployees.map(employee => (
                            <button
                              key={employee.id}
                              onClick={() => { setActiveTab(employee.id); setIsFromAdmin(true); }}
                            >
                              {employee.name}<ChevronRight className="w-4 h-4" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {!isFromAdmin && <div className="dashboard-mobile-person-jump">
                      <label htmlFor="dashboard-person-jump">個人シフトを見る</label>
                      <select
                        id="dashboard-person-jump"
                        value=""
                        onChange={(event) => {
                          if (!event.target.value) return;
                          setActiveTab(event.target.value);
                          setIsFromAdmin(false);
                        }}
                      >
                        <option value="">名前を選択</option>
                        {dashboardEmployees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                      </select>
                    </div>}
                    {isFromAdmin && <LeaveRequestManager requests={leaveRequests} loading={leaveRequestLoading} onStatusChange={handleLeaveRequestStatus} />}
                    <div className="dashboard-table-wrap overflow-x-auto">
                      <Table className="dashboard-table text-[13px]">
                        <TableHeader>
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableHead className="dashboard-date-col w-16 h-10 font-bold text-muted-foreground border-r border-border">日付</TableHead>
                            <TableHead className="dashboard-day-col w-10 h-10 font-bold text-muted-foreground border-r border-border">曜</TableHead>
                            {dashboardEmployees.map(emp => (
                              <TableHead key={emp.id} className="dashboard-employee-col font-bold text-muted-foreground border-r border-border min-w-[120px]">
                                <button
                                  className="dashboard-employee-link"
                                  onClick={() => { setActiveTab(emp.id); setIsFromAdmin(false); }}
                                  title={`${emp.name}さんの個人シフトを見る`}
                                >
                                  {emp.name}<ChevronRight className="w-3 h-3" />
                                </button>
                              </TableHead>
                            ))}
                            <TableHead className="dashboard-remarks-col font-bold text-muted-foreground min-w-[150px]">備考</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dateRange.map(date => {
                            const dateStr = getDateStr(date);
                            const gr = getGlobalRemark(date);
                            const rowBgClass = getRowBgClass(date);

                            return (
                              <TableRow key={date.toISOString()} className={`h-10 ${rowBgClass}`}>
                                <TableCell className="dashboard-date-col py-2 border-r border-border">{format(date, "MM/dd")}</TableCell>
                                <TableCell className="dashboard-day-col py-2 text-muted-foreground border-r border-border">{format(date, "E", { locale: ja })}</TableCell>
                                {dashboardEmployees.map(emp => {
                                  const s = getShift(emp, date);
                                  const leaveRequest = leaveRequests.find(item => item.employeeName === emp.name && item.date === dateStr && (item.status === "申請中" || item.status === "承認"));
                                  const shiftText = s?.shift === "任意入力" ? (s?.customShiftText || "任意") : (s?.shift === "休み" ? "" : (s?.shift || "-"));
                                  const compactParts = shiftText.includes("～") ? shiftText.split("～") : [shiftText];
                                  return (
                                    <TableCell key={emp.id} className={`dashboard-employee-cell py-1 px-1 border-r border-border ${leaveRequest ? "has-leave-request" : ""}`} title={leaveRequest ? `${leaveRequest.type}（${leaveRequest.status}）` : undefined}>
                                      <div className={`text-[12px] py-1.5 rounded-sm text-center font-bold leading-none ${
                                        s?.shift === "有休" 
                                          ? "bg-red-100 text-red-800 border border-red-200" 
                                          : s?.shift === "休み"
                                            ? ""
                                            : s?.shift === "任意入力"
                                              ? "text-blue-600"
                                              : s?.shift 
                                                ? "text-slate-900"
                                                : "text-muted-foreground"
                                      }`}>
                                        <span className="dashboard-shift-full">{shiftText}</span>
                                        <span className="dashboard-shift-compact">{compactParts[0]}{compactParts[1] && <><br />{compactParts[1]}</>}</span>
                                        {leaveRequest && <small className="leave-request-marker">{leaveRequest.type}</small>}
                                      </div>
                                    </TableCell>
                                  );
                                })}
                                <TableCell className="dashboard-remarks-col py-1 px-2">
                                  <div className="flex flex-col gap-1">
                                    <Select 
                                      value={gr?.type || "なし"} 
                                      onValueChange={(val) => handleGlobalRemarkTypeChange(dateStr, val as GlobalRemark["type"])}
                                      disabled={isLocked || !isFromAdmin}
                                    >
                                      <SelectTrigger className="h-7 text-[10px] bg-white/50">
                                        <SelectValue placeholder="備考種別" />
                                      </SelectTrigger>
                                      <SelectContent className="bg-white border-border shadow-xl z-50">
                                        {globalRemarkTypes.map(type => (
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
                                        disabled={isLocked || !isFromAdmin}
                                      />
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          {/* Summary Row */}
                          <TableRow className="dashboard-summary-row bg-muted/50 font-bold h-12">
                            <TableCell colSpan={2} className="text-right border-r border-border pr-4">月間合計</TableCell>
                            {dashboardEmployees.map(emp => {
                              const stats = emp.shifts
                                .filter(s => dateRange.some(d => s.date.startsWith(getDateStr(d))))
                                .reduce((acc, s) => {
                                  const isWorking = s.shift && s.shift !== "休み" && s.shift !== "有休";
                                  if (!s.workTime || !s.workTime.includes(":")) {
                                    return { ...acc, attendance: acc.attendance + (isWorking ? 1 : 0), paid: acc.paid + (s.shift === "有休" ? 1 : 0) };
                                  }
                                  const [h, m] = s.workTime.split(":").map(Number);
                                  if (isNaN(h) || isNaN(m)) {
                                    return { ...acc, attendance: acc.attendance + (isWorking ? 1 : 0), paid: acc.paid + (s.shift === "有休" ? 1 : 0) };
                                  }
                                  return {
                                    hours: acc.hours + h + m/60,
                                    paid: acc.paid + (s.shift === "有休" ? 1 : 0),
                                    attendance: acc.attendance + (isWorking ? 1 : 0)
                                  };
                                }, { hours: 0, paid: 0, attendance: 0 });
                              return (
                                <TableCell key={emp.id} className="dashboard-employee-cell py-1 px-2 border-r border-border text-center">
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
                            <TableCell className="dashboard-remarks-col bg-muted/30" />
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                    <div className="dashboard-band-legend">
                      <strong>帯色の見方</strong>
                      <div>{bandLegendItems.map(item => <span key={`${item.color}-${item.label}`}><i className={`band-swatch band-${item.color}`} />{item.label}</span>)}</div>
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
                    <CardHeader className="settings-card-header page-blue-header py-5 border-b border-border rounded-t-xl">
                      <CardTitle className="text-xl flex items-center gap-2">
                        <Users className="w-4 h-4 text-primary" />
                        基本設定
                      </CardTitle>
                      <CardDescription className="text-xs">従業員名やシフトパターンの名称をカスタマイズします</CardDescription>
                    </CardHeader>
                    <CardContent className="settings-content p-6 space-y-5">
                      <div className="calendar-period-settings">
                        <div>
                          <h4>カレンダー期間の設定</h4>
                          <p>店舗の締め日に合わせて、毎月のシフトカレンダーを自動作成します。</p>
                        </div>
                        <div className="calendar-period-controls">
                          <label>
                            <span>開始日</span>
                            <select
                              value={calendarPeriodDraft.startDay}
                              onChange={event => {
                                const startDay = Number(event.target.value);
                                setCalendarPeriodDraft({ startDay, endDay: startDay === 1 ? 0 : startDay - 1 });
                              }}
                            >
                              {Array.from({ length: 28 }, (_, index) => index + 1).map(day => <option key={day} value={day}>毎月{day}日</option>)}
                            </select>
                          </label>
                          <div className="calendar-period-arrow">→</div>
                          <label>
                            <span>終了日（自動）</span>
                            <div className="calendar-period-end">{calendarPeriodDraft.endDay === 0 ? "同月末日" : `翌月${calendarPeriodDraft.endDay}日`}</div>
                          </label>
                          <Button className="bg-blue-600 hover:bg-blue-700 text-white font-bold" disabled={calendarPeriodSaving} onClick={handleSaveCalendarPeriod}>
                            {calendarPeriodSaving ? "保存中…" : "この期間で作成"}
                          </Button>
                        </div>
                        <p className="calendar-period-example">
                          現在：毎月{calendarPeriodSettings.startDay}日〜{calendarPeriodSettings.endDay === 0 ? "同月末日" : `翌月${calendarPeriodSettings.endDay}日`}　
                          例：21日開始なら21日〜翌月20日、1日開始なら1日〜月末です。
                        </p>
                      </div>
                      <div className="rounded-2xl border-2 border-blue-100 bg-blue-50/50 p-5 space-y-4">
                        <div>
                          <h4 className="text-base font-black text-blue-950">管理者用GAS接続キー</h4>
                          <p className="mt-1 text-xs text-slate-600">Notion保存、確定状態の共有、管理者操作に使用します。この端末だけに保存されます。</p>
                        </div>
                        <p className="rounded-lg bg-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-600">従業員ID・パスワードはGAS側で設定済みです。安全のため、この画面には値を表示しません。</p>
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                          <Input type="password" value={managementApiKey} onChange={event => setManagementApiKey(event.target.value)} placeholder="管理者用GAS接続キー" className="h-11 bg-white" />
                          <Button className="h-11 font-bold" onClick={() => { saveManagementApiKey(managementApiKey); toast.success("この端末に接続キーを保存しました"); }}>この端末に保存</Button>
                        </div>
                        <p className="text-[11px] text-slate-500">従業員は共通の従業員ID・パスワードでログイン後、自分の名前を選んで希望を提出します。</p>
                      </div>
                      <SpecialDaySettings rules={specialDayRules} loading={specialDayLoading} onSave={handleSaveSpecialDayRules} />

                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">従業員マスター（名前の変更・個別シート編集）</h4>
                          <Badge variant="outline" className="text-[10px] font-medium border-slate-200 text-slate-400">
                            クリックで個別シート編集
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {dashboardEmployees.map(emp => (
                            <div key={emp.id} className="flex gap-2">
                              <Input 
                                defaultValue={emp.name}
                                onBlur={(e) => renameEmployee(emp.id, e.target.value)}
                                className="h-10 text-sm bg-white border-slate-200 focus:border-primary/50 rounded-xl flex-1"
                                placeholder="従業員名"
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

                      <div className="mobile-cycle-notice">
                        <strong>クール内容の変更はPC版で行ってください</strong>
                        <span>曜日ごとの勤務時間は項目数が多いため、スマホでは誤操作防止のため非表示にしています。</span>
                      </div>

                      <div className="desktop-cycle-editor pt-6 border-t border-slate-100">
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

                      <div className="desktop-cycle-editor pt-6 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">クール内容の編集（曜日ごとの勤務時間）</h4>
                        </div>
                        <div className="space-y-6">
                          {[1, 2, 3, 4, 5, 6, 7].map(num => (
                            <div key={num} className="border border-slate-200 rounded-xl p-4 bg-white">
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-bold text-slate-700">{num}. {cycleNames[num]}</span>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-[10px] px-2"
                                    onClick={() => reapplyCycleToCurrentMonth(num)}
                                  >
                                    この変更を今月に適用
                                  </Button>
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
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">月間人員配置ヒートマップ</h4>
                            <p className="text-[10px] text-muted-foreground mt-1">ホーム画面に日ごとの出勤人数を色分け表示します（初期設定はOFF）</p>
                          </div>
                          <Button
                            type="button"
                            variant={heatmapEnabled ? "default" : "outline"}
                            size="sm"
                            className="h-9 min-w-20 text-xs"
                            onClick={() => setHeatmapEnabled(value => !value)}
                          >
                            {heatmapEnabled ? "ON" : "OFF"}
                          </Button>
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

                      <div className="pt-6 border-t border-slate-100">
                        <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">シフトデータ出力</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Button variant="outline" className="h-11 font-bold" onClick={() => downloadCSV()}>
                            <FileCode className="w-4 h-4 mr-2" />CSV出力
                          </Button>
                          <Button className="h-11 bg-green-600 hover:bg-green-700 text-white font-bold" onClick={() => void downloadExcel()}>
                            <Grid3X3 className="w-4 h-4 mr-2" />Excel出力
                          </Button>
                        </div>
                      </div>

                    </CardContent>
                  </Card>

                </div>

              </motion.div>
            ) : (
              (() => {
                const emp = (viewingPublishedDraft && !isFromAdmin && publishedDraft ? publishedDraft.employees : employees).find(e => e.id === activeTab);
                if (!emp) return null;
                return (
                  <motion.div
                    key={emp.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card className="employee-shift-card border-border shadow-none">
                      <CardHeader className="employee-card-header page-blue-header py-4 border-b border-border flex flex-row items-center justify-between">
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
                        <div className="employee-stats flex items-center gap-4">
                          <Badge className={isLocked ? "bg-emerald-500 text-white border-0" : "bg-amber-300 text-amber-950 border-0"}>{isLocked ? "確定" : "シフト案"}</Badge>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold">出勤日数</span>
                            <Badge variant="secondary" className="bg-slate-50 text-slate-700 border-slate-100 font-bold">
                              {
                                emp.shifts
                                  .filter(s => dateRange.some(d => s.date.startsWith(getDateStr(d))))
                                  .filter(s => s.shift && s.shift !== "休み" && s.shift !== "有休")
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
                            <span className="text-[10px] text-muted-foreground uppercase font-bold">有休合計</span>
                            <Badge variant="secondary" className="bg-red-100 text-red-800 border-red-200 font-bold">
                              {
                                emp.shifts
                                  .filter(s => dateRange.some(d => s.date.startsWith(getDateStr(d))))
                                  .filter(s => s.shift === "有休")
                                  .length
                              }日
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="p-0">
                        {isFromAdmin && (
                          <div className="mobile-employee-picker">
                            <span>編集する人</span>
                            <select value={emp.id} onChange={(event) => setActiveTab(event.target.value)}>
                              {dashboardEmployees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                            </select>
                            <Button
                              disabled={periodStatusLoading}
                              variant={isLocked ? "outline" : "default"}
                              className="h-9 font-bold"
                              onClick={toggleLock}
                            >
                              {isLocked ? "確定を解除" : "この月を確定"}
                            </Button>
                            <Button variant="outline" className="h-9 font-bold" onClick={() => { setActiveTab("dashboard"); setIsFromAdmin(true); }}>
                              <Grid3X3 className="w-4 h-4 mr-2" />全体編集へ戻る
                            </Button>
                          </div>
                        )}
                        {!isFromAdmin ? <PersonalShiftList employee={emp} dates={dateRange} remarks={displayRemarks} /> : <div className="employee-shift-table-wrap overflow-x-auto">
                          <Table className="employee-shift-table text-[13px]">
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
                                            <SelectTrigger className={`h-8 text-xs flex-1 ${s?.shift === "有休" ? "bg-red-100 border-red-300 text-red-800" : "bg-white"} ${isLocked ? "opacity-70 cursor-not-allowed" : ""}`}>
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
                                          .filter(s => s.shift && s.shift !== "休み" && s.shift !== "有休")
                                          .length
                                      }日</span>
                                      <span className="text-red-700 text-[10px]">{
                                        emp.shifts
                                          .filter(s => dateRange.some(d => s.date.startsWith(getDateStr(d))))
                                          .filter(s => s.shift === "有休")
                                          .length
                                      }日(有)</span>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="bg-muted/30" />
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })()
            )}
          </AnimatePresence>
        </div>
      </main>
      {saveFeedback && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed left-1/2 top-3 z-[90] w-[calc(100%-24px)] max-w-xl -translate-x-1/2 rounded-2xl border px-4 py-3 shadow-2xl md:top-5 ${
            saveFeedback.kind === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-950"
              : saveFeedback.kind === "error"
                ? "border-red-300 bg-red-50 text-red-950"
                : "border-blue-300 bg-white text-slate-900"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className={`sync-dot shrink-0 ${saveFeedback.kind === "saving" ? "saving" : saveFeedback.kind === "error" ? "offline" : "saved"}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">
                {saveFeedback.kind === "saving" ? `保存中（${saveElapsedSeconds}秒経過）` : saveFeedback.kind === "success" ? "保存完了" : "保存失敗"}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed">{saveFeedback.message}</p>
              {saveFeedback.kind === "saving" && saveElapsedSeconds >= 15 && (
                <p className="mt-1 text-[11px] text-slate-500">変更件数が多い月は1分以上かかることがあります。</p>
              )}
            </div>
            {saveFeedback.kind !== "saving" && (
              <button
                type="button"
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold hover:bg-black/5"
                onClick={() => setSaveFeedback(null)}
                aria-label="保存結果を閉じる"
              >
                閉じる
              </button>
            )}
          </div>
        </div>
      )}
      <Toaster position="top-center" />
      {showPasswordModal && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-800">管理者ログイン</h3>
            <p className="text-xs text-muted-foreground">
              管理薬剤師・SE兼任管理薬剤師・開設者のみ入力してください。
            </p>
            <Input
              value={editorName}
              onChange={(e) => setEditorName(e.target.value)}
              placeholder="編集者名（例：降旗）"
              className="h-10 text-sm"
            />
            <Input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitEditPassword(); }}
              placeholder="パスワードを入力"
              autoComplete="current-password"
              className="h-10 text-sm"
            />
            <p className="text-[11px] font-bold text-blue-700">編集者パスワード：従来と同じものを入力してください</p>
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
