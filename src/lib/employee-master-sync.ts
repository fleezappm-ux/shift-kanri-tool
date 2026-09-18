import { Employee, EmployeeRole } from "../types";
import { getShiftSession } from "./auth-sync";

const GAS_URL = "https://script.google.com/macros/s/AKfycbzS1F43nO_ZDG6X6gH4qfUeprWmFFOZuthQKjbXxuxkoTWY0QMvbAfURd2speGZEa6x/exec";

export interface EmployeeMasterItem {
  id: string;
  name: string;
  displayName: string;
  displayOrder: number;
  active: boolean;
  aliases: string[];
  role: EmployeeRole;
}

async function call(action: string, payload: Record<string, unknown> = {}) {
  const sessionToken = getShiftSession()?.token || "";
  const response = await fetch(GAS_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ action, sessionToken, ...payload }) });
  if (!response.ok) throw new Error(`通信に失敗しました（${response.status}）`);
  const json = await response.json();
  if (!json.success) throw new Error(json.message || "従業員マスターを処理できませんでした");
  return json;
}

export async function fetchEmployeeMaster(names: string[]): Promise<EmployeeMasterItem[]> {
  const json = await call("getShiftEmployeeMaster", { names });
  return Array.isArray(json.employees) ? json.employees : [];
}

export async function saveEmployeeMaster(employees: EmployeeMasterItem[]): Promise<EmployeeMasterItem[]> {
  const json = await call("saveShiftEmployeeMaster", { employees });
  return Array.isArray(json.employees) ? json.employees : employees;
}

export function mergeEmployeesWithMaster(source: Employee[], master: EmployeeMasterItem[]): Employee[] {
  return master.filter(item => item.active).sort((a, b) => a.displayOrder - b.displayOrder).map(item => {
    const names = new Set([item.name, ...(item.aliases || [])]);
    const matches = source.filter(employee => employee.id === item.id || names.has(employee.name));
    return {
      id: item.id,
      name: item.name,
      displayName: item.displayName || item.name,
      displayOrder: item.displayOrder,
      active: item.active,
      aliases: item.aliases || [],
      role: item.role || matches.find(employee => employee.role)?.role,
      shifts: matches.flatMap(employee => employee.shifts)
    };
  });
}
