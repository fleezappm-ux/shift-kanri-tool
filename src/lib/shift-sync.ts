import { Employee, DayShift, ShiftType, GlobalRemark } from "../types";
import { SHIFT_OPTIONS } from "../constants";

// ファーマシーOSのGAS（Web App）のURL。デプロイし直してもURLは変わらない想定。
const GAS_URL = "https://script.google.com/macros/s/AKfycbzS1F43nO_ZDG6X6gH4qfUeprWmFFOZuthQKjbXxuxkoTWY0QMvbAfURd2speGZEa6x/exec";

const SHIFT_API_KEY_STORAGE = "shift_api_key";
export function hasShiftApiKey(): boolean {
  return Boolean(localStorage.getItem(SHIFT_API_KEY_STORAGE));
}

export function saveShiftApiKey(value: string): void {
  localStorage.setItem(SHIFT_API_KEY_STORAGE, value.trim());
}

/** 全端末で共有される、期間単位のシフト確定状態を取得します。 */
export async function fetchShiftPeriodStatus(periodStart: string): Promise<boolean> {
  let timeoutId: number | undefined;
  try {
    const json = await Promise.race([
      callGas("getShiftPeriodStatus", { periodStart }, false),
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error("確定状態の確認がタイムアウトしました")), 10000);
      })
    ]);
    return Boolean(json.locked);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

/** 期間単位の確定／作成中状態をGASへ保存します。 */
export async function saveShiftPeriodStatus(periodStart: string, periodEnd: string, locked: boolean): Promise<boolean> {
  const json = await callGas("saveShiftPeriodStatus", { periodStart, periodEnd, locked });
  return Boolean(json.locked);
}

interface ShiftRow {
  id: string;
  "社員名"?: string;
  "日付"?: { start?: string; end?: string } | null;
  "シフト内容"?: string;
  "休憩時間"?: string;
  "実働時間"?: string;
  "備考"?: string;
  "全体補足種別"?: string;
  "全体補足内容"?: string;
}

export interface ShiftFetchResult {
  employees: Employee[];
  globalRemarks: GlobalRemark[];
  supportsGlobalRemarks: boolean;
}

async function callGas(action: string, extra: Record<string, unknown> = {}, requireApiKey = true): Promise<any> {
  const shiftApiKey = localStorage.getItem(SHIFT_API_KEY_STORAGE) || "";
  if (requireApiKey && !shiftApiKey) throw new Error("GAS接続キーが未設定です。設定画面で登録してください。");
  const response = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" }, // GAS doPostはContent-Typeに関わらずpostData.contentsを見るため、プリフライトを避けるtext/plainにしています
    body: JSON.stringify({ action, shiftApiKey, ...extra })
  });
  if (!response.ok) {
    throw new Error("サーバーとの通信に失敗しました（status " + response.status + "）");
  }
  const json = await response.json();
  if (!json.success) {
    throw new Error(json.message || "サーバーでエラーが発生しました");
  }
  return json;
}

/** シフト内容の文字列を、アプリ内の shift / customShiftText の形に変換します。 */
function parseShiftContent(content: string): { shift: ShiftType; customShiftText?: string } {
  if (!content) return { shift: "" };
  if ((SHIFT_OPTIONS as string[]).includes(content) && content !== "任意入力") {
    return { shift: content as ShiftType };
  }
  return { shift: "任意入力", customShiftText: content };
}

/** shift / customShiftText を、Notionに保存する1本の文字列に変換します。 */
function buildShiftContent(shift: ShiftType, customShiftText?: string): string {
  if (shift === "任意入力") return customShiftText || "";
  return shift || "";
}

/**
 * サーバー（Notionのシフト管理DB）から全件取得し、Employee[] の形に組み立てます。
 * 取得できない場合（オフライン・未設定など）は null を返します（呼び出し側でlocalStorageにフォールバック）。
 */
export async function fetchShiftsFromServer(existingEmployees: Employee[]): Promise<ShiftFetchResult | null> {
  try {
    // 閲覧は全端末で利用できる公開API。保存系だけ接続キーを必須にします。
    const json = await callGas("getShifts", {}, false);
    const rows: ShiftRow[] = json.shifts || [];

    const serverNames = new Set<string>();
    rows.forEach(row => {
      if (row["社員名"]) serverNames.add(row["社員名"]);
    });

    // 既存の従業員リスト（表示順・id）をなるべく維持しつつ、名前をキーにマージします。
    // ただし「サーバーに同名データが無く、ローカルにもシフトが1件も無い」＝一度も使われていない
    // 仮の初期従業員（従業員A〜E など）は、サーバーにデータがある場合は表示から外します。
    const byName = new Map<string, Employee>();
    existingEmployees.forEach(emp => {
      const hasLocalShift = emp.shifts.some(s => s.shift || s.customShiftText || s.comment);
      if (serverNames.size > 0 && !serverNames.has(emp.name) && !hasLocalShift) {
        return; // 未使用の仮従業員はスキップ
      }
      byName.set(emp.name, { ...emp, shifts: [] });
    });

    rows.forEach(row => {
      const name = row["社員名"] || "";
      if (!name) return;
      const dateStart = row["日付"]?.start;
      if (!dateStart) return;
      if (!byName.has(name)) {
        byName.set(name, {
          id: Math.random().toString(36).substr(2, 9),
          name,
          shifts: []
        });
      }
      const emp = byName.get(name)!;
      const { shift, customShiftText } = parseShiftContent(row["シフト内容"] || "");
      const dayShift: DayShift = {
        date: dateStart,
        shift,
        customShiftText,
        breakTime: row["休憩時間"] || "",
        workTime: row["実働時間"] || "",
        comment: row["備考"] || ""
      };
      emp.shifts.push(dayShift);
    });

    const allowedRemarkTypes = new Set(["谷川整形休診", "祝日", "当番薬局", "店休日", "コメント"]);
    const remarksByDate = new Map<string, GlobalRemark>();
    rows.forEach(row => {
      const date = row["日付"]?.start?.slice(0, 10) || "";
      const type = row["全体補足種別"] || "";
      if (!date || !allowedRemarkTypes.has(type) || remarksByDate.has(date)) return;
      remarksByDate.set(date, {
        date,
        type: type as GlobalRemark["type"],
        text: row["全体補足内容"] || ""
      });
    });

    const supportsGlobalRemarks = rows.some(row => Object.prototype.hasOwnProperty.call(row, "全体補足種別"));
    return { employees: Array.from(byName.values()), globalRemarks: Array.from(remarksByDate.values()), supportsGlobalRemarks };
  } catch (error) {
    console.error("シフトのサーバー取得に失敗しました（オフラインの可能性）:", error);
    return null;
  }
}

/**
 * 指定期間内で「祝日・日曜・年末年始」とGASが判定した日付の一覧を取得します（yyyy-MM-dd形式の配列）。
 * 取得できない場合は空配列を返します（呼び出し側で何もしない扱いにしてください）。
 */
export async function fetchHolidaysFromServer(startDate: string, endDate: string): Promise<string[]> {
  try {
    const json = await callGas("getShiftHolidays", { startDate, endDate }, false);
    return Array.isArray(json.holidays) ? json.holidays : [];
  } catch (error) {
    console.error("祝日情報の取得に失敗しました:", error);
    return [];
  }
}

/**
 * 表示中の1か月分を、ブラウザからGASへ1リクエストで送ります。
 * 空欄も含めて送るため、Notion側にある既存シフトの削除も反映できます。
 */
export async function saveMonthToServer(
  employees: Employee[],
  globalRemarks: GlobalRemark[],
  periodStart: string,
  periodEnd: string,
  updatedBy?: string
): Promise<{ created: number; updated: number; cleared: number }> {
  const shifts = employees.flatMap(employee => {
    const shiftsByDate = new Map(employee.shifts.map(shift => [shift.date.slice(0, 10), shift]));
    const rows = [];
    const cursor = new Date(`${periodStart}T00:00:00`);
    const last = new Date(`${periodEnd}T00:00:00`);

    while (cursor <= last) {
      // toISOString()は日本時間の深夜を前日のUTCへ変換してしまうため、端末の暦日をそのまま組み立てます。
      const date = [
        cursor.getFullYear(),
        String(cursor.getMonth() + 1).padStart(2, "0"),
        String(cursor.getDate()).padStart(2, "0")
      ].join("-");
      const dayShift = shiftsByDate.get(date);
      rows.push({
        "社員名": employee.name,
        "日付": date,
        "シフト内容": dayShift ? buildShiftContent(dayShift.shift, dayShift.customShiftText) : "",
        "休憩時間": dayShift?.breakTime || "",
        "実働時間": dayShift?.workTime || "",
        "備考": dayShift?.comment || "",
        "全体補足種別": globalRemarks.find(remark => remark.date === date)?.type || "",
        "全体補足内容": globalRemarks.find(remark => remark.date === date)?.text || ""
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return rows;
  });

  const json = await callGas("saveShiftMonth", { periodStart, periodEnd, updatedBy: updatedBy || "", shifts });
  return {
    created: Number(json.created || 0),
    updated: Number(json.updated || 0),
    cleared: Number(json.cleared || 0)
  };
}
