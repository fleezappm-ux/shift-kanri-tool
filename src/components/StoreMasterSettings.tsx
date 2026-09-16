import { useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarPeriodSettings } from "../lib/calendar-period-sync";

export interface StoreMaster {
  storeName: string;
  businessDays: number[];
  useJapaneseHolidays: boolean;
  yearEndEnabled: boolean;
  yearEndStart: string;
  yearEndEnd: string;
  obonEnabled: boolean;
  obonStart: string;
  obonEnd: string;
  showSpecialDayBands: boolean;
}

export const DEFAULT_STORE_MASTER: StoreMaster = {
  storeName: "あおい薬局", businessDays: [1, 2, 3, 4, 5, 6], useJapaneseHolidays: true,
  yearEndEnabled: true, yearEndStart: "12-31", yearEndEnd: "01-03",
  obonEnabled: true, obonStart: "08-13", obonEnd: "08-15", showSpecialDayBands: true
};

interface Props {
  master: StoreMaster;
  onMasterChange: (master: StoreMaster) => void;
  period: CalendarPeriodSettings;
  periodDraft: CalendarPeriodSettings;
  saving: boolean;
  onPeriodDraftChange: (settings: CalendarPeriodSettings) => void;
  onSavePeriod: () => Promise<void>;
}

const panel = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const heading = "text-sm font-bold text-slate-900";
const description = "mt-1 text-xs leading-5 text-slate-500";
const field = "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export function StoreMasterSettings({ master, onMasterChange, period, periodDraft, saving, onPeriodDraftChange, onSavePeriod }: Props) {
  const [draft, setDraft] = useState(master);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const save = async () => {
    onMasterChange(draft);
    localStorage.setItem("store_master_settings", JSON.stringify(draft));
    if (period.startDay !== periodDraft.startDay || period.endDay !== periodDraft.endDay) await onSavePeriod();
    toast.success("店舗マスターを保存しました");
  };

  return <section className="space-y-4 font-sans text-slate-900">
    <div className={panel}>
      <label className={heading}>店舗名</label><p className={description}>シフト画面で使用する店舗名です。</p>
      <Input className="mt-3 h-11 rounded-xl text-sm" value={draft.storeName} onChange={event => setDraft(current => ({ ...current, storeName: event.target.value }))} />
    </div>
    <div className={panel}>
      <h4 className={heading}>シフトの集計期間</h4><p className={description}>シフトを1か月分として扱う開始日を選びます。終了日は自動で決まり、画面表示とCSV・Excelの出力期間も同じになります。</p>
      <div className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <label><span className="mb-2 block text-xs font-bold text-slate-600">開始日</span><select className={field} value={periodDraft.startDay} onChange={event => { const startDay = Number(event.target.value); onPeriodDraftChange({ startDay, endDay: startDay === 1 ? 0 : startDay - 1 }); }}>{Array.from({ length: 28 }, (_, index) => index + 1).map(day => <option key={day} value={day}>毎月{day}日</option>)}</select></label>
        <span className="pb-3 text-center text-sm font-bold text-blue-600">→</span>
        <label><span className="mb-2 block text-xs font-bold text-slate-600">終了日（自動）</span><div className={`${field} flex items-center bg-slate-50`}>{periodDraft.endDay === 0 ? "同月末日" : `翌月${periodDraft.endDay}日`}</div></label>
      </div>
    </div>
    <div className={panel}>
      <h4 className={heading}>通常の営業曜日</h4><p className={description}>通常営業する曜日を選択します。営業時間の登録はありません。</p>
      <div className="mt-4 flex flex-wrap gap-2">{weekdays.map((day, index) => <label key={day} className={`flex h-11 min-w-14 items-center justify-center rounded-xl border px-4 text-sm font-bold transition ${draft.businessDays.includes(index) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}><input type="checkbox" className="sr-only" checked={draft.businessDays.includes(index)} onChange={event => setDraft(current => ({ ...current, businessDays: event.target.checked ? [...current.businessDays, index].sort() : current.businessDays.filter(value => value !== index) }))} />{day}</label>)}</div>
    </div>
    <div className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-4"><div><h4 className={heading}>特殊日の帯色表示</h4><p className={description}>全体シフトと個人シフトに、祝日・店休日・当番薬局などの帯色を表示します。</p></div>
        <div className="flex rounded-xl bg-slate-100 p-1"><button type="button" className={`rounded-lg px-5 py-2 text-sm font-bold ${draft.showSpecialDayBands ? "bg-blue-600 text-white shadow-sm" : "text-slate-500"}`} onClick={() => setDraft(current => ({ ...current, showSpecialDayBands: true }))}>表示する</button><button type="button" className={`rounded-lg px-5 py-2 text-sm font-bold ${!draft.showSpecialDayBands ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`} onClick={() => setDraft(current => ({ ...current, showSpecialDayBands: false }))}>表示しない</button></div>
      </div>
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      <label className={panel}><span className={heading}><input className="mr-2" type="checkbox" checked={draft.useJapaneseHolidays} onChange={event => setDraft(current => ({ ...current, useJapaneseHolidays: event.target.checked }))} />国民の祝日</span><small className={description}>カレンダーから毎年自動取得します。</small></label>
      <PeriodBox title="年末年始" enabled={draft.yearEndEnabled} start={draft.yearEndStart} end={draft.yearEndEnd} onChange={patch => setDraft(current => ({ ...current, ...patch }))} keys={["yearEndEnabled", "yearEndStart", "yearEndEnd"]} />
      <PeriodBox title="お盆" enabled={draft.obonEnabled} start={draft.obonStart} end={draft.obonEnd} onChange={patch => setDraft(current => ({ ...current, ...patch }))} keys={["obonEnabled", "obonStart", "obonEnd"]} />
    </div>
    <p className="rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">年末年始・お盆は毎年同じ月日を使用します。年ごとに変わる当番薬局・当番医・臨時休業日は「特殊日設定」で登録します。</p>
    <Button className="h-11 w-full font-bold" disabled={saving || !draft.storeName.trim()} onClick={() => void save()}><Save className="mr-2 h-4 w-4" />店舗マスターを保存</Button>
  </section>;
}

function PeriodBox({ title, enabled, start, end, onChange, keys }: { title: string; enabled: boolean; start: string; end: string; onChange: (patch: Record<string, boolean | string>) => void; keys: [string, string, string] }) {
  return <div className={panel}><label className="flex items-center gap-2 text-sm font-bold text-slate-900"><input type="checkbox" checked={enabled} onChange={event => onChange({ [keys[0]]: event.target.checked })} />{title}</label><div className="mt-4 flex items-center gap-2"><input type="text" inputMode="numeric" className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm font-semibold" value={start} onChange={event => onChange({ [keys[1]]: event.target.value })} placeholder="12-31" /><span className="text-sm text-slate-500">〜</span><input type="text" inputMode="numeric" className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm font-semibold" value={end} onChange={event => onChange({ [keys[2]]: event.target.value })} placeholder="01-03" /></div><small className="mt-2 block text-xs leading-5 text-slate-500">毎年同じ月日で全員休み</small></div>;
}
