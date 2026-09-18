const GAS_URL = "https://script.google.com/macros/s/AKfycbzS1F43nO_ZDG6X6gH4qfUeprWmFFOZuthQKjbXxuxkoTWY0QMvbAfURd2speGZEa6x/exec";

const SESSION_KEY = "shift_app_session";
const API_KEY_KEY = "shift_api_key";
export interface ShiftLoginEmployee { id: string; name: string; displayName: string; active: boolean; }

export interface ShiftSession {
  token: string;
  role: "admin" | "employee";
  employeeId?: string;
  employeeName?: string;
  expiresAt: string;
}

async function call(action: string, payload: Record<string, unknown> = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action, ...payload }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`通信に失敗しました（${response.status}）`);
    const json = await response.json();
    if (!json.success) throw new Error(json.message || "認証処理に失敗しました");
    return json;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("ログイン確認がタイムアウトしました。もう一度お試しください");
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function readSession(key: string): ShiftSession | null {
  try {
    const session = JSON.parse(localStorage.getItem(key) || "null") as ShiftSession | null;
    if (!session?.token || new Date(session.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(key);
      return null;
    }
    return session;
  } catch (_) {
    localStorage.removeItem(key);
    return null;
  }
}

export const getShiftSession = () => readSession(SESSION_KEY);
export const getEmployeeSession = getShiftSession;
export const getEmployeeToken = () => getShiftSession()?.token || "";
export const getManagementApiKey = () => localStorage.getItem(API_KEY_KEY) || "";
export const saveManagementApiKey = (value: string) => localStorage.setItem(API_KEY_KEY, value.trim());

export async function loginEmployee(loginId: string, password: string, employeeId: string, employeeName: string): Promise<ShiftSession> {
  const json = await call("loginShiftEmployee", { loginId, password, employeeId, employeeName });
  const session = json.session as ShiftSession;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export async function loginEditor(loginId: string, password: string, employeeId: string, employeeName: string): Promise<ShiftSession> {
  const json = await call("loginShiftAdmin", { loginId, password, employeeId, employeeName });
  const session = json.session as ShiftSession;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export async function loginShift(loginId: string, password: string, employeeId: string, employeeName: string): Promise<ShiftSession> {
  const payload = { loginId, password, employeeId, employeeName };
  const [employeeResult, adminResult] = await Promise.allSettled([
    call("loginShiftEmployee", payload),
    call("loginShiftAdmin", payload)
  ]);
  const result = adminResult.status === "fulfilled" ? adminResult : employeeResult;
  if (result.status === "rejected") {
    const error = employeeResult.status === "rejected" ? employeeResult.reason : result.reason;
    throw error instanceof Error ? error : new Error("IDまたはパスワードを確認してください");
  }
  const session = result.value.session as ShiftSession;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function logoutShiftSession() { localStorage.removeItem(SESSION_KEY); }
export const logoutEmployee = logoutShiftSession;

export async function fetchShiftLoginEmployees(): Promise<ShiftLoginEmployee[]> {
  const json = await call("getShiftLoginEmployees");
  return Array.isArray(json.employees) ? json.employees : [];
}
