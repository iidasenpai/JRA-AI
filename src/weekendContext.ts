// @ts-nocheck
// Only explicit observations from result files. Frame number is NEVER a proxy for path.
const validTime=v=>typeof v==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
const values={weather:['晴','曇','小雨','雨','雪'],going:['良','稍重','重','不良'],pace:['S','M','H'],route:['内','中','外','混在'],move:['捲り','直線差し','先行粘り','その他']};
export function readResultContext(result,acquiredAt) {
  const v=result.resultContext;if(v==null)return null;
  if(v.version!==1||!validTime(v.observedAt)||Date.parse(v.observedAt)>Date.parse(acquiredAt)||Date.parse(v.observedAt)<Date.parse(result.raceDate+'T00:00:00+09:00'))throw Error('展開資料の取得日時が不正です');
  let source;try{source=new URL(v.sourceUrl);}catch{throw Error('展開資料の取得元が不正です');}
  if(source.protocol!=='https:')throw Error('展開資料にはHTTPSの取得元が必要です');
  for(const k of ['weather','going','pace'])if(v[k]!=null&&v[k]!==''&&!values[k].includes(v[k]))throw Error(`展開資料の${k}が不正です`);
  if(v.laps!=null&&(!Array.isArray(v.laps)||v.laps.length>25||v.laps.some(n=>!Number.isFinite(n)||n<=0||n>60)))throw Error('ラップが不正です');
  const roster=new Set(result.horses.map(h=>String(h.umaban))),seen=new Set(),horses=[];
  for(const h of v.horses||[]){
    const u=String(h.umaban);if(!roster.has(u)||seen.has(u))throw Error('展開資料の馬番が不正・重複しています');seen.add(u);
    if(h.positions!=null&&(!Array.isArray(h.positions)||h.positions.length>4||h.positions.some(n=>!Number.isInteger(n)||n<1||n>result.horses.length)))throw Error('通過順が不正です');
    if(h.route&&!values.route.includes(h.route)||h.move&&!values.move.includes(h.move)||h.agari!=null&&(!Number.isFinite(h.agari)||h.agari<20||h.agari>90))throw Error('進路・動き・上がりが不正です');
    if((h.route||h.move)&&(!validTime(h.pathObservedAt)||Date.parse(h.pathObservedAt)>Date.parse(v.observedAt)||Date.parse(h.pathObservedAt)<Date.parse(result.raceDate+'T00:00:00+09:00')||!/^https:\/\//.test(h.pathSourceUrl||'')))throw Error('進路・動きには確認日時と映像等の情報元が必要です');
    horses.push({umaban:u,positions:h.positions||[],agari:h.agari??null,route:h.route||'',move:h.move||'',pathObservedAt:h.pathObservedAt||'',pathSourceUrl:h.pathSourceUrl||''});
  }
  return {version:1,observedAt:v.observedAt,sourceUrl:v.sourceUrl,weather:v.weather||'',going:v.going||'',pace:v.pace||'',laps:v.laps||[],horses};
}
const band=d=>Number(d)<=1400?'短距離':Number(d)>=2200?'長距離':'中距離';
const tally=()=>({runners:0,places:0});
export function saturdayContext(records,race,asOf=Date.now()) {
  const time=Date.parse(race.raceDate+'T00:00:00Z');
  const weekday=Number.isFinite(time)?new Date(time).getUTCDay():-1;
  const offset=weekday===0?1:weekday===1?2:0;
  if(!offset)return {status:'対象外',reason:'同じ週の土曜→日曜・月曜の参考情報だけを使います。翌週への持ち越しはありません。',races:0};
  const saturday=new Date(time-offset*86400000).toISOString().slice(0,10);
  const sourceDates=Array.from({length:offset},(_,i)=>new Date(time-(offset-i)*86400000).toISOString().slice(0,10));
  const windowEnd=new Date(time+(weekday===0?1:0)*86400000).toISOString().slice(0,10);
  const rows=records.filter(r=>r.status==='completed'&&!r.integrity?.quarantined&&sourceDates.includes(r.raceDate)&&r.track===race.track&&r.surface===race.surface&&band(r.distance)===band(race.distance)
    &&Number.isFinite(Date.parse(r.completedAt))&&Date.parse(r.completedAt)<=asOf&&r.resultContext&&Array.isArray(r.resultContext.horses)&&Date.parse(r.resultContext.observedAt)<=asOf);
  const paths={内:tally(),中:tally(),外:tally()},positions={前:tally(),中団:tally(),後:tally()},moves={捲り:tally()};
  const goings=[...new Set(rows.map(r=>r.resultContext.going).filter(Boolean))],weather=[...new Set(rows.map(r=>r.resultContext.weather).filter(Boolean))];
  let countedRaces=0;
  for(const r of rows){
    const order=String(r.resultOrder||'').split('-');if(order.length!==3)continue;countedRaces++;
    for(const h of r.horses||[]){
      if(['取消','除外'].includes(String(h.finish))||h.mark==='消')continue;
      const detail=r.resultContext.horses.find(x=>x.umaban===String(h.umaban));if(!detail)continue;
      const place=order.includes(String(h.umaban)),starters=r.horses.filter(z=>!['取消','除外'].includes(String(z.finish))&&z.mark!=='消').length;
      if(Array.isArray(detail.positions)&&detail.positions.length){const p=detail.positions[0]/Math.max(1,starters),group=p<=1/3?'前':p<=2/3?'中団':'後';positions[group].runners++;positions[group].places+=place;}
      if(paths[detail.route]&&Date.parse(detail.pathObservedAt)<=asOf){paths[detail.route].runners++;paths[detail.route].places+=place;}
      if(detail.move==='捲り'&&Date.parse(detail.pathObservedAt)<=asOf){moves.捲り.runners++;moves.捲り.places+=place;}
    }
  }
  const env=race.environment,currentGoing=env?.going||race.going||'',sameGoing=goings.length===1&&goings[0]===currentGoing;
  const observedTargetDay=env?.status==='observed'&&validTime(env.observedAt)&&Date.parse(env.observedAt)<=asOf&&new Date(Date.parse(env.observedAt)+9*3600000).toISOString().slice(0,10)===race.raceDate;
  const sameWeather=weather.length===1&&env?.weather&&weather[0]===env.weather;
  // Reference correction remains off until measured conditions and adequate observations match.
  const usable=countedRaces>=3&&sameGoing&&observedTargetDay&&sameWeather&&positions.前.runners>=10&&positions.後.runners>=10;
  return {status:countedRaces?'参考':'資料不足',basedOnDate:saturday,basedOnDates:[...new Set(rows.map(r=>r.raceDate))].sort(),sourceDates,windowStart:saturday,windowEnd,validFor:race.raceDate,track:race.track,surface:race.surface,distanceBand:band(race.distance),races:countedRaces,going:goings,weather,positions,paths,moves,usable,
    reason:!countedRaces?'同じ週・競馬場の前日までの確定ラップ・通過順などが未収録です。着順だけから内外差を作りません。':!sameGoing?'参照日と予想対象日の馬場状態が一致・確認できないため補正しません。':!observedTargetDay?'予想対象日当日の馬場・天気の確認待ちです。前日までの傾向を仮説として表示します。':!sameWeather?'天気が変化・未確認のため補正しません。':!usable?'対象レース数・通過順の標本が少ないため補正しません。':'同条件での観測値を小さく参考評価へ反映。能力・人気を調整した因果推定ではありません。',
    expiresAt:new Date(Date.parse(windowEnd+'T00:00:00+09:00')+86400000).toISOString()};
}
export function weekendAdjustment(trend,h,fieldSize) {
  if(!trend.usable)return 0;
  const group=['逃','先'].includes(h.runningStyle)?'前':['差','追'].includes(h.runningStyle)?'後':'';if(!group)return 0;
  const a=trend.positions[group],total=Object.values(trend.positions).reduce((x,v)=>({runners:x.runners+v.runners,places:x.places+v.places}),tally());
  if(!a.runners||!total.runners)return 0;
  return Math.max(-.5,Math.min(.5,(a.places/a.runners-total.places/total.runners)*a.runners/(a.runners+15)));
}
