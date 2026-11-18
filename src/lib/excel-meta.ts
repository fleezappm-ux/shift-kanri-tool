/**
 * 出力（Excel/PDF）の上部にある「集計期間 ／ 出力日」の行の配置。
 * 人数（列数）が変わっても、必ず表の幅（totalCols）の中に収める。
 * 左：集計期間（左端〜右から3列目）、右：出力日（最後の2列を結合して右寄せ）。
 */
export interface OutputMetaLayout {
  /** 行に入れる値（長さは必ず totalCols） */
  cells: string[];
  /** 結合する範囲（行内の列番号・1始まり） */
  merges: Array<[number, number]>;
  /** 右寄せにする列（出力日の入っている列） */
  dateColumn: number;
}

export function outputMetaLayout(totalCols: number, periodText: string, outputDateText: string): OutputMetaLayout {
  const width = Math.max(2, Math.floor(totalCols));
  const cells = Array(width).fill("");
  cells[0] = periodText;
  if (width < 4) {
    cells[width - 1] = outputDateText;
    return { cells, merges: [], dateColumn: width };
  }
  cells[width - 2] = outputDateText;
  return { cells, merges: [[1, width - 2], [width - 1, width]], dateColumn: width - 1 };
}
