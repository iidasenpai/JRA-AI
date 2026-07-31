const horseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    umaban: { type: "string" },
    name: { type: "string" },
    sex: { type: "string" },
    weight: { type: "string" },
    jockey: { type: "string" },
    odds: { type: "string" },
    ninki: { type: "string" },
    best: { type: "string" },
    start: { type: "string" },
    oikake: { type: "string" },
    agari: { type: "string" },
    avg5: { type: "string" },
    dist: { type: "string" },
    course: { type: "string" },
    r3: { type: "string" },
    r2: { type: "string" },
    r1: { type: "string" },
    comment: { type: "string" },
    condition: { type: "string" },
    runningStyle: { type: "string", enum: ["逃", "先", "差", "追", ""] }
  },
  required: ["umaban","name","sex","weight","jockey","odds","ninki","best","start","oikake","agari","avg5","dist","course","r3","r2","r1","comment","condition","runningStyle"]
};

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    raceName: { type: "string" },
    track: { type: "string" },
    surface: { type: "string", enum: ["芝", "ダート", ""] },
    distance: { type: "string" },
    going: { type: "string" },
    raceClass: { type: "string" },
    paceType: { type: "string", enum: ["S", "M", "H", ""] },
    estimatedTime: { type: "string" },
    first3F: { type: "string" },
    last3F: { type: "string" },
    horses: { type: "array", items: horseSchema }
  },
  required: ["raceName","track","surface","distance","going","raceClass","paceType","estimatedTime","first3F","last3F","horses"]
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "OPENAI_API_KEY が設定されていません" });

  try {
    const images = Array.isArray(req.body?.images) ? req.body.images : [];
    if (!images.length) return res.status(400).json({ error: "画像がありません" });
    if (images.length > 5) return res.status(400).json({ error: "画像は5枚までです" });

    const labels: Record<string,string> = {
      race: "出馬表（馬番、馬名、性齢、斤量、騎手、単勝オッズ、人気）",
      standard: "タイム指数・標準（全体、スタート、追走、上がり、5走平均、距離、コース）",
      recent: "タイム指数・近5走（過去最高、3走前、2走前、前走など）",
      pace: "AI展開予測（ペース、推定タイム、前半3F、後半3F）",
      comment: "厩舎コメント"
    };

    const content: any[] = [{
      type: "input_text",
      text: `日本の中央競馬のスクリーンショットを構造化してください。画像は同一レースです。\n
重要ルール:\n- 表の行と列を位置関係で読み取り、馬番を主キーに統合する。\n- 見えない値、未出走、判別不能は空文字。推測で数字を作らない。\n- 指数の * 記号は除いて数値文字列にする。\n- condition は厩舎コメントを25〜80で評価。標準50、強い前向き材料は加点、不安材料は減点。\n- runningStyle は画像から明確に判断できる場合だけ設定し、不明は空文字。\n- 馬名は省略せず正確に。\n- 同じ馬が複数画像に出る場合は馬番で統合し、horsesは馬番順。`
    }];

    for (const image of images) {
      content.push({ type: "input_text", text: `次の画像種別: ${labels[image.type] || image.type}` });
      content.push({ type: "input_image", image_url: image.dataUrl, detail: "high" });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
        input: [{ role: "user", content }],
        text: { format: { type: "json_schema", name: "jra_race_data", strict: true, schema } },
        max_output_tokens: 8000
      })
    });

    const raw = await response.json();
    if (!response.ok) throw new Error(raw?.error?.message || `OpenAI API error ${response.status}`);
    let text = raw.output_text || "";
    if (!text && Array.isArray(raw.output)) {
      text = raw.output.flatMap((o: any) => o.content || []).map((c: any) => c.text || "").join("");
    }
    if (!text) throw new Error("AIから解析結果が返りませんでした");
    const data = JSON.parse(text);
    return res.status(200).json(data);
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: error?.message || "画像解析に失敗しました" });
  }
}
