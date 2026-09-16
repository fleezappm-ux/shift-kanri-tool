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
}

export const DEFAULT_STORE_MASTER: StoreMaster = {
  storeName: "あおい薬局", businessDays: [1, 2, 3, 4, 5, 6], useJapaneseHolidays: true,
  yearEndEnabled: true, yearEndStart: "12-31", yearEndEnd: "01-03",
  obonEnabled: true, obonStart: "08-13", obonEnd: "08-15"
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

export function StoreMasterSettings({ master, onMasterChange, period, periodDraft, saving, onPeriodDraftChange, onSavePeriod }: Props) {
  const [draft, setDraft] = useState(master);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const save = async () => {
    onMasterChange(draft);
    localStorage.setItem("store_master_settings", JSON.stringify(draft));
    if (period.startDay !== periodDraft.startDay || period.endDay !== periodDraft.endDay) await onSavePeriod();
    toast.success("店舗マスターを保存しました");
  };
  return <section className="space-y-6">
    <div className="space-y-2"><label className="text-sm font-black">店舗名</label><Input value={draft.storeName} onChange={event => setDraft(current => ({ ...current, storeName: event.target.value }))} /></div>
    <div className="calendar-period-settings">
      <div><h4>シフトの集計期間</h4><p>締め日に合わせて、画面表示とデータ出力の期間を自動でそろえます。</p></div>
      <div className="calendar-period-controls">
        <label><span>開始日</span><select value={periodDraft.startDay} onChange={event => { const startDay = Number(event.target.value); onPeriodDraftChange({ startDay, endDay: startDay === 1 ? 0 : startDay - 1 }); }}>{Array.from({ length: 28 }, (_, index) => index + 1).map(day => <option key={day} value={day}>毎月{day}日</option>)}</select></label>
        <div className="calendar-period-arrow">→</div><label><span>終了日（自動）</span><div className="calendar-period-end">{periodDraft.endDay === 0 ? "同月末日" : `翌月${periodDraft.endDay}日`}</div></label>
      </div>
    </div>
    <div className="space-y-3"><div><h4 className="font-black">通常の営業曜日</h4><p className="text-xs text-slate-500">営業時間は登録せず、営業する曜日だけを管理します。</p></div><div className="flex flex-wrap gap-2">{weekdays.map((day, index) => <label key={day} className={`flex h-10 min-w-14 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-bold ${draft.businessDays.includes(index) ? "border-blue-500 bg-blue-50 text-blue-700" : "bg-slate-50 text-slate-500"}`}><input type="checkbox" className="sr-only" checked={draft.businessDays.includes(index)} onChange={event => setDraft(current => ({ ...current, businessDays: event.target.checked ? [...current.businessDays, index].sort() : current.businessDays.filter(value => value !== index) }))} />{day}</label>)}</div></div>
    <div className="grid gap-4 lg:grid-cols-3">
      <label className="rounded-xl border bg-white p-4"><span className="flex items-center gap-2 font-black"><input type="checkbox" checked={draft.useJapaneseHolidays} onChange={event => setDraft(current => ({ ...current, useJapaneseHolidays: event.target.checked }))} />国民の祝日</span><small className="mt-2 block text-slate-500">カレンダーから毎年自動取得します</small></label>
      <PeriodBox title="年末年始" enabled={draft.yearEndEnabled} start={draft.yearEndStart} end={draft.yearEndEnd} onChange={patch => setDraft(current => ({ ...current, ...patch }))} keys={["yearEndEnabled", "yearEndStart", "yearEndEnd"]} />
      <PeriodBox title="お盆" enabled={draft.obonEnabled} start={draft.obonStart} end={draft.obonEnd} onChange={patch => setDraft(current => ({ ...current, ...patch }))} keys={["obonEnabled", "obonStart", "obonEnd"]} />
    </div>
    <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">年末年始・お盆は毎年同じ月日を使用します。年ごとに変わる当番薬局・当番医・臨時休業日は「特殊日設定」で登録します。</p>
    <Button className="h-11 w-full font-bold" disabled={saving || !draft.storeName.trim()} onClick={() => void save()}><Save className="mr-2 h-4 w-4" />店舗マスターを保存</Button>
  </section>;
}

function PeriodBox({ title, enabled, start, end, onChange, keys }: { title: string; enabled: boolean; start: string; end: string; onChange: (patch: Record<string, boolean | string>) => void; keys: [string, string, string] }) {
  return <div className="rounded-xl border bg-white p-4"><label className="flex items-center gap-2 font-black"><input type="checkbox" checked={enabled} onChange={event => onChange({ [keys[0]]: event.target.checked })} />{title}</label><div className="mt-3 flex items-center gap-2"><input type="text" inputMode="numeric" className="h-9 w-20 rounded-md border px-2 text-sm" value={start} onChange={event => onChange({ [keys[1]]: event.target.value })} placeholder="12-31" /><span>〜</span><input type="text" inputMode="numeric" className="h-9 w-20 rounded-md border px-2 text-sm" value={end} onChange={event => onChange({ [keys[2]]: event.target.value })} placeholder="01-03" /></div><small className="mt-2 block text-slate-500">毎年同じ月日で全員休み</small></div>;
}
