// @ts-nocheck
// Reference-only history. None of these fields are consumed by prediction.ts or learning.ts.
const tracks='札幌|函館|福島|新潟|東京|中山|中京|京都|阪神|小倉';
export const normalizedName=s=>String(s||'').normalize('NFKC').replace(/[\s・･]/g,'');
export function directionOf(track,distance,surface) {
  if(track==='新潟'&&Number(distance)===1000&&surface==='芝')return '直線';
  if(['東京','中京','新潟'].includes(track))return '左';
  return new RegExp(`^(?:${tracks})$`).test(track)?'右':'';
}
export function horseIdentity(h,raceDate) {
  if(/^\d{10}$/.test(String(h.horseId||'')))return 'netkeiba:'+h.horseId;
  const m=String(h.sex||'').normalize('NFKC').match(/^(牡|牝|セ|せん)(\d+)$/),year=Number(String(raceDate||'').slice(0,4));
  // Male/gelding changes do not change identity. Unknown sex/birth year is deliberately unlinked.
  return normalizedName(h.name)&&m&&year>=2000&&Number(m[2])>=2 ? `name-birth:${normalizedName(h.name)}|${year-Number(m[2])}|${m[1]==='牝'?'female':'male'}`:'';
}
const dateOf=(month,day,before)=>{
  let year=Number(before.slice(0,4)),date=`${year}-${month}-${day}`;
  if(date>=before)date=`${--year}-${month}-${day}`;
  const time=Date.parse(date+'T00:00:00Z');
  return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===date?date:'';
};
export function parseHorseHistory(detailText,horse,race,knownAt) {
  const t=String(detailText||'').replace(/\r/g,'').replace(/\u00a0/g,' ');
  const marker=horse.name+'のデータベース',start=t.indexOf(marker);if(start<0)return [];
  const end=t.indexOf('のデータベース',start+marker.length),block=t.slice(start,end<0?t.length:end);
  const header=new RegExp(`(?:^|\\n)(\\d{2})/(\\d{2})[ \\t]+(${tracks})[ \\t]+(\\d{1,2})R(?:\\n|$)`,'g');
  const heads=[...block.matchAll(header)],out=[];
  for(let i=0;i<Math.min(5,heads.length);i++){
    const m=heads[i],body=block.slice(m.index+m[0].length,i+1<heads.length?heads[i+1].index:block.length).split(/\n全場/)[0];
    const route=body.match(/(?:^|\n)(芝|ダ(?:ート)?)(\d{3,4})\s*\n(左|右|直線)[^\n]*\n(良|稍重|稍|重|不良|不)\s*(?:\n|$)/);
    const placing=body.match(/(?:^|\n)(\d{1,2}|取消|除外|中止|失格)\s*\n(\d{1,2})頭/),date=dateOf(m[1],m[2],race.raceDate);
    if(!route||!placing||!date||date>=race.raceDate)continue;
    const surface=route[1]==='芝'?'芝':'ダート',finish=/^\d+$/.test(placing[1])?Number(placing[1]):null;
    if(finish!==null&&(finish<1||finish>Number(placing[2])))continue;
    const pass=body.match(/\n((?:[-出不\d]+[ \t]*){2,})\n後\s*\n(\d{2}\.\d)/);
    const positions=pass?pass[1].replace(/[出不-]/g,' ').trim().split(/\s+/).map(Number).filter(n=>n>=1&&n<=Number(placing[2])):[];
    const pace=body.match(/(?:^|\n)(S|M|H)(?:\n|$)/)?.[1]||'';
    out.push({date,track:m[3],raceNumber:m[4],surface,distance:Number(route[2]),turn:route[3],going:route[4]==='稍'?'稍重':route[4]==='不'?'不良':route[4],finish,outcomeKnown:finish!==null||['中止','失格'].includes(placing[1]),entryStatus:finish===null?placing[1]:'',fieldSize:Number(placing[2]),positions,agari:pass?Number(pass[2]):null,pace,knownAt,source:'詳細出馬表',identity:horseIdentity(horse,race.raceDate)});
  }
  return out;
}
export function enrichSourceHistory(bundle) {
  const race=bundle.race;
  if(!bundle.sourceDetailText||!race?.raceDate)return bundle;
  return {...bundle,race:{...race,horses:race.horses.map(h=>{
    const runs=parseHorseHistory(bundle.sourceDetailText,h,race,bundle.acquiredAt);
    return {...h,...(runs.length?{historicalRuns:runs,historyIngestionVersion:1}:{})};
  })}};
}
export function buildHorseArchive(records) {
  const archive=new Map();
  for(const r of records){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(r.raceDate||'')||r.integrity?.quarantined)continue;
    for(const h of r.horses||[]){
      const key=horseIdentity(h,r.raceDate);if(!key)continue;
      const runs=archive.get(key)||[];
      // Preserve available prior runs even when this saved race has not yet completed.
      for(const run of (Array.isArray(h.historicalRuns)?h.historicalRuns:[]))if(run&&run.date<r.raceDate&&run.knownAt)runs.push({...run,identity:key});
      if(r.status==='completed'){
        const order=String(r.resultOrder||'').split('-'),f=Number(h.finish),finish=Number.isInteger(f)&&f>=1&&f<=18?f:order.includes(String(h.umaban))?order.indexOf(String(h.umaban))+1:null;
        const stamps=[r.resultImport?.confirmedAt||r.completedAt,r.resultContext?.observedAt,...(r.resultImportHistory||[]).map(v=>v.correctedAt)].filter(v=>Number.isFinite(Date.parse(v)));const knownAt=stamps.length?new Date(Math.max(...stamps.map(Date.parse))).toISOString():'';
        if(knownAt){const result=r.resultContext,detail=(Array.isArray(result?.horses)?result.horses:[]).find(v=>String(v.umaban)===String(h.umaban));
          runs.push({date:r.raceDate,track:r.track,raceNumber:String(r.raceNumber||''),surface:r.surface,distance:Number(r.distance),turn:directionOf(r.track,r.distance,r.surface),going:result?.going||'',finish,outcomeKnown:finish!==null||order.length===3&&!['取消','除外'].includes(String(h.finish))&&h.mark!=='消',fieldSize:r.horses.length,positions:detail?.positions||[],route:detail?.route||'',agari:detail?.agari??null,pace:result?.pace||'',knownAt,source:'保存済み確定結果',identity:key});
        }
      }
      archive.set(key,runs);
    }
  }
  return archive;
}
export function mergeArchiveHistory(records,bundles) {
  const event=r=>`${r.raceDate}|${r.track}|${Number(r.raceNumber)}`;
  const sources=new Map(bundles.map(b=>[event(b.race),b.race]));let changed=false;
  const next=records.map(r=>{
    const source=sources.get(event(r));if(!source)return r;let touched=false;
    const horses=(r.horses||[]).map(h=>{
      const match=source.horses.find(v=>String(v.umaban)===String(h.umaban)&&normalizedName(v.name)===normalizedName(h.name));
      if(!match||!Array.isArray(match.historicalRuns)||!match.historicalRuns.length)return h;
      const existing=Array.isArray(h.historicalRuns)?h.historicalRuns:[],merged=new Map(existing.map(run=>[`${run.date}|${run.track}|${run.raceNumber}`,run]));
      for(const run of match.historicalRuns)if(run.date<r.raceDate&&run.knownAt)merged.set(`${run.date}|${run.track}|${run.raceNumber}`,run);
      const runs=[...merged.values()].sort((a,b)=>b.date.localeCompare(a.date)||String(a.raceNumber).localeCompare(String(b.raceNumber)));
      if(JSON.stringify(existing)===JSON.stringify(runs))return h;
      touched=true;return {...h,historicalRuns:runs,historyIngestionVersion:1};
    });
    if(!touched)return r;changed=true;return {...r,horses};
  });
  return changed?next:records;
}
function eligibleRuns(h,race,archive,asOf) {
  const key=horseIdentity(h,race.raceDate);if(!key)return [];
  const map=new Map();
  for(const run of [...(archive.get(key)||[]),...(Array.isArray(h.historicalRuns)?h.historicalRuns:[])]){
    if(!run||typeof run!=='object')continue;
    if(run.identity&&run.identity!==key)continue;
    if(!run.date||run.date>=race.raceDate||!run.knownAt||!Number.isFinite(Date.parse(run.knownAt))||Date.parse(run.knownAt)>asOf||!['芝','ダート'].includes(run.surface))continue;
    const id=`${run.date}|${run.track}|${run.raceNumber}`;
    const previous=map.get(id);
    // Richer observations fill missing fields; knownAt stays the later timestamp.
    if(!previous)map.set(id,{...run});else{
      const merged={...previous};for(const [k,v]of Object.entries(run))if(v!==null&&v!==''&&(!Array.isArray(v)||v.length))merged[k]=v;
      merged.knownAt=new Date(Math.max(Date.parse(previous.knownAt),Date.parse(run.knownAt))).toISOString();map.set(id,merged);
    }
  }
  return [...map.values()].sort((a,b)=>b.date.localeCompare(a.date));
}
const tally=rows=>({runs:rows.filter(r=>r.outcomeKnown||r.finish!==null&&r.finish>=1).length,wins:rows.filter(r=>r.finish===1).length,places:rows.filter(r=>r.finish!==null&&r.finish>=1&&r.finish<=3).length});
export function profileForHorse(h,race,archive,asOf=Date.now()) {
  const runs=eligibleRuns(h,race,archive,asOf),sameSurface=runs.filter(r=>r.surface===race.surface),turn=directionOf(race.track,race.distance,race.surface);
  const groups={turn:sameSurface.filter(r=>r.turn===turn),course:sameSurface.filter(r=>r.track===race.track),distance:sameSurface.filter(r=>Math.abs(r.distance-Number(race.distance))<=200),going:sameSurface.filter(r=>race.going&&r.going===race.going)};
  const all=tally(sameSurface),summary=Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,tally(v)]));
  let adjustment=0,used=0;
  if(all.runs>=5)for(const key of ['turn','going']){const a=summary[key];if(a.runs>=3){adjustment+=(a.places/a.runs-all.places/all.runs)*a.runs/(a.runs+6)*2;used++;}}
  return {identity:horseIdentity(h,race.raceDate),identityMethod:/^netkeiba:/.test(horseIdentity(h,race.raceDate))?'馬ID':'馬名・推定生年・性別の一致',direction:turn,totalRuns:runs.length,all,...summary,adjustment:Math.max(-1,Math.min(1,used?adjustment/used:0)),latest:runs.slice(0,5),note:runs.length?'少数実績は適性を断定しません。馬場不明の過去結果は馬場別集計に含めません。':'照合できる日付付き実績がありません'};
}
