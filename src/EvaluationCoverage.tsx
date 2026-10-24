import { heldReason } from './raceContext';

export default function EvaluationCoverage({coverage}: {coverage: any}) {
  if (!coverage.total) return null;
  return <section aria-label="予想の評価範囲" className="mx-3 mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950">
    <div className="text-sm font-black">評価範囲：{coverage.compared}／{coverage.total}頭</div>
    <div className="mt-1 text-xs leading-relaxed">指数評価 {coverage.indexed}頭{coverage.auxiliary > 0 ? `・補助評価 ${coverage.auxiliary}頭` : ''}・評価保留 {coverage.held.length}頭</div>
    {coverage.held.length > 0 && <>
      <p className="mt-2 text-xs leading-relaxed">{coverage.compared ? '◎と順位は、評価できた馬の中での比較です。' : 'このレースは全頭が評価保留です。'} 評価保留は能力が低いという意味ではありません。</p>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer font-bold">評価保留の{coverage.held.length}頭を見る</summary>
        <ul className="mt-2 space-y-2">{coverage.held.map((h: any) => <li key={h.id || h.umaban}>
          <span className="font-bold">{h.umaban} {h.name}</span><span className="block text-[11px]">{heldReason(h)}</span>
        </li>)}</ul>
      </details>
    </>}
    {coverage.auxiliary > 0 && <p className="mt-2 text-[11px] leading-relaxed">補助評価は通常の指数評価と分けて表示しています。</p>}
    {coverage.missingHistory > 0 && <details className="mt-2 text-[11px] leading-relaxed">
      <summary className="cursor-pointer">取得情報：芝・ダート履歴が未収録 {coverage.missingHistory}頭</summary>
      <p className="mt-1">旧形式のファイルには履歴が含まれないため、馬場替わりを判定できません。履歴付きの取得ファイルから反映されます。保存済み予想は変更しません。</p>
    </details>}
  </section>;
}
