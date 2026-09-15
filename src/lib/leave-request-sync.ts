import { LeaveRequest, LeaveRequestStatus, LeaveRequestType } from "../types";
import { getEmployeeToken, getManagementApiKey } from "./auth-sync";

const GAS_URL = "https://script.google.com/macros/s/AKfycbzS1F43nO_ZDG6X6gH4qfUeprWmFFOZuthQKjbXxuxkoTWY0QMvbAfURd2speGZEa6x/exec";
const SHIFT_API_KEY_STORAGE = "shift_api_key";

async function request(action: string, payload: Record<string, unknown>, requireKey = false) {
  const shiftApiKey = localStorage.getItem(SHIFT_API_KEY_STORAGE) || "";
  if (requireKey && !shiftApiKey) throw new Error("管理者用GAS接続キーが未設定です");
  const response = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action, shiftApiKey, ...payload })
  });
  if (!response.ok) throw new Error(`通信に失敗しました（${response.status}）`);
  const json = await response.json();
  if (!json.success) throw new Error(json.message || "処理に失敗しました");
  return json;
}

export async function fetchLeaveRequests(periodStart: string, periodEnd: string): Promise<LeaveRequest[]> {
  const json = await request("getShiftLeaveRequests", { periodStart, periodEnd, shiftApiKey: getManagementApiKey(), employeeToken: getEmployeeToken() });
  return Array.isArray(json.requests) ? json.requests : [];
}

export async function submitLeaveRequest(input: {
  employeeName: string;
  date: string;
  periodStart: string;
  periodEnd: string;
  type: LeaveRequestType;
  comment: string;
}): Promise<LeaveRequest> {
  const json = await request("saveShiftLeaveRequest", { employeeToken: getEmployeeToken(), request: input });
  return json.request as LeaveRequest;
}

export async function cancelLeaveRequest(id: string): Promise<LeaveRequest> {
  const json = await request("cancelShiftLeaveRequest", { employeeToken: getEmployeeToken(), id });
  return json.request as LeaveRequest;
}

export async function updateLeaveRequestStatus(id: string, status: LeaveRequestStatus): Promise<LeaveRequest> {
  const json = await request("updateShiftLeaveRequestStatus", { shiftApiKey: getManagementApiKey(), id, status });
  return json.request as LeaveRequest;
}
