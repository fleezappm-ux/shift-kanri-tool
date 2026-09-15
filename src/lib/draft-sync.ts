import { Employee, GlobalRemark } from "../types";
import { getManagementApiKey } from "./auth-sync";

const GAS_URL = "https://script.google.com/macros/s/AKfycbzS1F43nO_ZDG6X6gH4qfUeprWmFFOZuthQKjbXxuxkoTWY0QMvbAfURd2speGZEa6x/exec";

async function call(action: string, payload: Record<string, unknown> = {}) {
  const response = await fetch(GAS_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ action, ...payload }) });
  if (!response.ok) throw new Error(`通信に失敗しました（${response.status}）`);
  const json = await response.json();
  if (!json.success) throw new Error(json.message || "シフト案を処理できませんでした");
  return json;
}

export interface PublishedDraft {
  employees: Employee[];
  globalRemarks: GlobalRemark[];
  periodStart: string;
  periodEnd: string;
  publishedAt: string;
  published: boolean;
}

export async function fetchPublishedDraft(periodStart: string): Promise<PublishedDraft | null> {
  const json = await call("getPublishedShiftDraft", { periodStart });
  return json.draft || null;
}

export async function publishShiftDraft(employees: Employee[], globalRemarks: GlobalRemark[], periodStart: string, periodEnd: string): Promise<void> {
  await call("publishShiftDraft", { shiftApiKey: getManagementApiKey(), periodStart, periodEnd, employees, globalRemarks });
}

export async function unpublishShiftDraft(periodStart: string): Promise<void> {
  await call("unpublishShiftDraft", { shiftApiKey: getManagementApiKey(), periodStart });
}
