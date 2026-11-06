// Eligibility only. Scores and snapshots use the same functions as single-race saving.
export function planBulkSave(bundles, savedRaces, now=Date.now()) {
  const key=r=>`${r.raceDate}|${r.track}|${Number(r.raceNumber)}`;
  const seen=new Set(savedRaces.map(key));
  const pending=[];
  let existing=0, unavailable=0;
  for(const bundle of bundles){
    const r=bundle.race;
    if(seen.has(key(r))){existing++;continue;}
    const start=Date.parse(r.scheduledStart);
    if(!Number.isFinite(start)||start<=now||new Date(start+9*3600000).toISOString().slice(0,10)!==r.raceDate){unavailable++;continue;}
    seen.add(key(r));pending.push(bundle);
  }
  return {pending,existing,unavailable};
}
