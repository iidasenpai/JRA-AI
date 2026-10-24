// @ts-nocheck
import { strictNumber } from './integrity';

// A JRA runner's previous starts can include regional meetings.
const tracks='札幌|函館|福島|新潟|東京|中山|中京|京都|阪神|小倉|門別|盛岡|水沢|浦和|船橋|大井|川崎|金沢|笠松|名古屋|園田|姫路|高知|佐賀';
const normalize=value=>(Array.isArray(value)?value.join('\n'):String(value||'')).normalize('NFKC').replace(/\r/g,'').replace(/\u00a0/g,' ');

export function surfaceContextFromHistory(recentSurfaces,currentSurface){
  let surfaceSwitch='',surfaceRunNo=0;
  const current=currentSurface==='芝'?'芝':'ダート',other=current==='芝'?'ダート':'芝';
  if(recentSurfaces[0]===other){surfaceSwitch=`${other}→${current}`;surfaceRunNo=1;}
  else if(recentSurfaces[0]===current){const firstOther=recentSurfaces.indexOf(other);if(firstOther===1||firstOther===2){surfaceSwitch=`${other}→${current}`;surfaceRunNo=firstOther+1;}}
  return {recentSurfaces:[...recentSurfaces],surfaceSwitch,surfaceRunNo,surfaceContextVersion:1};
}

// Read only this horse's past-race rows, never aggregate course stats or predictions.
export function parseSurfaceHistory(block,currentSurface){
  const text=normalize(block).split(/\n\s*(?:全場|重不[芝ダ]|AI展開予測|競馬新聞の見方)/)[0];
  const dateRows=new RegExp(`(?:^|\\n)[ \\t]*(?:(?:20)?\\d{2}/)?\\d{1,2}/\\d{1,2}[ \\t]+(?:${tracks})[^\\n]*`,'g');
  const starts=[...text.matchAll(dateRows)],recentSurfaces=[];
  if(starts.length){
    for(let i=0;i<starts.length&&recentSurfaces.length<5;i++){
      const run=text.slice(starts[i].index,i+1<starts.length?starts[i+1].index:text.length);
      if(/(?:障害|障\s*\d{3,4})/.test(run))continue;
      if(/(?:^|\n)\s*(?:取|取消|除外)\s*(?:\n|$)/.test(run))continue;
      const m=run.match(/(?:^|\n|[ \t])(芝|ダ(?:ート)?)\s*\d{3,4}m?(?=\s|[（(右左直ABCD]|$)/)
        || run.replace(/\s+/g,'').match(new RegExp(`(?:${tracks})(芝|ダ(?:ート)?)\\d{3,4}m?`));
      if(m)recentSurfaces.push(m[1]==='芝'?'芝':'ダート');
    }
  }else{
    // Also support the compact past-race rows used by manual text input.
    const compactRow=new RegExp(`(?:${tracks})(芝|ダ(?:ート)?)\\d{3,4}m?`);
    const aggregate=new RegExp(`^(?:${tracks})(?:芝|ダ(?:ート)?)\\d{3,4}m?\\s+\\d+\\s+\\d+\\s+\\d+\\s+\\d+(?:\\s|$)`);
    for(const line of text.split('\n')){
      if(aggregate.test(line.trim())||/障害|障\d/.test(line))continue;
      const m=line.replace(/\s+/g,'').match(compactRow);
      if(m)recentSurfaces.push(m[1]==='芝'?'芝':'ダート');
      if(recentSurfaces.length===5)break;
    }
  }
  return surfaceContextFromHistory(recentSurfaces,currentSurface);
}

export function evaluationLabel(h){
  if(h.mark==='消'||['取消','除外'].includes(h.entryStatus))return '除外';
  if(!Number.isFinite(h._rank)||h._rank<1)return '評価保留';
  return h._evaluationStatus==='指数評価'?'指数評価':'補助評価';
}

export function heldReason(h){
  const core=['best','avg5','dist','course'].some(k=>strictNumber(h[k])!==null);
  const recent=['r1','r2','r3'].some(k=>strictNumber(h[k])!==null);
  return !core?(recent?'今回条件の主要指数なし（近走指数あり）':'主要指数なし'):'順位を算出できる材料が不足';
}

export function evaluationCoverage(horses){
  const active=horses.filter(h=>evaluationLabel(h)!=='除外');
  const held=active.filter(h=>evaluationLabel(h)==='評価保留');
  const auxiliary=active.filter(h=>evaluationLabel(h)==='補助評価');
  const indexed=active.length-held.length-auxiliary.length;
  return {total:active.length,indexed,auxiliary:auxiliary.length,compared:indexed+auxiliary.length,held,
    missingHistory:active.filter(h=>h.detailImported&&h.surfaceContextVersion!==1&&!Array.isArray(h.recentSurfaces)).length};
}
