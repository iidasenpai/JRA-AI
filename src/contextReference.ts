// @ts-nocheck
import {buildHorseArchive,profileForHorse} from './horseArchive.ts';
import {saturdayContext,weekendAdjustment} from './weekendContext.ts';
export function buildContextReference(records,race,ranked,archive=buildHorseArchive(records),now=Date.now()) {
  const start=Date.parse(race.scheduledStart),valid=/^\d{4}-\d{2}-\d{2}$/.test(race.raceDate||'')&&Number.isFinite(start);
  const cutoff=valid?Math.min(now,start-1):0;
  const trend=valid?saturdayContext(records,race,cutoff):{status:'日時未入力',reason:'開催日・発走日時が必要です。',races:0};
  const rows=ranked.filter(h=>Number.isFinite(h._rank)&&h._rank>0&&h.mark!=='消').map(h=>{
    const profile=profileForHorse(h,race,valid?archive:new Map(),cutoff);
    const horseAdj=valid?profile.adjustment:0;
    const weekendAdj=['詳細出馬表','近走通過順'].includes(h.styleSource)?weekendAdjustment(trend,h,ranked.length):0;
    return {umaban:String(h.umaban),name:h.name,baseRank:h._rank,baseScore:h._winScore??h._selectionScore??h._finalScore,horseAdj,weekendAdj,profile};
  }).filter(h=>Number.isFinite(h.baseScore));
  const ordered=[...rows].sort((a,b)=>(b.baseScore+b.horseAdj+b.weekendAdj)-(a.baseScore+a.horseAdj+a.weekendAdj)||a.baseRank-b.baseRank);
  ordered.forEach((h,i)=>h.referenceRank=i+1);
  return {version:1,method:'history-weekend-reference-v1',capturedAt:new Date(now).toISOString(),asOf:valid?new Date(cutoff).toISOString():null,
    active:valid,baselineOrder:[...rows].sort((a,b)=>a.baseRank-b.baseRank).map(h=>h.umaban),referenceOrder:ordered.map(h=>h.umaban),
    changed:ordered.some((h,i)=>h.baseRank!==i+1),trend,horses:rows,
    limits:'検証用の参考候補。現行の点数・印には反映しません。実績は小標本補正、馬別±1点・週末±0.5点の仮ルール。効果は未検証です。'};
}
export function compareContextReferences(records) {
  const a={races:0,changed:0,baseWins:0,referenceWins:0,basePlaces:0,referencePlaces:0,baseTop5:0,referenceTop5:0};
  for(const r of records){
    const s=r.predictionSnapshot,c=s?.contextReference,actual=String(r.resultOrder||'').split('-');
    if(r.status!=='completed'||r.integrity?.quarantined||s?.provenance!=='prospective'||c?.version!==1||!c.active||c.method!=='history-weekend-reference-v1'||actual.length!==3||new Set(actual).size!==3||!Array.isArray(c.baselineOrder)||!Array.isArray(c.referenceOrder)||!c.baselineOrder.length||!c.referenceOrder.length||![s.capturedAt,c.capturedAt,c.asOf,r.scheduledStart].every(v=>Number.isFinite(Date.parse(v)))||new Set(c.baselineOrder).size!==c.baselineOrder.length||new Set(c.referenceOrder).size!==c.referenceOrder.length||c.baselineOrder.length!==c.referenceOrder.length||c.referenceOrder.some(n=>!c.baselineOrder.includes(n))||!(Date.parse(s.capturedAt)<Date.parse(r.scheduledStart))||Date.parse(c.capturedAt)>Date.parse(s.capturedAt)||Date.parse(c.asOf)>=Date.parse(r.scheduledStart))continue;
    a.races++;a.changed+=!!c.changed;a.baseWins+=c.baselineOrder[0]===actual[0];a.referenceWins+=c.referenceOrder[0]===actual[0];a.basePlaces+=actual.includes(c.baselineOrder[0]);a.referencePlaces+=actual.includes(c.referenceOrder[0]);a.baseTop5+=actual.every(n=>c.baselineOrder.slice(0,5).includes(n));a.referenceTop5+=actual.every(n=>c.referenceOrder.slice(0,5).includes(n));
  }
  return a;
}
