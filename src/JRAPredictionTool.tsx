import { useState, useEffect, useMemo, useCallback } from "react";

// ---- JRA 8枠カラー ----
const WAKU_COLORS = {
  1: { bg: "#FFFFFF", text: "#111111", border: "#111111" },
  2: { bg: "#111111", text: "#FFFFFF", border: "#111111" },
  3: { bg: "#D0342C", text: "#FFFFFF", border: "#D0342C" },
  4: { bg: "#1E5FBF", text: "#FFFFFF", border: "#1E5FBF" },
  5: { bg: "#F2C11B", text: "#111111", border: "#F2C11B" },
  6: { bg: "#2E8B4E", text: "#FFFFFF", border: "#2E8B4E" },
  7: { bg: "#E07B1E", text: "#FFFFFF", border: "#E07B1E" },
  8: { bg: "#E77FB3", text: "#111111", border: "#E77FB3" },
};
const wakuOf = (umaban) => {
  const n = Number(umaban);
  if (!Number.isFinite(n)) return null;
  return (((n - 1) % 8) + 8) % 8 + 1;
};

const JRA_TRACKS = ["札幌", "函館", "福島", "新潟", "東京", "中山", "中京", "京都", "阪神", "小倉"];
const GOINGS = ["良", "稍重", "重", "不良"];
const RACE_CLASSES = ["新馬", "未勝利", "1勝", "2勝", "3勝", "OP", "L", "G3", "G2", "G1"];
const RUNNING_STYLES = ["逃", "先", "差", "追"];
const PACE_TYPES = ["S", "M", "H"];
const TRAINING_SCORE = { S: 3.0, A: 2.0, B: 0.8, C: 0, D: -1.5 };
const GRADE_TO_TRAINING_100 = { S: 92, A: 82, B: 70, C: 56, D: 40 };
const MARK_ORDER = { "◎": 0, "○": 1, "▲": 2, "△": 3, "☆": 4, "": 9 };
const DEFAULT_LEARNED = { training: 1, comment: 1, value: 1, pace: 1, ground: 1, classFit: 1, jockey: 1, gate: 1, body: 1, pedigree: 1, condition: 1 };

const scoreCommentText = (raw = "") => {
  const text = String(raw);
  let score = 55;
  if (/^\s*◎/.test(text)) score += 13;
  else if (/^\s*○/.test(text)) score += 7;
  else if (/^\s*△/.test(text)) score -= 3;
  else if (/^\s*[×✕]/.test(text)) score -= 10;
  const positives: Array<[RegExp, number]> = [
    [/ここ目標|目標に順調|態勢は整|仕上がった|力を出し切れば/, 8],
    [/好レース|楽しみ|期待|巻き返せる|見直し|押し切れ/, 5],
    [/良くなって|良化|上向|順調|落ち着き|適性.*合|条件.*合/, 4],
    [/距離短縮|距離延長|良馬場|減量騎手|自分の競馬/, 2],
  ];
  const negatives: Array<[RegExp, number]> = [
    [/様子見|使いつつ|どこまで|半信半疑|課題/, -6],
    [/モタれ|出遅れ|気ムラ|忙しかった|馬場.*応え|折り合い.*鍵/, -3],
    [/疲れ|状態ひと息|良化途上|まだ.*ない/, -5],
  ];
  positives.forEach(([re, pt]) => { if (re.test(text)) score += pt; });
  negatives.forEach(([re, pt]) => { if (re.test(text)) score += pt; });
  return Math.round(clamp(score, 25, 95));
};

const STYLE_PACE_SCORE = {
  S: { "逃": 2.2, "先": 1.4, "差": -0.4, "追": -1.2 },
  M: { "逃": 0.4, "先": 0.7, "差": 0.5, "追": 0.0 },
  H: { "逃": -1.8, "先": -0.6, "差": 1.5, "追": 1.0 },
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const emptyHorse = () => ({
  id: crypto.randomUUID(),
  umaban: "",
  mark: "",
  name: "",
  sex: "",
  weight: "",
  jockey: "",
  best: "", // 全体最高
  start: "",
  oikake: "", // 追走
  agari: "", // 上がり
  avg5: "", // 5走平均
  dist: "", // 距離指数
  course: "", // コース指数
  r3: "", r2: "", r1: "", // 3走 2走 前走
  odds: "",
  ninki: "",
  runningStyle: "先",
  training: "B",
  trainingScore: "", // 調教100点
  trainingNote: "",
  groundFit: "", // 馬場適性 0-100
  classFit: "", // クラス適性 0-100
  jockeyIndex: "", // 騎手指数 0-100
  gateFit: "", // 枠順適性 0-100
  bodyChange: "", // 馬体重増減
  pedigreeFit: "", // 血統適性 0-100
  condition: "", // 状態評価 0-100
  comment: "", // 厩舎コメント
  finish: "", // 結果着順
});

const num = (v) => {
  if (v === "" || v === null || v === undefined) return null;
  const s = String(v).replace("*", "").replace("未", "").trim();
  if (s === "" || s === "-") return null;
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
};

function cellClass(v) {
  if (v === null) return "bg-white text-gray-400";
  if (v >= 110) return "bg-orange-500 text-white font-bold";
  if (v >= 104) return "bg-amber-400 text-amber-900 font-bold";
  if (v >= 100) return "bg-yellow-100 text-amber-900";
  return "bg-white text-blue-700";
}

export default function JRAPredictionTool() {
  const [raceName, setRaceName] = useState("");
  const [track, setTrack] = useState("東京");
  const [surface, setSurface] = useState("芝");
  const [distance, setDistance] = useState("");
  const [going, setGoing] = useState("良");
  const [raceClass, setRaceClass] = useState("3勝");
  const [paceType, setPaceType] = useState("M");
  const [learningOn, setLearningOn] = useState(true);
  const [learned, setLearned] = useState({ ...DEFAULT_LEARNED });
  const [historyCount, setHistoryCount] = useState(0);
  const [horses, setHorses] = useState([]);
  const [weights, setWeights] = useState({ best: 35, avg5: 20, dist: 25, course: 20 });
  const [agariBonus, setAgariBonus] = useState(true); // 芝で上がり重視
  const [oddsOn, setOddsOn] = useState(false);
  const [decayScale, setDecayScale] = useState(8);
  const [oddsStrength, setOddsStrength] = useState(12);
  const [bulkText, setBulkText] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [exportText, setExportText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("");
  const [scanOpen, setScanOpen] = useState(true);
  const [scanFiles, setScanFiles] = useState({ race: null, standard: null, recent: null, pace: null, comment: null });
  const [scanPreview, setScanPreview] = useState({});
  const [scanText, setScanText] = useState({ race: "", standard: "", recent: "", pace: "", comment: "", training: "" });
  const [azureDebug, setAzureDebug] = useState({});
  const [azureLastError, setAzureLastError] = useState("");
  const [scanProgress, setScanProgress] = useState(0);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanLog, setScanLog] = useState("");
  const [savedRaces, setSavedRaces] = useState<any[]>([]);
  const [savedRacesOpen, setSavedRacesOpen] = useState(false);
  const [resultEntryMode, setResultEntryMode] = useState(false);
  const [activeSavedRaceId, setActiveSavedRaceId] = useState<string | null>(null);
  const [reviewRaceId, setReviewRaceId] = useState<string | null>(null);
  const [analysisTab, setAnalysisTab] = useState<"review"|"conditions"|"backtest">("review");
  const [resultOrderInput, setResultOrderInput] = useState("");
  const [learningHistory, setLearningHistory] = useState<any[]>([]);

  // ---- 永続化 ----
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("jra-tool-state");
        if (res && res.value) {
          const data = JSON.parse(res.value);
          if (data.raceName !== undefined) setRaceName(data.raceName);
          if (data.track) setTrack(data.track);
          if (data.surface) setSurface(data.surface);
          if (data.distance !== undefined) setDistance(data.distance);
          if (data.going) setGoing(data.going);
          if (data.raceClass) setRaceClass(data.raceClass);
          if (data.paceType) setPaceType(data.paceType);
          if (data.learningOn !== undefined) setLearningOn(data.learningOn);
          if (data.learned) setLearned((prev) => ({ ...prev, ...data.learned }));
          if (data.historyCount !== undefined) setHistoryCount(data.historyCount);
          if (Array.isArray(data.learningHistory)) setLearningHistory(data.learningHistory);
          if (data.horses) setHorses(data.horses);
          if (data.weights) setWeights(data.weights);
          if (data.agariBonus !== undefined) setAgariBonus(data.agariBonus);
          if (data.oddsOn !== undefined) setOddsOn(data.oddsOn);
          if (data.decayScale !== undefined) setDecayScale(data.decayScale);
          if (data.oddsStrength !== undefined) setOddsStrength(data.oddsStrength);
        }
        const saved = await window.storage.get("jra-saved-races");
        if (saved && saved.value) {
          const items = JSON.parse(saved.value);
          if (Array.isArray(items)) setSavedRaces(items);
        }
      } catch (e) {
        // no saved data yet
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(async () => {
      try {
        await window.storage.set(
          "jra-tool-state",
          JSON.stringify({ raceName, track, surface, distance, going, raceClass, paceType, learningOn, learned, historyCount, learningHistory, horses, weights, agariBonus, oddsOn, decayScale, oddsStrength })
        );
      } catch (e) {}
    }, 400);
    return () => clearTimeout(t);
  }, [loaded, raceName, track, surface, distance, going, raceClass, paceType, learningOn, learned, historyCount, learningHistory, horses, weights, agariBonus, oddsOn, decayScale, oddsStrength]);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(async () => {
      try {
        await window.storage.set("jra-saved-races", JSON.stringify(savedRaces));
      } catch (e) {}
    }, 250);
    return () => clearTimeout(t);
  }, [loaded, savedRaces]);

  const flash = (msg) => {
    setStatus(msg);
    setTimeout(() => setStatus(""), 2000);
  };

  // ---- 行操作 ----
  const addHorse = () => setHorses((h) => [...h, { ...emptyHorse(), umaban: h.length + 1 }]);
  const removeHorse = (id) => setHorses((h) => h.filter((x) => x.id !== id));
  const updateHorse = (id, field, value) =>
    setHorses((h) => h.map((x) => (x.id === id ? { ...x, [field]: value } : x)));
  const clearAll = () => {
    if (confirm("全ての出走馬データを削除します。よろしいですか？")) {
      setHorses([]);
      setActiveSavedRaceId(null);
      setResultEntryMode(false);
    }
  };

  // ---- 一括貼り付け ----
  // 想定列順(1頭16項目): 馬番,予想印,馬名,全体,スタート,追走,上がり,5走平均,距離,コース,3走,2走,前走,性齢,斤量,騎手
  const COLS = 16;
  const HEADER_TOKENS = new Set(["馬番", "予想印", "馬名", "全体", "スタート", "追走", "上がり", "5走平均", "距離", "コース", "3走", "2走", "前走", "性齢", "斤量", "騎手", "切替", "最高", "近走成績", "5走", "平均", "オッズ", "人気"]);
  const SEXAGE_RE = /^(牡|牝|セ)\d{1,2}$/;
  const UMABAN_RE = /^\d{1,2}$/;
  const WEIGHT_RE = /^\d{2}(\.\d)?$/;

  const runBulkImport = () => {
    // コピー元サイトによって改行・タブ・複数スペースなど区切りが不定になるため、
    // 空白系文字を全て区切りとみなしトークン化する（行単位には依存しない）。
    const tokens = bulkText
      .split(/[\t\n\r\u3000]+|\s{1,}/)
      .map((t) => t.trim())
      .filter((t) => t !== "" && !HEADER_TOKENS.has(t));

    if (tokens.length < 10) {
      flash("解析できるデータが見つかりませんでした");
      return;
    }

    // 「牡4」「牝5」「セ6」等の性齢表記を目印(アンカー)にして、その前後から各項目を組み立てる。
    // 途中に余計な語（見出しや無関係な文章）が紛れ込んでも、固定列区切りと違って
    // 後続の馬まで連鎖的にズレない。性齢の直後は 斤量,騎手 、その後に任意で オッズ,人気 が続く形式にも対応。
    const ODDS_RE = /^\d{1,4}(\.\d)?$/;
    const NINKI_RE = /^\d{1,2}$/;
    const parsed = [];
    const usedAnchors = new Set();
    for (let i = 0; i < tokens.length; i++) {
      if (!SEXAGE_RE.test(tokens[i])) continue;
      if (i < 10 || i + 2 >= tokens.length + 1) continue;
      const idxTokens = tokens.slice(i - 10, i); // best..r1 (10項目)
      const name = tokens[i - 11];
      const mark = tokens[i - 12];
      const umaban = tokens[i - 13];
      const weight = tokens[i + 1];
      const jockey = tokens[i + 2] ?? "";
      if (idxTokens.length !== 10 || !name) continue;
      if (!umaban || !UMABAN_RE.test(umaban)) continue;
      if (!weight || !WEIGHT_RE.test(weight)) continue;
      const [best, start, oikake, agari, avg5, dist, course, r3, r2, r1] = idxTokens;
      // オッズ・人気（任意）: 次の馬のアンカー位置より手前にある場合のみ採用
      const nextUmabanTok = tokens[i + 4];
      let odds = "", ninki = "";
      if (tokens[i + 3] !== undefined && ODDS_RE.test(tokens[i + 3]) && !SEXAGE_RE.test(tokens[i + 3])) {
        odds = tokens[i + 3];
        if (tokens[i + 4] !== undefined && NINKI_RE.test(tokens[i + 4])) {
          ninki = tokens[i + 4];
        }
      }
      parsed.push({
        ...emptyHorse(),
        umaban,
        mark: mark && mark !== "--" && mark !== "ー" ? mark : "",
        name,
        best, start, oikake, agari, avg5, dist, course, r3, r2, r1,
        sex: tokens[i],
        weight,
        jockey,
        odds,
        ninki,
      });
      usedAnchors.add(i);
    }

    // アンカー方式で何も拾えなかった場合は、フォールバックとして16個ずつの固定区切りを試す
    if (parsed.length === 0) {
      for (let i = 0; i + COLS <= tokens.length; i += COLS) {
        const chunk = tokens.slice(i, i + COLS);
        const [umaban, mark, name, best, start, oikake, agari, avg5, dist, course, r3, r2, r1, sex, weight, jockey] = chunk;
        parsed.push({
          ...emptyHorse(),
          umaban: umaban ?? "",
          mark: mark && mark !== "--" && mark !== "ー" ? mark : "",
          name: name ?? "",
          best, start, oikake, agari, avg5, dist, course, r3, r2, r1,
          sex: sex ?? "",
          weight: weight ?? "",
          jockey: jockey ?? "",
        });
      }
    }

    if (parsed.length === 0) {
      flash("解析できる行がありませんでした。列の並び順を確認してください");
      return;
    }
    // 馬番の重複や桁崩れがないか軽くチェックして順に並べる
    parsed.sort((a, b) => Number(a.umaban || 0) - Number(b.umaban || 0));
    setHorses(parsed);
    setBulkText("");
    setImportOpen(false);
    flash(`${parsed.length}頭を取り込みました`);
  };

  // ---- テキスト一括入力 ----
  const SCAN_TYPES = [
    ["race", "出馬表", "馬番・馬名・性齢・斤量・騎手・オッズ・人気"],
    ["standard", "タイム指数（標準）", "全体・スタート・追走・上がり・5走平均"],
    ["recent", "タイム指数（近5走）", "過去最高・前走・3走・2走"],
    ["pace", "AI展開予測", "ペース・推定タイム・前後半3F"],
    ["comment", "厩舎コメント", "状態・距離短縮・適性コメント"],
    ["training", "調教評価", "馬番・馬名・短評・矢印・追い切り時計を含む調教全文"],
  ];

  const selectScanFile = (type, file) => {
    if (!file) return;
    setScanFiles((v) => ({ ...v, [type]: file }));
    const url = URL.createObjectURL(file);
    setScanPreview((v) => ({ ...v, [type]: url }));
  };

  const loadTesseract = async () => {
    if (window.Tesseract) return window.Tesseract;
    await new Promise((resolve, reject) => {
      const old = document.querySelector('script[data-jra-ocr="1"]');
      if (old) {
        old.addEventListener("load", resolve, { once: true });
        old.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      script.async = true;
      script.dataset.jraOcr = "1";
      script.onload = resolve;
      script.onerror = () => reject(new Error("OCRライブラリを読み込めませんでした"));
      document.head.appendChild(script);
    });
    return window.Tesseract;
  };

  const normalizeOcr = (text) => String(text || "")
    .replace(/[｜|]/g, " ")
    .replace(/[‐‑–—]/g, "-")
    .replace(/\r/g, "")
    .replace(/[ ]{2,}/g, " ");

  const findHorse = (name, list) => {
    const clean = String(name || "").replace(/[\s・･]/g, "");
    if (!clean) return null;
    return list.find((h) => {
      const hn = String(h.name || "").replace(/[\s・･]/g, "");
      return hn && (hn === clean || hn.includes(clean) || clean.includes(hn));
    }) || null;
  };

  const parseRaceText = (text, baseList) => {
    const lines = String(text || "")
      .replace(/\r/g, "")
      .split("\n")
      .map((x) => x.replace(/[\t\u3000]+/g, " ").replace(/ {2,}/g, " ").trim())
      .filter(Boolean);
    const list = baseList.map((h) => ({ ...h }));

    const isHorseNumber = (line) => /^\d{1,2}$/.test(line) && Number(line) >= 1 && Number(line) <= 18;
    const isHorseName = (line) => /^[ァ-ヶー一-龠A-Za-z0-9・･ー]{2,30}$/.test(line)
      && !/(人気|データベース|芝|ダート|良|稍|重|不良)/.test(line);

    for (let i = 0; i < lines.length; i += 1) {
      if (!isHorseNumber(lines[i])) continue;
      const umaban = lines[i];
      const nameLine = lines[i + 1] || "";
      if (!isHorseName(nameLine)) continue;

      const name = nameLine;
      const info = lines[i + 2] || "";
      const oddsLine = lines[i + 3] || "";
      const bodyLine = lines[i + 4] || "";
      const changeLine = lines[i + 5] || "";

      let h = list.find((x) => String(x.umaban) === umaban) || findHorse(name, list);
      if (!h) { h = { ...emptyHorse(), umaban, name }; list.push(h); }
      h.umaban = umaban;
      h.name = name;

      const sex = info.match(/(牡|牝|セ)\s*(\d{1,2})/);
      if (sex) h.sex = `${sex[1]}${sex[2]}`;

      const weight = info.match(/([45]\d(?:\.\d)?)\s*$/);
      if (weight) h.weight = weight[1];

      const dbMarker = "のデータベース";
      const dbPos = info.indexOf(dbMarker);
      const jockeyPart = (dbPos >= 0 ? info.slice(dbPos + dbMarker.length) : info)
        .replace(/^(?:牡|牝|セ)\d+\s*/, "")
        .replace(/([45]\d(?:\.\d)?)\s*$/, "")
        .trim();
      if (jockeyPart) h.jockey = jockeyPart.replace(/^[☆◇▲△★]/, "").trim();

      const oddsPop = `${oddsLine} ${bodyLine}`.match(/(\d{1,3}(?:\.\d+)?)\s+(\d{1,2})人気/);
      if (oddsPop) { h.odds = oddsPop[1]; h.ninki = oddsPop[2]; }
      else {
        const odds = oddsLine.match(/^\d{1,3}(?:\.\d+)?$/);
        const pop = oddsLine.match(/(\d{1,2})人気/) || bodyLine.match(/(\d{1,2})人気/);
        if (odds) h.odds = odds[0];
        if (pop) h.ninki = pop[1];
      }

      const body = bodyLine.match(/(?:^|\s)(\d{3})(?:\s|$)/) || changeLine.match(/^(\d{3})$/);
      const change = [bodyLine, changeLine].map((v) => v.match(/^\(([+-]?\d+)\)$/)).find(Boolean);
      if (body) h.bodyChange = change ? `${body[1]}(${change[1]})` : body[1];
    }
    return list.sort((a,b)=>Number(a.umaban||99)-Number(b.umaban||99));
  };

  const parseIndexText = (text, baseList, recentMode = false) => {
    const lines = String(text || "")
      .replace(/\r/g, "")
      .split("\n")
      .map((x) => x.replace(/[\t\u3000]+/g, " ").replace(/ {2,}/g, " ").trim())
      .filter(Boolean);
    const list = baseList.map((h) => ({ ...h }));
    const isNumberLine = (line) => /^\d{1,2}$/.test(line) && Number(line) >= 1 && Number(line) <= 18;

    if (!recentMode) {
      // 形式: 馬番(単独行) / 馬名 全体 ST 追走 上がり 5走平均 距離 コース 3走 2走 前走 性齢 斤量 騎手 オッズ 人気
      for (let i = 0; i < lines.length - 1; i += 1) {
        if (!isNumberLine(lines[i])) continue;
        const umaban = lines[i];
        const cols = lines[i + 1].split(/\s+/);
        if (cols.length < 8) continue;
        const name = cols[0];
        const sexIdx = cols.findIndex((v, idx) => idx > 1 && /^(牡|牝|セ)\d{1,2}$/.test(v));
        if (sexIdx < 5) continue;
        const values = cols.slice(1, sexIdx);
        let h = list.find((x) => String(x.umaban) === umaban) || findHorse(name, list);
        if (!h) { h = { ...emptyHorse(), umaban, name }; list.push(h); }
        h.umaban = umaban; h.name = name;
        const clean = (v) => String(v ?? "").replace(/\*/g, "");
        [h.best,h.start,h.oikake,h.agari,h.avg5,h.dist,h.course,h.r3,h.r2,h.r1] = Array.from({length:10},(_,k)=>clean(values[k] ?? ""));
        h.sex = cols[sexIdx] || h.sex;
        h.weight = cols[sexIdx + 1] || h.weight;
        h.jockey = String(cols[sexIdx + 2] || h.jockey || "").replace(/^[☆◇▲△★]/, "");
        h.odds = cols[sexIdx + 3] || h.odds;
        h.ninki = cols[sexIdx + 4] || h.ninki;
      }
      return list.sort((a,b)=>Number(a.umaban||99)-Number(b.umaban||99));
    }

    // 近5走は各馬ブロック末尾の「4指数 オッズ 人気」を使用する。
    for (let i = 0; i < lines.length; i += 1) {
      if (!isNumberLine(lines[i])) continue;
      const umaban = lines[i];
      const name = lines[i + 1] || "";
      if (!name || /^\d/.test(name)) continue;
      let end = lines.length;
      for (let j = i + 2; j < lines.length; j += 1) {
        if (isNumberLine(lines[j]) && j + 1 < lines.length && !/^\d/.test(lines[j + 1])) { end = j; break; }
      }
      const block = lines.slice(i + 2, end);
      const summary = [...block].reverse().find((line) => {
        const parts = line.split(/\s+/);
        return parts.length >= 6 && parts.slice(0,4).every((v)=>/^\d{1,3}(?:\.\d+)?\*?$/.test(v));
      });
      if (!summary) continue;
      const parts = summary.split(/\s+/);
      let h = list.find((x) => String(x.umaban) === umaban) || findHorse(name, list);
      if (!h) { h = { ...emptyHorse(), umaban, name }; list.push(h); }
      h.umaban = umaban; h.name = name;
      const vals = parts.slice(0,4).map((v)=>v.replace(/\*/g, ""));
      h.avg5 = vals[0] || h.avg5;
      h.r3 = vals[1] || h.r3;
      h.r2 = vals[2] || h.r2;
      h.r1 = vals[3] || h.r1;
      if (parts[4]) h.odds = parts[4];
      if (parts[5]) h.ninki = parts[5];
      i = end - 1;
    }
    return list.sort((a,b)=>Number(a.umaban||99)-Number(b.umaban||99));
  };

  const commentScore = (comment) => {
    let score = 50;
    const plusStrong = ["抜群", "絶好", "大幅良化", "上積み十分", "好気配", "期待", "勝ち負け", "自信"];
    const plus = ["良化", "前進", "上向", "順調", "問題ない", "合いそう", "対応", "楽しみ", "適性"];
    const minusStrong = ["厳しい", "不安", "物足りない", "状態一息", "良化途上", "使ってから"];
    const minus = ["課題", "遅れ", "モタれる", "半信半疑", "どこまで", "割引", "重い"];
    plusStrong.forEach((w)=>{ if(comment.includes(w)) score += 7; });
    plus.forEach((w)=>{ if(comment.includes(w)) score += 3; });
    minusStrong.forEach((w)=>{ if(comment.includes(w)) score -= 7; });
    minus.forEach((w)=>{ if(comment.includes(w)) score -= 3; });
    return clamp(score, 25, 80);
  };

  const parseCommentText = (text, baseList) => {
    const lines = String(text || "")
      .replace(/\r/g, "")
      .split("\n")
      .map((x)=>x.replace(/[\t\u3000]+/g," ").replace(/ {2,}/g," ").trim())
      .filter(Boolean);
    const list = baseList.map((h)=>({ ...h }));
    const headerRe = /^(\d{1,2})\s+([ァ-ヶー一-龠A-Za-z0-9・･ー]{2,30})$/;
    for (let i=0;i<lines.length;i++) {
      const m = lines[i].match(headerRe);
      if (!m) continue;
      const h = list.find((x)=>String(x.umaban)===m[1]) || findHorse(m[2], list);
      if (!h) continue;
      const chunks = [];
      for (let j=i+1;j<lines.length;j++) {
        if (headerRe.test(lines[j])) break;
        if (/^\d{1,2}$/.test(lines[j])) continue; // 枠番だけの行
        chunks.push(lines[j]);
      }
      h.comment = chunks.join(" ").replace(/^[◎○▲△×]\s*/, "");
      h.condition = String(commentScore(h.comment));
      if (/距離短縮.*(?:期待|合う|プラス)|短縮.*好材料/.test(h.comment)) h.classFit = String(Math.max(num(h.classFit)||50, 56));
      if (/芝.*(?:合う|問題ない)|ダート.*(?:合う|問題ない)/.test(h.comment)) h.groundFit = String(Math.max(num(h.groundFit)||50, 56));
    }
    return list;
  };


  const parseTrainingText = (text, baseList) => {
    const rawLines = String(text || "")
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => line.replace(/[\t\u3000]+/g, " ").replace(/ {2,}/g, " ").trim())
      .filter(Boolean);
    const list = baseList.map((h)=>({ ...h }));

    // 競馬ブック等の「馬番 馬名 短評 矢印」を各馬ブロックの先頭として扱う。
    // 直前に枠番だけの行（例: 8）があっても無視し、馬番付きの見出し行から次の見出し直前までを1頭分にまとめる。
    const headerRe = /^(\d{1,2})\s+([ァ-ヶー一-龠A-Za-z0-9・･]+)\s+(.+?)\s*([↗↘→↑↓])$/;
    const blocks = [];
    let current = null;
    for (const line of rawLines) {
      const m = line.match(headerRe);
      if (m && Number(m[1]) >= 1 && Number(m[1]) <= 18) {
        if (current) blocks.push(current);
        current = { umaban: m[1], name: m[2], summary: m[3], arrow: m[4], lines: [] };
        continue;
      }
      if (current) current.lines.push(line);
    }
    if (current) blocks.push(current);

    const scoreBlock = (block) => {
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

    let applied = 0;
    for (const block of blocks) {
      const horse = list.find((h)=>String(h.umaban)===block.umaban) || findHorse(block.name, list);
      if (!horse) continue;
      const evaluated = scoreBlock(block);
      horse.training = evaluated.grade;
      horse.trainingScore = String(evaluated.numeric);
      horse.trainingNote = `${block.summary}${block.arrow ? ` ${block.arrow}` : ""}`.trim();
      applied += 1;
    }

    // 従来の「馬番 馬名 A」「◎/○/▲/△/×」形式も引き続き対応。
    if (applied === 0) {
      const normalizeGrade = (raw) => {
        const value = String(raw || "").trim().toUpperCase();
        if (["S","A","B","C","D"].includes(value)) return value;
        if (["◎","抜群","絶好","非常に良い"].some((x)=>value.includes(x))) return "S";
        if (["○","良好","好調","上々","動き良い"].some((x)=>value.includes(x))) return "A";
        if (["▲","順調","まずまず","平行線","普通"].some((x)=>value.includes(x))) return "B";
        if (["△","一息","やや重い","物足りない"].some((x)=>value.includes(x))) return "C";
        if (["×","不振","重い","遅れ","低調"].some((x)=>value.includes(x))) return "D";
        return "";
      };
      for (const line of rawLines) {
        const gradeMatch = line.match(/(?:^|[\s:：,、|｜])([SABCD])(?:$|[\s:：,、|｜])/i)
          || line.match(/(◎|○|▲|△|×|抜群|絶好|非常に良い|良好|好調|上々|動き良い|順調|まずまず|平行線|普通|一息|やや重い|物足りない|不振|重い|遅れ|低調)/);
        const grade = normalizeGrade(gradeMatch?.[1]);
        if (!grade) continue;
        const numberMatch = line.match(/^\s*(\d{1,2})(?:\s|番|枠)/);
        let horse = numberMatch ? list.find((h)=>String(h.umaban)===numberMatch[1]) : null;
        if (!horse) {
          const nameCandidates = line.match(/[ァ-ヶー一-龠A-Za-z0-9・･]{2,24}/g) || [];
          for (const candidate of nameCandidates) {
            if (["S","A","B","C","D"].includes(candidate.toUpperCase())) continue;
            horse = findHorse(candidate, list);
            if (horse) break;
          }
        }
        if (horse) { horse.training = grade; horse.trainingScore = String(GRADE_TO_TRAINING_100[grade] ?? 70); }
      }
    }
    return list;
  };

  const parsePaceText = (text) => {
    const t = normalizeOcr(text);
    const m = t.match(/(?:ペース|予測)\s*[:：]?\s*([SMH])/i) || t.match(/\n\s*([SMH])\s*\n/);
    if (m) setPaceType(m[1].toUpperCase());
    const course = t.match(new RegExp(`(${JRA_TRACKS.join("|")})\s*(\d{3,4})m?\s*(芝|ダート|ダ)`));
    if (course) { setTrack(course[1]); setDistance(course[2]); setSurface(course[3]==="芝"?"芝":"ダート"); }
  };

  const fileToImage = async (file) => {
    const original = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("画像を読み込めませんでした"));
      reader.readAsDataURL(file);
    });
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = () => reject(new Error("画像を開けませんでした"));
      node.src = original;
    });
  };

  const preprocessImage = async (file, mode = "table") => {
    const img = await fileToImage(file);
    const targetWidth = mode === "table" ? 2400 : 2000;
    const scale = Math.max(1, Math.min(3, targetWidth / img.width));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("画像処理を開始できませんでした");
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = image.data;
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      let value;
      if (mode === "table") {
        value = gray < 205 ? Math.max(0, (gray - 115) * 1.85) : 255;
      } else {
        value = gray < 225 ? Math.max(0, (gray - 95) * 1.55) : 255;
      }
      d[i] = d[i + 1] = d[i + 2] = value;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  };


  const cropCanvas = (img, x, y, w, h, scale = 2.2) => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("画像を切り出せませんでした");
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < data.data.length; i += 4) {
      const r=data.data[i], g=data.data[i+1], b=data.data[i+2];
      const gray = 0.299*r + 0.587*g + 0.114*b;
      const v = gray < 218 ? Math.max(0, (gray - 95) * 1.72) : 255;
      data.data[i]=data.data[i+1]=data.data[i+2]=v;
    }
    ctx.putImageData(data,0,0);
    return canvas;
  };

  const bestHorseName = (text) => {
    const stop = new Set(["出馬表","タイム指数","近走成績","単勝オッズ","人気","騎手","斤量","馬名","全体","スタート","追走","上がり","コメント","厩舎"]);
    const normalized = normalizeOcr(text)
      .replace(/[○◎△▲☆◇□■●]/g, " ")
      .replace(/\d+(?:\.\d+)?/g, " ")
      .replace(/[一-龠]{1,4}(?:師|騎手|調教師)/g, " ");
    const words = normalized.match(/[ァ-ヶー]{4,20}/g) || [];
    const badFragments = ["サンクス", "ソングス", "グツグツ"];
    return words
      .map((x)=>x.replace(/^[ー]+|[ー]+$/g,""))
      .filter((x)=>x.length>=4 && !stop.has(x) && !badFragments.includes(x))
      .sort((a,b)=>b.length-a.length)[0] || "";
  };

  const rowLayout = (type, img) => {
    const h=img.height, w=img.width;
    if (type === "race") return { x:0.01*w, y:0.278*h, width:0.98*w, height:0.708*h };
    if (type === "standard") return { x:0.01*w, y:0.294*h, width:0.98*w, height:0.696*h };
    if (type === "recent") return { x:0.01*w, y:0.294*h, width:0.98*w, height:0.696*h };
    return { x:0, y:0, width:w, height:h };
  };

  const nameColumnLayout = (type, img) => {
    const w=img.width;
    // 対応画面ごとの「馬名列」だけを切り出す。騎手・斤量・コメントは混ぜない。
    if (type === "race") return { x:0.17*w, width:0.48*w };
    if (type === "standard") return { x:0.075*w, width:0.255*w };
    if (type === "recent") return { x:0.09*w, width:0.23*w };
    return { x:0, width:0 };
  };


  const normalizeHorseNameCandidate = (value) => String(value || "")
    .replace(/[\s・･]/g, "")
    .replace(/[○◎△▲☆◇□■●◯]/g, "")
    .replace(/[0-9０-９A-Za-z]/g, "")
    .replace(/^[ー]+|[ー]+$/g, "");

  const isLikelyHorseName = (value) => {
    const name = normalizeHorseNameCandidate(value);
    if (!/^[ァ-ヶー]{4,22}$/.test(name)) return false;
    const stop = ["タイム指数","スタート","オイカケ","追走指数","アガリ指数","近走成績","タンショウオッズ","コメント","データ分析"];
    return !stop.some((word)=>name.includes(word));
  };

  const recognizeNameColumn = async (Tesseract, img, type, progressBase, progressSpan) => {
    const layout = rowLayout(type, img);
    const col = nameColumnLayout(type, img);
    if (!col.width) return {};
    const tableTop = layout.y;
    const tableHeight = layout.height;
    const nameCanvas = cropCanvas(img, col.x, tableTop, col.width, tableHeight, 3.2);
    const variants = [
      { psm:"6", canvas:nameCanvas },
      { psm:"11", canvas:nameCanvas },
    ];
    const votes = {};
    for (let pass=0; pass<variants.length; pass++) {
      const result = await Tesseract.recognize(variants[pass].canvas, "jpn", {
        tessedit_pageseg_mode: variants[pass].psm,
        preserve_interword_spaces:"1",
        logger:(m)=>{ if(m.status==="recognizing text") setScanProgress(Math.round(progressBase + (pass+(m.progress||0))/variants.length*progressSpan)); }
      });
      const words = result?.data?.words || [];
      words.forEach((word)=>{
        const candidate = normalizeHorseNameCandidate(word.text);
        if (!isLikelyHorseName(candidate)) return;
        const cy = ((word.bbox?.y0 || 0) + (word.bbox?.y1 || 0)) / 2;
        const originalY = cy / 3.2;
        const row = Math.max(1, Math.min(18, Math.floor(originalY / (tableHeight / 11)) + 1));
        const conf = Number(word.confidence || word.conf || 0);
        votes[row] ||= [];
        votes[row].push({ candidate, conf });
      });
      // Tesseract may merge words into lines. Keep one katakana block per OCR line as a fallback.
      const lines = normalizeOcr(result?.data?.text || "").split("\n").map(x=>x.trim()).filter(Boolean);
      lines.forEach((line, index)=>{
        const candidates = (line.match(/[ァ-ヶー]{4,22}/g) || []).map(normalizeHorseNameCandidate).filter(isLikelyHorseName);
        if (!candidates.length) return;
        const row = Math.max(1, Math.min(11, index + 1));
        votes[row] ||= [];
        candidates.forEach(candidate=>votes[row].push({candidate, conf:35}));
      });
    }
    const resultMap = {};
    Object.entries(votes).forEach(([row, rawItems])=>{
      const items = rawItems as Array<{candidate:string; conf:number}>;
      const grouped: Record<string, number> = {};
      items.forEach(({candidate,conf})=>{ grouped[candidate]=(grouped[candidate]||0)+Math.max(1,conf); });
      const selected = Object.entries(grouped).sort((a,b)=>b[1]-a[1] || b[0].length-a[0].length)[0]?.[0];
      if (selected) resultMap[row]=selected;
    });
    return resultMap;
  };

  const recognizeHorseRows = async (Tesseract, file, type, baseList, progressBase, progressSpan) => {
    const img = await fileToImage(file);
    const layout = rowLayout(type, img);
    const nameLayout = nameColumnLayout(type, img);
    const list = baseList.length ? baseList.map((h)=>({...h})) : Array.from({length:11},(_,i)=>({...emptyHorse(),umaban:String(i+1)}));
    const rows = 11;
    // Recognize the complete name column first. This preserves vertical position and avoids
    // mixing jockey names or stable comments into the horse-name field.
    const columnNames = type === "race"
      ? await recognizeNameColumn(Tesseract, img, type, progressBase, progressSpan * 0.28)
      : {};
    Object.entries(columnNames).forEach(([row,name])=>{
      const horse = list.find((x)=>String(x.umaban)===String(row));
      if (horse && isLikelyHorseName(name)) horse.name = name;
    });
    const rowH = layout.height / rows;
    for (let i=0;i<rows;i++) {
      setScanLog(`${SCAN_TYPES.find((x)=>x[0]===type)?.[1] || type}：${i+1}番を解析中…`);
      const pad = rowH * 0.06;
      const rowY = layout.y + i*rowH + pad;
      const rowCanvas = cropCanvas(img, layout.x, rowY, layout.width, rowH-pad*2, 2.25);
      const rowResult = await Tesseract.recognize(rowCanvas, "jpn+eng", {
        tessedit_pageseg_mode: "7",
        preserve_interword_spaces: "1",
        logger:(m)=>{ if(m.status==="recognizing text") setScanProgress(Math.round(progressBase + ((i+(m.progress||0)*0.65)/rows)*progressSpan)); }
      });
      const raw = normalizeOcr(rowResult?.data?.text || "").replace(/\n+/g," ").trim();
      let h = list.find((x)=>String(x.umaban)===String(i+1));
      if (!h) { h={...emptyHorse(),umaban:String(i+1)}; list.push(h); }

      // 馬名は専用の狭い列だけを別OCR。既に出馬表で確定済みなら指数画像では上書きしない。
      if (!h.name && nameLayout.width > 0) {
        const nameCanvas = cropCanvas(img, nameLayout.x, rowY, nameLayout.width, rowH-pad*2, 3.0);
        const attempts = [];
        for (const psm of ["7","13"]) {
          const nameResult = await Tesseract.recognize(nameCanvas, "jpn", {
            tessedit_pageseg_mode: psm,
            preserve_interword_spaces: "1",
            logger:(m)=>{ if(m.status==="recognizing text") setScanProgress(Math.round(progressBase + ((i+0.65+(m.progress||0)*0.35)/rows)*progressSpan)); }
          });
          const candidate = bestHorseName(nameResult?.data?.text || "");
          if (isLikelyHorseName(candidate)) attempts.push(candidate);
        }
        const candidate = attempts.sort((a,b)=>b.length-a.length)[0] || "";
        if (candidate) h.name=candidate;
      }

      if (type === "race") {
        const sex=raw.match(/(牡|牝|セ)\s*(\d{1,2})/); if(sex) h.sex=`${sex[1]}${sex[2]}`;
        const oddsPop=raw.match(/(\d{1,3}(?:\.\d)?)\s*(?:倍)?\s*(\d{1,2})\s*人気/);
        if(oddsPop){h.odds=oddsPop[1];h.ninki=oddsPop[2];}
        const weightMatches=[...(raw.matchAll(/(?:^|\s)([45]\d(?:\.\d)?)(?=\s|$)/g))];
        if(weightMatches.length) h.weight=weightMatches[weightMatches.length-1][1];
        const jockey=raw.match(/([一-龠]{2,5}|[ァ-ヶー]{2,8})\s*(?:△|▲|☆|◇)?\s*[45]\d(?:\.\d)?/);
        if(jockey && jockey[1]!==h.name && !/^(牡|牝|人気|馬名)$/.test(jockey[1])) h.jockey=jockey[1];
      } else if (type === "standard") {
        const vals=(raw.match(/(?<![\d.])-?\d{1,3}(?:\.\d)?\*?/g)||[]).map(v=>v.replace("*","")).filter(v=>Number(v)>=20&&Number(v)<=140);
        if(vals.length>=4){h.best=vals[0];h.start=vals[1];h.oikake=vals[2];h.agari=vals[3];}
        if(vals.length>=5) h.avg5=vals[4];
        if(vals.length>=6) h.dist=vals[5];
        if(vals.length>=7) h.course=vals[6];
      } else if (type === "recent") {
        const vals=(raw.match(/(?<![\d.])-?\d{1,3}(?:\.\d)?\*?/g)||[]).map(v=>v.replace("*","")).filter(v=>Number(v)>=20&&Number(v)<=140);
        if(vals.length) h.avg5=vals[0];
        if(vals.length>=4){h.r3=vals[vals.length-3];h.r2=vals[vals.length-2];h.r1=vals[vals.length-1];}
      }
    }
    return list.sort((a,b)=>Number(a.umaban)-Number(b.umaban));
  };

  const assignCommentsByKnownNames = (text, baseList) => {
    const normalized = normalizeOcr(text);
    const list = baseList.map((h)=>({...h}));
    const found = list
      .filter((h)=>h.name && h.name.length>=4)
      .map((h)=>({ h, pos: normalized.indexOf(h.name) }))
      .filter((x)=>x.pos>=0)
      .sort((a,b)=>a.pos-b.pos);
    found.forEach((item, idx)=>{
      const end = idx+1<found.length ? found[idx+1].pos : normalized.length;
      let block = normalized.slice(item.pos + item.h.name.length, end)
        .replace(/^\s*[【\[].*?[】\]]\s*/, "")
        .replace(/^\s*(?:○|◎|△|▲|☆|◇)+\s*/, "")
        .trim();
      if (block.length > 240) block = block.slice(0,240);
      if (block.length>=6) {
        item.h.comment=block;
        item.h.condition=String(commentScore(block));
        if (/距離短縮.*(?:期待|合う|プラス)|短縮.*好材料/.test(block)) item.h.classFit=String(Math.max(num(item.h.classFit)||50,56));
        if (/芝.*(?:合う|問題ない)|ダート.*(?:合う|問題ない)/.test(block)) item.h.groundFit=String(Math.max(num(item.h.groundFit)||50,56));
      }
    });
    return list;
  };

  const combineOcrTexts = (a, b) => {
    const lines = [...normalizeOcr(a).split("\n"), ...normalizeOcr(b).split("\n")]
      .map((x) => x.trim()).filter(Boolean);
    const seen = new Set();
    return lines.filter((line) => {
      const key = line.replace(/\s/g, "");
      if (key.length < 2 || seen.has(key)) return false;
      seen.add(key); return true;
    }).join("\n");
  };

  const recognizeLocal = async (Tesseract, file, index, total, label) => {
    const tableCanvas = await preprocessImage(file, "table");
    const sparseCanvas = await preprocessImage(file, "text");
    const run = async (image, psm, offset, span) => {
      const result = await Tesseract.recognize(image, "jpn+eng", {
        tessedit_pageseg_mode: String(psm),
        preserve_interword_spaces: "1",
        logger: (m) => {
          if (m.status === "recognizing text") {
            const local = offset + (m.progress || 0) * span;
            setScanProgress(Math.round(((index + local) / total) * 100));
          }
        }
      });
      return result?.data?.text || "";
    };
    setScanLog(`${label}を表モードで解析中…`);
    const first = await run(tableCanvas, 6, 0, 0.56);
    setScanLog(`${label}を文字検出モードで再確認中…`);
    const second = await run(sparseCanvas, 11, 0.56, 0.44);
    return combineOcrTexts(first, second);
  };

  const extractHorseCandidates = (text) => {
    const stop = new Set(["出馬表","タイム指数","近走成績","馬名","騎手","人気","単勝オッズ","全体","スタート","追走","上がり","前走","性齢","斤量"]);
    const candidates = [];
    normalizeOcr(text).split("\n").forEach((line) => {
      const pieces = line.match(/[ァ-ヶー一-龠A-Za-z]{3,18}/g) || [];
      pieces.forEach((word) => {
        const clean = word.replace(/[年月日時芝牝牡人気良稍重不調]/g, "");
        if (clean.length >= 3 && !stop.has(word) && !stop.has(clean)) candidates.push(word);
      });
    });
    return [...new Set(candidates)];
  };

  const enrichRaceFromLooseText = (text, baseList) => {
    let list = parseRaceText(text, baseList);
    const lines = normalizeOcr(text).split("\n").map((x)=>x.trim()).filter(Boolean);
    const names = extractHorseCandidates(text);
    // 馬番を伴わない認識でも、オッズ・人気の並びから行を復元する。
    const oddsRows = [];
    lines.forEach((line) => {
      const m = line.match(/(?:^|\s)(\d{1,2})\s+([^\d]{2,24}?)\s+(\d{1,3}(?:\.\d)?)\s+(\d{1,2})\s*人気/);
      if (m) oddsRows.push({ umaban:m[1], name:m[2].trim(), odds:m[3], ninki:m[4] });
    });
    oddsRows.forEach((r) => {
      let h = list.find((x)=>String(x.umaban)===r.umaban) || findHorse(r.name,list);
      if (!h) { h={...emptyHorse(),...r}; list.push(h); }
      Object.assign(h,r);
    });
    if (list.length < 2 && names.length) {
      const likely = names.filter((n)=>/^[ァ-ヶーA-Za-z]{4,18}$/.test(n)).slice(0,18);
      likely.forEach((name, i)=>{
        if (!findHorse(name,list)) list.push({...emptyHorse(),umaban:String(i+1),name});
      });
    }
    return list.sort((a,b)=>Number(a.umaban||99)-Number(b.umaban||99));
  };

  const analyzeWithLocalOcr = async (entries) => {
    const Tesseract = await loadTesseract();
    const texts = { ...scanText };
    for (let i = 0; i < entries.length; i++) {
      const [type, file] = entries[i];
      const label = SCAN_TYPES.find((x)=>x[0]===type)?.[1] || type;
      texts[type] = await recognizeLocal(Tesseract, file, i, entries.length, label);
    }
    setScanText(texts);
    let next = horses.map((h)=>({ ...h }));
    // 対応サイトの表は11行に分割し、馬番を1〜11で固定して読む。
    // 全画面OCRのゴミ文字を馬名として採用しない。
    const selected = Object.fromEntries(entries);
    let rowStep = 0;
    const rowTypes = ["race","standard","recent"].filter((t)=>selected[t]);
    const span = rowTypes.length ? 72 / rowTypes.length : 0;
    for (const t of rowTypes) {
      next = await recognizeHorseRows(Tesseract, selected[t], t, next, 24 + rowStep*span, span);
      rowStep++;
    }
    if (texts.pace) parsePaceText(texts.pace);
    if (texts.comment) next = assignCommentsByKnownNames(texts.comment, next);
    // 行解析で空欄の項目だけ、全画面OCR結果から補う。
    if (texts.race) {
      const loose = parseRaceText(texts.race, next);
      next = next.map((h)=>{
        const x=loose.find((v)=>String(v.umaban)===String(h.umaban));
        return x ? {...x,...Object.fromEntries(Object.entries(h).filter(([,v])=>v!==""))} : h;
      });
    }
    next = next.filter((h)=>h.name || h.best || h.start || h.oikake || h.agari || h.comment || h.odds || h.jockey)
      .sort((a,b)=>Number(a.umaban||99)-Number(b.umaban||99));
    setHorses(next);
    return next.filter((h)=>h.name && h.name !== "馬名").length;
  };

  const fileToCompressedDataUrl = async (file) => {
    const img = await fileToImage(file);
    const maxSide = 2200;
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  };


  const azureCell = (value) => String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[｜|]/g, " ")
    .trim();

  const azureNumber = (value, min = -Infinity, max = Infinity) => {
    const m = azureCell(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    if (!m) return "";
    const n = Number(m[0]);
    return Number.isFinite(n) && n >= min && n <= max ? String(n) : "";
  };

  const azureInteger = (value, min = -Infinity, max = Infinity) => {
    const text = azureCell(value).replace(/,/g, "");
    const m = text.match(/(?:^|\D)(-?\d{1,3})(?:\D|$)/);
    if (!m) return "";
    const n = Number(m[1]);
    return Number.isInteger(n) && n >= min && n <= max ? String(n) : "";
  };

  const INVALID_HORSE_NAMES = new Set([
    "selected", "select", "option", "undefined", "null", "馬名", "騎手", "斤量",
    "人気", "オッズ", "出馬表", "タイム指数", "スタート", "追走", "上がり",
  ]);

  const cleanHorseName = (value) => {
    const raw = String(value || "").replace(/[\s・･]/g, "").trim();
    if (!raw || INVALID_HORSE_NAMES.has(raw.toLowerCase())) return "";
    if (!/^[ァ-ヶーA-Za-z]{3,24}$/.test(raw)) return "";
    return raw;
  };

  const cleanJockeyName = (value, horseName = "") => {
    const raw = azureCell(value).replace(/[△▲☆◇◎○]/g, "").replace(/\s+/g, "").trim();
    if (!raw || /^(馬名|騎手|斤量|人気|オッズ|牡|牝|セ)$/.test(raw)) return "";
    // 馬名の先頭数文字を騎手欄として誤認したケースを除外
    if (horseName && (horseName.startsWith(raw) || raw.startsWith(horseName))) return "";
    // 国内騎手名は通常、漢字を含む。純カタカナは馬名断片の可能性が高いので除外
    if (!/[一-龠々]/.test(raw)) return "";
    const m = raw.match(/[一-龠々]{1,5}(?:[ぁ-ん]{0,3}|[一-龠々]{0,4})/);
    return m?.[0] || "";
  };

  const nameFromComment = (comment) => {
    const text = String(comment || "").replace(/[\s・･]/g, "");
    const beforeStable = text.split(/[【\[]/)[0] || "";
    const candidates = beforeStable.match(/[ァ-ヶー]{3,24}/g) || [];
    return candidates
      .map(cleanHorseName)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0] || "";
  };

  const sanitizeHorseRecord = (horse) => {
    const h = { ...horse };
    const cleaned = cleanHorseName(h.name);
    h.name = cleaned || nameFromComment(h.comment);
    const pop = Number(String(h.ninki ?? "").trim());
    h.ninki = Number.isInteger(pop) && pop >= 1 && pop <= 20 ? String(pop) : "";
    const odds = Number(String(h.odds ?? "").trim());
    h.odds = Number.isFinite(odds) && odds > 0 && odds < 10000 ? String(odds) : "";
    h.jockey = cleanJockeyName(h.jockey, h.name) || "";
    // 距離・コース指数は専用列から確実に取れた値だけ残す。主要指数の複製は除外。
    for (const key of ["dist", "course"]) {
      const v = String(h[key] ?? "").trim();
      if (!/^\d{1,3}$/.test(v) || [h.best, h.start, h.oikake, h.agari, h.avg5].includes(v)) h[key] = "";
    }
    return h;
  };

  const azureHorseName = (value) => {
    const text = azureCell(value)
      .replace(/[◎○▲△☆◇●◉◯]/g, " ")
      .replace(/(?:牡|牝|セ)\s*\d{1,2}.*/, "")
      .replace(/\d+(?:\.\d+)?.*/, "")
      .trim();
    const candidates = text.match(/[ァ-ヶーA-Za-z]{3,22}/g) || [];
    return candidates
      .map(cleanHorseName)
      .filter(Boolean)
      .filter((x) => !/^(タイム指数|スタート|追走|上がり|オッズ|チェック|切替|人気|出馬表)$/.test(x))
      .sort((a, b) => b.length - a.length)[0] || "";
  };

  const azureHeaderIndex = (rows, aliases, maxHeaderRows = 6) => {
    const limit = Math.min(maxHeaderRows, rows.length);
    let best = -1;
    for (let c = 0; c < Math.max(0, ...rows.slice(0, limit).map((r) => r.length)); c++) {
      const combined = rows.slice(0, limit).map((r) => azureCell(r[c])).join(" ");
      if (aliases.some((a) => combined.includes(a))) { best = c; break; }
    }
    return best;
  };

  const azureLeadingHorseNumber = (value) => {
    const text = azureCell(value)
      .replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, (ch) => String("①②③④⑤⑥⑦⑧⑨⑩".indexOf(ch) + 1))
      .replace(/^[枠馬番\s:：-]+/, "")
      .trim();
    const exact = text.match(/^(?:0?)([1-9]|1\d|20)$/);
    if (exact) return exact[1];
    // 「1 1 セイリュウ」「10 エストレアボニータ」のような結合セルにも対応
    const lead = text.match(/^([1-9]|1\d|20)(?:\s+([1-9]|1\d|20))?(?=\s|[ァ-ヶーA-Za-z])/);
    if (lead) return lead[2] || lead[1];
    return "";
  };

  const azureRowHorseNumber = (row) => {
    for (let c = 0; c < Math.min(6, row.length); c++) {
      const n = azureLeadingHorseNumber(row[c]);
      if (n) return n;
    }
    const joined = row.slice(0, 6).map(azureCell).join(" ");
    return azureLeadingHorseNumber(joined);
  };


  const azureSpatialLines = (payload) => (payload?.pages || [])
    .flatMap((page) => page?.lines || [])
    .filter((line) => line && line.content)
    .map((line) => ({ ...line, content: azureCell(line.content) }));

  const azureMedian = (values) => {
    const sorted = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    if (!sorted.length) return 0.018;
    return sorted[Math.floor(sorted.length / 2)];
  };

  const azureRowBands = (payload) => {
    const lines = azureSpatialLines(payload);
    const medianHeight = azureMedian(lines.map((line) => Number(line.height || 0)));
    const anchors = lines
      .map((line) => ({ line, n: azureLeadingHorseNumber(line.content) }))
      .filter((item) => item.n && Number(item.line.centerX) < 0.34 && Number(item.line.centerY) > 0.14)
      .map((item) => ({ n: Number(item.n), y: Number(item.line.centerY), x: Number(item.line.centerX) }))
      .sort((a, b) => a.y - b.y);
    const unique = [];
    for (const anchor of anchors) {
      if (!unique.some((item) => item.n === anchor.n || Math.abs(item.y - anchor.y) < medianHeight * 0.75)) unique.push(anchor);
    }
    return unique.map((anchor, index) => {
      const prevY = index ? unique[index - 1].y : anchor.y - medianHeight * 2.5;
      const nextY = index + 1 < unique.length ? unique[index + 1].y : anchor.y + medianHeight * 2.5;
      const top = (prevY + anchor.y) / 2;
      const bottom = (anchor.y + nextY) / 2;
      const rowLines = lines.filter((line) => Number(line.centerY) >= top && Number(line.centerY) < bottom).sort((a, b) => Number(a.x) - Number(b.x));
      return { umaban: String(anchor.n), y: anchor.y, top, bottom, lines: rowLines, text: rowLines.map((line) => line.content).join(" ") };
    });
  };

  const azureHeaderCenters = (payload, aliases) => {
    const lines = azureSpatialLines(payload);
    const result: any = {};
    Object.entries(aliases as Record<string, string[]>).forEach(([key, words]) => {
      const hit = lines
        .filter((line) => Number(line.centerY) < 0.55 && words.some((word) => line.content.includes(word)))
        .sort((a, b) => Number(b.width || 0) - Number(a.width || 0))[0];
      if (hit) result[key] = Number(hit.centerX);
    });
    return result;
  };

  const nearestSpatialValue = (row, centerX, parser, maxDistance = 0.11) => {
    if (!Number.isFinite(centerX)) return "";
    const candidates = row.lines
      .map((line) => ({ line, distance: Math.abs(Number(line.centerX) - centerX), value: parser(line.content) }))
      .filter((item) => item.value !== "" && item.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance);
    return candidates[0]?.value || "";
  };

  const mergeAzureRaceSpatial = (payload, baseList) => {
    const rows = azureRowBands(payload);
    const list = baseList.map((h) => ({ ...h }));
    const headers: any = azureHeaderCenters(payload, { name: ["馬名"], jockey: ["騎手"], weight: ["斤量"], odds: ["オッズ", "単勝"], pop: ["人気"] });
    for (const row of rows) {
      let h = list.find((x) => String(x.umaban) === row.umaban);
      if (!h) { h = { ...emptyHorse(), umaban: row.umaban }; list.push(h); }
      const nameCandidates = row.lines
        .filter((line) => Number(line.centerX) > 0.10 && Number(line.centerX) < 0.62)
        .map((line) => azureHorseName(line.content))
        .filter((name) => name && name.length >= 3)
        .sort((a, b) => b.length - a.length);
      const nearestName = nearestSpatialValue(row, headers.name, azureHorseName, 0.22);
      const name = nearestName || nameCandidates[0] || "";
      if (!h.name && name && !/^(馬名|厩舎コメント)$/.test(name)) h.name = name;
      const sex = row.text.match(/(牡|牝|セ)\s*(\d{1,2})/);
      if (sex) h.sex = `${sex[1]}${sex[2]}`;
      const weight = nearestSpatialValue(row, headers.weight, (v) => azureNumber(v, 45, 65), 0.12) || (row.text.match(/(?:牡|牝|セ)\s*\d{1,2}.*?([45]\d(?:\.\d)?)/)?.[1] || "");
      if (!h.weight && weight) h.weight = weight;
      const jockey = nearestSpatialValue(row, headers.jockey, (v) => cleanJockeyName(v, h.name), 0.17);
      if (!h.jockey && jockey) h.jockey = jockey;
      const odds = nearestSpatialValue(row, headers.odds, (v) => azureNumber(v, 1, 9999), 0.12);
      if (!h.odds && odds) h.odds = odds;
      const pop = nearestSpatialValue(row, headers.pop, (v) => azureInteger(v, 1, 20), 0.10) || row.text.match(/(\d{1,2})\s*人気/)?.[1] || "";
      if (!h.ninki && pop) h.ninki = pop;
    }
    return list.sort((a, b) => Number(a.umaban || 99) - Number(b.umaban || 99));
  };

  const mergeAzureIndexSpatial = (payload, baseList, recentMode) => {
    const rows = azureRowBands(payload);
    const list = baseList.map((h) => ({ ...h }));
    const headers: any = azureHeaderCenters(payload, {
      name: ["馬名"], overall: recentMode ? ["総合", "過去1年最高"] : ["全体", "最高"], start: ["スタート"], chase: ["追走"], finish: ["上がり"],
      avg5: ["5走平均"], dist: ["距離"], course: ["コース"], r3: ["3走前", "3走"], r2: ["2走前", "2走"], r1: ["前走"],
    });
    for (const row of rows) {
      let h = list.find((x) => String(x.umaban) === row.umaban);
      if (!h) { h = { ...emptyHorse(), umaban: row.umaban }; list.push(h); }
      if (!h.name) {
        const name = nearestSpatialValue(row, headers.name, azureHorseName, 0.20) || row.lines.map((line) => azureHorseName(line.content)).filter(Boolean).sort((a,b)=>b.length-a.length)[0] || "";
        if (name) h.name = name;
      }
      const assign = (key, center) => {
        if (h[key] !== "" && h[key] !== null && h[key] !== undefined) return;
        const value = nearestSpatialValue(row, center, (v) => azureInteger(v.replace(/\*/g, ""), 20, 120), 0.075);
        if (value) h[key] = value;
      };
      assign("best", headers.overall); assign("start", headers.start); assign("oikake", headers.chase); assign("agari", headers.finish);
      assign("avg5", headers.avg5);
      if (recentMode) {
        assign("r3", headers.r3); assign("r2", headers.r2); assign("r1", headers.r1);
      }
      // 「距離&コース」の結合見出しは同じ数値を複数列へ誤配置しやすいので自動投入しない。

      if (!h.best || !h.start || !h.oikake || !h.agari) {
        const numeric = row.lines
          .filter((line) => Number(line.centerX) > 0.24)
          .map((line) => azureInteger(line.content.replace(/\*/g, ""), 20, 120))
          .filter(Boolean);
        if (!recentMode && numeric.length >= 4) {
          if (!h.best) h.best = numeric[0]; if (!h.start) h.start = numeric[1]; if (!h.oikake) h.oikake = numeric[2]; if (!h.agari) h.agari = numeric[3];
          if (!h.avg5 && numeric[4]) h.avg5 = numeric[4];
        }
      }
    }
    return list.sort((a,b)=>Number(a.umaban||99)-Number(b.umaban||99));
  };

  const mergeAzureCommentSpatial = (payload, baseList) => {
    const rows = azureRowBands(payload);
    const list = baseList.map((h) => ({ ...h }));
    for (const row of rows) {
      const h = list.find((x) => String(x.umaban) === row.umaban);
      if (!h) continue;
      const comment = row.lines
        .filter((line) => Number(line.centerX) > 0.08)
        .map((line) => line.content)
        .filter((text) => text !== h.name && !/^(?:[1-9]|1\d|20)$/.test(text))
        .join(" ")
        .replace(new RegExp(`^[○◎△▲]?${h.name ? h.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : ""}\\s*`), "")
        .trim();
      if (comment.length >= 6) { h.comment = comment.slice(0, 500); h.condition = String(commentScore(h.comment)); }
    }
    return list;
  };

  const azureNameCandidates = (value) => {
    const text = azureCell(value)
      .replace(/[◎○▲△☆◇●◉◯]/g, " ")
      .replace(/(?:牡|牝|セ)\s*\d{1,2}/g, " ")
      .replace(/\d+(?:\.\d+)?/g, " ");
    return (text.match(/[ァ-ヶー]{3,24}/g) || [])
      .filter((name) => !/^(タイム指数|スタート指数|追走指数|上がり指数|タイム予測|ポジション|コメント|オッズ|データ分析|レース結果|出馬表|馬名|騎手|斤量|人気)$/.test(name));
  };

  const mergeAzureGenericTextRows = (payload, baseList) => {
    const list = baseList.map((h) => ({ ...h }));
    const lines = azureSpatialLines(payload);
    for (const line of lines) {
      const umaban = azureLeadingHorseNumber(line.content);
      if (!umaban) continue;
      const names = azureNameCandidates(line.content).sort((a, b) => b.length - a.length);
      if (!names.length) continue;
      let h = list.find((x) => String(x.umaban) === String(umaban));
      if (!h) { h = { ...emptyHorse(), umaban: String(umaban) }; list.push(h); }
      if (!h.name || h.name === "馬名") h.name = names[0];
    }
    // Azureが行を分割した場合は、馬番アンカーの直後にある馬名候補を縦位置で割り当てる
    const bands = azureRowBands(payload);
    for (const row of bands) {
      let h = list.find((x) => String(x.umaban) === row.umaban);
      if (!h) { h = { ...emptyHorse(), umaban: row.umaban }; list.push(h); }
      if (h.name && h.name !== "馬名") continue;
      const candidates = row.lines
        .filter((line) => Number(line.centerX) > 0.10 && Number(line.centerX) < 0.70)
        .flatMap((line) => azureNameCandidates(line.content))
        .sort((a, b) => b.length - a.length);
      if (candidates[0]) h.name = candidates[0];
    }
    return list;
  };

  const pickAzureTable = (tables, type) => {
    const scored = (tables || []).map((table) => {
      const rows = table?.rows || [];
      const text = rows.flat().join(" ");
      const horseRows = rows.filter((r) => azureRowHorseNumber(r)).length;
      let score = horseRows * 5 + Math.min(rows.length, 20);
      if (type === "race" && /馬名|オッズ|人気|騎手/.test(text)) score += 35;
      if (type === "standard" && /スタート|追走|上がり|5走平均/.test(text)) score += 40;
      if (type === "recent" && /過去1年|前走|3走前|2走前|5走平均/.test(text)) score += 40;
      if (type === "pace" && /前半3F|後半3F|予測タイム|ペース/.test(text)) score += 35;
      if (type === "comment" && /厩舎|コメント|厩舎の話/.test(text)) score += 25;
      return { table, score };
    }).sort((a, b) => b.score - a.score);
    return scored[0]?.table || null;
  };

  const mergeAzureRaceTable = (payload, baseList) => {
    const table = pickAzureTable(payload.tables, "race");
    if (!table) return mergeAzureGenericTextRows(payload, mergeAzureRaceSpatial(payload, baseList));
    const rows = table.rows || [];
    const nameCol = azureHeaderIndex(rows, ["馬名"]);
    const jockeyCol = azureHeaderIndex(rows, ["騎手"]);
    const weightCol = azureHeaderIndex(rows, ["斤量"]);
    const oddsCol = azureHeaderIndex(rows, ["単勝オッズ", "オッズ"]);
    const popCol = azureHeaderIndex(rows, ["人気"]);
    const sexCol = azureHeaderIndex(rows, ["性齢", "年齢"]);
    const list = baseList.map((h) => ({ ...h }));

    rows.forEach((row) => {
      const umaban = azureRowHorseNumber(row);
      if (!umaban) return;
      let name = nameCol >= 0 ? azureHorseName(row[nameCol]) : "";
      if (!name) {
        const all = row.map(azureHorseName).filter(Boolean);
        name = all.sort((a, b) => b.length - a.length)[0] || "";
      }
      let h = list.find((x) => String(x.umaban) === umaban);
      if (!h) { h = { ...emptyHorse(), umaban }; list.push(h); }
      if (name) h.name = name;
      const rowText = row.map(azureCell).join(" ");
      const sex = sexCol >= 0 ? azureCell(row[sexCol]).match(/(牡|牝|セ)\s*(\d{1,2})/) : rowText.match(/(牡|牝|セ)\s*(\d{1,2})/);
      if (sex) h.sex = `${sex[1]}${sex[2]}`;
      const weight = weightCol >= 0 ? azureNumber(row[weightCol], 45, 65) : "";
      if (weight) h.weight = weight;
      if (jockeyCol >= 0) {
        const jockey = cleanJockeyName(row[jockeyCol], h.name);
        if (jockey) h.jockey = jockey;
      }
      // 「6.5 4人気」のような明示表記を最優先し、オッズと人気の列ずれを防ぐ
      const op = rowText.match(/(\d{1,3}(?:\.\d+)?)\s*(\d{1,2})\s*人気/);
      if (op) {
        h.odds = op[1];
        h.ninki = op[2];
      } else {
        const odds = oddsCol >= 0 ? azureNumber(row[oddsCol], 1, 9999) : "";
        if (odds) h.odds = odds;
        const pop = popCol >= 0 ? azureInteger(row[popCol], 1, 20) : "";
        if (pop) h.ninki = pop;
      }
    });
    const spatial = mergeAzureRaceSpatial(payload, list);
    const generic = mergeAzureGenericTextRows(payload, spatial);
    return generic.sort((a, b) => Number(a.umaban || 99) - Number(b.umaban || 99));
  };

  const mergeAzureIndexTable = (payload, baseList, recentMode) => {
    const table = pickAzureTable(payload.tables, recentMode ? "recent" : "standard");
    if (!table) return mergeAzureIndexSpatial(payload, baseList, recentMode);
    const rows = table.rows || [];
    const list = baseList.map((h) => ({ ...h }));
    const cols = {
      name: azureHeaderIndex(rows, ["馬名"]),
      overall: azureHeaderIndex(rows, recentMode ? ["総合", "過去1年最高"] : ["全体", "最高"]),
      start: azureHeaderIndex(rows, ["スタート"]),
      chase: azureHeaderIndex(rows, ["追走"]),
      finish: azureHeaderIndex(rows, ["上がり"]),
      avg5: azureHeaderIndex(rows, ["5走平均"]),
      dist: azureHeaderIndex(rows, ["距離"]),
      course: azureHeaderIndex(rows, ["コース"]),
      r3: azureHeaderIndex(rows, ["3走前", "3走"]),
      r2: azureHeaderIndex(rows, ["2走前", "2走"]),
      r1: azureHeaderIndex(rows, ["前走"]),
    };
    rows.forEach((row) => {
      const umaban = azureRowHorseNumber(row);
      if (!umaban) return;
      let h = list.find((x) => String(x.umaban) === umaban);
      if (!h) { h = { ...emptyHorse(), umaban }; list.push(h); }
      if (!h.name && cols.name >= 0) {
        const nm = azureHorseName(row[cols.name]);
        if (nm) h.name = nm;
      }
      const setVal = (key, col, min = 0, max = 140) => {
        if (col >= 0) { const v = azureNumber(row[col], min, max); if (v) h[key] = v; }
      };
      setVal("best", cols.overall, 0, 140);
      setVal("start", cols.start, 0, 140);
      setVal("oikake", cols.chase, 0, 140);
      setVal("agari", cols.finish, 0, 140);
      setVal("avg5", cols.avg5, 0, 140);
      if (recentMode) {
        setVal("r3", cols.r3, 0, 140);
        setVal("r2", cols.r2, 0, 140);
        setVal("r1", cols.r1, 0, 140);
      }
      // 距離・コース指数は結合セル誤認識が多いため、確実な専用入力がある時だけ手動補完する。
    });
    // 表認識に成功した場合はセル値を正とし、座標OCRで空欄を無理に埋めない。
    // オッズ・人気・斤量を指数列へ誤配置する事故を防ぐ。
    return list.sort((a, b) => Number(a.umaban || 99) - Number(b.umaban || 99));
  };

  const mergeAzureComments = (payload, baseList) => {
    const table = pickAzureTable(payload.tables, "comment");
    if (!table) return mergeAzureCommentSpatial(payload, baseList);
    const list = baseList.map((h) => ({ ...h }));
    (table.rows || []).forEach((row) => {
      const umaban = azureRowHorseNumber(row);
      if (!umaban) return;
      const h = list.find((x) => String(x.umaban) === umaban);
      if (!h) return;
      const cells = row.map(azureCell).filter(Boolean);
      const comment = cells
        .filter((x) => x !== umaban && x !== h.name && !/^枠?\d+$/.test(x))
        .sort((a, b) => b.length - a.length)[0] || "";
      if (comment.length >= 6) {
        h.comment = comment.slice(0, 400);
        h.condition = String(commentScore(h.comment));
      }
    });
    return mergeAzureCommentSpatial(payload, list);
  };

  const analyzeWithAzure = async (entries) => {
    const texts = { ...scanText };
    const payloads: any = {};
    for (let i = 0; i < entries.length; i++) {
      const [type, file] = entries[i];
      const label = SCAN_TYPES.find((x)=>x[0]===type)?.[1] || type;
      setScanLog(`${label}をAzure Document Intelligenceで解析中…`);
      setScanProgress(Math.round((i / entries.length) * 90) + 2);
      const image = await fileToCompressedDataUrl(file);
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, type }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAzureDebug((prev)=>({ ...prev, [type]: { httpStatus: response.status, ...payload } }));
        throw new Error(payload?.error || `${label}の解析に失敗しました`);
      }
      payloads[type] = payload;
      texts[type] = payload.text || "";
      // F0無料枠で連続リクエストが集中しないよう、画像間に少し間隔を空ける。
      if (i < entries.length - 1) {
        setScanLog(`${label}の解析完了。次の画像まで待機中…`);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
    setScanText(texts);
    setAzureDebug(payloads);
    setAzureLastError("");

    // 出馬表を含む新規解析では前回レースの値を持ち越さず、列ずれ・残存値を防ぐ。
    let next = payloads.race ? [] : horses.map((h)=>({ ...h }));
    if (payloads.race) next = mergeAzureRaceTable(payloads.race, next);
    if (payloads.standard) next = mergeAzureIndexTable(payloads.standard, next, false);
    if (payloads.recent) next = mergeAzureIndexTable(payloads.recent, next, true);
    if (payloads.pace) parsePaceText(payloads.pace.text || "");
    if (payloads.comment) next = mergeAzureComments(payloads.comment, next);

    next = next
      .map(sanitizeHorseRecord)
      .filter((h)=>h.name || h.best || h.start || h.oikake || h.agari || h.comment || h.odds || h.jockey)
      .sort((a,b)=>Number(a.umaban||99)-Number(b.umaban||99));
    setHorses(next);
    return next.filter((h)=>h.name && h.name !== "馬名").length;
  };

  const analyzeScreenshots = async () => {
    const entries = Object.entries(scanFiles).filter(([,file])=>file);
    if (!entries.length) { flash("スクリーンショットを1枚以上選んでください"); return; }
    setScanBusy(true); setScanProgress(1); setScanLog("Azure解析を準備しています…");
    try {
      let count;
      try {
        count = await analyzeWithAzure(entries);
        setScanLog(`${count}頭をAzure OCRで反映しました。読み違いだけ表で修正してください。`);
      } catch (azureError) {
        console.warn("Azure OCR failed; falling back to local OCR", azureError);
        const azureMessage = azureError?.message || "設定を確認してください";
        setAzureLastError(azureMessage);
        setScanLog(`Azure解析に失敗したため端末内OCRへ切り替えます：${azureMessage}`);
        count = await analyzeWithLocalOcr(entries);
        setScanLog(`${count}頭を端末内OCRで反映しました。Azure設定も確認してください。`);
      }
      setActiveSavedRaceId(null);
      setResultEntryMode(false);
      setScanProgress(100);
      flash("スクショ解析が完了しました");
    } catch (error) {
      console.error(error);
      setScanLog(`解析に失敗しました: ${error?.message || "通信状態を確認してください"}`);
      flash("スクショ解析に失敗しました");
    } finally { setScanBusy(false); }
  };

  const downloadAzureDebug = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      azureError: azureLastError || null,
      scanText,
      azure: azureDebug,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jra-azure-debug-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    flash("Azure解析JSONを書き出しました");
  };

  // ---- JSON入出力 ----
  const doExport = () => {
    const data = { raceName, track, surface, distance, going, raceClass, paceType, learningOn, learned, historyCount, horses, weights, agariBonus, oddsOn, decayScale, oddsStrength };
    setExportText(JSON.stringify(data, null, 2));
  };
  const doImportJson = () => {
    try {
      const data = JSON.parse(exportText);
      if (data.horses) setHorses(data.horses);
      if (data.raceName !== undefined) setRaceName(data.raceName);
      if (data.track) setTrack(data.track);
      if (data.surface) setSurface(data.surface);
      if (data.distance !== undefined) setDistance(data.distance);
      if (data.going) setGoing(data.going);
      if (data.raceClass) setRaceClass(data.raceClass);
      if (data.paceType) setPaceType(data.paceType);
      if (data.learningOn !== undefined) setLearningOn(data.learningOn);
      if (data.learned) setLearned((prev) => ({ ...prev, ...data.learned }));
      if (data.historyCount !== undefined) setHistoryCount(data.historyCount);
          if (Array.isArray(data.learningHistory)) setLearningHistory(data.learningHistory);
      if (data.weights) setWeights(data.weights);
      if (data.agariBonus !== undefined) setAgariBonus(data.agariBonus);
      if (data.oddsOn !== undefined) setOddsOn(data.oddsOn);
      if (data.decayScale !== undefined) setDecayScale(data.decayScale);
      if (data.oddsStrength !== undefined) setOddsStrength(data.oddsStrength);
      flash("JSONを読み込みました");
    } catch (e) {
      flash("JSONの読み込みに失敗しました");
    }
  };
  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      flash("コピーしました");
    } catch (e) {
      flash("コピーに失敗しました");
    }
  };

  // ---- スコア計算 ----
  const wSum = weights.best + weights.avg5 + weights.dist + weights.course || 1;

  const computed = useMemo(() => {
    // 先に全馬を数値化し、レース内の相対評価も使えるようにする
    const parsed = horses.map((h) => ({
      ...h,
      _best: num(h.best),
      _start: num(h.start),
      _oikake: num(h.oikake),
      _agari: num(h.agari),
      _avg5: num(h.avg5),
      _dist: num(h.dist),
      _course: num(h.course),
      _r3: num(h.r3),
      _r2: num(h.r2),
      _r1: num(h.r1),
      _odds: num(h.odds),
      _groundFit: num(h.groundFit),
      _classFit: num(h.classFit),
      _jockeyIndex: num(h.jockeyIndex),
      _gateFit: num(h.gateFit),
      _bodyChange: num(h.bodyChange),
      _pedigreeFit: num(h.pedigreeFit),
      _condition: num(h.condition),
    }));

    const avgOf = (key) => {
      const vals = parsed.map((h) => h[key]).filter((v) => v !== null && Number.isFinite(v));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    const raceAvg = {
      start: avgOf("_start"),
      oikake: avgOf("_oikake"),
      agari: avgOf("_agari"),
      oddsLog: (() => {
        const vals = parsed.filter((h) => h._odds && h._odds > 0).map((h) => Math.log(h._odds));
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      })(),
    };

    const d = Number(distance) || 0;
    const isSprint = d > 0 && d <= 1400;
    const isLong = d >= 2200;

    return parsed.map((h) => {
      const best = h._best;
      const avg5 = h._avg5;
      const dist = h._dist;
      const course = h._course;

      // 未経験値は過度に高く見積もらず、全体最高から控えめに代替
      const distVal = dist !== null ? dist : best !== null ? best - 5 : null;
      const courseVal = course !== null ? course : best !== null ? best - 4 : null;

      const parts = [];
      if (best !== null) parts.push([best, weights.best]);
      if (avg5 !== null) parts.push([avg5, weights.avg5]);
      if (distVal !== null) parts.push([distVal, weights.dist]);
      if (courseVal !== null) parts.push([courseVal, weights.course]);

      let base = null;
      if (parts.length > 0) {
        const wTotal = parts.reduce((sum, [, w]) => sum + w, 0) || 1;
        base = parts.reduce((sum, [v, w]) => sum + v * w, 0) / wTotal;
      }

      // 直近3走: 単純平均だけでなく、上向き・下向きの方向も反映
      const recentVals = [h._r3, h._r2, h._r1].filter((v) => v !== null);
      let recentAdj = 0;
      if (base !== null && recentVals.length) {
        const weighted = [
          h._r1 !== null ? [h._r1, 4] : null,
          h._r2 !== null ? [h._r2, 2] : null,
          h._r3 !== null ? [h._r3, 1] : null,
        ].filter(Boolean);
        const wt = weighted.reduce((sum, [, w]) => sum + w, 0);
        const recentAvg = weighted.reduce((sum, [v, w]) => sum + v * w, 0) / wt;
        const trend = h._r1 !== null && h._r3 !== null ? (h._r1 - h._r3) : 0;
        recentAdj = (recentAvg - base) * 0.16 + Math.max(-3, Math.min(3, trend * 0.06));
      }

      // 条件別の脚質適性。短距離・ダートは先行力、長距離芝は末脚を強める
      let paceAdj = 0;
      if (base !== null) {
        if (h._start !== null && raceAvg.start !== null) {
          const startWeight = surface === "ダート" ? 0.13 : isSprint ? 0.11 : 0.05;
          paceAdj += (h._start - raceAvg.start) * startWeight;
        }
        if (h._oikake !== null && raceAvg.oikake !== null) {
          const chaseWeight = surface === "ダート" ? 0.10 : isSprint ? 0.08 : 0.05;
          paceAdj += (h._oikake - raceAvg.oikake) * chaseWeight;
        }
        if (agariBonus && surface === "芝" && h._agari !== null && raceAvg.agari !== null) {
          const finishWeight = isLong ? 0.15 : isSprint ? 0.07 : 0.11;
          paceAdj += (h._agari - raceAvg.agari) * finishWeight;
        }
      }

      // 欠損が多い馬の過大評価を抑える信頼度補正
      const coreKnown = [h._best, h._avg5, h._dist, h._course].filter((v) => v !== null).length;
      const reliabilityAdj = base !== null ? -(4 - coreKnown) * 0.35 : 0;

      let score = base !== null ? base + recentAdj + paceAdj + reliabilityAdj : null;

      // オッズは市場の集合知として弱く利用。低オッズを加点、高オッズを減点する。
      // 強く掛けすぎると人気順のコピーになるため、最大でも数ポイントに制限。
      let oddsBonus = 0;
      if (oddsOn && h._odds !== null && h._odds > 0 && score !== null && raceAvg.oddsLog !== null) {
        const marketEdge = raceAvg.oddsLog - Math.log(h._odds);
        oddsBonus = Math.max(-3.5, Math.min(3.5, marketEdge * (oddsStrength / 10)));
      }

      // 調教・厩舎コメントを100点化。50〜55点を中立として補正する。
      const training100 = num(h.trainingScore) ?? GRADE_TO_TRAINING_100[h.training] ?? 70;
      const comment100 = scoreCommentText(h.comment || "");
      const trainingAdj = clamp((training100 - 65) / 5, -5.5, 6.0) * (learningOn ? learned.training : 1);
      const commentAdj = clamp((comment100 - 55) / 8, -3.5, 4.5) * (learningOn ? learned.comment : 1);
      const styleAdj = (STYLE_PACE_SCORE[paceType]?.[h.runningStyle] ?? 0) * (learningOn ? learned.pace : 1);
      const fitAdj = (value, scale, key) => value === null ? 0 : clamp((value - 50) / scale, -2.2, 2.2) * (learningOn ? learned[key] : 1);
      const groundAdj = fitAdj(h._groundFit, 20, "ground");
      const classAdj = fitAdj(h._classFit, 22, "classFit");
      const jockeyAdj = fitAdj(h._jockeyIndex, 25, "jockey");
      const gateAdj = fitAdj(h._gateFit, 25, "gate");
      const pedigreeAdj = fitAdj(h._pedigreeFit, 28, "pedigree");
      const conditionAdj = fitAdj(h._condition, 22, "condition");
      let bodyAdj = 0;
      if (h._bodyChange !== null) {
        const abs = Math.abs(h._bodyChange);
        bodyAdj = abs <= 6 ? 0.3 : abs <= 12 ? -0.3 : abs <= 18 ? -1.0 : -1.8;
        bodyAdj *= learningOn ? learned.body : 1;
      }
      const contextAdj = clamp(trainingAdj + commentAdj + styleAdj + groundAdj + classAdj + jockeyAdj + gateAdj + pedigreeAdj + conditionAdj + bodyAdj, -15, 15);

      const finalScore = score !== null ? score + oddsBonus + contextAdj : null;
      return {
        ...h,
        _distVal: distVal,
        _courseVal: courseVal,
        _base: base,
        _recentAdj: recentAdj,
        _paceAdj: paceAdj,
        _reliabilityAdj: reliabilityAdj,
        _oddsBonus: oddsBonus,
        _trainingScore: training100,
        _commentScore: comment100,
        _commentAdj: commentAdj,
        _contextAdj: contextAdj,
        _finalScore: finalScore,
      };
    });
  }, [horses, weights, agariBonus, surface, distance, oddsOn, oddsStrength, paceType, learningOn, learned]);

  const ranked = useMemo(() => {
    const withScore = computed.filter((h) => h._finalScore !== null);
    const sorted = [...withScore].sort((a, b) => b._finalScore - a._finalScore);
    const rankMap = new Map(sorted.map((h, i) => [h.id, i]));
    const marks = ["◎", "○", "▲", "△", "△", "☆"];
    return computed.map((h) => {
      const idx = rankMap.get(h.id);
      const autoMark = idx !== undefined && idx < marks.length ? marks[idx] : "";
      return { ...h, _rank: idx !== undefined ? idx + 1 : null, _autoMark: autoMark };
    });
  }, [computed]);

  const raceAnalytics = useMemo(() => {
    const scored = ranked.filter((h) => h._finalScore !== null).sort((a,b)=>b._finalScore-a._finalScore);
    if (!scored.length) return { chaos: 0, label: "未判定", reasons: [], marked: [], bets: [] };
    const top = scored[0];
    const second = scored[1];
    const third = scored[2];
    let chaos = 28;
    const reasons: string[] = [];
    const gap12 = top && second ? top._finalScore - second._finalScore : 8;
    const gap15 = top && scored[4] ? top._finalScore - scored[4]._finalScore : 15;
    if (gap12 < 1.5) { chaos += 16; reasons.push("上位2頭が拮抗"); }
    else if (gap12 < 3) { chaos += 9; reasons.push("本命と対抗の差が小さい"); }
    if (gap15 < 7) { chaos += 14; reasons.push("上位勢の指数差が小さい"); }
    const favorite = scored.find((h)=>num(h.ninki)===1);
    if (!favorite || favorite._rank >= 4) { chaos += 15; reasons.push("1番人気の信頼度が低め"); }
    const valueHorses = scored.filter((h)=>num(h.ninki)!==null && num(h.ninki)>=6 && h._rank<=6);
    if (valueHorses.length >= 2) { chaos += 14; reasons.push("人気薄の高評価馬が複数"); }
    else if (valueHorses.length === 1) { chaos += 7; reasons.push("人気薄の高評価馬あり"); }
    const missing = ranked.filter((h)=>h._finalScore===null).length;
    if (missing >= 2) { chaos += 8; reasons.push("指数欠損馬が多い"); }
    if (paceType === "H") { chaos += 6; reasons.push("ハイペース予測"); }
    chaos = Math.round(clamp(chaos, 5, 95));
    const label = chaos >= 80 ? "大波乱" : chaos >= 65 ? "波乱" : chaos >= 45 ? "中波乱" : chaos >= 25 ? "やや堅い" : "堅い";

    const enhanced = ranked.map((h) => {
      const popularity = num(h.ninki);
      const valueGap = popularity !== null && h._rank !== null ? popularity - h._rank : 0;
      const odds = num(h.odds);
      const valueScore = Math.round(clamp(50 + valueGap * 7 + (odds && odds >= 10 ? 5 : 0), 20, 95));
      return { ...h, _valueScore: valueScore };
    });
    const marked = enhanced.filter((h)=>h.mark || h._autoMark).map((h)=>({ ...h, _displayMark: h.mark || h._autoMark }))
      .sort((a,b)=>(MARK_ORDER[a._displayMark]??9)-(MARK_ORDER[b._displayMark]??9));
    const pick = (m) => marked.find((h)=>h._displayMark===m);
    const main = pick("◎"), sub = pick("○"), thirdPick = pick("▲");
    const deltas = marked.filter((h)=>["△","☆"].includes(h._displayMark)).slice(0,3);
    const bets: string[] = [];
    if (main) bets.push(`単勝 ${main.umaban}`);
    if (main && sub) bets.push(`馬連 ${main.umaban}-${sub.umaban}`);
    if (main) deltas.slice(0,2).forEach((h)=>bets.push(`ワイド ${main.umaban}-${h.umaban}`));
    if (main && sub && thirdPick) bets.push(`三連複 ${main.umaban}-${sub.umaban}-${thirdPick.umaban}`);
    return { chaos, label, reasons, marked, bets };
  }, [ranked, paceType]);

  const parseResultOrder = (raw: string) => {
    const nums = String(raw || "").match(/\d{1,2}/g)?.map(Number) || [];
    if (nums.length !== 3) return { ok: false as const, message: "1着-2着-3着の馬番を3頭入力してください（例: 3-11-5）", order: [] as number[] };
    if (new Set(nums).size !== 3) return { ok: false as const, message: "同じ馬番は重複して入力できません", order: nums };
    const valid = new Set(ranked.map((h:any)=>Number(h.umaban)).filter(Number.isFinite));
    const invalid = nums.filter(n=>!valid.has(n));
    if (invalid.length) return { ok: false as const, message: `存在しない馬番があります: ${invalid.join(", ")}`, order: nums };
    return { ok: true as const, message: "", order: nums };
  };

  const factorGetters = (pace: string = paceType) => ({
    training: (h:any) => (h._trainingScore ?? num(h.trainingScore) ?? GRADE_TO_TRAINING_100[h.training] ?? 70) - 65,
    comment: (h:any) => (h._commentScore ?? scoreCommentText(h.comment || "")) - 55,
    value: (h:any) => { const p=num(h.ninki); const rank=num(h._rank); return p===null||rank===null ? 0 : p-rank; },
    pace: (h:any) => STYLE_PACE_SCORE[pace]?.[h.runningStyle] ?? 0,
    ground: (h:any) => h._groundFit === null || h._groundFit === undefined ? 0 : h._groundFit - 50,
    classFit: (h:any) => h._classFit === null || h._classFit === undefined ? 0 : h._classFit - 50,
    jockey: (h:any) => h._jockeyIndex === null || h._jockeyIndex === undefined ? 0 : h._jockeyIndex - 50,
    gate: (h:any) => h._gateFit === null || h._gateFit === undefined ? 0 : h._gateFit - 50,
    body: (h:any) => h._bodyChange === null || h._bodyChange === undefined ? 0 : -Math.abs(h._bodyChange),
    pedigree: (h:any) => h._pedigreeFit === null || h._pedigreeFit === undefined ? 0 : h._pedigreeFit - 50,
    condition: (h:any) => h._condition === null || h._condition === undefined ? 0 : h._condition - 50,
  });

  const learningDelta = (topValues:number[], otherValues:number[]) => {
    if (!topValues.length || !otherValues.length) return 0;
    const mean=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
    const a=mean(topValues), b=mean(otherValues);
    const all=[...topValues,...otherValues];
    const mu=mean(all);
    const variance=all.reduce((sum,v)=>sum+(v-mu)*(v-mu),0)/Math.max(1,all.length-1);
    const sd=Math.sqrt(variance);
    const effect=Math.abs(a-b)/Math.max(sd, 4);
    if (effect < 0.18) return 0;
    const magnitude=clamp(0.01 + effect*0.012, 0.01, 0.04);
    return a>b ? magnitude : -magnitude;
  };

  const learnFromRace = (raceHorses:any[], pace:string, base:any) => {
    const top3 = raceHorses.filter((h:any)=>{ const f=num(h.finish); return f!==null && f<=3; });
    const topIds = new Set(top3.map((h:any)=>String(h.id || h.umaban)));
    const others = raceHorses.filter((h:any)=>!topIds.has(String(h.id || h.umaban)));
    if (top3.length < 3 || !others.length) return { next: base, changes: {} as Record<string,number> };
    const getters:any = factorGetters(pace);
    const next={...base};
    const changes:Record<string,number>={};
    Object.entries(getters).forEach(([key,getter]:any)=>{
      const topValues=top3.map((h:any)=>Number(getter(h))).filter(Number.isFinite);
      const otherValues=others.map((h:any)=>Number(getter(h))).filter(Number.isFinite);
      const delta=learningDelta(topValues,otherValues);
      if (!delta) return;
      const before=Number(base[key] ?? 1);
      const after=clamp(before+delta,0.65,1.35);
      next[key]=Number(after.toFixed(4));
      changes[key]=Number((after-before).toFixed(4));
    });
    return {next,changes};
  };

  const resultTop3Of = (race:any) => (race?.horses||[])
    .filter((h:any)=>{ const f=num(h.finish); return f!==null && f>=1 && f<=3; })
    .sort((a:any,b:any)=>num(a.finish)-num(b.finish));

  const learningSummary = useMemo(() => {
    const completed = savedRaces.filter((r)=>r.status === "completed");
    let topWin=0, topPlace=0, markedTop3=0, totalTop3=0, total=0;
    completed.forEach((r)=>{
      const all=(r.horses||[]);
      const actual=resultTop3Of(r);
      if(actual.length<3) return;
      total += 1;
      totalTop3 += 3;
      const pred=[...all].filter((h:any)=>num(h.predictedScore)!==null).sort((a:any,b:any)=>num(b.predictedScore)-num(a.predictedScore));
      const top=pred[0];
      const winner=actual.find((h:any)=>num(h.finish)===1);
      const actualIds=new Set(actual.map((h:any)=>String(h.id||h.umaban)));
      if(top && winner && String(top.id||top.umaban)===String(winner.id||winner.umaban)) topWin += 1;
      if(top && actualIds.has(String(top.id||top.umaban))) topPlace += 1;
      markedTop3 += actual.filter((h:any)=>["◎","○","▲","△","☆"].includes(h.mark||h._autoMark||"")).length;
    });
    return { total, topWin, topPlace, markedTop3, totalTop3 };
  }, [savedRaces]);

  const dataQuality = useMemo(() => {
    const total = ranked.length;
    if (!total) return { score: 0, label: "未入力", issues: ["出走馬データがありません"], core: 0, training: 0, comments: 0 };
    const core = ranked.filter(h => [h._best,h._avg5,h._dist,h._course].filter(v=>v!==null).length >= 3).length;
    const training = ranked.filter(h => (h.trainingNote || num(h.trainingScore)!==null)).length;
    const comments = ranked.filter(h => String(h.comment||"").trim().length >= 8).length;
    const odds = ranked.filter(h => num(h.odds)!==null && num(h.ninki)!==null).length;
    const score = Math.round(clamp((core/total)*45 + (training/total)*20 + (comments/total)*20 + (odds/total)*15, 0, 100));
    const issues:string[]=[];
    if(core<total) issues.push(`主要指数不足 ${total-core}頭`);
    if(training<total) issues.push(`調教不足 ${total-training}頭`);
    if(comments<total) issues.push(`コメント不足 ${total-comments}頭`);
    if(odds<total) issues.push(`人気・オッズ不足 ${total-odds}頭`);
    return { score, label: score>=85?"良好":score>=65?"概ね良好":score>=45?"注意":"不足", issues, core, training, comments };
  }, [ranked]);

  const confidence = useMemo(() => {
    const scored=[...ranked].filter(h=>h._finalScore!==null).sort((a,b)=>b._finalScore-a._finalScore);
    if(scored.length<2) return {score:0, grade:"-", reasons:["指数データ不足"]};
    const gap=scored[0]._finalScore-scored[1]._finalScore;
    let score=42 + clamp(gap*7,0,28) + (dataQuality.score-50)*0.35 - Math.max(0,raceAnalytics.chaos-50)*0.22;
    score=Math.round(clamp(score,5,95));
    const grade=score>=80?"A":score>=65?"B":score>=50?"C":score>=35?"D":"E";
    const reasons=[gap>=3?"本命と対抗に指数差あり":"上位が拮抗", dataQuality.score>=75?"入力データは充実":"データ欠損に注意", raceAnalytics.chaos>=65?"波乱要素が強い":"波乱要素は限定的"];
    return {score,grade,reasons};
  },[ranked,dataQuality,raceAnalytics]);

  const buildReview = (race:any) => {
    const all=(race?.horses||[]);
    const actual=resultTop3Of(race);
    if(actual.length<3) return null;
    const pred=[...all].filter((h:any)=>num(h.predictedScore)!==null).sort((a:any,b:any)=>num(b.predictedScore)-num(a.predictedScore));
    const top=pred[0], top3=actual;
    const missed=top3.filter((h:any)=>!["◎","○","▲","△","☆"].includes(h.mark||""));
    const actualIds=new Set(top3.map((h:any)=>String(h.id||h.umaban)));
    const over=pred.filter((h:any)=>["◎","○","▲"].includes(h.mark||"") && !actualIds.has(String(h.id||h.umaban)));
    const notes:string[]=[];
    missed.forEach((h:any)=>{
      const ts=num(h.trainingScore)??GRADE_TO_TRAINING_100[h.training]??70;
      if(ts>=80) notes.push(`${h.umaban} ${h.name}: 調教高評価(${ts})を印に反映できず`);
      else if(num(h.avg5)!==null && num(h.avg5)>=80) notes.push(`${h.umaban} ${h.name}: 近走指数${h.avg5}を評価不足`);
      else notes.push(`${h.umaban} ${h.name}: 好走馬を無印。条件適性・展開・人気乖離を再検証候補`);
    });
    over.slice(0,2).forEach((h:any)=>notes.push(`${h.umaban} ${h.name}: ${h.mark}評価だったが3着外。高評価要因を過大評価した可能性`));
    if(!notes.length) notes.push("上位評価と実着順のズレは小さめでした");
    const hitTop3=top3.filter((h:any)=>["◎","○","▲","△","☆"].includes(h.mark||"")).length;
    const winner=top3.find((h:any)=>num(h.finish)===1);
    const topWon=top&&winner&&String(top.id||top.umaban)===String(winner.id||winner.umaban);
    const grade = topWon ? "A" : hitTop3===3 ? "B" : hitTop3>=2 ? "C" : hitTop3===1 ? "D" : "E";
    return { grade, actual:top3, top, missed, notes };
  };

  const conditionStats = useMemo(()=>{
    const map=new Map<string,any>();
    savedRaces.filter(r=>r.status==='completed').forEach(r=>{
      const key=`${r.track} ${r.surface}${r.distance||''}m / ${r.raceClass}`;
      const actual=resultTop3Of(r);
      if(actual.length<3)return;
      const pred=[...(r.horses||[])].filter((h:any)=>num(h.predictedScore)!==null).sort((a:any,b:any)=>num(b.predictedScore)-num(a.predictedScore));
      const st=map.get(key)||{key,races:0,wins:0,places:0}; st.races++;
      const winner=actual.find((h:any)=>num(h.finish)===1);
      const actualIds=new Set(actual.map((h:any)=>String(h.id||h.umaban)));
      if(pred[0]&&winner&&String(pred[0].id||pred[0].umaban)===String(winner.id||winner.umaban))st.wins++;
      if(pred[0]&&actualIds.has(String(pred[0].id||pred[0].umaban)))st.places++;
      map.set(key,st);
    });
    return [...map.values()].sort((a,b)=>b.races-a.races);
  },[savedRaces]);

  const backtest = useMemo(()=>{
    const completed=savedRaces.filter(r=>r.status==='completed');
    let races=0, win=0, place=0, top3Capture=0;
    completed.forEach(r=>{
      const actual=resultTop3Of(r);
      if(actual.length<3)return;
      const pred=[...(r.horses||[])].filter((h:any)=>num(h.predictedScore)!==null).sort((a:any,b:any)=>num(b.predictedScore)-num(a.predictedScore));
      if(!pred.length)return; races++;
      const winner=actual.find((h:any)=>num(h.finish)===1);
      const actualIds=new Set(actual.map((h:any)=>String(h.id||h.umaban)));
      if(winner&&String(pred[0].id||pred[0].umaban)===String(winner.id||winner.umaban))win++;
      if(actualIds.has(String(pred[0].id||pred[0].umaban)))place++;
      top3Capture += actual.filter((h:any)=>['◎','○','▲','△','☆'].includes(h.mark||'')).length;
    });
    return {races,win,place,top3Capture};
  },[savedRaces]);

  const currentRaceSnapshot = (id: string = crypto.randomUUID(), previous: any = {}): any => ({
    ...previous,
    id,
    title: raceName.trim() || `${track} ${surface}${distance || ""}m ${raceClass}`.trim(),
    raceName,
    track,
    surface,
    distance,
    going,
    raceClass,
    paceType,
    learningOn,
    weights,
    agariBonus,
    oddsOn,
    decayScale,
    oddsStrength,
    confidenceSnapshot: confidence,
    dataQualitySnapshot: dataQuality,
    horses: ranked.map((h) => ({ ...sanitizeHorseRecord(h), mark: h.mark || h._autoMark || "", predictedScore: h._finalScore })),
    status: previous.status || "pending",
    savedAt: previous.savedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const saveRaceForLater = () => {
    if (!horses.length) { flash("先に出走馬を解析してください"); return; }
    const usable = horses.filter((h) => h.name || h.umaban);
    if (!usable.length) { flash("保存できるレース情報がありません"); return; }
    const existing = savedRaces.find((r) => r.id === activeSavedRaceId);
    const id = existing?.id || crypto.randomUUID();
    const snapshot = currentRaceSnapshot(id, existing || {});
    snapshot.status = existing?.status === "completed" ? "completed" : "pending";
    setSavedRaces((prev) => [snapshot, ...prev.filter((r) => r.id !== id)]);
    setActiveSavedRaceId(id);
    setResultEntryMode(false);
    flash(existing ? "保存済みレースを更新しました" : "解析結果を保存しました");
  };

  const loadSavedRace = (race: any, forResult = false) => {
    setRaceName(race.raceName || "");
    setTrack(race.track || "東京");
    setSurface(race.surface || "芝");
    setDistance(race.distance || "");
    setGoing(race.going || "良");
    setRaceClass(race.raceClass || "3勝");
    setPaceType(race.paceType || "M");
    if (race.weights) setWeights(race.weights);
    if (race.agariBonus !== undefined) setAgariBonus(race.agariBonus);
    if (race.oddsOn !== undefined) setOddsOn(race.oddsOn);
    if (race.decayScale !== undefined) setDecayScale(race.decayScale);
    if (race.oddsStrength !== undefined) setOddsStrength(race.oddsStrength);
    setHorses((race.horses || []).map((h) => ({ ...sanitizeHorseRecord(h), finish: h.finish || "" })));
    setActiveSavedRaceId(race.id);
    setResultEntryMode(forResult);
    if (forResult) {
      const existingOrder=(race.horses||[]).filter((h:any)=>{const f=num(h.finish); return f!==null&&f>=1&&f<=3;}).sort((a:any,b:any)=>num(a.finish)-num(b.finish)).map((h:any)=>h.umaban).join("-");
      setResultOrderInput(existingOrder);
    } else {
      setResultOrderInput("");
    }
    setSavedRacesOpen(false);
    if (forResult) {
      setTimeout(() => {
        document.getElementById("result-entry-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    flash(forResult ? "保存済みレースを読み込みました。1着-2着-3着の馬番を入力してください" : "保存済みレースを読み込みました");
  };

  const deleteSavedRace = (id: string) => {
    if (!confirm("この保存済みレースを削除しますか？")) return;
    setSavedRaces((prev) => prev.filter((r) => r.id !== id));
    if (activeSavedRaceId === id) {
      setActiveSavedRaceId(null);
      setResultEntryMode(false);
    }
    flash("保存済みレースを削除しました");
  };

  const saveResultAndLearn = () => {
    const raceId = activeSavedRaceId;
    if (!raceId) { flash("先に保存済みレースから対象レースを開いてください"); return; }
    const parsed=parseResultOrder(resultOrderInput);
    if(!parsed.ok){ flash(parsed.message); return; }
    const order=parsed.order;
    const finishByUmaban=new Map(order.map((u,i)=>[String(u),String(i+1)]));
    const raceHorses=ranked.map((h:any)=>({ ...h, finish: finishByUmaban.get(String(h.umaban)) || "" }));
    const activeRecord = savedRaces.find((r) => r.id === raceId);
    const shouldLearn = !activeRecord?.learnedApplied;
    let canLearn=false;
    let changes:Record<string,number>={};
    if(shouldLearn && learningOn){
      const learnedResult=learnFromRace(raceHorses, paceType, learned);
      changes=learnedResult.changes;
      canLearn=Object.keys(changes).length>0;
      if(canLearn){
        setLearned(learnedResult.next);
        setHistoryCount((n)=>n+1);
        setLearningHistory((prev)=>[{
          raceId,
          title: activeRecord?.title || raceName || `${track}${surface}${distance}m`,
          at:new Date().toISOString(),
          changes,
        },...prev].slice(0,100));
      }
    }
    const updated = currentRaceSnapshot(raceId, activeRecord || {});
    updated.status = "completed";
    updated.completedAt = new Date().toISOString();
    updated.learnedApplied = activeRecord?.learnedApplied || canLearn;
    updated.resultOrder = order.join("-");
    updated.learningChanges = changes;
    updated.horses = raceHorses.map((h:any) => ({ ...sanitizeHorseRecord(h), mark: h.mark || h._autoMark || "", predictedScore: h._finalScore, finish: h.finish || "" }));
    updated.review = buildReview(updated);
    setHorses(raceHorses.map((h:any)=>sanitizeHorseRecord(h)));
    setSavedRaces((prev) => [updated, ...prev.filter((r) => r.id !== raceId)]);
    setResultEntryMode(false);
    setSavedRacesOpen(true);
    flash(canLearn ? `結果${order.join("-")}を保存し、${Object.keys(changes).length}項目を学習しました` : `結果${order.join("-")}を保存しました`);
  };

  const relearnAllCompleted = () => {
    const races=[...savedRaces].filter((r:any)=>r.status==='completed' && resultTop3Of(r).length===3).reverse();
    if(!races.length){ flash("再学習できる結果済みレースがありません"); return; }
    let next:any={...DEFAULT_LEARNED};
    const history:any[]=[];
    let learnedRaces=0;
    const updatedIds=new Set<string>();
    races.forEach((r:any)=>{
      const res=learnFromRace(r.horses||[], r.paceType||"M", next);
      if(Object.keys(res.changes).length){
        next=res.next; learnedRaces++;
        history.unshift({raceId:r.id,title:r.title||"保存レース",at:new Date().toISOString(),changes:res.changes,relearned:true});
        updatedIds.add(r.id);
      }
    });
    setLearned(next);
    setHistoryCount(learnedRaces);
    setLearningHistory(history.slice(0,100));
    setSavedRaces((prev)=>prev.map((r:any)=>updatedIds.has(r.id)?{...r,learnedApplied:true}:r));
    flash(`${learnedRaces}レースを既存結果から再学習しました`);
  };

  const setW = (key, val) => setWeights((w) => ({ ...w, [key]: Number(val) }));

  const colHeaderCls = "px-2 py-2 text-xs font-bold text-gray-600 whitespace-nowrap border-b border-gray-300";
  const cellBase = "px-2 py-1.5 text-sm text-center border-b border-gray-100 whitespace-nowrap";

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 pb-16">
      {/* ヘッダー */}
      <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <span className="text-lg font-black tracking-wide">JRA タイム指数予想帳</span>
          <span className="text-xs bg-gray-700 px-1.5 py-0.5 rounded">中央競馬対応版</span>
        </div>
        {status && <span className="text-xs bg-green-600 px-2 py-1 rounded">{status}</span>}
      </div>

      {/* レース情報 */}
      <div className="bg-white mx-3 mt-3 rounded-lg shadow-sm border border-gray-200 p-3">
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input
            value={raceName}
            onChange={(e) => setRaceName(e.target.value)}
            placeholder="レース名（例: 函館記念）"
            className="col-span-2 border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
          <select value={track} onChange={(e) => setTrack(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm">
            {JRA_TRACKS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <div className="flex gap-1">
            <button
              onClick={() => setSurface("芝")}
              className={`flex-1 rounded px-2 py-1.5 text-sm font-bold border ${surface === "芝" ? "bg-green-600 text-white border-green-600" : "border-gray-300 text-gray-500"}`}
            >芝</button>
            <button
              onClick={() => setSurface("ダート")}
              className={`flex-1 rounded px-2 py-1.5 text-sm font-bold border ${surface === "ダート" ? "bg-amber-800 text-white border-amber-800" : "border-gray-300 text-gray-500"}`}
            >ダート</button>
          </div>
          <input
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            placeholder="距離(m) 例: 2000"
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
          <select value={going} onChange={(e) => setGoing(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm">
            {GOINGS.map((x) => <option key={x}>{x}</option>)}
          </select>
          <select value={raceClass} onChange={(e) => setRaceClass(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm">
            {RACE_CLASSES.map((x) => <option key={x}>{x}</option>)}
          </select>
          <select value={paceType} onChange={(e) => setPaceType(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm">
            {PACE_TYPES.map((x) => <option key={x} value={x}>展開 {x}</option>)}
          </select>
        </div>
        {surface === "芝" && (
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={agariBonus} onChange={(e) => setAgariBonus(e.target.checked)} />
            芝レース: 上がり指数を追加考慮（末脚重視）
          </label>
        )}
      </div>

      {/* 4軸ウェイト設定 */}
      <div className="bg-white mx-3 mt-3 rounded-lg shadow-sm border border-gray-200 p-3">
        <div className="text-xs font-bold text-gray-500 mb-2">4軸ウェイト設定（合計 {wSum}）</div>
        {[
          ["best", "全体最高"],
          ["avg5", "5走平均"],
          ["dist", "距離指数"],
          ["course", "コース指数"],
        ].map(([key, label]) => (
          <div key={key} className="flex items-center gap-2 mb-1">
            <span className="text-xs w-16 text-gray-600">{label}</span>
            <input type="range" min="0" max="60" value={weights[key]} onChange={(e) => setW(key, e.target.value)} className="flex-1" />
            <span className="text-xs w-8 text-right font-mono">{weights[key]}</span>
          </div>
        ))}
      </div>

      {/* オッズ補正 */}
      <div className="bg-white mx-3 mt-3 rounded-lg shadow-sm border border-gray-200 p-3">
        <label className="flex items-center gap-2 text-xs font-bold text-gray-600 mb-2">
          <input type="checkbox" checked={oddsOn} onChange={(e) => setOddsOn(e.target.checked)} />
          市場人気補正を有効化（低オッズを弱く加点）
        </label>
        {oddsOn && (
          <div>
            <div className="text-xs text-gray-500 mb-1">補正強度: {oddsStrength}%（推奨 6〜12）</div>
            <input type="range" min="0" max="20" value={oddsStrength} onChange={(e) => setOddsStrength(Number(e.target.value))} className="w-full" />
          </div>
        )}
      </div>

      <div className="bg-white mx-3 mt-3 rounded-lg shadow-sm border border-gray-200 p-3">
        <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
          <input type="checkbox" checked={learningOn} onChange={(e) => setLearningOn(e.target.checked)} />
          結果学習を予想へ反映（学習済み {historyCount}レース）
        </label>
        <div className="text-[11px] text-gray-400 mt-1">解析後は「レースを保存」。レース終了後は「3-11-5」のように1〜3着の馬番だけ入力すると、自動回顧と学習を行います。</div>
      </div>

      {/* 注目馬・波乱度・学習状況 */}
      {raceAnalytics.marked.length > 0 && (
        <div className="mx-3 mt-3 grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-indigo-200 bg-white p-3 shadow-sm lg:col-span-2">
            <div className="mb-2 flex items-center justify-between"><div className="font-black text-indigo-900">🎯 印を付けた注目馬</div><div className="text-[10px] text-gray-400">印順</div></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-xs"><thead><tr className="bg-indigo-50 text-indigo-800"><th className="p-2">印</th><th>馬番</th><th className="text-left">馬名</th><th>総合</th><th>調教</th><th>コメント</th><th>人気</th><th>オッズ</th><th>期待値</th></tr></thead>
              <tbody>{raceAnalytics.marked.map((h)=><tr key={`marked-${h.id}`} className="border-t border-gray-100"><td className="p-2 text-center text-lg font-black">{h._displayMark}</td><td className="text-center font-bold">{h.umaban}</td><td className="font-bold">{h.name}</td><td className="text-center font-black">{h._finalScore?.toFixed(1) ?? "-"}</td><td className="text-center">{h._trainingScore ?? "-"}</td><td className="text-center">{h._commentScore ?? "-"}</td><td className="text-center">{h.ninki || "-"}</td><td className="text-center">{h.odds || "-"}</td><td className="text-center font-bold">{h._valueScore}</td></tr>)}</tbody></table>
            </div>
          </div>
          <div className="rounded-xl border border-rose-200 bg-white p-3 shadow-sm">
            <div className="font-black text-rose-900">🌊 波乱度</div>
            <div className="mt-1 flex items-end gap-2"><span className="text-4xl font-black text-rose-600">{raceAnalytics.chaos}</span><span className="pb-1 text-lg font-black">{raceAnalytics.label}</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded bg-gray-100"><div className="h-full bg-rose-500" style={{width:`${raceAnalytics.chaos}%`}} /></div>
            <div className="mt-2 space-y-1 text-[11px] text-gray-600">{raceAnalytics.reasons.slice(0,4).map((r)=><div key={r}>・{r}</div>)}</div>
            {raceAnalytics.bets.length > 0 && <div className="mt-3 rounded-lg bg-amber-50 p-2"><div className="text-[11px] font-black text-amber-900">参考買い目</div>{raceAnalytics.bets.map((b)=><div key={b} className="mt-1 text-xs font-bold text-amber-800">{b}</div>)}</div>}
          </div>
        </div>
      )}

      <div className="mx-3 mt-3 rounded-xl border border-violet-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-black text-violet-900">🧠 自動学習</div><div className="text-[10px] text-gray-500">結果保存時に好走馬と凡走馬を比較して重みを自動調整</div></div><div className="text-sm font-black text-violet-700">{historyCount}レース学習</div></div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded bg-violet-50 p-2"><div className="text-gray-500">◎勝率</div><div className="font-black">{learningSummary.total ? Math.round(learningSummary.topWin/learningSummary.total*100) : 0}% <span className="text-[9px] text-gray-400">({learningSummary.topWin}/{learningSummary.total})</span></div></div><div className="rounded bg-violet-50 p-2"><div className="text-gray-500">◎複勝率</div><div className="font-black">{learningSummary.total ? Math.round(learningSummary.topPlace/learningSummary.total*100) : 0}% <span className="text-[9px] text-gray-400">({learningSummary.topPlace}/{learningSummary.total})</span></div></div><div className="rounded bg-violet-50 p-2"><div className="text-gray-500">印の3着内捕捉率</div><div className="font-black">{learningSummary.totalTop3 ? Math.round(learningSummary.markedTop3/learningSummary.totalTop3*100) : 0}% <span className="text-[9px] text-gray-400">({learningSummary.markedTop3}/{learningSummary.totalTop3})</span></div></div></div>
        <div className="mt-2 flex flex-wrap items-center gap-2"><button onClick={relearnAllCompleted} className="rounded bg-violet-700 px-3 py-1.5 text-[10px] font-black text-white">既存結果から全再学習</button><span className="text-[10px] text-gray-500">1〜3着だけで、上位3頭とその他を比較。差が小さい項目は動かしません。</span></div>
        {learningHistory.length>0 && <div className="mt-2 rounded bg-violet-50 p-2 text-[10px] text-violet-900"><div className="font-black">直近の学習変更</div><div className="mt-1">{Object.entries(learningHistory[0].changes||{}).map(([k,v]:any)=>`${k} ${v>0?"+":""}${Number(v).toFixed(3)}`).join(" / ") || "変更なし"}</div></div>}
        <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-gray-600">{Object.entries(learned).map(([k,v])=><span key={k} className="rounded bg-gray-100 px-2 py-1">{k}: {Number(v).toFixed(2)}</span>)}</div>
      </div>

      <div className="mx-3 mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-sky-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between"><div className="font-black text-sky-900">🛡️ 予想信頼度</div><div className="text-2xl font-black text-sky-700">{confidence.grade} <span className="text-sm">{confidence.score}/100</span></div></div>
          <div className="mt-2 text-[11px] text-gray-600">{confidence.reasons.join("・")}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between"><div className="font-black text-emerald-900">✅ データ品質</div><div className="text-xl font-black text-emerald-700">{dataQuality.score}/100</div></div>
          <div className="mt-1 text-xs font-bold">{dataQuality.label}</div><div className="mt-1 text-[10px] text-gray-500">{dataQuality.issues.length?dataQuality.issues.join("・"):"主要データが揃っています"}</div>
        </div>
      </div>

      <div className="mx-3 mt-3 rounded-xl border border-indigo-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2 border-b pb-2">
          <button onClick={()=>setAnalysisTab("review")} className={`rounded px-3 py-1.5 text-xs font-black ${analysisTab==='review'?'bg-indigo-700 text-white':'bg-gray-100'}`}>AI自動回顧</button>
          <button onClick={()=>setAnalysisTab("conditions")} className={`rounded px-3 py-1.5 text-xs font-black ${analysisTab==='conditions'?'bg-indigo-700 text-white':'bg-gray-100'}`}>条件別成績</button>
          <button onClick={()=>setAnalysisTab("backtest")} className={`rounded px-3 py-1.5 text-xs font-black ${analysisTab==='backtest'?'bg-indigo-700 text-white':'bg-gray-100'}`}>バックテスト</button>
        </div>
        {analysisTab==='review' && <div className="mt-3 text-xs text-gray-700">結果保存時に自動回顧を生成します。保存済みレースの「AI回顧」から、見逃した好走馬・過大評価した本命・改善候補を確認できます。</div>}
        {analysisTab==='conditions' && <div className="mt-3 space-y-2">{conditionStats.length?conditionStats.slice(0,8).map(s=><div key={s.key} className="flex justify-between rounded bg-gray-50 p-2 text-xs"><span className="font-bold">{s.key}</span><span>{s.races}R / ◎勝{Math.round(s.wins/s.races*100)}% / 複{Math.round(s.places/s.races*100)}%</span></div>):<div className="text-xs text-gray-400">結果データがまだありません</div>}</div>}
        {analysisTab==='backtest' && <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4"><div className="rounded bg-indigo-50 p-3"><div>対象</div><b>{backtest.races}R</b></div><div className="rounded bg-indigo-50 p-3"><div>◎勝率</div><b>{backtest.races?Math.round(backtest.win/backtest.races*100):0}%</b></div><div className="rounded bg-indigo-50 p-3"><div>◎複勝率</div><b>{backtest.races?Math.round(backtest.place/backtest.races*100):0}%</b></div><div className="rounded bg-indigo-50 p-3"><div>印の3着内捕捉</div><b>{backtest.races?Math.round(backtest.top3Capture/(backtest.races*3)*100):0}%</b></div></div>}
      </div>

      {resultEntryMode && (
        <div id="result-entry-panel" className="mx-3 mt-3 scroll-mt-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-black text-amber-900">🏁 レース後結果入力</div>
              <div className="mt-1 text-[11px] text-amber-700">1着 → 2着 → 3着の馬番をまとめて入力してください。</div>
            </div>
            <button onClick={() => setResultEntryMode(false)} className="shrink-0 rounded border border-amber-300 bg-white px-2 py-1 text-[10px] font-bold text-amber-800">閉じる</button>
          </div>
          <div className="mt-3 rounded-xl border border-amber-200 bg-white p-3">
            <label className="block text-xs font-black text-gray-700">1着-2着-3着</label>
            <input
              value={resultOrderInput}
              onChange={(e)=>setResultOrderInput(e.target.value.replace(/[→＞>]/g,"-").replace(/[、,\s]+/g,"-"))}
              inputMode="text"
              placeholder="例: 3-11-5"
              className="mt-2 w-full rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-center text-2xl font-black tracking-widest text-amber-950 outline-none focus:border-amber-500"
              aria-label="1着2着3着の馬番"
            />
            <div className="mt-2 text-[10px] text-gray-500">「3-11-5」「3 11 5」「3,11,5」「3→11→5」のどれでもOK。4着以下の入力は不要です。</div>
            {parseResultOrder(resultOrderInput).ok && <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              {parseResultOrder(resultOrderInput).order.map((u,i)=>{const h=ranked.find((x:any)=>Number(x.umaban)===u); return <div key={u} className="rounded-lg bg-amber-100 p-2"><div className="font-black text-amber-900">{i+1}着</div><div className="mt-1 font-bold">{u} {h?.name||""}</div></div>})}
            </div>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={saveResultAndLearn} className="rounded-lg bg-purple-700 px-4 py-2.5 text-sm font-black text-white shadow-sm">結果保存・学習</button>
            <button onClick={() => setResultOrderInput("")} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-600">入力をクリア</button>
          </div>
        </div>
      )}

      {/* テキスト一括入力 */}
      <div className="mx-3 mt-3 overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm">
        <button onClick={()=>setScanOpen((v)=>!v)} className="flex w-full items-center justify-between bg-emerald-50 px-4 py-3 text-left">
          <div><div className="font-black text-emerald-900">📝 テキスト一括入力</div><div className="mt-0.5 text-[11px] text-emerald-700">各サイトの表示内容をコピーして、対応する欄へそのまま貼り付けます</div></div>
          <span className="text-emerald-700">{scanOpen ? "▲" : "▼"}</span>
        </button>
        {scanOpen && <div className="p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {SCAN_TYPES.map(([type,label,desc])=><div key={type} className="rounded-lg border border-gray-200 bg-gray-50 p-2">
              <div className="text-xs font-black text-gray-800">{label}</div>
              <div className="mb-1 mt-0.5 text-[10px] text-gray-500">{desc}</div>
              <textarea
                rows={type === "comment" ? 8 : 6}
                value={scanText[type]}
                onChange={(e)=>setScanText((v)=>({...v,[type]:e.target.value}))}
                placeholder={`${label}のテキストを貼り付け`}
                className="w-full rounded-lg border border-gray-300 bg-white p-2 text-[11px] font-mono outline-none focus:border-emerald-500"
              />
            </div>)}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={()=>{
              let next=scanText.race ? [] : horses.map(h=>({...h}));
              if(scanText.race) next=parseRaceText(scanText.race,next);
              if(scanText.standard) next=parseIndexText(scanText.standard,next,false);
              if(scanText.recent) next=parseIndexText(scanText.recent,next,true);
              if(scanText.pace) parsePaceText(scanText.pace);
              if(scanText.comment) next=parseCommentText(scanText.comment,next);
              if(scanText.training) next=parseTrainingText(scanText.training,next);
              setHorses(next);
              flash(`${next.filter((h)=>h.name && h.umaban).length}頭へテキストを反映しました`);
            }} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-black text-white shadow">テキストを一括反映</button>
            <button onClick={()=>setScanText({race:"",standard:"",recent:"",pace:"",comment:"",training:""})} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-600">入力欄をクリア</button>
          </div>
          <div className="mt-2 text-[10px] leading-relaxed text-gray-500">入力できない欄は空のままでOKです。取り込み後は下の表で読み違いだけ修正してください。</div>
        </div>}
      </div>

      <div className="flex flex-wrap gap-2 mx-3 mt-3">
        <button onClick={addHorse} className="bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded shadow-sm">＋ 1頭追加</button>
        <button onClick={() => setImportOpen((v) => !v)} className="bg-white border border-gray-300 text-xs font-bold px-3 py-2 rounded shadow-sm">一括貼り付け</button>
        <button onClick={doExport} className="bg-white border border-gray-300 text-xs font-bold px-3 py-2 rounded shadow-sm">JSON書き出し</button>
        {!resultEntryMode ? (
          <button onClick={saveRaceForLater} className="bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded shadow-sm">レースを保存</button>
        ) : (
          <>
            <button onClick={saveResultAndLearn} className="bg-purple-700 text-white text-xs font-bold px-3 py-2 rounded shadow-sm">結果保存・学習</button>
            <button onClick={() => setResultEntryMode(false)} className="bg-white border border-gray-300 text-xs font-bold px-3 py-2 rounded shadow-sm">結果入力を閉じる</button>
          </>
        )}
        <button onClick={() => setSavedRacesOpen((v) => !v)} className="bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded shadow-sm">保存済みレース {savedRaces.length ? `(${savedRaces.length})` : ""}</button>
        {horses.length > 0 && (
          <button onClick={clearAll} className="bg-white border border-red-300 text-red-500 text-xs font-bold px-3 py-2 rounded shadow-sm ml-auto">全削除</button>
        )}
      </div>

      {savedRacesOpen && (
        <div className="mx-3 mt-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="font-black text-slate-800">保存済みレース</div>
              <div className="text-[10px] text-slate-500">予想を保存し、レース終了後に「結果を入力」から呼び出します。</div>
            </div>
            <button onClick={() => setSavedRacesOpen(false)} className="text-xs text-slate-400">閉じる</button>
          </div>
          {savedRaces.length === 0 ? (
            <div className="rounded bg-slate-50 p-4 text-center text-xs text-slate-400">保存済みレースはありません。</div>
          ) : (
            <div className="space-y-2">
              {savedRaces.map((race) => (
                <div key={race.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-800">{race.title || "名称未設定のレース"}</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">{race.track}・{race.surface}{race.distance || ""}m・{race.going}・{race.raceClass}／{race.horses?.length || 0}頭</div>
                      <div className="mt-1 text-[10px] text-slate-400">保存: {race.savedAt ? new Date(race.savedAt).toLocaleString("ja-JP") : "-"}</div>
                    </div>
                    <span className={`shrink-0 rounded px-2 py-1 text-[10px] font-bold ${race.status === "completed" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{race.status === "completed" ? "結果入力済み" : "結果待ち"}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button onClick={() => loadSavedRace(race, false)} className="rounded bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-700">予想を見る</button>
                    <button onClick={() => loadSavedRace(race, true)} className="rounded bg-purple-700 px-3 py-1.5 text-[11px] font-bold text-white">{race.status === "completed" ? "結果を修正" : "結果を入力"}</button>
                    {race.status === "completed" && <button onClick={()=>setReviewRaceId(reviewRaceId===race.id?null:race.id)} className="rounded bg-indigo-700 px-3 py-1.5 text-[11px] font-bold text-white">AI回顧</button>}
                    <button onClick={() => deleteSavedRace(race.id)} className="rounded border border-red-200 px-3 py-1.5 text-[11px] font-bold text-red-500">削除</button>
                  </div>
                  {reviewRaceId===race.id && (()=>{const rv=race.review||buildReview(race); return rv?<div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 p-3"><div className="font-black text-indigo-900">AI回顧 評価 {rv.grade}</div><div className="mt-1 text-xs">実着順: {rv.actual.map((h:any)=>`${h.finish}着 ${h.umaban} ${h.name}`).join(" / ")}</div><div className="mt-2 space-y-1 text-[11px] text-indigo-900">{rv.notes.map((n:string,i:number)=><div key={i}>・{n}</div>)}</div></div>:<div className="mt-2 text-xs text-gray-400">回顧に必要な着順が不足しています</div>})()}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {importOpen && (
        <div className="bg-white mx-3 mt-2 rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="text-xs text-gray-500 mb-1">
            列順: 馬番,予想印,馬名,全体,スタート,追走,上がり,5走平均,距離,コース,3走,2走,前走,性齢,斤量,騎手。
            「タイム指数マスター」画面のコピーをそのまま貼り付けてOK（改行が崩れても「牡4」等の性齢を目印に自動補正します。前後に余計な文章が混ざっても大丈夫です）
          </div>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={6}
            className="w-full border border-gray-300 rounded p-2 text-xs font-mono"
            placeholder="1	--	ボーンディスウェイ	101	97	96	107	97	109	102	89	96	100	牡7	56.0	丸山元気"
          />
          <div className="flex gap-2 mt-2">
            <button onClick={runBulkImport} className="bg-green-600 text-white text-xs font-bold px-3 py-2 rounded">取り込む</button>
            <button onClick={() => setImportOpen(false)} className="text-xs text-gray-500 px-3 py-2">閉じる</button>
          </div>
        </div>
      )}

      {exportText && (
        <div className="bg-white mx-3 mt-2 rounded-lg shadow-sm border border-gray-200 p-3">
          <textarea value={exportText} onChange={(e) => setExportText(e.target.value)} rows={6} className="w-full border border-gray-300 rounded p-2 text-xs font-mono" />
          <div className="flex gap-2 mt-2">
            <button onClick={copyExport} className="bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded">コピー</button>
            <button onClick={doImportJson} className="bg-green-600 text-white text-xs font-bold px-3 py-2 rounded">このJSONを読み込む</button>
            <button onClick={() => setExportText("")} className="text-xs text-gray-500 px-3 py-2">閉じる</button>
          </div>
        </div>
      )}

      {/* テーブル */}
      <div className="mx-3 mt-3 bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className={colHeaderCls}>枠/馬番</th>
              <th className={colHeaderCls}>印</th>
              <th className={colHeaderCls}>馬名</th>
              <th className={colHeaderCls}>性齢</th>
              <th className={colHeaderCls}>斤量</th>
              <th className={colHeaderCls}>騎手</th>
              <th className={colHeaderCls}>全体</th>
              <th className={colHeaderCls}>ST</th>
              <th className={colHeaderCls}>追走</th>
              <th className={colHeaderCls}>上がり</th>
              <th className={colHeaderCls}>5走平均</th>
              <th className={colHeaderCls}>距離</th>
              <th className={colHeaderCls}>コース</th>
              <th className={colHeaderCls}>3走</th>
              <th className={colHeaderCls}>2走</th>
              <th className={colHeaderCls}>前走</th>
              <th className={colHeaderCls}>オッズ</th>
              <th className={colHeaderCls}>人気</th>
              <th className={colHeaderCls}>脚質</th>
              <th className={colHeaderCls}>調教</th>
              <th className={colHeaderCls}>馬場</th>
              <th className={colHeaderCls}>クラス</th>
              <th className={colHeaderCls}>騎手</th>
              <th className={colHeaderCls}>枠</th>
              <th className={colHeaderCls}>馬体増減</th>
              <th className={colHeaderCls}>血統</th>
              <th className={colHeaderCls}>状態</th>
                            <th className={colHeaderCls}>総合指数</th>
              <th className={colHeaderCls}></th>
            </tr>
          </thead>
          <tbody>
            {ranked
              .slice()
              .sort((a, b) => Number(a.umaban || 0) - Number(b.umaban || 0))
              .map((h) => {
                const waku = h.umaban && !Number.isNaN(Number(h.umaban)) ? wakuOf(h.umaban) : null;
                const wc = waku ? WAKU_COLORS[waku] : { bg: "#eee", text: "#999", border: "#ccc" };
                return (
                  <tr key={h.id} className="hover:bg-gray-50">
                    <td className={cellBase}>
                      <div className="flex items-center gap-1 justify-center">
                        <span
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border"
                          style={{ background: wc.bg, color: wc.text, borderColor: wc.border }}
                        >
                          {h.umaban || "-"}
                        </span>
                      </div>
                    </td>
                    <td className={cellBase}>
                      <select
                        value={h.mark || ""}
                        onChange={(e) => updateHorse(h.id, "mark", e.target.value)}
                        className="bg-transparent text-red-600 font-bold text-sm"
                        aria-label={`${h.name || h.umaban}の印`}
                      >
                        <option value="">{h._autoMark || "—"}</option>
                        {["◎","○","▲","△","☆","消"].map((m)=><option key={m} value={m}>{m}</option>)}
                      </select>
                    </td>
                    <td className={`${cellBase} text-left font-bold text-gray-800 w-28`}>
                      <input
                        value={h.name}
                        onChange={(e) => updateHorse(h.id, "name", e.target.value)}
                        className="w-full border-none bg-transparent text-sm font-bold"
                        placeholder="馬名"
                      />
                      {h.comment && <div className="text-[9px] text-gray-400 font-normal leading-tight mt-1 max-w-40" title={h.comment}>{h.comment.slice(0,32)}{h.comment.length>32?"…":""}</div>}
                    </td>
                    <td className={cellBase}>
                      <input value={h.sex} onChange={(e) => updateHorse(h.id, "sex", e.target.value)} className="w-10 text-center border-none bg-transparent" />
                    </td>
                    <td className={cellBase}>
                      <input value={h.weight} onChange={(e) => updateHorse(h.id, "weight", e.target.value)} className="w-10 text-center border-none bg-transparent" />
                    </td>
                    <td className={`${cellBase} w-20`}>
                      <input value={h.jockey} onChange={(e) => updateHorse(h.id, "jockey", e.target.value)} className="w-full text-center border-none bg-transparent" />
                    </td>
                    {["best", "start", "oikake", "agari", "avg5", "dist", "course", "r3", "r2", "r1"].map((f) => (
                      <td key={f} className={`${cellBase} ${cellClass(num(h[f]))}`}>
                        <input
                          value={h[f]}
                          onChange={(e) => updateHorse(h.id, f, e.target.value)}
                          className="w-10 text-center bg-transparent border-none font-bold"
                        />
                      </td>
                    ))}
                    <td className={cellBase}>
                      <input value={h.odds} onChange={(e) => updateHorse(h.id, "odds", e.target.value)} className="w-12 text-center border-none bg-transparent" placeholder="—" />
                    </td>
                    <td className={cellBase}>
                      <input value={h.ninki} onChange={(e) => updateHorse(h.id, "ninki", e.target.value)} className="w-8 text-center border-none bg-transparent" placeholder="—" />
                    </td>
                    <td className={cellBase}><select value={h.runningStyle || "先"} onChange={(e)=>updateHorse(h.id,"runningStyle",e.target.value)} className="bg-transparent text-xs">{RUNNING_STYLES.map(x=><option key={x}>{x}</option>)}</select></td>
                    <td className={cellBase}><select value={h.training || "B"} onChange={(e)=>updateHorse(h.id,"training",e.target.value)} className="bg-transparent text-xs">{["S","A","B","C","D"].map(x=><option key={x}>{x}</option>)}</select></td>
                    {[["groundFit","馬場"],["classFit","級"],["jockeyIndex","騎"],["gateFit","枠"],["bodyChange","増減"],["pedigreeFit","血"],["condition","状"]].map(([f,p]) => (
                      <td key={f} className={cellBase}><input value={h[f] ?? ""} onChange={(e)=>updateHorse(h.id,f,e.target.value)} className="w-10 text-center border-none bg-transparent" placeholder={p}/></td>
                    ))}
                    
                    <td className={`${cellBase} font-black text-base ${h._rank === 1 ? "text-red-600" : h._rank === 2 ? "text-blue-600" : "text-gray-700"}`}>
                      {h._finalScore !== null ? h._finalScore.toFixed(1) : "-"}
                    </td>
                    <td className={cellBase}>
                      <button onClick={() => removeHorse(h.id)} className="text-gray-300 hover:text-red-500 text-xs">✕</button>
                    </td>
                  </tr>
                );
              })}
            {horses.length === 0 && (
              <tr>
                <td colSpan={resultEntryMode ? 30 : 29} className="text-center text-sm text-gray-400 py-8">
                  出走馬データがありません。「一括貼り付け」または「＋1頭追加」で入力してください。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mx-3 mt-2 text-xs text-gray-400 leading-relaxed">
        ※総合指数 = タイム4軸 ＋ 近走トレンド ＋ スタート/追走/上がり ＋ 展開・調教・馬場・クラス・騎手・枠・馬体重・血統・状態補正
        {surface === "芝" && agariBonus ? " ＋ 上がり補正" : ""}
        {oddsOn ? " ＋ 市場人気補正（低オッズを弱く加点・上限あり）" : ""}。
        「未」は全体最高から自動推定した参考値です。解析後は「レースを保存」、レース終了後は「保存済みレース」から結果を入力します。
      </div>
    </div>
  );
}
