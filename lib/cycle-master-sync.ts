import { CyclePatterns } from "../constants";
import { getShiftSession } from "./auth-sync";

const GAS_URL = "https://script.google.com/macros/s/AKfycbzS1F43nO_ZDG6X6gH4qfUeprWmFFOZuthQKjbXxuxkoTWY0QMvbAfURd2speGZEa6x/exec";
export interface CycleMasterData {
  names: Record<number, string>;
  lengths: Record<number, number>;
  patterns: CyclePatterns;
  assignments: Record<string, { cycleType: number; anchorDate: string }>;
}

async function call(action: string, payload: Record<string, unknown> = {}) {
  const response = await fetch(GAS_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ action, sessionToken: getShiftSession()?.token || "", ...payload }) });
  if (!response.ok) throw new Error(`通信に失敗しました（${response.status}）`);
  const json = await response.json();
  if (!json.success) throw new Error(json.message || "クールマスターを処理できませんでした");
  return json;
}
export async function fetchCycleMaster(): Promise<CycleMasterData | null> { const json = await call("getShiftCycleMaster"); return json.master || null; }
export async function saveCycleMaster(master: CycleMasterData): Promise<CycleMasterData> { const json = await call("saveShiftCycleMaster", { master }); return json.master || master; }
