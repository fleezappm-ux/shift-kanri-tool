import { Employee, DayShift, ShiftType } from "../types";
import { SHIFT_OPTIONS } from "../constants";

// ファーマシーOSのGAS（Web App）のURL。デプロイし直してもURLは変わらない想定。
const GAS_URL = "https://script.google.com/macros/s/AKfycbzS1F43nO_ZDG6X6gH4qfUeprWmFFOZuthQKjbXxuxkoTWY0QMvbAfURd2speGZEa6x/exec";

// GAS側の SHIFT_API_KEY スクリプトプロパティと同じ値にしてください。
const SHIFT_API_KEY = "sk_aoi_shift_9f3k2m8q7x";

interface ShiftRow {
  id: string;
  "社員名"?: string;
  "日付"?: { start?: string; end?: string } | null;
  "シフト内容"?: string;
  "休憩時間"?: string;
  "実働時間"?: string;
  "備考"?: string;
}

async function callGas(action: string, extra: Record<string, unknown> = {}): Promise<any> {
  const response = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" }, // GAS doPostはContent-Typeに関わらずpostData.contentsを見るため、プリフライトを避けるtext/plainにしています
    body: JSON.stringify({ action, shiftApiKey: SHIFT_API_KEY, ...extra })
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
export async function fetchShiftsFromServer(existingEmployees: Employee[]): Promise<Employee[] | null> {
  try {
    const json = await callGas("getShifts");
    const rows: ShiftRow[] = json.shifts || [];

    // 既存の従業員リスト（表示順・id）をなるべく維持しつつ、名前をキーにマージします。
    const byName = new Map<string, Employee>();
    existingEmployees.forEach(emp => byName.set(emp.name, { ...emp, shifts: [] }));

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

    return Array.from(byName.values());
  } catch (error) {
    console.error("シフトのサーバー取得に失敗しました（オフラインの可能性）:", error);
    return null;
  }
}

/** 1人・1日分のシフトをサーバー（Notion）へ保存します（社員名＋日付で新規/上書きを自動判定）。 */
export async function pushShiftToServer(employeeName: string, dayShift: DayShift): Promise<void> {
  const dateOnly = dayShift.date.slice(0, 10);
  await callGas("saveShift", {
    shift: {
      "社員名": employeeName,
      "日付": dateOnly,
      "シフト内容": buildShiftContent(dayShift.shift, dayShift.customShiftText),
      "休憩時間": dayShift.breakTime,
      "実働時間": dayShift.workTime,
      "備考": dayShift.comment
    }
  });
}

/** 全従業員の全シフトを、サーバーへまとめて（順番に）反映します。件数が多いと時間がかかるため、変更のたびに毎回呼ぶのではなく、デバウンスして使ってください。 */
export async function pushAllShiftsToServer(employees: Employee[]): Promise<{ ok: number; fail: number }> {
  let ok = 0;
  let fail = 0;
  for (const emp of employees) {
    for (const dayShift of emp.shifts) {
      try {
        await pushShiftToServer(emp.name, dayShift);
        ok++;
      } catch (error) {
        console.error("シフト同期エラー:", emp.name, dayShift.date, error);
        fail++;
      }
    }
  }
  return { ok, fail };
}
