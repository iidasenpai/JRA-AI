// @ts-nocheck
import React from 'react';
import {compareContextReferences} from './contextReference';
const box={background:'#0f172a',color:'#e2e8f0',border:'1px solid #64748b',borderRadius:16,padding:16,margin:12};
const result=s=>s.runs?`${s.places}/${s.runs}走が3着内`:'資料なし';
export function ContextReferencePanel({value}) {
  if(!value)return null;
  const t=value.trend,e=value.explanation;
  return <section style={box} aria-label="蓄積実績と週末傾向">
    <h2 style={{fontSize:18,fontWeight:800}}>蓄積実績・同じ開催週の参考情報</h2>
    <p style={{color:'#cbd5e1',fontSize:13,marginTop:8}}>ファイルを読み込むだけで照合します。現在の点数・印は維持し、追加情報を使う参考候補を別保存します。</p>
    {e&&<div style={{marginTop:14,padding:14,background:'#16243a',border:'1px solid #94a3b8',borderRadius:12,lineHeight:1.8}}>
      <h3 style={{fontSize:17,fontWeight:800,color:'#fff'}}>条件・展開の見立て（参考）</h3>
      <p>{e.conditions}</p><p>ペース：{e.pace}</p>
      <p style={{color:'#cbd5e1'}}>{e.coverage}</p>
      <p>逃げ・先行：{e.front.join(' ／ ')||'取得なし'}</p><p>差し・追込：{e.back.join(' ／ ')||'取得なし'}</p>
      {!!e.unknown.length&&<p style={{color:'#fde68a'}}>脚質未確認：{e.unknown.join(' ／ ')}</p>}
      <details style={{marginTop:8}}><summary>展開が変わる2つのパターン</summary>{e.scenarios.map(s=><p key={s.title}><strong>{s.title}</strong><br/>{s.text}</p>)}</details>
      <h3 style={{fontWeight:800,marginTop:12}}>現行本命が負けるパターン：{e.leader||'評価待ち'}</h3>
      {e.risks.map(r=><p key={r}>・{r}</p>)}
      {!!e.alternatives.length&&<p>反対の脚質で確認したい現行上位馬：{e.alternatives.join(' ／ ')}（買い推奨ではありません）</p>}
      <p style={{fontSize:12,color:'#cbd5e1',marginTop:8}}>{e.limits}</p>
    </div>}
    <div style={{marginTop:12,padding:12,border:'1px solid #475569',borderRadius:10}}>
      <strong>週末傾向：{t.status}</strong>{t.basedOnDate&&<p>{(t.basedOnDates?.length?t.basedOnDates:t.sourceDates||[t.basedOnDate]).join('・')} → {t.validFor} ／ {t.distanceBand} ／ {t.races}R</p>}<p style={{fontSize:13,marginTop:8}}>{t.reason}</p>
      {!!t.races&&<details style={{marginTop:8}}><summary>観測した通過位置・進路を見る</summary><p style={{fontSize:12,color:'#cbd5e1'}}>人気・能力調整前の観測値です。前残りや内外差を断定しません。</p>{['positions','paths','moves'].map(k=><div key={k} style={{marginTop:8}}><strong>{k==='positions'?'最初の通過位置':k==='paths'?'実際に通った進路':'映像等で確認した動き'}</strong>{Object.entries(t[k]||{}).map(([name,v]:any)=><p key={name}>{name}：{v.runners?`${v.places}/${v.runners}頭が3着内`:'資料なし'}</p>)}</div>)}</details>}
    </div>
    <div style={{marginTop:14}}><strong>現行の上位5頭</strong><p>{value.baselineOrder.slice(0,5).join('・')||'評価待ち'}</p><strong>追加情報を使う参考上位5頭</strong><p>{value.referenceOrder.slice(0,5).join('・')||'評価待ち'}{!value.changed&&value.referenceOrder.length?'（現行と同じ）':''}</p></div>
    <p style={{fontSize:12,color:'#cbd5e1',marginTop:8}}>現在の参考表示です。成績では保存時の候補だけを使います。有効性は未検証です。データ不足の馬に指数を補作せず、候補数も増やしません。</p>
    <details style={{marginTop:14}}><summary style={{fontWeight:800}}>馬ごとの蓄積実績を確認</summary>{value.horses.map(h=><details key={h.umaban} style={{borderTop:'1px solid #475569',padding:'12px 0'}}><summary>{h.umaban} {h.name} ／ 現行{h.baseRank}位 → 参考{h.referenceRank}位 ／ 実績{h.profile.totalRuns}走</summary>
      <p style={{fontSize:12,color:'#cbd5e1',marginTop:8}}>{h.profile.identityMethod}で照合。{h.profile.note}</p>
      <p>{h.profile.direction==='直線'?'直線':h.profile.direction?h.profile.direction+'回り':'回り方未確認'}：{result(h.profile.turn)}</p>
      <p>同競馬場：{result(h.profile.course)} ／ 近い距離：{result(h.profile.distance)}</p><p>今回と同じ馬場状態：{result(h.profile.going)}</p>
      {h.conditionEvidence&&<div style={{marginTop:8}}><strong>今回条件の根拠</strong>{h.conditionEvidence.map(c=><p key={c.key} style={{fontSize:13}}>{c.text}</p>)}</div>}
      <p style={{fontSize:12}}>検証用補正：馬実績 {h.horseAdj.toFixed(2)} ／ 週末 {h.weekendAdj.toFixed(2)}</p>
      {h.profile.latest.map(r=><p key={`${r.date}|${r.track}|${r.raceNumber}`} style={{fontSize:13,marginTop:6}}>{r.date} {r.track}{r.raceNumber}R {r.surface}{r.distance}m・{r.going||'馬場未収録'} ／ {r.finish?r.finish+'着':r.outcomeKnown?'着外・順位未収録':r.entryStatus||'順位未収録'}{r.positions?.length?' ／ 通過 '+r.positions.join('-'):''}{r.agari?' ／ 上がり '+r.agari:''}</p>)}
    </details>)}</details>
  </section>;
}
export function ContextReferenceResults({records}) {
  const s=compareContextReferences(records);
  return <section style={box}><h2 style={{fontSize:17,fontWeight:800}}>追加情報の参考候補を検証</h2><p style={{marginTop:8}}>事前固定 {s.races}R ／ 順位が変わった記録 {s.changed}R</p>
    <div style={{overflowX:'auto',marginTop:10}}><table style={{width:'100%',fontSize:14}}><thead><tr><th>指標</th><th>現行</th><th>参考候補</th></tr></thead><tbody>{[['◎相当の勝利',s.baseWins,s.referenceWins],['◎相当の3着内',s.basePlaces,s.referencePlaces],['上位5頭で全捕捉',s.baseTop5,s.referenceTop5]].map(([label,a,b])=><tr key={label}><td style={{padding:'8px 0'}}>{label}</td><td style={{textAlign:'center'}}>{a}/{s.races}</td><td style={{textAlign:'center'}}>{b}/{s.races}</td></tr>)}</tbody></table></div>
    <p style={{fontSize:12,color:'#cbd5e1',marginTop:8}}>保存時の参考候補だけを比較。旧記録には後から参考順位を付けず、自動採用もしません。</p>
  </section>;
}
