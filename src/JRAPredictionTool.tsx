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
  const [learned, setLearned] = useState({ training: 1, pace: 1, ground: 1, classFit: 1, jockey: 1, gate: 1, body: 1, pedigree: 1, condition: 1 });
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
  const [scanText, setScanText] = useState({ race: "", standard: "", recent: "", pace: "", comment: "" });
  const [scanProgress, setScanProgress] = useState(0);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanLog, setScanLog] = useState("");

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
          if (data.learned) setLearned(data.learned);
          if (data.historyCount !== undefined) setHistoryCount(data.historyCount);
          if (data.horses) setHorses(data.horses);
          if (data.weights) setWeights(data.weights);
          if (data.agariBonus !== undefined) setAgariBonus(data.agariBonus);
          if (data.oddsOn !== undefined) setOddsOn(data.oddsOn);
          if (data.decayScale !== undefined) setDecayScale(data.decayScale);
          if (data.oddsStrength !== undefined) setOddsStrength(data.oddsStrength);
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
          JSON.stringify({ raceName, track, surface, distance, going, raceClass, paceType, learningOn, learned, historyCount, horses, weights, agariBonus, oddsOn, decayScale, oddsStrength })
        );
      } catch (e) {}
    }, 400);
    return () => clearTimeout(t);
  }, [loaded, raceName, track, surface, distance, going, raceClass, paceType, learningOn, learned, historyCount, horses, weights, agariBonus, oddsOn, decayScale, oddsStrength]);

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
    if (confirm("全ての出走馬データを削除します。よろしいですか？")) setHorses([]);
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

  // ---- スクリーンショットOCR ----
  const SCAN_TYPES = [
    ["race", "出馬表", "馬名・騎手・斤量・オッズ・人気"],
    ["standard", "タイム指数（標準）", "全体・スタート・追走・上がり・5走平均"],
    ["recent", "タイム指数（近5走）", "過去最高・前走・3走・2走"],
    ["pace", "AI展開予測", "ペース・推定タイム・前後半3F"],
    ["comment", "厩舎コメント", "状態・距離短縮・適性コメント"],
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
    const lines = normalizeOcr(text).split("\n").map((x) => x.trim()).filter(Boolean);
    let list = baseList.length ? baseList.map((h) => ({ ...h })) : [];
    const header = lines.slice(0, 12).join(" ");
    const distM = header.match(/(芝|ダート|ダ)\s*(\d{3,4})m?/i);
    if (distM) { setSurface(distM[1] === "芝" ? "芝" : "ダート"); setDistance(distM[2]); }
    const trackM = header.match(new RegExp(`(${JRA_TRACKS.join("|")})`));
    if (trackM) setTrack(trackM[1]);
    const raceM = header.match(/(\d{1,2})R\s*([^\n]{2,16})/);
    if (raceM) setRaceName(`${raceM[1]}R ${raceM[2].trim()}`);
    const paceM = header.match(/(?:ペース|予測)\s*[:：]?\s*([SMH])/i);
    if (paceM) setPaceType(paceM[1].toUpperCase());

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let m = line.match(/^(\d{1,2})\s+([ァ-ヶー一-龠A-Za-z0-9・･]{2,24})/);
      if (!m) continue;
      const umaban = m[1];
      const name = m[2];
      if (["馬番", "人気", "単勝"].includes(name)) continue;
      let h = list.find((x) => String(x.umaban) === umaban) || findHorse(name, list);
      if (!h) { h = { ...emptyHorse(), umaban, name }; list.push(h); }
      h.umaban = umaban; h.name = name;
      const joined = lines.slice(i, Math.min(i + 3, lines.length)).join(" ");
      const sex = joined.match(/(牡|牝|セ)\s*(\d{1,2})/);
      if (sex) h.sex = `${sex[1]}${sex[2]}`;
      const weight = joined.match(/(?:牡|牝|セ)\s*\d{1,2}.*?([45]\d(?:\.\d)?)\s*(?:kg)?/);
      if (weight) h.weight = weight[1];
      const oddsPop = joined.match(/(\d{1,3}(?:\.\d)?)\s*(?:倍)?\s*(\d{1,2})\s*人気/);
      if (oddsPop) { h.odds = oddsPop[1]; h.ninki = oddsPop[2]; }
      const jockey = joined.match(/([ァ-ヶー一-龠]{2,7})\s*(?:△|▲|☆|◇)?\s*[45]\d(?:\.\d)?/);
      if (jockey) h.jockey = jockey[1];
    }
    return list.sort((a,b)=>Number(a.umaban||99)-Number(b.umaban||99));
  };

  const parseIndexText = (text, baseList, recentMode = false) => {
    const lines = normalizeOcr(text).split("\n").map((x) => x.trim()).filter(Boolean);
    const list = baseList.map((h) => ({ ...h }));
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(/^(\d{1,2})\s+([ァ-ヶー一-龠A-Za-z0-9・･]{2,24})\s+(.*)$/);
      if (!m) continue;
      const h = list.find((x) => String(x.umaban) === m[1]) || findHorse(m[2], list);
      if (!h) continue;
      const joined = [m[3], lines[i+1] || ""].join(" ");
      const vals = (joined.match(/(?<![\d.])-?\d{1,3}(?:\.\d)?\*?/g) || [])
        .map((v)=>v.replace("*", ""))
        .filter((v)=>Number(v) >= 0 && Number(v) <= 140);
      if (!recentMode) {
        if (vals.length >= 4) { h.best=vals[0]; h.start=vals[1]; h.oikake=vals[2]; h.agari=vals[3]; }
        if (vals.length >= 5) h.avg5=vals[4];
        if (vals.length >= 6) h.dist=vals[5];
        if (vals.length >= 7) h.course=vals[6];
        if (vals.length >= 8) h.r3=vals[vals.length-3];
        if (vals.length >= 9) h.r2=vals[vals.length-2];
        if (vals.length >= 10) h.r1=vals[vals.length-1];
      } else {
        const idx = vals.filter((v)=>Number(v) >= 20);
        if (idx.length >= 4) { h.best=idx[0]; h.start=idx[idx.length-3]; h.oikake=idx[idx.length-2]; h.agari=idx[idx.length-1]; }
        if (idx.length >= 1) h.avg5=idx[0];
        if (idx.length >= 4) { h.r3=idx[idx.length-3]; h.r2=idx[idx.length-2]; h.r1=idx[idx.length-1]; }
      }
    }
    return list;
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
    const lines = normalizeOcr(text).split("\n").map((x)=>x.trim()).filter(Boolean);
    const list = baseList.map((h)=>({ ...h }));
    for (let i=0;i<lines.length;i++) {
      const m = lines[i].match(/^(\d{1,2})\s+([ァ-ヶー一-龠A-Za-z0-9・･]{2,24})/);
      if (!m) continue;
      const h = list.find((x)=>String(x.umaban)===m[1]) || findHorse(m[2], list);
      if (!h) continue;
      let block = lines[i];
      for (let j=i+1;j<Math.min(i+5,lines.length);j++) {
        if (/^\d{1,2}\s+[ァ-ヶー一-龠]/.test(lines[j])) break;
        block += " " + lines[j];
      }
      h.comment = block.replace(/^\d{1,2}\s+[^ ]+\s*/, "");
      h.condition = String(commentScore(h.comment));
      if (/距離短縮.*(?:期待|合う|プラス)|短縮.*好材料/.test(h.comment)) h.classFit = String(Math.max(num(h.classFit)||50, 56));
      if (/芝.*(?:合う|問題ない)|ダート.*(?:合う|問題ない)/.test(h.comment)) h.groundFit = String(Math.max(num(h.groundFit)||50, 56));
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

  const recognizeHorseRows = async (Tesseract, file, type, baseList, progressBase, progressSpan) => {
    const img = await fileToImage(file);
    const layout = rowLayout(type, img);
    const nameLayout = nameColumnLayout(type, img);
    const list = baseList.length ? baseList.map((h)=>({...h})) : Array.from({length:11},(_,i)=>({...emptyHorse(),umaban:String(i+1)}));
    const rows = 11;
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
      if ((type === "race" || !h.name) && nameLayout.width > 0) {
        const nameCanvas = cropCanvas(img, nameLayout.x, rowY, nameLayout.width, rowH-pad*2, 3.0);
        const nameResult = await Tesseract.recognize(nameCanvas, "jpn", {
          tessedit_pageseg_mode: "7",
          preserve_interword_spaces: "1",
          logger:(m)=>{ if(m.status==="recognizing text") setScanProgress(Math.round(progressBase + ((i+0.65+(m.progress||0)*0.35)/rows)*progressSpan)); }
        });
        const candidate = bestHorseName(nameResult?.data?.text || "");
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
    next = next.filter((h)=>h.name || h.best || h.comment).sort((a,b)=>Number(a.umaban||99)-Number(b.umaban||99));
    setHorses(next);
    return next.filter((h)=>h.name).length;
  };

  const analyzeScreenshots = async () => {
    const entries = Object.entries(scanFiles).filter(([,file])=>file);
    if (!entries.length) { flash("スクリーンショットを1枚以上選んでください"); return; }
    setScanBusy(true); setScanProgress(1); setScanLog("端末内OCRを準備しています…");
    try {
      const count = await analyzeWithLocalOcr(entries);
      setScanProgress(100);
      setScanLog(`${count}頭を端末内OCRで反映しました。読み違いだけ表で修正してください。`);
      flash("スクショ解析が完了しました");
    } catch (error) {
      console.error(error);
      setScanLog(`解析に失敗しました: ${error?.message || "通信状態を確認してください"}`);
      flash("スクショ解析に失敗しました");
    } finally { setScanBusy(false); }
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
      if (data.learned) setLearned(data.learned);
      if (data.historyCount !== undefined) setHistoryCount(data.historyCount);
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

      // タイム指数で拾いにくい要素は、過大評価を避けて合計±12点程度に制限
      const trainingAdj = (TRAINING_SCORE[h.training] ?? 0) * (learningOn ? learned.training : 1);
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
      const contextAdj = clamp(trainingAdj + styleAdj + groundAdj + classAdj + jockeyAdj + gateAdj + pedigreeAdj + conditionAdj + bodyAdj, -12, 12);

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
        _contextAdj: contextAdj,
        _finalScore: finalScore,
      };
    });
  }, [horses, weights, agariBonus, surface, distance, oddsOn, oddsStrength, paceType, learningOn, learned]);

  const ranked = useMemo(() => {
    const withScore = computed.filter((h) => h._finalScore !== null);
    const sorted = [...withScore].sort((a, b) => b._finalScore - a._finalScore);
    const rankMap = new Map(sorted.map((h, i) => [h.id, i]));
    const marks = ["◎", "○", "▲", "△", "△"];
    return computed.map((h) => {
      const idx = rankMap.get(h.id);
      const autoMark = idx !== undefined && idx < marks.length ? marks[idx] : "";
      return { ...h, _rank: idx !== undefined ? idx + 1 : null, _autoMark: autoMark };
    });
  }, [computed]);

  const saveResultAndLearn = () => {
    const finished = ranked.filter((h) => num(h.finish) !== null && h._finalScore !== null);
    if (finished.length < 3) { flash("最低3頭の着順を入力してください"); return; }
    const factors = {
      training: (h) => TRAINING_SCORE[h.training] ?? 0,
      pace: (h) => STYLE_PACE_SCORE[paceType]?.[h.runningStyle] ?? 0,
      ground: (h) => h._groundFit === null ? 0 : h._groundFit - 50,
      classFit: (h) => h._classFit === null ? 0 : h._classFit - 50,
      jockey: (h) => h._jockeyIndex === null ? 0 : h._jockeyIndex - 50,
      gate: (h) => h._gateFit === null ? 0 : h._gateFit - 50,
      body: (h) => h._bodyChange === null ? 0 : -Math.abs(h._bodyChange),
      pedigree: (h) => h._pedigreeFit === null ? 0 : h._pedigreeFit - 50,
      condition: (h) => h._condition === null ? 0 : h._condition - 50,
    };
    setLearned((prev) => {
      const next = { ...prev };
      Object.entries(factors).forEach(([key, getter]) => {
        const top3 = finished.filter((h) => num(h.finish) <= 3);
        const others = finished.filter((h) => num(h.finish) > 3);
        if (!top3.length || !others.length) return;
        const a = top3.reduce((sum,h)=>sum+getter(h),0)/top3.length;
        const b = others.reduce((sum,h)=>sum+getter(h),0)/others.length;
        const direction = a > b ? 0.03 : a < b ? -0.03 : 0;
        next[key] = clamp((prev[key] ?? 1) + direction, 0.65, 1.35);
      });
      return next;
    });
    setHistoryCount((n) => n + 1);
    flash("結果を保存し、補正値を学習しました");
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
        <div className="text-[11px] text-gray-400 mt-1">着順を入力して「結果保存・学習」を押すと、調教・展開・適性補正を少しずつ調整します。</div>
      </div>

      {/* 操作ボタン */}
      <div className="mx-3 mt-3 bg-white rounded-xl shadow-sm border border-blue-200 overflow-hidden">
        <button onClick={()=>setScanOpen((v)=>!v)} className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 text-left">
          <div><div className="font-black text-blue-900">📷 スクショ自動入力</div><div className="text-[11px] text-blue-700 mt-0.5">5種類のうち、用意できた画像だけでOK</div></div>
          <span className="text-blue-700">{scanOpen ? "▲" : "▼"}</span>
        </button>
        {scanOpen && <div className="p-3">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {SCAN_TYPES.map(([type,label,desc])=><label key={type} className="border border-dashed border-gray-300 rounded-lg p-2 text-center cursor-pointer bg-gray-50 hover:bg-blue-50">
              <input type="file" accept="image/*" className="hidden" onChange={(e)=>selectScanFile(type,e.target.files?.[0])}/>
              {scanPreview[type] ? <img src={scanPreview[type]} className="w-full h-20 object-cover rounded mb-1"/> : <div className="h-20 flex items-center justify-center text-2xl">＋</div>}
              <div className="text-[11px] font-bold text-gray-800">{label}</div>
              <div className="text-[9px] text-gray-400 mt-0.5">{desc}</div>
            </label>)}
          </div>
          <div className="flex items-center gap-3 mt-3">
            <button disabled={scanBusy} onClick={analyzeScreenshots} className="bg-blue-700 disabled:bg-gray-400 text-white text-sm font-black px-4 py-2.5 rounded-lg shadow">{scanBusy ? "解析中…" : "画像を解析して自動入力"}</button>
            <div className="flex-1">
              <div className="h-2 bg-gray-200 rounded overflow-hidden"><div className="h-full bg-blue-600 transition-all" style={{width:`${scanProgress}%`}}/></div>
              <div className="text-[10px] text-gray-500 mt-1">{scanLog || "画像はVercelの保護されたAPI経由でAI解析されます。APIキーはブラウザに公開されません。"}</div>
            </div>
          </div>
          <details className="mt-2"><summary className="text-[10px] text-gray-400 cursor-pointer">OCR原文を確認・修正</summary>
            <div className="grid sm:grid-cols-2 gap-2 mt-2">{SCAN_TYPES.map(([type,label])=><div key={type}><div className="text-[10px] font-bold mb-1">{label}</div><textarea rows={4} value={scanText[type]} onChange={(e)=>setScanText((v)=>({...v,[type]:e.target.value}))} className="w-full border rounded p-1 text-[9px] font-mono"/></div>)}</div>
            <button onClick={()=>{let next=horses.map(h=>({...h})); if(scanText.race)next=parseRaceText(scanText.race,next); if(scanText.standard)next=parseIndexText(scanText.standard,next,false); if(scanText.recent)next=parseIndexText(scanText.recent,next,true); if(scanText.pace)parsePaceText(scanText.pace); if(scanText.comment)next=parseCommentText(scanText.comment,next); setHorses(next); flash("修正したOCR原文を再反映しました");}} className="mt-2 bg-green-600 text-white text-xs font-bold px-3 py-2 rounded">修正テキストを再反映</button>
          </details>
        </div>}
      </div>

      <div className="flex flex-wrap gap-2 mx-3 mt-3">
        <button onClick={addHorse} className="bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded shadow-sm">＋ 1頭追加</button>
        <button onClick={() => setImportOpen((v) => !v)} className="bg-white border border-gray-300 text-xs font-bold px-3 py-2 rounded shadow-sm">一括貼り付け</button>
        <button onClick={doExport} className="bg-white border border-gray-300 text-xs font-bold px-3 py-2 rounded shadow-sm">JSON書き出し</button>
        <button onClick={saveResultAndLearn} className="bg-purple-700 text-white text-xs font-bold px-3 py-2 rounded shadow-sm">結果保存・学習</button>
        {horses.length > 0 && (
          <button onClick={clearAll} className="bg-white border border-red-300 text-red-500 text-xs font-bold px-3 py-2 rounded shadow-sm ml-auto">全削除</button>
        )}
      </div>

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
              <th className={colHeaderCls}>着順</th>
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
                      <span className="font-bold text-red-600">{h._autoMark || h.mark}</span>
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
                    <td className={cellBase}><input value={h.finish ?? ""} onChange={(e)=>updateHorse(h.id,"finish",e.target.value)} className="w-8 text-center border border-gray-200 rounded" placeholder="着" /></td>
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
                <td colSpan={30} className="text-center text-sm text-gray-400 py-8">
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
        「未」は全体最高から自動推定した参考値です。
      </div>
    </div>
  );
}
