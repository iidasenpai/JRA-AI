const API_VERSION = "2024-11-30";
const MODEL_ID = "prebuilt-layout";
const MAX_POLLS = 25;
const POLL_DELAY_MS = 900;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function tableText(tables: any[] = []): string {
  const blocks: string[] = [];
  for (const table of tables) {
    const rows = Number(table.rowCount || 0);
    const cols = Number(table.columnCount || 0);
    if (!rows || !cols) continue;
    const grid = Array.from({ length: rows }, () => Array(cols).fill(""));
    for (const cell of table.cells || []) {
      const r = Number(cell.rowIndex || 0);
      const c = Number(cell.columnIndex || 0);
      if (r < rows && c < cols) grid[r][c] = String(cell.content || "").trim();
    }
    blocks.push(grid.map((row) => row.join("\t")).join("\n"));
  }
  return blocks.join("\n\n");
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "POSTのみ対応しています" });

  const endpoint = String(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT || "").replace(/\/$/, "");
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
  if (!endpoint || !key) {
    return res.status(500).json({ error: "VercelのAzure環境変数が未設定です" });
  }

  try {
    const image = req.body?.image;
    if (typeof image !== "string" || !image.startsWith("data:image/")) {
      return res.status(400).json({ error: "画像データがありません" });
    }
    const comma = image.indexOf(",");
    const meta = image.slice(0, comma);
    const base64 = image.slice(comma + 1);
    const contentType = meta.match(/^data:([^;]+)/)?.[1] || "image/jpeg";
    const bytes = Buffer.from(base64, "base64");

    const analyzeUrl = `${endpoint}/documentintelligence/documentModels/${MODEL_ID}:analyze?api-version=${API_VERSION}`;
    const start = await fetch(analyzeUrl, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": contentType,
      },
      body: bytes,
    });
    if (!start.ok) {
      const detail = await start.text();
      throw new Error(`Azure開始エラー ${start.status}: ${detail.slice(0, 300)}`);
    }

    const operationLocation = start.headers.get("operation-location");
    if (!operationLocation) throw new Error("Azureからoperation-locationが返りませんでした");

    let result: any = null;
    for (let i = 0; i < MAX_POLLS; i++) {
      await sleep(POLL_DELAY_MS);
      const poll = await fetch(operationLocation, {
        headers: { "Ocp-Apim-Subscription-Key": key },
      });
      const data = await poll.json();
      if (!poll.ok) throw new Error(`Azure取得エラー ${poll.status}: ${JSON.stringify(data).slice(0, 300)}`);
      const status = String(data.status || "").toLowerCase();
      if (status === "succeeded") { result = data; break; }
      if (status === "failed") throw new Error(data?.error?.message || "Azure解析に失敗しました");
    }
    if (!result) throw new Error("Azure解析がタイムアウトしました");

    const analyzeResult = result.analyzeResult || {};
    const content = String(analyzeResult.content || "");
    const structured = tableText(analyzeResult.tables || []);
    const text = [structured, content].filter(Boolean).join("\n\n");
    return res.status(200).json({ text, pages: analyzeResult.pages?.length || 0 });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: error?.message || "Azure解析で不明なエラーが発生しました" });
  }
}
