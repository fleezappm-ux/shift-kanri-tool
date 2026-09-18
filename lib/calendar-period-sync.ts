export interface CalendarPeriodSettings {
  startDay: number;
  endDay: number;
}

const GAS_URL = "https://script.google.com/macros/s/AKfycbzS1F43nO_ZDG6X6gH4qfUeprWmFFOZuthQKjbXxuxkoTWY0QMvbAfURd2speGZEa6x/exec";
const SHIFT_API_KEY_STORAGE = "shift_api_key";

async function call(action: string, extra: Record<string, unknown> = {}) {
  const response = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action, sessionToken: getShiftSession()?.token || "", shiftApiKey: localStorage.getItem(SHIFT_API_KEY_STORAGE) || "", ...extra })
  });
  if (!response.ok) throw new Error(`通信に失敗しました（${response.status}）`);
  const json = await response.json();
  if (!json.success) throw new Error(json.message || "カレンダー期間を処理できませんでした");
  return json;
}

export async function fetchCalendarPeriodSettings(): Promise<CalendarPeriodSettings | null> {
  const json = await call("getShiftCalendarPeriodSettings");
  const settings = json.settings;
  if (!settings) return null;
  return { startDay: Number(settings.startDay), endDay: Number(settings.endDay) };
}

export async function saveCalendarPeriodSettings(settings: CalendarPeriodSettings): Promise<CalendarPeriodSettings> {
  const json = await call("saveShiftCalendarPeriodSettings", { settings });
  return { startDay: Number(json.settings.startDay), endDay: Number(json.settings.endDay) };
}
import { getShiftSession } from "./auth-sync";
