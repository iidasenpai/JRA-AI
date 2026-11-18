// @ts-nocheck
// Explanations only: never write to horses, scores, marks or candidate orders.
const sources=['詳細出馬表','近走通過順'];
export const verifiedStyle=h=>sources.includes(h.styleSource)&&['逃','先','差','追'].includes(h.runningStyle)?h.runningStyle:'';
const horseLabel=h=>`${h.umaban} ${h.name}`;
export function describeConditions(profile,observedGoing=false) {
  const keys=[['turn',profile.direction?`${profile.direction}回り`:'回り方未確認'],['course','同競馬場'],['distance','今回距離±200m'],['going',observedGoing?'今回と同じ確認済み馬場':'設定馬場と同じ（当日未確認）']];
  return keys.map(([key,label])=>{
    const s=profile[key]||{runs:0,places:0};
    return {key,label,runs:s.runs,places:s.places,status:!s.runs?'未取得':s.runs<3?'少数実績':'実績あり',
      text:s.runs?`${label}：${s.runs}走中${s.places}走が3着内${s.runs<3?'（少数実績・得意とは断定しません）':''}`:`${label}：照合実績なし`};
  });
}
export function buildRaceExplanation(race,horses,reference,asOf) {
  const active=(horses||[]).filter(h=>h.mark!=='消'&&!['取消','除外'].includes(String(h.finish)));
  const known=active.filter(verifiedStyle),unknown=active.filter(h=>!verifiedStyle(h));
  const front=known.filter(h=>['逃','先'].includes(verifiedStyle(h))),back=known.filter(h=>['差','追'].includes(verifiedStyle(h)));
  const env=race.environment||{},time=Date.parse(env.observedAt);
  const observed=env.status==='observed'&&Number.isFinite(time)&&Number.isFinite(asOf)&&time<=asOf&&new Date(time+9*3600000).toISOString().slice(0,10)===race.raceDate;
  const conditions=observed?`当日確認：天気 ${env.weather||'未取得'} ／ 馬場 ${env.going||'未取得'}（${env.observedAt}）`:env.status==='forecast'?`予報：${env.weather||'天気未取得'}。当日の天気・馬場は未確認。`:'当日の天気・馬場：未確認。画面の馬場設定だけでは確認済みと扱いません。';
  const leaderNumber=reference?.baselineOrder?.[0];
  const leader=active.find(h=>String(h.umaban)===String(leaderNumber)),style=leader?verifiedStyle(leader):'';
  const leaderProfile=reference?.horses?.find(h=>String(h.umaban)===String(leaderNumber))?.profile;
  const risks=[];
  if(leader){
    if(['逃','先'].includes(style))risks.push('前の位置を取るために脚を使い、先行争いが想定より激しくなる場合。');
    else if(['差','追'].includes(style))risks.push('前の馬が余力を残す流れや、進路が開かず仕掛けが遅れる場合。');
    else risks.push('本命の脚質の取得元が確認できず、位置取りを見誤る場合。');
    if(!observed||!env.going||!env.weather)risks.push('当日の天気・馬場が未確認、または予報から変わる場合。');
    if(!leaderProfile?.all?.runs)risks.push('照合できる過去実績がなく、今回条件への対応を判断できない場合。');
    else if(!leaderProfile.course?.runs||!leaderProfile.distance?.runs)risks.push('同競馬場または今回距離±200mの実績が乏しく、条件適性の見立てが外れる場合。');
  }
  const withinTop=group=>(reference?.baselineOrder||[]).map(n=>group.find(h=>String(h.umaban)===String(n))).filter(Boolean).filter(h=>String(h.umaban)!==String(leaderNumber)).slice(0,3).map(horseLabel);
  const alternatives=style==='逃'||style==='先'?withinTop(back):style==='差'||style==='追'?withinTop(front):[];
  return {version:1,conditions,observed,pace:['S','M','H'].includes(race.paceType)?`${race.paceType}（現在の設定・予測値。実際のペースではありません）`:'ペースの取得値なし',
    coverage:`脚質の取得元を確認できた馬 ${known.length}/${active.length}頭`,
    front:front.map(horseLabel),back:back.map(horseLabel),unknown:unknown.map(horseLabel),
    scenarios:[{title:'先行争いが激しくなる場合',text:'前の馬の消耗が増え、差し・追込の出番が生じる可能性。ただし頭数だけではハイペースと判定しません。'},
      {title:'前が余力を残す場合',text:'前の位置を取れる馬が残り、後方の馬は届かない可能性。出脚・位置取り・進路の確認が必要です。'}],
    leader:leader?horseLabel(leader):'',risks,alternatives,
    limits:'条件付きの仮説で、発生確率は未検証です。枠番から内外の進路、通過順から捲りを決めつけません。'};
}
