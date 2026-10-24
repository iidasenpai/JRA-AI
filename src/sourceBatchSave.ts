// @ts-nocheck
import {validateSourceCollection} from './sourceIngestion';
import {computeHorses,rankHorses} from './prediction';
import {evaluationCoverage} from './raceContext';
import {MODEL_VERSION,cleanHorse,strictNumber,freezePrediction,eventKey,migrateRaces,confidenceAssessment} from './integrity';
const clone=x=>JSON.parse(JSON.stringify(x));
const qualityOf=horses=>{
 const total=horses.length,core=horses.filter(h=>[h._best,h._avg5,h._dist,h._course].filter(v=>v!==null).length>=3).length;
 const training=horses.filter(h=>h.trainingNote||strictNumber(h.trainingScore)!==null).length,comments=horses.filter(h=>String(h.comment||'').trim().length>=8).length,unknown=horses.filter(h=>h._evaluationStatus!=='指数評価').length;
 const score=Math.round(core/total*60+training/total*20+comments/total*20),issues=[];
 if(core<total)issues.push(`主要指数不足 ${total-core}頭`);if(training<total)issues.push(`調教不足 ${total-training}頭`);if(comments<total)issues.push(`コメント不足 ${total-comments}頭`);if(unknown)issues.push(`補助評価・材料不足 ${unknown}頭`);
 const coverage=evaluationCoverage(horses);
 return {score,label:score>=85?'良好':score>=65?'概ね良好':score>=45?'注意':'不足',issues,core,training,comments,
  evaluationScope:{total:coverage.total,compared:coverage.compared,indexed:coverage.indexed,auxiliary:coverage.auxiliary,held:coverage.held.length}};
};
export function planSourceBatchSave(records,data,settings,{now=Date.now(),prepareHorse=cleanHorse,makeId=()=>crypto.randomUUID()}={}){
 if(!Number.isFinite(now))throw Error('保存日時が不正です');
 const bundles=validateSourceCollection(data),created=[],report=[],savedAt=new Date(now).toISOString(),config=clone(settings);
 // Validate every input before constructing or persisting any records.
 for(const b of bundles){const r=b.race,start=Date.parse(r.scheduledStart),acquired=Date.parse(b.acquiredAt);
  if(acquired>now||new Date(start+9*3600000).toISOString().slice(0,10)!==r.raceDate)throw Error(`${r.track}${r.raceNumber}R: 開催日・取得日時を確認してください`);
  if(r.horses.some(h=>!String(h.name||'').trim()))throw Error(`${r.track}${r.raceNumber}R: 馬名が空欄です`);
 }
 for(const b of bundles){
  const r=b.race,key=eventKey(r),label=`${r.raceDate} ${r.track}${r.raceNumber}R`,existing=records.filter(x=>eventKey(x)===key);
  if(existing.length){report.push({label,status:'skip',reason:existing.length>1?'同じ開催情報の保存記録が重複しています':existing[0].status==='completed'?'結果済みの記録を保持しました':'保存済みの予想を保持しました'});continue;}
  const horses=r.horses.map(raw=>prepareHorse({...clone(raw),id:makeId(),finish:'',mark:raw.entryStatus==='取消'?'消':'',_sourceBundle:{acquiredAt:b.acquiredAt,sourceIds:clone(b.sourceIds)}},r));
  const options={...config,horses,surface:r.surface,distance:r.distance,paceType:r.paceType};
  const ranked=rankHorses(computeHorses(options),options),quality=qualityOf(ranked),afterStart=now>=Date.parse(r.scheduledStart);
  const record={...clone(r),id:makeId(),title:r.raceName||`${r.track} ${r.raceNumber}R`,modelVersion:MODEL_VERSION,
   learnedSnapshot:clone(config.learned||{}),learningOn:config.learningOn,weights:clone(config.weights),agariBonus:config.agariBonus,oddsOn:config.oddsOn,experimentalOn:!!config.experimentalOn,decayScale:config.decayScale,oddsStrength:config.oddsStrength,
   confidenceSnapshot:confidenceAssessment(ranked,quality,records,!!config.experimentalOn),dataQualitySnapshot:quality,flowSnapshot:null,
   horses:ranked.map(h=>({...h,finish:'',mark:h.mark==='消'?'消':h._autoMark||'',predictedScore:h._winScore??h._selectionScore??h._finalScore})),
   status:'pending',savedAt,updatedAt:savedAt,learningRebuiltVersion:MODEL_VERSION,learnedApplied:false,
   sourceBatch:{version:1,acquiredAt:b.acquiredAt,savedAfterStart:afterStart,unrated:!ranked.some(h=>h._autoMark==='◎'),flowSnapshotAvailable:false}};
  record.predictionSnapshot=freezePrediction(record,afterStart?'fixed-unverified':'prospective');created.push(record);
  report.push({label,status:'saved',reason:afterStart?'発走後の参考予想として保存':record.sourceBatch.unrated?'評価保留の入力データを保存':'発走前の予想を保存'});
 }
 // Existing records are never migrated, recalculated, or replaced by a batch save.
 return {records:[...migrateRaces(created),...records],added:created.length,skipped:report.filter(x=>x.status==='skip').length,afterStart:created.filter(r=>r.sourceBatch.savedAfterStart).length,unrated:created.filter(r=>r.sourceBatch.unrated).length,report};
}
export async function persistSourceBatchSave(records,data,settings,{write,...options}){
 const plan=planSourceBatchSave(records,data,settings,options);
 if(plan.added)await write('jra-saved-races',JSON.stringify(plan.records));
 return plan;
}

