type VercelRequest = { method?: string; body?: any };
type VercelResponse = { status: (code: number) => VercelResponse; json: (body: any) => any };
declare const process: { env: Record<string, string | undefined> };
declare const Buffer: { from: (data: string, encoding: "base64") => Uint8Array };

const API_VERSION = "2024-11-30";
const MODEL_ID = "prebuilt-layout";
const MAX_POLLS = 40;
const POLL_DELAY_MS = 750;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type AzureCell = {
  rowIndex?: number;
  columnIndex?: number;
  rowSpan?: number;
  columnSpan?: number;
  content?: string;
};

type AzureTable = {
  rowCount?: number;
  columnCount?: number;
  cells?: AzureCell[];
};

function normalizeTables(tables: AzureTable[] = []) {
  return tables.map((table, tableIndex) => {
    const rowCount = Number(table.rowCount ?? 0);
    const columnCount = Number(table.columnCount ?? 0);
    const rows: string[][] = Array.from({ length: rowCount }, () =>
      Array.from({ length: columnCount }, () => ""),
    );

    for (const cell of table.cells ?? []) {
      const row = Number(cell.rowIndex ?? 0);
      const col = Number(cell.columnIndex ?? 0);
      const rowSpan = Math.max(1, Number(cell.rowSpan ?? 1));
      const colSpan = Math.max(1, Number(cell.columnSpan ?? 1));
      const content = String(cell.content ?? "").replace(/\s+/g, " ").trim();

      for (let r = row; r < Math.min(rowCount, row + rowSpan); r += 1) {
        for (let c = col; c < Math.min(columnCount, col + colSpan); c += 1) {
          if (!rows[r][c]) rows[r][c] = content;
        }
      }
    }

    return { tableIndex, rowCount, columnCount, rows };
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POSTのみ対応しています" });
  }

  const endpoint = String(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT ?? "").replace(/\/$/, "");
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
    if (comma < 0) {
      return res.status(400).json({ error: "画像データの形式が不正です" });
    }

    const meta = image.slice(0, comma);
    const base64 = image.slice(comma + 1);
    const contentType = meta.match(/^data:([^;]+)/)?.[1] ?? "image/jpeg";
    const bytes = Buffer.from(base64, "base64");

    const analyzeUrl = `${endpoint}/documentintelligence/documentModels/${MODEL_ID}:analyze?api-version=${API_VERSION}&outputContentFormat=text`;
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
      throw new Error(`Azure開始エラー ${start.status}: ${detail.slice(0, 500)}`);
    }

    const operationLocation = start.headers.get("operation-location");
    if (!operationLocation) {
      throw new Error("Azureからoperation-locationが返りませんでした");
    }

    let result: any = null;
    for (let i = 0; i < MAX_POLLS; i += 1) {
      await sleep(POLL_DELAY_MS);
      const poll = await fetch(operationLocation, {
        headers: { "Ocp-Apim-Subscription-Key": key },
      });
      const data = await poll.json();

      if (!poll.ok) {
        throw new Error(`Azure取得エラー ${poll.status}: ${JSON.stringify(data).slice(0, 500)}`);
      }

      const status = String(data.status ?? "").toLowerCase();
      if (status === "succeeded") {
        result = data;
        break;
      }
      if (status === "failed") {
        throw new Error(data?.error?.message ?? "Azure解析に失敗しました");
      }
    }

    if (!result) {
      throw new Error("Azure解析がタイムアウトしました");
    }

    const analyzeResult = result.analyzeResult ?? {};
    const content = String(analyzeResult.content ?? "");
    const tables = normalizeTables(analyzeResult.tables ?? []);
    const text = [
      ...tables.map((table) => table.rows.map((row) => row.join("\t")).join("\n")),
      content,
    ]
      .filter(Boolean)
      .join("\n\n");

    return res.status(200).json({
      text,
      tables,
      pages: analyzeResult.pages?.length ?? 0,
      apiVersion: API_VERSION,
      model: MODEL_ID,
    });
  } catch (error: unknown) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Azure解析で不明なエラーが発生しました";
    return res.status(500).json({ error: message });
  }
}
