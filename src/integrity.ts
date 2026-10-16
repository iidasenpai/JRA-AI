// @ts-nocheck
// Pure migration, immutable forecast and replay logic. No UI or storage side effects.
export const MODEL_VERSION = '3.13.1';
export const strictNumber = value => {
  if (value === null || value === undefined) return null;
  const s=String(value).normalize('NFKC').replace(/[−―]/g,'-').replace(/\*$/,'').trim();
  if(!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(s)) return null;
  const n=Number(s); return Number.isFinite(n)?n:null;
};
export const parseBodyDelta = value => {
  const s=String(value??'').normalize('NFKC').replace(/[−―]/g,'-').trim();
  const match=s.match(/^(?:\d{3}\s*(?:kg)?\s*)?\(\s*([+-]?\d+)\s*\)$/i);
  const n=match?Number(match[1]):strictNumber(s);
  return n!==null && Number.isInteger(n) && Math.abs(n)<=80 ? n:null;
};
const coreKeys=['best','start','oikake','agari','avg5','dist','course','r1','r2','r3'];
export const cleanHorse = horse => {
  const h={...horse,_rawRepairs:{...(horse._rawRepairs||{})}};
  for(const k of coreKeys){
    const v=h[k]; if(v!==''&&v!=null&&strictNumber(v)===null&&!/^(?:-|--|未|未経験|取消)$/.test(String(v).trim())){
      h._rawRepairs[k]=v;h[k]='';
    }
    h['_'+k]=strictNumber(h[k]);
  }
  const delta=parseBodyDelta(h.bodyChange);
  if(h._bodyChange!==delta && h._bodyChange!=null) h._rawRepairs._bodyChange=h._bodyChange;
  h._bodyChange=delta;
  for(const key of ['groundFit','classFit','jockeyIndex','gateFit','pedigreeFit','condition']) h['_'+key]=strictNumber(h[key]);
  return h;
};
export const resultNumbers = race => {
  const hs=race.horses||[];
  if(race.resultOrder){
    const s=String(race.resultOrder).normalize('NFKC').trim();
    if(!/^\d{1,2}\s*[-,、\s]\s*\d{1,2}\s*[-,、\s]\s*\d{1,2}$/.test(s)) return [];
    const a=s.match(/\d+/g).map(String);
    return new Set(a).size===3 && a.every(n=>hs.some(h=>String(h.umaban)===n))?a:[];
  }
  const a=hs.filter(h=>[1,2,3].includes(strictNumber(h.finish))).sort((a,b)=>Number(a.finish)-Number(b.finish));
  return a.length===3&&new Set(a.map(h=>Number(h.finish))).size===3?a.map(h=>String(h.umaban)):[];
};
export const predictionHorses = race => race.predictionSnapshot?.horses || race.horses || [];
export const predictionOrder = race => [...predictionHorses(race)].sort((a,b)=>{
  const p=h=>h.mark==='◎'?0:h.mark==='○'?1:h.mark==='▲'?2:3;
  return p(a)-p(b) || (a._rank??999)-(b._rank??999) || Number(b.predictedScore??-999)-Number(a.predictedScore??-999);
});
export const actualHorses = race => resultNumbers(race).map((n,i)=>({...((race.horses||[]).find(h=>String(h.umaban)===n)),finish:String(i+1)}));
export const rosterKey = race => `${race.track}|${race.surface}|${race.distance}|${(race.horses||[]).map(h=>`${h.umaban}:${h.name}`).sort().join('|')}`;
export const eventKey = race => race.raceDate && race.raceNumber ? `${race.raceDate}|${race.track}|${race.raceNumber}`:null;
const clone=x=>JSON.parse(JSON.stringify(x));
export const freezePrediction = (race,provenance=(race.scheduledStart && Date.parse(race.scheduledStart)>Date.now()?'prospective':'fixed-unverified')) => ({
  modelVersion:MODEL_VERSION, provenance, capturedAt:(provenance==='legacy-unverified'?race.savedAt:race.updatedAt)||race.savedAt||new Date().toISOString(),
  learned:clone(race.learnedSnapshot||{}), settings:{weights:race.weights,oddsOn:race.oddsOn,paceType:race.paceType,experimentalOn:!!race.experimentalOn},
  horses:(race.horses||[]).map(h=>{const v=clone(h);delete v.finish;return v;}),
});
export const migrateRaces = input => {
  const list=input.map(r=>{
    const legacy=!r.predictionSnapshot;
    const v={...r,horses:(r.horses||[]).map(cleanHorse),integrity:{...(r.integrity||{}),issues:[]},integrityVersion:MODEL_VERSION};
    // Legacy forecasts are retained, never described as verified pre-race snapshots.
    v.predictionSnapshot=r.predictionSnapshot||freezePrediction(r,'legacy-unverified');
    if(legacy) v.legacyReview=r.review||null;
    const ns=v.horses.map(h=>String(h.umaban));
    if(new Set(ns).size!==ns.length||ns.some(n=>!/^\d+$/.test(n)||Number(n)<1||Number(n)>18))v.integrity.issues.push('馬番重複・範囲異常');
    if(v.status==='completed'&&resultNumbers(v).length!==3)v.integrity.issues.push('結果形式異常');
    if(v.status==='completed'&&resultNumbers(v).length===3){
      const order=resultNumbers(v); const entered=v.horses.filter(h=>[1,2,3].includes(strictNumber(h.finish))).sort((a,b)=>Number(a.finish)-Number(b.finish)).map(h=>String(h.umaban));
      if(entered.length&&(entered.length!==3||new Set(v.horses.filter(h=>[1,2,3].includes(strictNumber(h.finish))).map(h=>String(h.finish))).size!==3||entered.join('-')!==order.join('-')))v.integrity.issues.push('結果順序と個別着順の不一致');
    }
    v.review=reviewOf(v);return v;
  });
  const groups=new Map();
  for(const r of list){const k=rosterKey(r);groups.set(k,[...(groups.get(k)||[]),r]);}
  for(const group of groups.values())if(group.length>1){
    const results=new Set(group.filter(r=>r.status==='completed').map(r=>resultNumbers(r).join('-')));
    // Same roster on known different days is allowed. Unknown-date duplicates remain quarantined.
    const knownDifferentDays=group.every(r=>r.raceDate)&&new Set(group.map(r=>r.raceDate)).size===group.length;
    if(!knownDifferentDays) for(const r of group)r.integrity.issues.push(results.size>1?'同一出走馬の結果矛盾':'同一出走馬の重複候補');
  }
  const events=new Map();
  for(const r of list){const k=eventKey(r);if(k)events.set(k,[...(events.get(k)||[]),r]);}
  for(const group of events.values())if(group.length>1)for(const r of group)r.integrity.issues.push('開催日・場・Rの重複');
  for(const r of list){r.integrity.quarantined=r.integrity.issues.length>0;if(r.integrity.quarantined)r.learnedApplied=false;r.review=reviewOf(r);}
  return list;
};
export const reviewOf = race => {
  const actual=actualHorses(race);if(actual.length!==3)return null;
  const pred=predictionOrder(race),top=pred[0];
  const marked=new Map(pred.map(h=>[String(h.umaban),h.mark]));
  const hit=actual.filter(h=>['◎','○','▲','△','☆'].includes(marked.get(String(h.umaban)))).length;
  const missed=actual.filter(h=>!['◎','○','▲','△','☆'].includes(marked.get(String(h.umaban))));
  const notes=[];
  if(race.integrity?.quarantined)notes.push('要確認：学習・成績集計から除外。'+race.integrity.issues.join('／'));
  if(race.predictionSnapshot?.provenance==='legacy-unverified')notes.push('旧記録：レース前の固定予想であることは確認できません');
  for(const h of missed)notes.push(`${h.umaban} ${h.name}: ${h._rank==null?'評価材料不足':'無印で好走'}。原因は未確定、入力・適性・展開を確認`);
  if(top)notes.push(`保存した◎ ${top.umaban} ${top.name}：${actual.some(h=>String(h.umaban)===String(top.umaban))?'3着以内':'3着外'}。上位3頭の捕捉 ${hit}/3`);
  return {grade:top&&String(top.umaban)===String(actual[0].umaban)?'A':hit===3?'B':hit===2?'C':hit===1?'D':'E',actual,top,missed,notes};
};
export const eligibleRace = race => race.status==='completed' && !race.integrity?.quarantined && resultNumbers(race).length===3 && (race.predictionSnapshot?.provenance!=='prospective' || (Date.parse(race.predictionSnapshot.capturedAt)<Date.parse(race.scheduledStart) && Date.parse(race.completedAt)>=Date.parse(race.scheduledStart)));
export const replayLearning = (input,initial,learn) => {
  const races=migrateRaces(input);let next={...initial};const history=[];const ledger=new Map();
  const sorted=[...races].filter(r=>eligibleRace(r)&&r.learningEnabledAtResult!==false&&r.learningOn!==false).sort((a,b)=>String(a.predictionSnapshot?.capturedAt||a.savedAt).localeCompare(String(b.predictionSnapshot?.capturedAt||b.savedAt))||a.id.localeCompare(b.id));
  for(const r of sorted){
    const order=resultNumbers(r);const hs=predictionHorses(r).map(raw=>{const h=cleanHorse(raw);return {...h,finish:order.includes(String(h.umaban))?String(order.indexOf(String(h.umaban))+1):'',_oddsOn:r.oddsOn};});
    const before={...next};const res=learn(hs,r.paceType||'M',next);next=res.next;
    const entry={raceId:r.id,title:r.title,at:r.completedAt||r.savedAt,resultOrder:order.join('-'),modelVersion:MODEL_VERSION,before,after:{...next},changes:res.changes};
    history.push(entry);ledger.set(r.id,entry);
  }
  return {next,history:history.reverse(),count:history.length,races:races.map(r=>({...r,learningRebuiltVersion:MODEL_VERSION,learnedApplied:ledger.has(r.id),learningChanges:ledger.get(r.id)?.changes||{},learningLedger:ledger.get(r.id)||null}))};
};
export const evaluateRecords = races => {
  const rows=races.filter(eligibleRace).map(r=>{const actual=resultNumbers(r),pred=predictionOrder(r),top=pred[0];return {id:r.id,provenance:r.predictionSnapshot?.provenance||'legacy-unverified',win:top&&String(top.umaban)===actual[0]?1:0,place:top&&actual.includes(String(top.umaban))?1:0,allMarked:actual.every(n=>pred.some(h=>String(h.umaban)===n&&['◎','○','▲','△','☆'].includes(h.mark)))?1:0};});
  const stats=a=>({n:a.length,wins:a.reduce((s,r)=>s+r.win,0),places:a.reduce((s,r)=>s+r.place,0),allMarked:a.reduce((s,r)=>s+r.allMarked,0)});
  return {all:stats(rows),prospective:stats(rows.filter(r=>r.provenance==='prospective')),legacy:stats(rows.filter(r=>r.provenance!=='prospective')),excluded:races.length-rows.length};
};
// All equal values must be neutral, missing values must not gain a percentile bonus.
export const midPercentile = (value,values) => {
  const v=strictNumber(value),a=values.map(strictNumber).filter(x=>x!==null);
  return v===null||!a.length ? .5 :(a.filter(x=>x<v).length+a.filter(x=>x===v).length*.5)/a.length;
};
export const confidenceAssessment = (ranked,quality,history=[],experimentalOn=false) => {
  const a=[...ranked].filter(h=>h._winScore!=null&&h._rank!=null).sort((a,b)=>(a._rank??999)-(b._rank??999));
  if(a.length<2)return {score:0,grade:'-',reasons:['評価材料不足']};
  const gap=Math.max(0,a[0]._winScore-a[1]._winScore),missing=ranked.filter(h=>h._evaluationStatus!=='指数評価').length/ranked.length;
  const score=Math.round(Math.max(5,Math.min(95,45+Math.min(35,gap*6)+(quality.score-60)*.15-missing*25)));
  const grade=score>=80?'A':score>=65?'B':score>=50?'C':score>=35?'D':'E';
  const valid=history.filter(r=>eligibleRace(r)&&r.predictionSnapshot?.provenance==='prospective'&&r.modelVersion===MODEL_VERSION&&!!r.experimentalOn===experimentalOn&&r.confidenceSnapshot?.grade===grade);
  const wins=valid.filter(r=>String(predictionOrder(r)[0]?.umaban)===resultNumbers(r)[0]).length;
  return {score,grade,reasons:[`◎○の評価差 ${gap.toFixed(1)}`,`補助評価・材料不足 ${Math.round(missing*100)}%`,`予測勝率ではありません／同版の事前固定記録 ${valid.length}件${valid.length?`・◎勝率${(wins/valid.length*100).toFixed(1)}%`:''}`]};
};
