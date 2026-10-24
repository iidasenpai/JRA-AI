// @ts-nocheck
import { strictNumber } from './integrity';
import { parseSurfaceHistory, surfaceContextFromHistory } from './raceContext';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const normalize=s=>String(s||'').replace(/\r/g,'').replace(/\u00a0/g,' ');
const indexValue=s=>{const t=String(s||'').trim();if(/^(?:-|--|未)$/.test(t))return '';const n=strictNumber(t);if(n===null)throw Error(`指数列が数値ではありません: ${t}`);return String(n);};
const nameKey=s=>String(s||'').replace(/[\s・･]/g,'');
const tracks='札幌|函館|福島|新潟|東京|中山|中京|京都|阪神|小倉';
const fit=(a,b,c,d)=>{const total=a+b+c+d;return total?String(Math.round(clamp(50+((a+b*.66+c*.4)/total-.25)*42*total/(total+5),35,72))):'50';};
const scoreTraining=(block) => {
      const latest = block.lines.slice(-7).join(" ");
      const all = `${block.summary} ${latest}`;
      let score = 0;

      if (/[↗↑]/.test(block.arrow)) score += 2;
      if (/[↘↓]/.test(block.arrow)) score -= 2;

      const strongPositive = [
        /抜群/, /絶好/, /好気配/, /力強い/, /鋭い/, /迫力/, /文句なし/, /申し分なし/,
        /伸び良好/, /動き良好/, /時計優秀/, /好時計/
      ];
      const positive = [
        /良化/, /上向き/, /順調/, /動く/, /軽快/, /余力十分/, /反応良/, /脚捌き良/,
        /仕上がり良/, /気配上々/, /馬なり余力/
      ];
      const negative = [
        /モタれ/, /前向きさに欠け/, /上昇味薄い/, /物足りない/, /重い/, /反応鈍/,
        /伸び欠く/, /気配平凡/, /一息/, /遅れ/, /バテ/, /低調/
      ];
      const strongNegative = [
        /大きく遅れ/, /一杯.*遅れ/, /動き重い/, /精彩欠く/, /状態ひと息/, /不振/
      ];

      for (const re of strongPositive) if (re.test(all)) score += 3;
      for (const re of positive) if (re.test(all)) score += 1;
      for (const re of negative) if (re.test(all)) score -= 2;
      for (const re of strongNegative) if (re.test(all)) score -= 2;

      // 「連闘のため中間軽め」「攻め軽め」は悪化扱いにせず、評価の上振れだけ抑える。
      if (/連闘.*中間軽め|攻め軽め/.test(block.summary)) score = Math.min(score, 1);

      // 時計・追い方・併せ内容を100点へ反映
      const times = [...all.matchAll(/(?:^|\s)(1[01]\.\d|12\.\d|13\.\d|14\.\d)(?=\s|$|［)/g)].map((m)=>Number(m[1]));
      const lastF = times.length ? Math.min(...times) : null;
      if (lastF !== null) {
        if (lastF <= 11.3) score += 4;
        else if (lastF <= 11.8) score += 3;
        else if (lastF <= 12.3) score += 2;
        else if (lastF >= 13.5) score -= 2;
      }
      if (/先着/.test(all)) score += 2;
      if (/同入/.test(all)) score += 1;
      if (/遅れ/.test(all)) score -= 3;
      if (/馬なり余力/.test(all)) score += 1;
      if (/一杯に追う|叩き一杯/.test(all) && lastF !== null && lastF >= 13.0) score -= 2;

      const numeric = Math.round(clamp(70 + score * 4, 30, 97));
      const grade = numeric >= 88 ? "S" : numeric >= 78 ? "A" : numeric >= 65 ? "B" : numeric >= 50 ? "C" : "D";
      return { grade, numeric };
    };
const detectClass=s=>/未勝利/.test(s)?'未勝利':/新馬/.test(s)?'新馬':/[1１]勝/.test(s)?'1勝':/[2２]勝/.test(s)?'2勝':/[3３]勝/.test(s)?'3勝':/G(?:III|3)/i.test(s)?'G3':/G(?:II|2)/i.test(s)?'G2':/G(?:I|1)/i.test(s)?'G1':/リステッド|\(L\)| L(?:\s|$)/.test(s)?'L':/オープン/.test(s)?'OP':'';
export function parseCollectedPages(pages, acquiredAt=new Date().toISOString()){
  const required=['race','details','standard','recent','training','comments'];
  for(const k of required)if(!pages[k]?.text||!pages[k]?.url)throw Error(`未取得: ${k}`);
  const urls={};
  for(const k of required){urls[k]=new URL(pages[k].url);if(urls[k].protocol!=='https:')throw Error('取得元はHTTPSのみ');}
  for(const k of ['race','details','standard','recent'])if(urls[k].hostname!=='race.sp.netkeiba.com')throw Error('netkeibaの取得元が不一致');
  for(const k of ['training','comments'])if(urls[k].hostname!=='s.keibabook.co.jp')throw Error('競馬ブックの取得元が不一致');
  const raceId=urls.race.searchParams.get('race_id');
  if(!/^\d{12}$/.test(raceId||''))throw Error('netkeibaのレースIDが不正');
  for(const k of ['details','standard','recent'])if(urls[k].searchParams.get('race_id')!==raceId)throw Error(`${k}が別のレース`);
  const bookId=urls.training.pathname.match(/\/(\d{12})$/)?.[1];
  if(!bookId||!urls.comments.pathname.endsWith('/'+bookId))throw Error('競馬ブックのレースIDが不一致');
  const book=normalize(pages.training.text),raceText=normalize(pages.race.text);
  const date=book.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日\s+\d+回([^\s\d]+)\d+日目/);
  if(!date)throw Error('競馬ブックの開催日・競馬場が読めません');
  const raceDate=`${date[1]}-${date[2].padStart(2,'0')}-${date[3].padStart(2,'0')}`,track=date[4];
  const netDate=raceText.match(/(?:^|\n)(\d{1,2})\/(\d{1,2})\([^\n]+\)\s*\n([^\n]+)/);
  if(!netDate||Number(netDate[1])!==+date[2]||Number(netDate[2])!==+date[3]||netDate[3].trim()!==track||raceId.slice(0,4)!==date[1])throw Error('両サイトの開催日・競馬場が不一致');
  const expectedNo=String(Number(raceId.slice(-2)));
  const no=book.match(/(?:^|\n)(\d{1,2})R[ \t]+([^\n]+)/),netNo=raceText.match(new RegExp(`(?:^|\\n)(${expectedNo})R[ \\t]*\\n([^\\n]+)`));
  if(!no||!netNo||no[1]!==netNo[1]||no[1]!==String(Number(raceId.slice(-2)))||no[1]!==String(Number(bookId.slice(-2))))throw Error('レース番号が不一致');
  const route=book.match(/(?:^|\n)(\d{3,4})m\s*\((芝|ダート|ダ)/),time=book.match(/発走時刻\s+(\d{1,2}):(\d{2})/);
  if(!route||!time)throw Error('距離・芝ダ・発走時刻が不明');
  const distance=route[1],surface=route[2]==='芝'?'芝':'ダート';
  if(!new RegExp(`${surface==='芝'?'芝':'ダ(?:ート)?'}${distance}m`).test(raceText))throw Error('両サイトの芝ダ・距離が不一致');
  const standard=normalize(pages.standard.text),rowRe=/(?:^|\n)\s*(\d{1,2})\s*\n\t\t([^\t\n]+)\t([^\n]+)/g;
  const horses=[];
  const noIndices=/新馬戦にはタイム指数はございません/.test(standard)&&/新馬/.test(no[2]);
  for(const m of standard.matchAll(rowRe)){
    const c=m[3].split('\t').map(x=>x.trim());if(c.length===13)c.push('','');if(c.length!==15)throw Error(`馬番${m[1]}の標準指数列数が不正: ${c.length}`);
    const h={id:crypto.randomUUID(),umaban:m[1],mark:'',name:m[2],finish:'',bodyChange:'',training:'',trainingScore:'',trainingNote:'',comment:'',runningStyle:'',styleSource:''};
    for(const [i,k]of ['best','start','oikake','agari','avg5','dist','course','r3','r2','r1'].entries())h[k]=indexValue(c[i]);
    [h.sex,h.weight,h.jockey,h.odds,h.ninki]=c.slice(10);
    if(!/^[牡牝セ]\d+$/.test(h.sex)||strictNumber(h.weight)===null)throw Error(`馬番${h.umaban}の性齢・斤量が不正`);
    horses.push(h);
  }
  const expected=Number(raceText.match(/\s(\d{1,2})頭/)?.[1]);
  if(noIndices){
    const dt=normalize(pages.details.text),hh=[...dt.matchAll(/(?:^|\n)(\d{1,2})\s*\n(?:取消\n)?([^\n]+)のデータベース\n/g)];
    for(let i=0;i<hh.length;i++){
      const m=hh[i],block=dt.slice(m.index,i+1<hh.length?hh[i+1].index:dt.length);
      const meta=block.match(/\n([牡牝セ]\d+) [^\n]+\n([^\n]+)\n-\n[^\d\n]*([\d.]+)/);
      if(!meta)throw Error(`新馬${m[1]}の性齢・騎手・斤量が不明`);
      horses.push({id:crypto.randomUUID(),umaban:m[1],name:m[2],entryStatus:/^\s*\d+\s*\n取消\n/.test(block)?'取消':'',mark:/^\s*\d+\s*\n取消\n/.test(block)?'消':'',finish:'',bodyChange:'',training:'',trainingScore:'',trainingNote:'',comment:'',runningStyle:'',styleSource:'',sex:meta[1],jockey:meta[2],weight:meta[3],odds:'',ninki:'',...Object.fromEntries(['best','start','oikake','agari','avg5','dist','course','r3','r2','r1'].map(k=>[k,'']))});
    }
  }
  if(horses.length!==expected||!expected||new Set(horses.map(h=>h.umaban)).size!==expected)throw Error(`標準指数の頭数不足 ${horses.length}/${expected}`);
  const details=normalize(pages.details.text),heads=[...details.matchAll(/(?:^|\n)(\d{1,2})\s*\n(?:取消\n)?([^\n]+)のデータベース\n/g)];
  if(heads.length!==expected)throw Error(`詳細出馬表の頭数不足 ${heads.length}/${expected}`);
  for(let i=0;i<heads.length;i++){
    const m=heads[i],h=horses.find(h=>h.umaban===m[1]);if(!h||nameKey(h.name)!==nameKey(m[2]))throw Error('詳細の馬番・馬名が不一致');
    const b=details.slice(m.index,i+1<heads.length?heads[i+1].index:details.length);
    const style=b.match(/\n(逃|先|差|追)\n中(\d+)週/);if(style){h.runningStyle=style[1];h.restWeeks=style[2];h.styleSource='詳細出馬表';}
    h.detailImported=true;
    Object.assign(h,parseSurfaceHistory(b,surface));
    for(const [key,prefix]of [['detailDistanceFit',`全場${surface==='芝'?'芝':'ダ'}${distance}m`],['detailCourseFit',`${track}${surface==='芝'?'芝':'ダ'}${distance}m`]]){
      const z=b.match(new RegExp(`(?:^|\\n)${prefix}\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)`));if(z)h[key]=fit(+z[1],+z[2],+z[3],+z[4]);
    }
    // Today's body mass belongs to the header only; never use a previous run's mass.
    const header=b.split(/\n\d{2}\/\d{2}\s/)[0],body=header.match(/(?:^|\n)(\d{3})kg\s*\(([+-]?\d+)\)/);
    if(body){h.bodyWeight=body[1];h.bodyChange=body[2];}
  }
  const recent=normalize(pages.recent.text),recentHeads=[...recent.matchAll(/(?:^|\n)\s*(\d{1,2})\s*\n\t\t([^\t\n]+)\t/g)];
  if(!noIndices&&recentHeads.length!==expected)throw Error('近5走の頭数不足');
  for(let i=0;i<recentHeads.length;i++){
    const m=recentHeads[i],h=horses.find(h=>h.umaban===m[1]);if(!h||nameKey(h.name)!==nameKey(m[2]))throw Error('近5走の馬名不一致');
    const b=recent.slice(m.index,i+1<recentHeads.length?recentHeads[i+1].index:recent.length);
    const average=b.match(/\t((?:[+-]?\d+(?:\.\d+)?\*?)|-)\t((?:[+-]?\d+(?:\.\d+)?\*?)|-)\t((?:[+-]?\d+(?:\.\d+)?\*?)|-)\t((?:[+-]?\d+(?:\.\d+)?\*?)|-)\t([\d.]+)\t(\d{1,2})(?:\n|$)/)
      || b.match(/\t((?:[+-]?\d+(?:\.\d+)?\*?)|-)\t((?:[+-]?\d+(?:\.\d+)?\*?)|-)\t((?:[+-]?\d+(?:\.\d+)?\*?)|-)\t((?:[+-]?\d+(?:\.\d+)?\*?)|-)(?:\n|$)/);
    if(!average)throw Error(`馬番${h.umaban}の近5走集計が不明`);
    h.avgStart=indexValue(average[2]);h.avgChase=indexValue(average[3]);h.avgAgari=indexValue(average[4]);
    h.sourceRecentAverage=indexValue(average[1]);
  }
  const trainingHeads=[...book.matchAll(/^\s*\t(\d{1,2})\t([^\t\n]+)\t([^\t\n]+)\t([→↗↘↑↓])\s*$/gm)];
  if(trainingHeads.length!==expected)throw Error(`調教の頭数不足 ${trainingHeads.length}/${expected}（ログイン切れの可能性）`);
  for(let i=0;i<trainingHeads.length;i++){
    const m=trainingHeads[i],h=horses.find(h=>h.umaban===m[1]);if(!h||nameKey(h.name)!==nameKey(m[2]))throw Error('調教の馬名不一致');
    const b=book.slice(m.index+m[0].length,i+1<trainingHeads.length?trainingHeads[i+1].index:book.length).split('中央競馬Topへ')[0];
    const block={summary:m[3],arrow:m[4],lines:b.split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean)};
    const score=scoreTraining(block);h.training=score.grade;h.trainingScore=String(score.numeric);h.trainingNote=`${m[3]} ${m[4]}`;h.trainingRaw=b.trim();
  }
  const comments=normalize(pages.comments.text).replace(/^([◎○▲△×]?)([^（(\n]+)[（(]([^）)]+)[）)]\s+([^―\n]+)――(.*)$/gm,'$1$2【$4】$3。$5'),commentLines=comments.split('\n').map(x=>x.trim()).filter(x=>/^[◎○▲△×]?[^【\n]+【[^】]+】/.test(x));
  if(commentLines.length!==expected)throw Error(`厩舎コメントの頭数不足 ${commentLines.length}/${expected}（ログイン切れの可能性）`);
  const used=new Set();
  for(const line of commentLines){const name=line.match(/^[◎○▲△×]?([^【]+)【/)?.[1],h=horses.find(h=>nameKey(h.name)===nameKey(name));if(!h||used.has(h.umaban))throw Error('コメントの馬名不一致・重複');h.comment=line;used.add(h.umaban);}
  const commentDate=comments.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日\s+\d+回([^\s\d]+)\d+日目/);
  if(!commentDate||commentDate.slice(1).join('|')!==date.slice(1).join('|'))throw Error('調教とコメントの開催日・場が不一致');
  const pace=raceText.match(/コース情報[^\n]*\nペース\n([SMH])/);if(!pace&&!noIndices)throw Error('AI展開予測のペースを取得できません');
  const race={raceDate,raceNumber:no[1],raceName:no[2].normalize('NFKC'),track,surface,distance,going:book.match(/m\s*\([^\n]+\)[^\n]*?[・ ](良|稍重|重|不良)(?:\s|$)/)?.[1]||'良',raceClass:detectClass(book.slice(book.indexOf(date[0]),book.indexOf('発走時刻')).normalize('NFKC')),scheduledStart:`${raceDate}T${time[1].padStart(2,'0')}:${time[2]}:00+09:00`,paceType:pace?.[1]||'',horses};
  if(!race.raceClass)throw Error('この試作で未対応のクラスです');
  return {type:'jra-ai-source-bundle',version:1,acquiredAt,complete:true,race,sourceIds:{netkeiba:raceId,keibabook:bookId},sources:Object.fromEntries(required.map(k=>[k,{url:pages[k].url,acquiredAt:pages[k].acquiredAt||acquiredAt,count:expected}])),missing:[],notes:[...(noIndices?['新馬戦：タイム指数は提供されていません。AI展開のペースが未提供の場合も空欄です。']:[]),'馬体重は未発表なら空欄。近走の馬体重で代用しません。','取得時点の入力資料です。予想の保存は別途必要です。']};
}
export function validateSourceBundle(bundle){
  if(bundle?.type!=='jra-ai-source-bundle'||bundle.version!==1||bundle.complete!==true||!Array.isArray(bundle.missing)||bundle.missing.length)throw Error('未完成または未対応の取得データです');
  const r=bundle.race,n=r?.horses?.length,required=['race','details','standard','recent','training','comments'];
  if(!r||!Array.isArray(r.horses)||n<1||n>18||!/^\d{4}-\d{2}-\d{2}$/.test(r.raceDate)||!new RegExp(`^(${tracks})$`).test(r.track)||!/^([1-9]|1[0-2])$/.test(r.raceNumber))throw Error('開催情報が不正です');
  if(!['芝','ダート'].includes(r.surface)||!/^\d{3,4}$/.test(String(r.distance))||!Number.isFinite(Date.parse(r.scheduledStart))||!Number.isFinite(Date.parse(bundle.acquiredAt)))throw Error('芝ダ・距離・日時が不正です');
  for(const k of required){const a=bundle.sources?.[k];if(!a||a.count!==n)throw Error(`${k}の頭数が一致しません`);const u=new URL(a.url);if(u.protocol!=='https:'||!['race.sp.netkeiba.com','s.keibabook.co.jp'].includes(u.hostname))throw Error('取得元が不正です');}
  if(new Set(r.horses.map(h=>String(h.umaban))).size!==n||new Set(r.horses.map(h=>nameKey(h.name))).size!==n)throw Error('馬番・馬名が重複しています');
  for(const h of r.horses){if(!/^(?:[1-9]|1[0-8])$/.test(String(h.umaban))||!h.name||!h.trainingNote||!h.comment||strictNumber(h.trainingScore)===null)throw Error('馬情報・調教・コメントが不足しています');
    const subject=h.comment.match(/^[◎○▲△×]?([^【]+)【/)?.[1];if(nameKey(subject)!==nameKey(h.name))throw Error('コメントの対象馬が一致しません');
    for(const k of ['best','start','oikake','agari','avg5','dist','course','r1','r2','r3'])if(h[k]!==''&&h[k]!=null)indexValue(h[k]);
    if(h.surfaceContextVersion!=null){
      if(h.surfaceContextVersion!==1||!Array.isArray(h.recentSurfaces)||h.recentSurfaces.length>5||h.recentSurfaces.some(s=>!['芝','ダート'].includes(s)))throw Error('近走の芝ダ履歴が不正です');
      const expected=surfaceContextFromHistory(h.recentSurfaces,r.surface);
      if(h.surfaceSwitch!==expected.surfaceSwitch||h.surfaceRunNo!==expected.surfaceRunNo)throw Error('芝ダ履歴と馬場替わりの判定が一致しません');
    }
  }
  return r;
}


// 一括ファイルも全件検証してから受け入れる。重複は上書きせず拒否する。
export const sourceRaceKey = bundle => {
  const r=bundle.race;
  return `${r.raceDate}|${r.track}|${r.raceNumber}`;
};
export function validateSourceCollection(data){
  const bundles=data?.type==='jra-ai-source-bundle'?[data]:data?.type==='jra-ai-source-collection'&&data.version===1?data.bundles:null;
  if(!Array.isArray(bundles)||!bundles.length||bundles.length>72)throw Error('1〜72レースの取得データを指定してください');
  const seen=new Set();
  bundles.forEach((b,i)=>{
    try {validateSourceBundle(b);} catch(e){throw Error(`${i+1}レース目: ${e.message}`);}
    const key=sourceRaceKey(b);
    if(seen.has(key))throw Error('同じ開催日・競馬場・レース番号が重複しています');
    seen.add(key);
  });
  return [...bundles].sort((a,b)=>a.race.raceDate.localeCompare(b.race.raceDate)||a.race.track.localeCompare(b.race.track,'ja')||Number(a.race.raceNumber)-Number(b.race.raceNumber));
}

