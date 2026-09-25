import { getShiftSession } from "./auth-sync";

export type BoardVisibility = "immediate" | "after_approval" | "private";

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
  if (!json.success) throw new Error(json.message || "掲示板公開設定を処理できませんでした");
  return json;
}

export async function fetchBoardVisibility(): Promise<BoardVisibility> {
  const json = await call("getShiftStoreBoardVisibility");
  const value = json.visibility;
  return value === "after_approval" || value === "private" ? value : "immediate";
}

export async function saveBoardVisibility(visibility: BoardVisibility): Promise<BoardVisibility> {
  const json = await call("saveShiftStoreBoardVisibility", { visibility });
  const value = json.visibility;
  return value === "after_approval" || value === "private" ? value : "immediate";
}

export async function fetchCorrectionVisibility(): Promise<"all" | "private"> {
  const json = await call("getShiftCorrectionVisibility");
  return json.visibility === "all" ? "all" : "private";
}
export async function saveCorrectionVisibility(visibility: "all" | "private"): Promise<"all" | "private"> {
  const json = await call("saveShiftCorrectionVisibility", { visibility });
  return json.visibility === "all" ? "all" : "private";
}
