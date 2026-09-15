const GAS_URL = "https://script.google.com/macros/s/AKfycbzS1F43nO_ZDG6X6gH4qfUeprWmFFOZuthQKjbXxuxkoTWY0QMvbAfURd2speGZEa6x/exec";

const EMPLOYEE_TOKEN_KEY = "shift_employee_session";
const API_KEY_KEY = "shift_api_key";

export interface ShiftSession {
  token: string;
  role: "admin" | "employee";
  employeeName?: string;
  expiresAt: string;
}

async function call(action: string, payload: Record<string, unknown> = {}) {
  const response = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action, ...payload })
  });
  if (!response.ok) throw new Error(`通信に失敗しました（${response.status}）`);
  const json = await response.json();
  if (!json.success) throw new Error(json.message || "認証処理に失敗しました");
  return json;
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

export const getEmployeeSession = () => readSession(EMPLOYEE_TOKEN_KEY);
export const getEmployeeToken = () => getEmployeeSession()?.token || "";
export const getManagementApiKey = () => localStorage.getItem(API_KEY_KEY) || "";
export const saveManagementApiKey = (value: string) => localStorage.setItem(API_KEY_KEY, value.trim());

export async function loginEmployee(loginId: string, password: string): Promise<ShiftSession> {
  const json = await call("loginShiftEmployee", { loginId, password });
  const session = json.session as ShiftSession;
  localStorage.setItem(EMPLOYEE_TOKEN_KEY, JSON.stringify(session));
  return session;
}

export function logoutEmployee() { localStorage.removeItem(EMPLOYEE_TOKEN_KEY); }
