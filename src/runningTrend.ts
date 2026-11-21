// @ts-nocheck
import {verifiedStyle} from './raceExplanation.ts';
// Imported analyst judgments, never inferred from a single winner or frame number.
export function validateRunningTrend(x){
 const text=v=>typeof v==='string'&&v.trim().length>0;
 const fail=()=>{throw Error('分析済み傾向ファイルの形式・根拠・日時を確認してください')};
 if(x?.format!=='jra-running-trend'||x.version!==1||!text(x.id)||!text(x.summary)||typeof x.analyzedAt!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(x.analyzedAt)||!Number.isFinite(Date.parse(x.analyzedAt))||!/^\d{4}-\d{2}-\d{2}$/.test(x.validFrom)||!/^\d{4}-\d{2}-\d{2}$/.test(x.validTo)||x.validTo<x.validFrom||!Array.isArray(x.sourceRaces)||!x.sourceRaces.length||!Array.isArray(x.rules))fail();
 if(x.rules.length>100||x.sourceRaces.length>500)fail();
 const ids=new Set();for(const s of x.sourceRaces){if(!text(s.id)||ids.has(s.id)||!/^\d{4}-\d{2}-\d{2}$/.test(s.date)||s.date>=x.validFrom||!text(s.track)||!['芝','ダート'].includes(s.surface)||!Number.isFinite(s.distance)||s.distance<600||!text(s.sourceNote))fail();ids.add(s.id);}
 if(x.sourceRaces.some(s=>s.date>new Date(x.analyzedAt).toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'})))fail();
 for(const q of x.rules){if(!text(q.id)||!text(q.reason)||!['参考','適用可'].includes(q.status)||!text(q.track)||!['芝','ダート'].includes(q.surface)||!Array.isArray(q.goings)||!q.goings.length||q.goings.some(g=>!['良','稍重','重','不良'].includes(g))||!Number.isFinite(q.minDistance)||!Number.isFinite(q.maxDistance)||q.minDistance>q.maxDistance||!Array.isArray(q.evidenceRaceIds)||!q.evidenceRaceIds.length||q.evidenceRaceIds.some(id=>!ids.has(id))||!Number.isFinite(q.points)||Math.abs(q.points)>1||!q.selector||!['style','horseName'].includes(q.selector.type)||typeof q.selector.value!=='string'||!q.selector.value)fail();
 if(q.selector.type==='style'&&!['逃','先','差','追'].includes(q.selector.value))fail();
 if(q.evidenceRaceIds.some(id=>{const s=x.sourceRaces.find(s=>s.id===id);return s.track!==q.track||s.surface!==q.surface}))fail();
 }return x;
}
export function prepareRunningTrend(horses,race,file,enabled,now=Date.now()){
 const clean=horses.map(h=>({...h,_runningTrendAdj:0,_runningTrendReasons:[],_runningTrendFile:null}));
 const out=(reason,applied=false)=>({horses:clean,reason,applied,file:file?{id:file.id,summary:file.summary,analyzedAt:file.analyzedAt}:null});
 if(!file)return out('未読込：走行ノートをChatGPTで分析した傾向ファイルを読み込んでください。');
 try{validateRunningTrend(file)}catch{return out('ファイルを検証できないため適用しません。')}
 if(!enabled)return out('確認用に表示中。印への反映はオフです。');
 const start=Date.parse(race.scheduledStart);if(!Number.isFinite(start)||now>=start)return out('発走日時が未確認、または発走済みのため適用しません。');
 if(Date.parse(file.analyzedAt)>now||Date.parse(file.analyzedAt)>=start||file.sourceRaces.some(s=>s.date>=race.raceDate))return out('予想時点より後の分析・結果が含まれるため適用しません。');
 if(race.raceDate<file.validFrom||race.raceDate>file.validTo)return out('このレースは分析ファイルの適用期間外です。');
 const going=g=>g==='稍'?'稍重':g==='不'?'不良':g;
 const rules=file.rules.filter(q=>q.status==='適用可'&&q.track===race.track&&q.surface===race.surface&&Number(race.distance)>=q.minDistance&&Number(race.distance)<=q.maxDistance&&q.goings.includes(going(race.going))&&(!q.course||q.course===race.course)&&(!q.pace||q.pace===race.paceType));
 if(!rules.length)return out('競馬場・芝ダート・距離・馬場などが一致する適用可能な傾向はありません。');
 let matched=0;for(const h of clean){if(h._selectionScore==null||h.mark==='消')continue;const qs=rules.filter(q=>q.selector.type==='horseName'?h.name===q.selector.value:verifiedStyle(h)===q.selector.value);if(!qs.length)continue;h._runningTrendAdj=Math.max(-1,Math.min(1,qs.reduce((n,q)=>n+q.points,0)));h._runningTrendReasons=qs.map(q=>({ruleId:q.id,points:q.points,reason:q.reason,evidenceRaceIds:q.evidenceRaceIds}));h._runningTrendFile={id:file.id,analyzedAt:file.analyzedAt};matched++;}
 return out(matched?`${matched}頭に補正。基本の能力点は維持し、勝ち切り評価へ最大±1点を加減します。補正量の有効性は未検証です。`:'条件は一致しましたが、対象馬・出典のある脚質が一致しないため補正0です。',matched>0);
}
