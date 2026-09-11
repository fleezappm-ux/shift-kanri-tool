
import { ShiftType } from "./types";

export const SHIFT_OPTIONS: ShiftType[] = [
  "8:45～18:15",
  "8:30～18:00",
  "8:30～13:30",
  "8:30～16:30",
  "9:30～13:30",
  "9:00～13:00",
  "有休",
  "休み",
  "任意入力"
];

export const GAS_CODE = `
/**
 * シフト管理システム GASコード
 */

// 設定
const LINE_NOTIFY_TOKEN = "YOUR_LINE_NOTIFY_TOKEN"; // ここにトークンを入力
const ADMIN_SHEET_NAME = "全体シフト";
const TEMPLATE_SHEET_NAME = "テンプレート";
const EMPLOYEES = ["従業員1", "従業員2", "従業員3", "従業員4", "従業員5"];

/**
 * 翌月分のシートを作成する
 */
function createNextMonthSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const template = ss.getSheetByName(TEMPLATE_SHEET_NAME);
  
  // 期間の計算 (21日〜翌20日)
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 21);
  const monthStr = (nextMonth.getMonth() + 1) + "月分";
  
  EMPLOYEES.forEach(name => {
    const sheetName = name + "_" + monthStr;
    if (!ss.getSheetByName(sheetName)) {
      const newSheet = template.copyTo(ss).setName(sheetName);
      setupDates(newSheet, nextMonth.getFullYear(), nextMonth.getMonth() + 1);
    }
  });
  
  SpreadsheetApp.getUi().alert(monthStr + "のシートを作成しました。");
}

/**
 * 日付をセットアップする (21日〜翌20日)
 */
function setupDates(sheet, year, month) {
  const startDate = new Date(year, month - 1, 21);
  for (let i = 0; i < 31; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    
    // 翌月20日を超えたら終了
    if (d.getMonth() === month && d.getDate() > 20) break;
    
    sheet.getRange(i + 2, 1).setValue(d); // A列: 日付
    sheet.getRange(i + 2, 2).setValue(Utilities.formatDate(d, "JST", "E")); // B列: 曜日
  }
}

/**
 * 各個人シートから全体シフトへ集約する
 */
function aggregateShifts() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const adminSheet = ss.getSheetByName(ADMIN_SHEET_NAME);
  adminSheet.clear();
  
  // ヘッダー作成
  adminSheet.getRange(1, 1).setValue("日付");
  EMPLOYEES.forEach((name, i) => {
    adminSheet.getRange(1, i * 2 + 2).setValue(name + " (シフト)");
    adminSheet.getRange(1, i * 2 + 3).setValue(name + " (コメント)");
  });
  
  // データの転記 (簡易版: 最新の月を対象とする)
  // 実際にはシート名をループして日付を合わせるロジックが必要
  SpreadsheetApp.getUi().alert("集約が完了しました。");
}

/**
 * LINE通知を送信する
 */
function sendLineNotification() {
  const message = "\\n【シフト連絡】\\n明日のシフトは以下の通りです... (実装例)";
  const options = {
    "method": "post",
    "headers": { "Authorization": "Bearer " + LINE_NOTIFY_TOKEN },
    "payload": { "message": message }
  };
  UrlFetchApp.fetch("https://notify-api.line.me/api/notify", options);
}
`;

export const SPREADSHEET_LAYOUT = `
【スプレッドシート構成案】

1. 「全体シフト」シート（管理者用）
   - A列：日付
   - B列：従業員A（シフト）
   - C列：従業員A（コメント）
   - D列：従業員B（シフト）
   - E列：従業員B（コメント）
   ...（5名分繰り返す）

2. 「従業員名_月分」シート（個人用 × 5名分）
   - A列：日付
   - B列：曜日
   - C列：シフト（プルダウン設定）
   - D列：休憩時間（数式：=IF(...) ）
   - E列：実働時間（数式：=拘束時間-休憩 ）
   - F列：従業員コメント

3. 「テンプレート」シート
   - 新規月作成時のコピー元。
   - C列にデータの入力規則（プルダウン）を設定しておく。
   - D, E列に数式を埋め込んでおく。
`;

export const SPREADSHEET_FORMULAS = {
  breakTime: '=IF(OR(C2="有休", C2="休み", C2=""), "0:00", IF(VALUE(LEFT(RIGHT(C2, 5), 2)) + VALUE(RIGHT(C2, 2))/60 - (VALUE(LEFT(C2, FIND("～", C2)-1)) + VALUE(MID(C2, FIND(":", C2)+1, 2))/60) > 6, "1:00", "0:00"))',
  workTime: '=IF(OR(C2="有休", C2="休み", C2=""), "0:00", (VALUE(LEFT(RIGHT(C2, 5), 2)) + VALUE(RIGHT(C2, 2))/60 - (VALUE(LEFT(C2, FIND("～", C2)-1)) + VALUE(MID(C2, FIND(":", C2)+1, 2))/60)) - VALUE(LEFT(D2, 1)) - VALUE(MID(D2, 3, 2))/60)'
};

// 編集モード（従業員マスター編集・個別シート編集・アプリ詳細設定）に入るための共通パスワード。
// 変更したい場合はこの値を書き換えてください。
export const EDITOR_PASSWORD = "aoi-kanri-2026";

export interface CycleWeekPattern {
  week1: ShiftType;
  week2: ShiftType;
}
// 配列のインデックスは JavaScript の Date.getDay() と同じ並び: 0=日,1=月,2=火,3=水,4=木,5=金,6=土
export type CyclePattern = CycleWeekPattern[];
export type CyclePatterns = Record<number, CyclePattern>;

const OFF: ShiftType = "休み";
const wk = (mon: ShiftType, tue: ShiftType, wed: ShiftType, thu: ShiftType, fri: ShiftType, sat: ShiftType, sun: ShiftType): ShiftType[] =>
  [sun, mon, tue, wed, thu, fri, sat];

function buildPattern(week1: ShiftType[], week2: ShiftType[]): CyclePattern {
  return week1.map((w1, i) => ({ week1: w1, week2: week2[i] }));
}

export const DEFAULT_CYCLE_PATTERNS: CyclePatterns = {
  1: buildPattern(
    wk("8:45～18:15", "8:45～18:15", "8:45～18:15", "8:30～16:30", "8:45～18:15", OFF, OFF),
    wk("8:45～18:15", "8:45～18:15", "8:45～18:15", OFF, "8:45～18:15", "8:30～13:30", OFF)
  ),
  2: buildPattern(
    wk("8:45～18:15", "8:45～18:15", "8:45～18:15", OFF, "8:45～18:15", "8:30～13:30", OFF),
    wk("8:45～18:15", "8:45～18:15", "8:45～18:15", "8:30～16:30", "8:45～18:15", OFF, OFF)
  ),
  3: buildPattern(
    wk("8:30～18:00", "8:30～18:00", "8:30～18:00", "8:30～16:30", "8:30～18:00", OFF, OFF),
    wk("8:30～18:00", "8:30～18:00", "8:30～18:00", OFF, "8:30～18:00", "8:30～13:30", OFF)
  ),
  4: buildPattern(
    wk("8:30～18:00", "8:30～18:00", "8:30～18:00", OFF, "8:30～18:00", "8:30～13:30", OFF),
    wk("8:30～18:00", "8:30～18:00", "8:30～18:00", "8:30～16:30", "8:30～18:00", OFF, OFF)
  ),
  5: buildPattern(
    wk(OFF, "9:30～13:30", OFF, "9:00～13:00", OFF, "9:00～13:00", OFF),
    wk(OFF, "9:30～13:30", OFF, "9:00～13:00", OFF, "9:00～13:00", OFF)
  ),
  6: buildPattern(
    wk("9:00～13:00", OFF, "9:00～13:00", "9:00～13:00", "9:00～13:00", OFF, OFF),
    wk("9:00～13:00", OFF, "9:00～13:00", "9:00～13:00", "9:00～13:00", OFF, OFF)
  ),
  7: buildPattern(
    wk("8:45～18:15", "8:45～18:15", "8:45～18:15", OFF, "8:45～18:15", "8:30～13:30", OFF),
    wk("8:45～18:15", "8:45～18:15", "8:45～18:15", OFF, "8:45～18:15", "8:30～13:30", OFF)
  )
};
