import { CalendarClock, Play, Power } from "lucide-react";
import { AutoDraftSettings as Settings } from "../types";
import { Button } from "@/components/ui/button";

export function AutoDraftSettings({ settings, onChange, onStart }: { settings: Settings; onChange: (value: Settings) => void; onStart: () => Promise<void> }) {
  return <section className="space-y-4 rounded-2xl border bg-white p-5">
    <div className="flex items-center justify-between gap-4"><div><h2 className="flex items-center gap-2 font-black"><CalendarClock className="h-5 w-5 text-blue-600" />シフト案自動作成</h2><p className="mt-1 text-xs text-slate-500">作成対象月から3か月先までのシフト案を維持します。</p></div><Button variant={settings.enabled ? "default" : "outline"} onClick={() => onChange({ ...settings, enabled: !settings.enabled, started: settings.enabled ? false : settings.started })}><Power className="mr-2 h-4 w-4" />{settings.enabled ? "ON" : "OFF"}</Button></div>
    <div className="rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-700"><strong className="block text-slate-900">作成ルール</strong>
      <p>各従業員のクールを前月から継続します。週間の基準勤務扱いは、勤務時間にかかわらず5日です。</p>
      <p>谷川整形休診の青帯日は、金井・児玉を休みとして作成します。赤帯日は全員休みとし、当番勤務者だけ出勤へ戻します。</p>
      <p>本来の出勤日が赤帯となり週5日に満たない場合は、その週のクール休みを有給として作成します。</p>
      <p>木曜・土曜が両方赤帯の週はクールを進めず、次の通常週で直前と同じクール週を繰り返します。</p>
      <p>確定済みシフトと手動変更済みの勤務は上書きしません。</p>
    </div>
    {!settings.enabled && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">現在、シフト案の自動作成は停止しています。作成済みのシフト案は削除されません。</p>}
    {settings.enabled && !settings.started && <Button className="h-12 w-full font-bold" onClick={() => void onStart()}><Play className="mr-2 h-4 w-4" />シフト案の自動作成を開始する</Button>}
    {settings.started && <div className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">自動作成：稼働中{settings.lastRunAt ? `　最終作成 ${new Date(settings.lastRunAt).toLocaleString("ja-JP")}` : ""}</div>}
  </section>;
}
