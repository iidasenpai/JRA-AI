// @ts-nocheck
import { eventKey, resultNumbers } from './integrity';
const tracks=['札幌','函館','福島','新潟','東京','中山','中京','京都','阪神','小倉'];
const nameKey=s=>String(s||'').normalize('NFKC').replace(/[\s・･]/g,'');
const number=s=>/^(?:[1-9]|1[0-8])$/.test(String(s));
const timestamp=s=>typeof s==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/.test(s)&&Number.isFinite(Date.parse(s));
const payoutSizes={'単勝':1,'複勝':1,'枠連':2,'馬連':2,'ワイド':2,'馬単':2,'三連複':3,'三連単':3};
const orderless=new Set(['枠連','馬連','ワイド','三連複']);
const canonicalPayouts=rows=>JSON.stringify(rows.map(p=>({type:p.type,amount:p.amount,unit:p.unit,combination:orderless.has(p.type)?p.combination.map(String).sort((a,b)=>Number(a)-Number(b)):p.combination.map(String)})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
export function validateResultCollection(data, now=Date.now()){
  if(data?.type!=='jra-ai-result-collection'||data.version!==1||!timestamp(data.acquiredAt)||Date.parse(data.acquiredAt)>now||!Array.isArray(data.results)||!data.results.length||data.results.length>72)throw Error('対応する結果ファイル（1〜72レース）を指定してください');
  const keys=new Set();
  for(const [i,r]of data.results.entries()){
    const fail=msg=>{throw Error(`${i+1}レース目: ${msg}`);};
    if(!r||!/^\d{4}-\d{2}-\d{2}$/.test(r.raceDate)||!tracks.includes(r.track)||!/^([1-9]|1[0-2])$/.test(String(r.raceNumber)))fail('開催情報が不正です');
    const day=Date.parse(r.raceDate+'T00:00:00+09:00');
    if(!Number.isFinite(day)||new Date(day+9*3600000).toISOString().slice(0,10)!==r.raceDate)fail('開催日が不正です');
    if(r.confirmed!==true||r.deadHeat===true)fail('確定前・同着の結果はこの形式では取り込めません');
    if(!timestamp(r.confirmedAt)||Date.parse(r.confirmedAt)<day||Date.parse(r.confirmedAt)>Date.parse(data.acquiredAt))fail('結果確定日時が不正です');
    if(!['芝','ダート'].includes(r.surface)||!/^\d{3,4}$/.test(String(r.distance)))fail('芝ダ・距離が不正です');
    const key=eventKey(r);if(keys.has(key))fail('同じレースが重複しています');keys.add(key);
    const url=new URL(r.sourceUrl);
    const resultPage=url.pathname==='/race/result.html'||(url.pathname==='/'&&url.searchParams.getAll('pid').length===1&&url.searchParams.get('pid')==='race_result');
    if(url.protocol!=='https:'||url.hostname!=='race.sp.netkeiba.com'||url.port||url.username||url.password||!resultPage||url.searchParams.getAll('race_id').length!==1||!/^\d{12}$/.test(r.netkeibaRaceId)||url.searchParams.get('race_id')!==r.netkeibaRaceId||Number(r.netkeibaRaceId.slice(-2))!==Number(r.raceNumber)||r.netkeibaRaceId.slice(0,4)!==r.raceDate.slice(0,4)||tracks[Number(r.netkeibaRaceId.slice(4,6))-1]!==r.track)fail('結果ページのレースIDが一致しません');
    if(!Array.isArray(r.horses)||r.horses.length<3||r.horses.length>18)fail('全頭の結果が必要です');
    const seen=new Set(),names=new Set(),ranks=new Set();
    for(const h of r.horses){
      if(!number(h.umaban)||!nameKey(h.name)||seen.has(String(h.umaban))||names.has(nameKey(h.name)))fail('馬番・馬名の不足または重複があります');
      seen.add(String(h.umaban));names.add(nameKey(h.name));
      if(number(h.finish)){
        if(Number(h.finish)>r.horses.length||ranks.has(Number(h.finish)))fail('着順に重複・範囲異常があります（同着は手動で確認してください）');
        ranks.add(Number(h.finish));
      }else if(!['取消','除外','中止','失格'].includes(h.finish))fail('各馬の着順または取消等の状態が必要です');
    }
    if(![1,2,3].every(n=>ranks.has(n)))fail('上位3頭が確定していません');
    if(!Array.isArray(r.payouts)||!['confirmed','unavailable'].includes(r.payoutStatus)||(r.payoutStatus==='unavailable'&&r.payouts.length)||(r.payoutStatus==='confirmed'&&!r.payouts.length))fail('払戻の取得状態が不正です');
    const payoutKeys=new Set(),top3=r.horses.filter(h=>Number(h.finish)<=3).sort((a,b)=>Number(a.finish)-Number(b.finish)).map(h=>String(h.umaban));
    for(const p of r.payouts){
      if(!payoutSizes[p.type]||!Array.isArray(p.combination)||p.combination.length!==payoutSizes[p.type]||!Number.isSafeInteger(p.amount)||p.amount<0||p.amount%10!==0||p.unit!==100)fail('払戻は券種・組合せ・100円あたりの確定金額を指定してください');
      const combo=p.combination.map(String);
      if(combo.some(n=>!number(n)||!seen.has(n))&&p.type!=='枠連')fail('払戻の馬番が存在しません');
      if(p.type==='枠連'){if(combo.some(n=>!/^([1-8])$/.test(n)))fail('払戻の枠番が不正です');}
      else {
        if(new Set(combo).size!==combo.length)fail('払戻の組合せが重複しています');
        const eq=(a,b)=>a.join('-')===b.join('-'),sort=a=>[...a].sort((a,b)=>Number(a)-Number(b));
        if(p.type==='単勝'&&!eq(combo,top3.slice(0,1))||p.type==='複勝'&&combo.some(n=>!top3.includes(n))||p.type==='馬単'&&!eq(combo,top3.slice(0,2))||p.type==='馬連'&&!eq(sort(combo),sort(top3.slice(0,2)))||p.type==='三連単'&&!eq(combo,top3)||p.type==='三連複'&&!eq(sort(combo),sort(top3))||p.type==='ワイド'&&combo.some(n=>!top3.includes(n)))fail('払戻と上位着順が一致しません');
      }
      const pkey=p.type+'|'+(orderless.has(p.type)?[...combo].sort((a,b)=>Number(a)-Number(b)):combo).join('-');
      if(payoutKeys.has(pkey))fail('払戻の券種・組合せが重複しています');payoutKeys.add(pkey);
    }
  }
  return data;
}
export function planResultImport(records,data,now=Date.now()){
  validateResultCollection(data,now);
  const next=[...records],report=[];
  for(const result of data.results){
    const label=`${result.raceDate} ${result.track}${result.raceNumber}R`;
    const matches=records.filter(r=>eventKey(r)===eventKey(result));
    const skip=reason=>report.push({label,status:'skip',reason});
    if(matches.length!==1){skip(matches.length?'保存レースが重複しています':'一致する保存レースがありません');continue;}
    const race=matches[0];
    if(race.integrity?.quarantined){skip('整合性の確認が必要な保存レースです');continue;}
    if(race.surface!==result.surface||String(race.distance)!==String(result.distance)){skip('芝ダ・距離が保存内容と一致しません');continue;}
    const roster=hs=>hs.map(h=>String(h.umaban)+':'+nameKey(h.name)).sort().join('|');
    if(roster(race.horses||[])!==roster(result.horses)){skip('出走馬の馬番・馬名が保存内容と一致しません');continue;}
    if(race.scheduledStart&&(!Number.isFinite(Date.parse(race.scheduledStart))||Date.parse(race.scheduledStart)>Date.parse(result.confirmedAt))){skip('保存した発走日時より前の結果です');continue;}
    if(Date.parse(race.predictionSnapshot?.capturedAt||race.savedAt)>Date.parse(result.confirmedAt)){skip('予想の保存日時より前に確定した結果です');continue;}
    const sourceIds=new Set((race.horses||[]).map(h=>h._sourceBundle?.sourceIds?.netkeiba).filter(Boolean));
    if(sourceIds.size&&([...sourceIds].some(id=>id!==result.netkeibaRaceId))){skip('保存した取得元レースIDと一致しません');continue;}
    const order=result.horses.filter(h=>Number(h.finish)<=3).sort((a,b)=>Number(a.finish)-Number(b.finish)).map(h=>String(h.umaban));
    const old=resultNumbers(race);
    if(race.status==='completed'&&old.join('-')!==order.join('-')){skip('保存済み結果と異なります。「結果を修正」で確認してください');continue;}
    const existingPayouts=race.resultPayouts||[];
    if(existingPayouts.length&&result.payouts.length&&canonicalPayouts(existingPayouts)!==canonicalPayouts(result.payouts)){skip('保存済みの払戻と異なります');continue;}
    if(race.resultImport?.fullResults){
      const before=race.horses.map(h=>`${h.umaban}:${h.finish}`).sort().join('|');
      const after=result.horses.map(h=>`${h.umaban}:${h.finish}`).sort().join('|');
      if(before!==after){skip('保存済みの全頭着順と異なります');continue;}
    }
    const hasNewPayouts=!existingPayouts.length&&result.payouts.length;
    if(race.status==='completed'&&race.resultImport?.fullResults&&!hasNewPayouts){report.push({label,status:'same',reason:'反映済み（再学習を追加しません）'});continue;}
    const updated={...race,status:'completed',completedAt:race.completedAt||result.confirmedAt,resultOrder:order.join('-'),
      learningEnabledAtResult:race.learningEnabledAtResult??(race.learningOn!==false),
      horses:race.horses.map(h=>({...h,finish:String(result.horses.find(x=>String(x.umaban)===String(h.umaban)).finish)})),
      resultPayouts:existingPayouts.length?existingPayouts:result.payouts.map(p=>({...p,combination:p.combination.map(String)})),
      resultImport:{sourceUrl:result.sourceUrl,netkeibaRaceId:result.netkeibaRaceId,confirmedAt:result.confirmedAt,acquiredAt:data.acquiredAt,fullResults:true,payoutStatus:existingPayouts.length?'confirmed':result.payoutStatus}};
    next[records.indexOf(race)]=updated;
    report.push({label,status:'update',reason:`${order.join('-')} ／ ${updated.resultPayouts.length?`払戻${updated.resultPayouts.length}件`:'払戻未取得'}`});
  }
  return {records:next,report,updated:report.filter(r=>r.status==='update').length};
}
