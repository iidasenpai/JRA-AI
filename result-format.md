# 結果ファイル形式（取得作業向け）

type: jra-ai-result-collection / version: 1
acquiredAt: ISO8601タイムゾーン必須。取得済みの時刻。
results: 1〜72件。日・場・Rは重複不可。
各レース:
raceDate: YYYY-MM-DD（日本開催日）
track: 札幌/函館/福島/新潟/東京/中山/中京/京都/阪神/小倉
raceNumber: 1〜12の文字列
surface: 芝 または ダート / distance: m単位の数字
confirmed: true / deadHeat: false（同着結果は除外）
confirmedAt: 確定確認時刻（ISO8601、タイムゾーン付き、取得日時以前）
netkeibaRaceId: 12桁
sourceUrl: https://race.sp.netkeiba.com/race/result.html?race_id=取得したID
horses: 保存時の出走馬全頭。{umaban, name, finish}
finish: 着順の文字列、または取消/除外/中止/失格。上位3頭の確定必須。
payoutStatus: confirmed または unavailable
payouts: {type, combination, amount, unit:100} の配列。
type: 単勝/複勝/枠連/馬連/ワイド/馬単/三連複/三連単
combination: 馬番（枠連のみ枠番）の配列。順序のある券種は実着順どおり。
amount: 100円あたりの確定払戻額（円・10円単位の整数）。オッズではない。
払戻未取得は payoutStatus:unavailable と payouts:[]。

HTMLテキストを自動解釈する機能は含まない。取得時に確定表示・全頭・払戻を
画面で確認してこの形式に整える。取得できない値や日時を補作しない。
