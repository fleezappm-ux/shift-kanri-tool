import { ReactNode, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarPeriodSettings } from "../lib/calendar-period-sync";
import { SpecialDayColor } from "../types";

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
  holidayBandEnabled: boolean;
  holidayColor: SpecialDayColor;
  yearEndBandEnabled: boolean;
  yearEndColor: SpecialDayColor;
  obonBandEnabled: boolean;
  obonColor: SpecialDayColor;
}

export const DEFAULT_STORE_MASTER: StoreMaster = {
  storeName: "あおい薬局", businessDays: [1, 2, 3, 4, 5, 6], useJapaneseHolidays: true,
  yearEndEnabled: true, yearEndStart: "12-31", yearEndEnd: "01-03",
  obonEnabled: true, obonStart: "08-13", obonEnd: "08-15",
  holidayBandEnabled: true, holidayColor: "red", yearEndBandEnabled: true, yearEndColor: "red", obonBandEnabled: true, obonColor: "red"
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
      <h4 className={heading}>通常の営業曜日</h4><p className={description}>青は「営業日」、灰色は「休み」です。曜日を押すと切り替わります。</p>
      <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7">{weekdays.map((day, index) => { const open = draft.businessDays.includes(index); return <label key={day} className={`flex h-14 cursor-pointer flex-col items-center justify-center rounded-xl border text-sm font-bold transition ${open ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-100 text-slate-500"}`}><input type="checkbox" className="sr-only" checked={open} onChange={event => setDraft(current => ({ ...current, businessDays: event.target.checked ? [...current.businessDays, index].sort() : current.businessDays.filter(value => value !== index) }))} /><span>{day}</span><small className="mt-0.5 text-[10px] font-bold">{open ? "営業" : "休み"}</small></label>; })}</div>
    </div>
    <HolidayBox title="国民の祝日" descriptionText="カレンダーから毎年自動取得します。" enabled={draft.useJapaneseHolidays} bandEnabled={draft.holidayBandEnabled} color={draft.holidayColor} onEnabled={value => setDraft(current => ({ ...current, useJapaneseHolidays: value }))} onBand={value => setDraft(current => ({ ...current, holidayBandEnabled: value }))} onColor={value => setDraft(current => ({ ...current, holidayColor: value }))} />
    <HolidayBox title="年末年始" descriptionText="毎年同じ月日を全員休みとして扱います。" enabled={draft.yearEndEnabled} bandEnabled={draft.yearEndBandEnabled} color={draft.yearEndColor} onEnabled={value => setDraft(current => ({ ...current, yearEndEnabled: value }))} onBand={value => setDraft(current => ({ ...current, yearEndBandEnabled: value }))} onColor={value => setDraft(current => ({ ...current, yearEndColor: value }))}><DateRange start={draft.yearEndStart} end={draft.yearEndEnd} onStart={value => setDraft(current => ({ ...current, yearEndStart: value }))} onEnd={value => setDraft(current => ({ ...current, yearEndEnd: value }))} /></HolidayBox>
    <HolidayBox title="お盆" descriptionText="毎年同じ月日を全員休みとして扱います。" enabled={draft.obonEnabled} bandEnabled={draft.obonBandEnabled} color={draft.obonColor} onEnabled={value => setDraft(current => ({ ...current, obonEnabled: value }))} onBand={value => setDraft(current => ({ ...current, obonBandEnabled: value }))} onColor={value => setDraft(current => ({ ...current, obonColor: value }))}><DateRange start={draft.obonStart} end={draft.obonEnd} onStart={value => setDraft(current => ({ ...current, obonStart: value }))} onEnd={value => setDraft(current => ({ ...current, obonEnd: value }))} /></HolidayBox>
    <p className="rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">年末年始・お盆は毎年同じ月日を使用します。年ごとに変わる当番薬局・当番医・臨時休業日は「特殊日設定」で登録します。</p>
    <Button className="h-11 w-full font-bold" disabled={saving || !draft.storeName.trim()} onClick={() => void save()}><Save className="mr-2 h-4 w-4" />店舗マスターを保存</Button>
  </section>;
}

const COLORS: { value: SpecialDayColor; label: string }[] = [
  { value: "red", label: "赤" }, { value: "blue", label: "青" }, { value: "green", label: "緑" },
  { value: "amber", label: "黄" }, { value: "purple", label: "紫" }, { value: "gray", label: "灰" }
];

function HolidayBox({ title, descriptionText, enabled, bandEnabled, color, onEnabled, onBand, onColor, children }: { title: string; descriptionText: string; enabled: boolean; bandEnabled: boolean; color: SpecialDayColor; onEnabled: (value: boolean) => void; onBand: (value: boolean) => void; onColor: (value: SpecialDayColor) => void; children?: ReactNode }) {
  return <div className={panel}>
    <div className="grid items-center gap-4 lg:grid-cols-[1fr_auto_auto]">
      <div><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={enabled} onChange={event => onEnabled(event.target.checked)} />{title}を使用する</label><p className={description}>{descriptionText}</p>{children}</div>
      <div><span className="mb-2 block text-xs font-bold text-slate-600">帯色</span><div className="flex rounded-xl bg-slate-100 p-1"><button type="button" className={`rounded-lg px-4 py-2 text-xs font-bold ${bandEnabled ? "bg-blue-600 text-white shadow-sm" : "text-slate-500"}`} onClick={() => onBand(true)}>ON</button><button type="button" className={`rounded-lg px-4 py-2 text-xs font-bold ${!bandEnabled ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`} onClick={() => onBand(false)}>OFF</button></div></div>
      <label><span className="mb-2 block text-xs font-bold text-slate-600">色</span><select className="h-10 min-w-28 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold disabled:opacity-40" value={color} disabled={!bandEnabled} onChange={event => onColor(event.target.value as SpecialDayColor)}>{COLORS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    </div>
  </div>;
}

function DateRange({ start, end, onStart, onEnd }: { start: string; end: string; onStart: (value: string) => void; onEnd: (value: string) => void }) {
  return <div className="mt-3 flex max-w-xs items-center gap-2"><input type="text" inputMode="numeric" className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm font-semibold" value={start} onChange={event => onStart(event.target.value)} placeholder="12-31" /><span className="text-sm text-slate-500">〜</span><input type="text" inputMode="numeric" className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm font-semibold" value={end} onChange={event => onEnd(event.target.value)} placeholder="01-03" /></div>;
}
