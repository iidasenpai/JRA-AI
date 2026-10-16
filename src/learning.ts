// @ts-nocheck
import {strictNumber as num,parseBodyDelta as bodyChangeNum} from "./integrity";
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export const GRADE_TO_TRAINING_100 = { S: 92, A: 82, B: 70, C: 56, D: 40 };
export const DEFAULT_LEARNED = { training: 1, comment: 1, value: 1, pace: 1, ground: 1, classFit: 1, jockey: 1, gate: 1, body: 1, pedigree: 1, condition: 1 };
const LEARN_BOUNDS:any = {
  training:[0.75,1.15], comment:[0.75,1.10], condition:[0.75,1.10], value:[0.65,1.20],
  pace:[0.75,1.25], ground:[0.75,1.25], classFit:[0.75,1.25], jockey:[0.75,1.25],
  gate:[0.75,1.25], body:[0.75,1.25], pedigree:[0.75,1.25],
};
const STYLE_PACE_SCORE = {
  S: { "逃": 2.2, "先": 1.4, "差": -0.4, "追": -1.2 },
  M: { "逃": 0.4, "先": 0.7, "差": 0.5, "追": 0.0 },
  H: { "逃": -1.8, "先": -0.6, "差": 1.5, "追": 1.0 },
};
const importedCommentScore = h => {
  const a=h.commentAssessment,n=num(a?.score);
  return a?.method==='keyword-v3.13.1'&&a.forText===h.comment&&n!==null&&n>=25&&n<=95?n:scoreCommentText(h.comment||'');
};
const scoreCommentText = (raw = "") => {
  const text = String(raw);
  let score = 55;
  if (/^\s*◎/.test(text)) score += 13;
  else if (/^\s*○/.test(text)) score += 7;
  else if (/^\s*△/.test(text)) score -= 3;
  else if (/^\s*[×✕]/.test(text)) score -= 10;
  const positives: Array<[RegExp, number]> = [
    [/ここ目標|目標に順調|態勢は整|仕上がった|力を出し切れば/, 8],
    [/好レース|楽しみ|期待|巻き返せる|見直し|押し切れ/, 5],
    [/良くなって|良化|上向|順調|落ち着き|適性.*合|条件.*合/, 4],
    [/距離短縮|距離延長|良馬場|減量騎手|自分の競馬/, 2],
  ];
  const negatives: Array<[RegExp, number]> = [
    [/様子見|使いつつ|どこまで|半信半疑|課題/, -6],
    [/モタれ|出遅れ|気ムラ|忙しかった|馬場.*応え|折り合い.*鍵/, -3],
    [/疲れ|状態ひと息|良化途上|まだ.*ない/, -5],
  ];
  positives.forEach(([re, pt]) => { if (re.test(text)) score += pt; });
  negatives.forEach(([re, pt]) => { if (re.test(text)) score += pt; });
  return Math.round(clamp(score, 25, 95));
};

  const factorGetters = (pace: string = "M") => ({
    training: (h:any) => num(h.trainingScore)===null && !GRADE_TO_TRAINING_100[h.training]?null:(num(h.trainingScore) ?? GRADE_TO_TRAINING_100[h.training]) - 65,
    comment: (h:any) => h.comment?importedCommentScore(h) - 55:null,
    value: (h:any) => { if(!h._oddsOn)return 0;const p=num(h.ninki); const rank=num(h._rank); return p===null||rank===null ? 0 : p-rank; },
    pace: (h:any) => STYLE_PACE_SCORE[pace]?.[h.runningStyle] ?? 0,
    ground: (h:any) => h._imputed?.groundFit || num(h.groundFit)===null ? null : num(h.groundFit) - 50,
    classFit: (h:any) => h._imputed?.classFit || num(h.classFit)===null ? null : num(h.classFit) - 50,
    jockey: (h:any) => h._imputed?.jockeyIndex || num(h.jockeyIndex)===null ? null : num(h.jockeyIndex) - 50,
    gate: (h:any) => h._imputed?.gateFit || num(h.gateFit)===null ? null : num(h.gateFit) - 50,
    body: (h:any) => {const d=bodyChangeNum(h.bodyChange);return h._imputed?.bodyChange||d===null?null:-Math.abs(d);},
    pedigree: (h:any) => h._imputed?.pedigreeFit || num(h.pedigreeFit)===null ? null : num(h.pedigreeFit) - 50,
    condition: (h:any) => h._imputed?.condition || num(h.condition)===null ? null : num(h.condition) - 50,
  });

  const learningDelta = (topValues:number[], otherValues:number[]) => {
    if (!topValues.length || !otherValues.length) return 0;
    const mean=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
    const a=mean(topValues), b=mean(otherValues);
    const all=[...topValues,...otherValues];
    const mu=mean(all);
    const variance=all.reduce((sum,v)=>sum+(v-mu)*(v-mu),0)/Math.max(1,all.length-1);
    const sd=Math.sqrt(variance);
    const effect=Math.abs(a-b)/Math.max(sd, 4);
    if (effect < 0.18) return 0;
    const magnitude=clamp(0.01 + effect*0.012, 0.01, 0.04);
    return a>b ? magnitude : -magnitude;
  };

  export const learnFromRace = (raceHorses:any[], pace:string, base:any) => {
    const top3 = raceHorses.filter((h:any)=>{ const f=num(h.finish); return f!==null && f>=1 && f<=3; });
    const topIds = new Set(top3.map((h:any)=>String(h.id || h.umaban)));
    const others = raceHorses.filter((h:any)=>!topIds.has(String(h.id || h.umaban)));
    if (top3.length < 3 || !others.length) return { next: base, changes: {} as Record<string,number> };
    const getters:any = factorGetters(pace);
    const next={...base};
    const changes:Record<string,number>={};
    Object.entries(getters).forEach(([key,getter]:any)=>{
      const topValues=top3.map((h:any)=>getter(h)).filter((v:any)=>v!==null && Number.isFinite(v));
      const otherValues=others.map((h:any)=>getter(h)).filter((v:any)=>v!==null && Number.isFinite(v));
      const delta=learningDelta(topValues,otherValues);
      if (!delta) return;
      const before=Number(base[key] ?? 1);
      const [lo,hi]=LEARN_BOUNDS[key] || [0.65,1.35];
      const after=clamp(before+delta,lo,hi);
      next[key]=Number(after.toFixed(4));
      changes[key]=Number((after-before).toFixed(4));
    });
    return {next,changes};
  };

