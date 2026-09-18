import { SpecialDayRule } from "../types";
import { getManagementApiKey, getShiftSession } from "./auth-sync";

const GAS_URL = "https://script.google.com/macros/s/AKfycbzS1F43nO_ZDG6X6gH4qfUeprWmFFOZuthQKjbXxuxkoTWY0QMvbAfURd2speGZEa6x/exec";

async function call(action: string, extra: Record<string, unknown> = {}) {
  const response = await fetch(GAS_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ action, sessionToken: getShiftSession()?.token || "", ...extra }) });
  if (!response.ok) throw new Error("特殊日設定の通信に失敗しました");
  const json = await response.json();
  if (!json.success) throw new Error(json.message || "特殊日設定を処理できませんでした");
  return json;
}

export async function fetchSpecialDayRules(): Promise<SpecialDayRule[]> {
  const json = await call("getShiftSpecialDayRules");
  return Array.isArray(json.rules) ? json.rules : [];
}

export async function saveSpecialDayRules(rules: SpecialDayRule[]): Promise<SpecialDayRule[]> {
  const json = await call("saveShiftSpecialDayRules", { shiftApiKey: getManagementApiKey(), rules });
  return Array.isArray(json.rules) ? json.rules : [];
}
