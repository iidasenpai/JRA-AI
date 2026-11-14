// @ts-nocheck
import {eligibleRace,resultNumbers,predictionHorses} from './integrity';
export function coursePerformance(records, scope='prospective') {
 const groups=new Map();
 for(const r of records){
  if(!eligibleRace(r))continue;
  const prospective=r.predictionSnapshot?.provenance==='prospective';
  if(scope==='prospective'&&!prospective||scope==='legacy'&&prospective)continue;
  if(prospective&&!Array.isArray(r.predictionSnapshot?.horses))continue;
  if(!r.track||!['芝','ダート'].includes(r.surface)||!/^\d{3,4}$/.test(String(r.distance)))continue;
  const key=`${r.track}|${r.surface}|${Number(r.distance)}`, actual=resultNumbers(r), hs=predictionHorses(r);
  const s=groups.get(key)||{key,track:r.track,surface:r.surface,distance:Number(r.distance),races:0,favoriteRaces:0,wins:0,places:0,top5Hits:0};
  s.races++;
  const favorites=hs.filter(h=>h.mark==='◎');
  if(favorites.length===1){s.favoriteRaces++;s.wins+=Number(String(favorites[0].umaban)===actual[0]);s.places+=Number(actual.includes(String(favorites[0].umaban)));}
  const top5=[...hs].filter(h=>Number.isFinite(Number(h._rank))&&Number(h._rank)>0).sort((a,b)=>Number(a._rank)-Number(b._rank)).slice(0,5).map(h=>String(h.umaban));
  s.top5Hits+=Number(actual.every(n=>top5.includes(n)));
  groups.set(key,s);
 }
 return [...groups.values()];
}
export const performanceValue=(s,metric)=>metric==='top5'?{hits:s.top5Hits,n:s.races}:metric==='win'?{hits:s.wins,n:s.favoriteRaces}:{hits:s.places,n:s.favoriteRaces};
export function rankCourses(rows,metric='place',minimum=10){
 return rows.map(s=>{const {hits,n}=performanceValue(s,metric);return {...s,hits,n,rate:n?hits/n:null,reference:n<minimum};}).sort((a,b)=>Number(a.reference)-Number(b.reference)||(b.rate??-1)-(a.rate??-1)||b.n-a.n||a.track.localeCompare(b.track,'ja')||a.surface.localeCompare(b.surface,'ja')||a.distance-b.distance);
}
