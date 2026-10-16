// @ts-nocheck
import {strictNumber as num,parseBodyDelta as bodyChangeNum,midPercentile} from "./integrity";
const GRADE_TO_TRAINING_100 = { S: 92, A: 82, B: 70, C: 56, D: 40 };
const STYLE_PACE_SCORE = {
  S: { "逃": 2.2, "先": 1.4, "差": -0.4, "追": -1.2 },
  M: { "逃": 0.4, "先": 0.7, "差": 0.5, "追": 0.0 },
  H: { "逃": -1.8, "先": -0.6, "差": 1.5, "追": 1.0 },
};
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
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

export function computeHorses({horses,weights,agariBonus,surface,distance,oddsOn,oddsStrength,paceType,learningOn,learned,experimentalOn=false}){
    // 先に全馬を数値化し、レース内の相対評価も使えるようにする
    const parsed = horses.map((h) => ({
      ...h,
      _best: num(h.best),
      _start: num(h.start),
      _oikake: num(h.oikake),
      _agari: num(h.agari),
      _avg5: num(h.avg5),
      _dist: num(h.dist),
      _course: num(h.course),
      _r3: num(h.r3),
      _r2: num(h.r2),
      _r1: num(h.r1),
      _odds: num(h.odds),
      _groundFit: num(h.groundFit),
      _classFit: num(h.classFit),
      _jockeyIndex: num(h.jockeyIndex),
      _gateFit: num(h.gateFit),
      _bodyChange: bodyChangeNum(h.bodyChange),
      _pedigreeFit: num(h.pedigreeFit),
      _condition: num(h.condition),
      _detailDistanceFit: num(h.detailDistanceFit),
      _detailCourseFit: num(h.detailCourseFit),
      _detailGroundFit: num(h.detailGroundFit),
    }));

    const avgOf = (key) => {
      const vals = parsed.map((h) => h[key]).filter((v) => v !== null && Number.isFinite(v));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    const raceAvg = {
      start: avgOf("_start"),
      oikake: avgOf("_oikake"),
      agari: avgOf("_agari"),
      oddsLog: (() => {
        const vals = parsed.filter((h) => h._odds && h._odds > 0).map((h) => Math.log(h._odds));
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      })(),
    };

    const d = Number(distance) || 0;
    const isSprint = d > 0 && d <= 1400;
    const isLong = d >= 2200;

    return parsed.map((h) => {
      const best = h._best;
      const avg5 = h._avg5;
      const dist = h._dist;
      const course = h._course;

      // 未経験値は過度に高く見積もらず、全体最高から控えめに代替
      const distVal = dist!==null?dist:!experimentalOn&&best!==null?best-5:null;
      const courseVal = course!==null?course:!experimentalOn&&best!==null?best-4:null;

      const parts = [];
      if (best !== null) parts.push([best, weights.best]);
      if (avg5 !== null) parts.push([avg5, weights.avg5]);
      if (distVal !== null) parts.push([distVal, weights.dist]);
      if (courseVal !== null) parts.push([courseVal, weights.course]);

      let base = null;
      if (parts.length > 0) {
        const wTotal = parts.reduce((sum, [, w]) => sum + w, 0) || 1;
        base = parts.reduce((sum, [v, w]) => sum + v * w, 0) / wTotal;
      }

      // Missing core scores may use observed recent indices; otherwise use a conservative
      // field-median auxiliary estimate, explicitly labelled and penalized for uncertainty.
      let evaluationStatus=base!==null?"指数評価":experimentalOn?"補助評価":"材料不足";
      if(base===null && experimentalOn){
        const recent=[h._r1,h._r2,h._r3].filter(v=>v!==null);
        if(recent.length) base=recent.reduce((a,b)=>a+b,0)/recent.length;
        else {
          const field=parsed.map(x=>x._avg5??x._best??x._r1).filter(v=>v!==null).sort((a,b)=>a-b);
          if(field.length) base=field[Math.floor((field.length-1)/2)]-4;
          else evaluationStatus="材料不足";
        }
      }
      // 直近3走: 単純平均だけでなく、上向き・下向きの方向も反映
      const recentVals = [h._r3, h._r2, h._r1].filter((v) => v !== null);
      let recentAdj = 0;
      if (base !== null && recentVals.length) {
        const weighted = [
          h._r1 !== null ? [h._r1, 4] : null,
          h._r2 !== null ? [h._r2, 2] : null,
          h._r3 !== null ? [h._r3, 1] : null,
        ].filter(Boolean);
        const wt = weighted.reduce((sum, [, w]) => sum + w, 0);
        const recentAvg = weighted.reduce((sum, [v, w]) => sum + v * w, 0) / wt;
        const trend = h._r1 !== null && h._r3 !== null ? (h._r1 - h._r3) : 0;
        recentAdj = (recentAvg - base) * 0.16 + Math.max(-3, Math.min(3, trend * 0.06));
      }

      // 芝⇔ダート替わり。別馬場で作った近走指数の再現性を少し下げる。
      // 初戦は不確実性を大きめ、2戦目は弱く、3戦目以降は通常評価へ戻す。
      // 現条件の距離/コース適性が高ければ減点を縮小し、固定的な「替わり=悪」とはしない。
      const surfaceRunNo = Number(h.surfaceRunNo || 0);
      const surfaceSwitch = String(h.surfaceSwitch || "");
      let surfaceSwitchAdj = 0;
      if (surfaceSwitch && surfaceRunNo === 1) {
        recentAdj *= 0.55;
        const provenFit = Math.max(num(h.detailDistanceFit) ?? 50, num(h.detailCourseFit) ?? 50);
        surfaceSwitchAdj = provenFit >= 56 ? -0.35 : provenFit >= 52 ? -0.70 : -1.20;
      } else if (surfaceSwitch && surfaceRunNo === 2) {
        recentAdj *= 0.82;
        surfaceSwitchAdj = -0.35;
      }

      // 条件別の脚質適性。短距離・ダートは先行力、長距離芝は末脚を強める
      let paceAdj = 0;
      if (base !== null) {
        if (h._start !== null && raceAvg.start !== null) {
          const startWeight = surface === "ダート" ? 0.13 : isSprint ? 0.11 : 0.05;
          paceAdj += (h._start - raceAvg.start) * startWeight;
        }
        if (h._oikake !== null && raceAvg.oikake !== null) {
          const chaseWeight = surface === "ダート" ? 0.10 : isSprint ? 0.08 : 0.05;
          paceAdj += (h._oikake - raceAvg.oikake) * chaseWeight;
        }
        if (agariBonus && surface === "芝" && h._agari !== null && raceAvg.agari !== null) {
          const finishWeight = isLong ? 0.15 : isSprint ? 0.07 : 0.11;
          paceAdj += (h._agari - raceAvg.agari) * finishWeight;
        }
      }

      // 欠損が多い馬の過大評価を抑える信頼度補正
      const coreKnown = [h._best, h._avg5, h._dist, h._course].filter((v) => v !== null).length;
      const recentKnown = [h._r1, h._r2, h._r3].filter((v) => v !== null).length;
      const recentSurfaceCount = Array.isArray(h.recentSurfaces) ? h.recentSurfaces.length : 0;
      // データ不足は能力不足とはみなさず「不確実性」として小さく縮小する。
      // 新馬・少キャリア馬を強制的に消さず、過大な一点評価だけを防ぐ。
      const uncertainty = Math.max(0, 3 - Math.max(recentKnown, recentSurfaceCount));
      const reliabilityAdj = base !== null ? -(4 - coreKnown) * 0.35 - uncertainty * 0.28 : 0;

      let score = base !== null ? base + recentAdj + paceAdj + reliabilityAdj : null;

      // オッズは市場の集合知として弱く利用。低オッズを加点、高オッズを減点する。
      // 強く掛けすぎると人気順のコピーになるため、最大でも数ポイントに制限。
      let oddsBonus = 0;
      if (oddsOn && h._odds !== null && h._odds > 0 && score !== null && raceAvg.oddsLog !== null) {
        const marketEdge = raceAvg.oddsLog - Math.log(h._odds);
        oddsBonus = Math.max(-3.5, Math.min(3.5, marketEdge * (oddsStrength / 10)));
      }

      // 調教・厩舎コメントを100点化。50〜55点を中立として補正する。
      const training100 = num(h.trainingScore) ?? GRADE_TO_TRAINING_100[h.training] ?? 65;
      const comment100 = importedCommentScore(h);
      const effectiveTrainingLearn = learningOn ? clamp(Number(learned.training ?? 1), 0.80, 1.05) : 1;
      const effectiveCommentLearn = learningOn ? clamp(Number(learned.comment ?? 1), 0.85, 1.05) : 1;
      const effectiveConditionLearn = learningOn ? clamp(Number(learned.condition ?? 1), 0.75, 1.10) : 1;
      const trainingAdj = clamp((training100 - 65) / 7.5, -3.0, 3.2) * effectiveTrainingLearn;
      const commentAdj = clamp((comment100 - 55) / 12, -2.0, 2.2) * effectiveCommentLearn;
      const styleAdj = (STYLE_PACE_SCORE[paceType]?.[h.runningStyle] ?? 0) * (learningOn ? learned.pace : 1);
      const fitAdj = (value, scale, key) => value === null ? 0 : clamp((value - 50) / scale, -2.2, 2.2) * (learningOn ? learned[key] : 1);
      const groundAdj = fitAdj(h._groundFit, 20, "ground");
      const classAdj = fitAdj(h._classFit, 22, "classFit");
      const jockeyAdj = fitAdj(h._jockeyIndex, 25, "jockey");
      const gateAdj = fitAdj(h._gateFit, 25, "gate");
      const pedigreeAdj = fitAdj(h._pedigreeFit, 28, "pedigree");
      const conditionAdj = h._condition === null || h._imputed?.condition || (!h.detailImported && h.comment && Number(h.condition)===scoreCommentText(h.comment)) ? 0 : clamp((h._condition - 50) / 22, -2.2, 2.2) * effectiveConditionLearn;
      // 詳細出馬表の実績はタイム指数とは別物。小標本補正済みの適性値として弱く加点する。
      const detailDistanceAdj = h._detailDistanceFit === null ? 0 : clamp((h._detailDistanceFit - 50) / 8, -1.5, 2.2);
      const detailCourseAdj = h._detailCourseFit === null ? 0 : clamp((h._detailCourseFit - 50) / 9, -1.2, 1.7);
      const detailGroundAdj = h._detailGroundFit === null ? 0 : clamp((h._detailGroundFit - 50) / 12, -0.8, 1.0);
      let bodyAdj = 0;
      if (h._bodyChange !== null) {
        const abs = Math.abs(h._bodyChange);
        bodyAdj = abs <= 4 ? 0.10 : abs <= 8 ? 0 : abs <= 12 ? -0.20 : abs <= 18 ? -0.65 : -1.10;
        bodyAdj *= learningOn ? learned.body : 1;
      }
      // 160R検証では、人気薄の高指数馬を◎に持ち上げすぎる傾向が確認された。
      // 人気順のコピーにならないよう最大±2点程度の「◎選定用」市場補正だけを加える。
      // 元の能力指数(_finalScore)は保持し、印決定だけに使う。
      const popularity = num(h.ninki);
      // value学習値が低いほど「AIだけが高評価する穴」を信用しすぎない。
      // 現在の学習値0.65なら係数0.60、初期値1.00なら0.25程度。
      const marketCoef = learningOn ? clamp(1.35 - Number(learned.value ?? 1), 0.30, 0.72) : 0.35;
      // 人気は能力点には混ぜず、◎選定時の逆張り暴走だけを抑える安全装置。
      // 1〜3人気は小さく補強、4人気以下は段階的に抑制。ただし能力差が大きい穴馬は後段で再昇格できる。
      const marketSafetyAdj = !oddsOn || popularity === null ? 0
        : popularity <= 3 ? clamp((4 - popularity) * marketCoef, 0, 1.5)
        : popularity <= 5 ? -(popularity - 3) * 0.75
        : popularity <= 7 ? -2.2 - (popularity - 6) * 0.45
        : -3.0;

      // 誤コメントの影響を増幅しないよう、学習済み係数にも実効上限を設ける。
      const contextAdj = clamp(trainingAdj + commentAdj + styleAdj + groundAdj + classAdj + jockeyAdj + gateAdj + pedigreeAdj + conditionAdj + detailDistanceAdj + detailCourseAdj + detailGroundAdj + bodyAdj + surfaceSwitchAdj, -15, 15);

      const finalScore = score !== null ? score + oddsBonus + contextAdj : null;
      const selectionScore = finalScore !== null ? finalScore + marketSafetyAdj : null;
      return {
        ...h,
        _evaluationStatus:evaluationStatus,
        _indexImputation:{distance:dist===null&&distVal!==null,course:course===null&&courseVal!==null},
        _distVal: distVal,
        _courseVal: courseVal,
        _base: base,
        _recentAdj: recentAdj,
        _paceAdj: paceAdj,
        _reliabilityAdj: reliabilityAdj,
        _surfaceSwitchAdj: surfaceSwitchAdj,
        _oddsBonus: oddsBonus,
        _trainingScore: training100,
        _commentScore: comment100,
        _commentAdj: commentAdj,
        _contextAdj: contextAdj,
        _marketSafetyAdj: marketSafetyAdj,
        _selectionScore: selectionScore,
        _finalScore: finalScore,
      };
    });

}
export function rankHorses(computed,{surface,oddsOn,experimentalOn=false}){
    const withScore = computed.filter((h) => h._selectionScore !== null && h.mark!=="消");
    const abilitySorted = [...withScore].sort((a, b) => b._finalScore - a._finalScore);
    const pct = (value:any, values:number[]) => {
      return midPercentile(value,values);
    };
    const vals=(key:string)=>withScore.map((h:any)=>num(h[key])).filter((v:any)=>v!==null) as number[];
    const distVals=vals("_detailDistanceFit"), courseVals=vals("_detailCourseFit"), groundVals=vals("_detailGroundFit");
    const r1Vals=vals("_r1"), avg5Vals=vals("_avg5"), agariVals=vals("_agari"), startVals=vals("_start");

    // ◎専用スコア: 能力を土台に、今回条件適性・ペース・市場整合性を重視。
    // 調教/コメントはcomputed側で小さく反映済みなので、ここでは重複加点しない。
    const winScore=(h:any)=>{
      const pop=num(h.ninki);
      const ability=Number(h._finalScore ?? -999);
      const fit=(pct(h._detailDistanceFit,distVals)-0.5)*2.8 + (pct(h._detailCourseFit,courseVals)-0.5)*1.6 + (pct(h._detailGroundFit,groundVals)-0.5)*1.0;
      const recent=(pct(h._r1,r1Vals)-0.5)*1.2;
      let market=Number(h._marketSafetyAdj||0);
      // 人気薄でも能力がフィールド上位から明確に抜ける場合は逆張りを許容。
      const abilityTop=abilitySorted[0]?Number(abilitySorted[0]._finalScore):-999;
      if(pop!==null && pop>=4 && abilityTop-ability<0.8) market*=0.55;
      return ability + fit + recent + market;
    };
    // 勝ち切り順位。市場は「人気馬を自動で◎にする」のではなく、僅差時だけ逆張り◎を抑える安全弁として使う。
    let winSorted=[...withScore].sort((a,b)=>winScore(b)-winScore(a));
    if(oddsOn && winSorted.length>=2){
      const leader=winSorted[0];
      const leaderPop=num(leader.ninki);
      const popularChallenger=winSorted
        .slice(1,4)
        .filter((h:any)=>{ const p=num(h.ninki); return p!==null && p<=3; })
        .sort((a:any,b:any)=>winScore(b)-winScore(a))[0];
      if(leaderPop!==null && leaderPop>=4 && popularChallenger){
        const margin=winScore(leader)-winScore(popularChallenger);
        // 10/4検証: 人気薄AI1位と1〜3人気のAI2〜3位が僅差なら、逆張りに十分な根拠がないと判断。
        // 1.5点以上の明確な優位がある時は従来どおり人気薄◎を許容する。
        if(margin < 1.5){
          winSorted=[popularChallenger,...winSorted.filter((h:any)=>h.id!==popularChallenger.id)];
        }
      }
    }
    const rankMap=new Map(winSorted.map((h,i)=>[h.id,i]));
    const top3Ids=new Set(winSorted.slice(0,3).map(h=>h.id));

    // 相手専用スコア: 「勝ち切る」より2・3着に残る再現性を優先。
    const supportScore=(h:any)=>{
      const modelRank=(rankMap.get(h.id)??99)+1;
      const pop=num(h.ninki);
      let sc=Math.max(0,11-modelRank)*0.75;
      if(oddsOn && pop!==null) sc += pop<=3?4.0:pop<=5?2.5:pop<=7?0.8:0;
      sc += pct(h._detailDistanceFit,distVals)*3.2;
      sc += pct(h._detailCourseFit,courseVals)*1.8;
      sc += pct(h._r1,r1Vals)*2.2;
      sc += pct(h._avg5,avg5Vals)*2.0;
      sc += pct(h._agari,agariVals)*1.5;
      if(surface==="ダート") sc += pct(h._start,startVals)*1.4;
      // 調教は相手でも補助に限定。
      sc += pct(h._trainingScore,vals("_trainingScore"))*0.45;
      if(modelRank>10) sc-=15;
      return sc;
    };

    const fieldSize=winSorted.length;
    // 実戦フィードバック対応: v3.11.0 は印を絞りすぎて相手抜けが増えたため、
    // 基本候補数を1頭ずつ戻す。ただし以前のように12頭で8〜9頭へ無制限に広げない。
    // 上位が拮抗しているレースだけ、ヒモ抜け防止でさらに1頭追加する。
    // 10/3 実戦検証: 5頭前後では3頭目の取りこぼしが多かったため、◎○▲は維持したまま相手枠を戻す。
    // 総印数の目安は <=9頭:5、10〜13頭:6、14〜18頭:7。16頭以上かつ上位が極端に拮抗時のみ8頭まで。
    const targetMarkedCount = fieldSize<=9 ? 5 : fieldSize<=13 ? 6 : 7;
    const baseSupportCount = Math.min(Math.max(0, fieldSize-3), Math.max(0, targetMarkedCount-3));
    const supportCandidates=winSorted.filter(h=>!top3Ids.has(h.id))
      .map(h=>({h,rescue:supportScore(h)}))
      .sort((a,b)=>b.rescue-a.rescue || winScore(b.h)-winScore(a.h));
    // 印の境界だけ可変化。7頭目と8頭目（小頭数なら最終印と次点）がほぼ同評価なら1頭だけ追加。
    // 一律8頭にはせず、相手専用スコア差が0.9以内の時だけヒモ抜け防止を行う。
    const boundaryIn=supportCandidates[baseSupportCount-1];
    const boundaryOut=supportCandidates[baseSupportCount];
    const boundaryExtra = experimentalOn ? 0 : boundaryIn && boundaryOut && (boundaryIn.rescue-boundaryOut.rescue)<=0.9 ? 1 : 0;
    const supportCount = Math.min(supportCandidates.length, baseSupportCount + boundaryExtra);
    const support=supportCandidates.slice(0,supportCount).map(x=>x.h);
    const supportMark=new Map(support.map((h,i)=>[h.id,i===support.length-1?"☆":"△"]));

    return computed.map((h:any)=>{
      const idx=rankMap.get(h.id);
      let autoMark="";
      if(idx===0) autoMark="◎"; else if(idx===1) autoMark="○"; else if(idx===2) autoMark="▲"; else autoMark=supportMark.get(h.id)||"";
      return {...h,_rank:idx!==undefined?idx+1:null,_autoMark:autoMark,_supportRescue:supportScore(h),_winScore:winScore(h)};
    });

}
