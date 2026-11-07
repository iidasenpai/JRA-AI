// @ts-nocheck
// Temporary source adapter. Prediction weights and the bookmaker parser are unchanged.
const key = s => String(s || '').normalize('NFKC').replace(/[\s・･]/g, '');
const textLines = text => String(text || '').replace(/\r/g, '').split('\n').map(s => s.trim()).filter(Boolean);
export const NET_TRAINING_POINTS = {S:92,A:82,B:70,C:56,D:40};
const matchHorse = (horses, number, name) => {
  const h = horses.find(h => String(h.umaban) === String(number));
  if (!h || key(h.name) !== key(name)) throw Error(`代用データの馬番・馬名が不一致: ${number} ${name}`);
  return h;
};
export function parseNetkeibaTraining(text, horses) {
  const lines = textLines(text), heads=[];
  // Both copied table rows and DOM innerText with a separate number are supported.
  for(let i=0;i<lines.length;i++) {
    let m=lines[i].match(/^(\d{1,2})\s+(.+?)\s+前走(?:調教映像)?$/);
    if(m) heads.push({i,end:i,number:m[1],name:m[2]});
    else if(/^\d{1,2}$/.test(lines[i]) && (m=lines[i+1]?.match(/^(.+?)\s+前走(?:調教映像)?$/))) heads.push({i,end:i+1,number:lines[i],name:m[1]});
  }
  if(!heads.length) throw Error('netkeiba調教の馬番・馬名を読み取れません');
  const out=horses.map(h=>({...h})),seen=new Set();
  heads.forEach((head,i)=>{
    const h=matchHorse(out,head.number,head.name);
    if(seen.has(head.number)) throw Error('調教の馬番が重複しています');
    seen.add(head.number);
    const body=lines.slice(head.end+1,heads[i+1]?.i ?? lines.length);
    const dateIndex=body.findIndex(s=>/^\d{2,4}\/\d{2}\/\d{2}\(/.test(s));
    const rating=dateIndex<0?null:body.slice(dateIndex,dateIndex+2).join(' ').match(/([^\s]+?)([SABCD])(?:\s|$)/);
    if(!rating) throw Error(`馬番${h.umaban}の調教評価を取得できません`);
    h.training=rating[2];h.trainingScore=String(NET_TRAINING_POINTS[rating[2]]);
    h.trainingNote=[...body.slice(0,dateIndex),rating[1]+rating[2]].join(' ');
    h.trainingRaw=body.join('\n');h.trainingSource='netkeiba';h.trainingSourceGrade=rating[2];
    h.trainingSourceStatus='substitute';
  });
  return {horses:out,count:seen.size};
}

// Canonical comment blocks: number + horse name, speaker + publisher mark, Q line, answer.
// Publisher marks are metadata, never the user's prediction marks.
export function parseNetkeibaComments(text, horses) {
  const lines=textLines(text),heads=[];
  for(let i=0;i<lines.length;i++) {
    let m=lines[i].match(/^(\d{1,2})\s+(.+)$/);
    if(m && /^[ァ-ヶー・･]+$/.test(m[2])) heads.push({i,end:i,number:m[1],name:m[2]});
    else if(/^\d{1,2}$/.test(lines[i]) && /^[ァ-ヶー・･]+$/.test(lines[i+1]||'')) heads.push({i,end:i+1,number:lines[i],name:lines[i+1]});
  }
  if(!heads.length && String(text||'').trim()) throw Error('netkeibaコメントの馬番・馬名を読み取れません。未取得としては扱いません');
  const out=horses.map(h=>({...h})),seen=new Set();
  heads.forEach((head,i)=>{
    const h=matchHorse(out,head.number,head.name);
    if(seen.has(head.number)) throw Error('コメントの馬番が重複しています');
    const body=lines.slice(head.end+1,heads[i+1]?.i ?? lines.length);
    const stop=body.findIndex(s=>/^(提供\s*[:：]|コメント分析)/.test(s));
    if(stop>=0)body.splice(stop);
    const q=body.findIndex(s=>/^Q(?:\s|$)/.test(s));
    if(q<1)throw Error(`馬番${h.umaban}のコメント形式が不明`);
    const speaker=body.slice(0,q).join(' ').replace(/[◎○◯▲△×]/g,'').trim();
    const answer=body.slice(q+1).join(' ').trim();
    if(!speaker||!answer)throw Error(`馬番${h.umaban}のコメント本文が不足`);
    h.comment=`${h.name}【${speaker}】${answer}`;
    h.commentRaw=body.join('\n');h.commentSource='netkeiba';h.commentSourceStatus='substitute';
    h.commentSourceMark=body.slice(0,q).join(' ').match(/[◎○◯▲△×]/)?.[0]||'';
    seen.add(head.number);
  });
  return {horses:out,count:seen.size};
}

export function fallbackSourceLabel(horses) {
  const training=horses.filter(h=>h.trainingSource==='netkeiba').length;
  const comments=horses.filter(h=>h.commentSource==='netkeiba'&&h.comment).length;
  const missing=horses.filter(h=>h.commentSourceStatus==='unavailable').length;
  return training||comments||missing ? `一時代用：netkeiba調教 ${training}頭・コメント ${comments}頭／コメント未取得 ${missing}頭。掲載評価を既存換算で使用しています。` : '';
}
