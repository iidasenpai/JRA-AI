export const maxDuration = 60;

type VercelRequest = { method?: string; body?: any };
type VercelResponse = { status: (code: number) => VercelResponse; json: (body: any) => any };

const API_VERSION = "2024-11-30";
const MODEL_ID = "prebuilt-layout";
const MAX_POLLS = 24;
// F0は結果取得が20回/分まで。3.5秒間隔なら上限を超えにくい。
const POLL_DELAY_MS = 3500;
const MAX_RATE_LIMIT_RETRIES = 3;

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

type AzureLine = {
  content?: string;
  polygon?: number[] | Array<{ x?: number; y?: number }>;
};

type AzurePage = {
  pageNumber?: number;
  width?: number;
  height?: number;
  lines?: AzureLine[];
};

function polygonBox(polygon: AzureLine["polygon"]) {
  const points: Array<{ x: number; y: number }> = [];
  if (Array.isArray(polygon)) {
    if (polygon.length && typeof polygon[0] === "number") {
      const nums = polygon as number[];
      for (let i = 0; i + 1 < nums.length; i += 2) points.push({ x: Number(nums[i]), y: Number(nums[i + 1]) });
    } else {
      for (const point of polygon as Array<{ x?: number; y?: number }>) {
        points.push({ x: Number(point?.x ?? 0), y: Number(point?.y ?? 0) });
      }
    }
  }
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x, y, width: maxX - x, height: maxY - y, centerX: (x + maxX) / 2, centerY: (y + maxY) / 2 };
}

function normalizePages(pages: AzurePage[] = []) {
  return pages.map((page, pageIndex) => {
    const width = Math.max(1, Number(page.width ?? 1));
    const height = Math.max(1, Number(page.height ?? 1));
    const lines = (page.lines ?? []).map((line, lineIndex) => {
      const box = polygonBox(line.polygon);
      return {
        lineIndex,
        content: String(line.content ?? "").replace(/\s+/g, " ").trim(),
        x: box.x / width,
        y: box.y / height,
        width: box.width / width,
        height: box.height / height,
        centerX: box.centerX / width,
        centerY: box.centerY / height,
      };
    }).filter((line) => line.content);
    return { pageIndex, pageNumber: Number(page.pageNumber ?? pageIndex + 1), width, height, lines };
  });
}

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

  const env = ((globalThis as any).process?.env ?? {}) as Record<string, string | undefined>;
  const endpoint = String(env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT ?? "").replace(/\/$/, "");
  const key = env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

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
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

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
    let rateLimitRetries = 0;
    for (let i = 0; i < MAX_POLLS; i += 1) {
      await sleep(POLL_DELAY_MS);
      const poll = await fetch(operationLocation, {
        headers: { "Ocp-Apim-Subscription-Key": key },
      });
      const raw = await poll.text();
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }

      if (poll.status === 429) {
        if (rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) {
          throw new Error(`Azure取得エラー 429: ${raw.slice(0, 500)}`);
        }
        rateLimitRetries += 1;
        const retryHeader = Number(poll.headers.get("retry-after") || 0);
        const message = String(data?.error?.message ?? raw);
        const retryFromMessage = Number(message.match(/retry after\s+(\d+)/i)?.[1] || 0);
        const waitSeconds = Math.max(5, retryHeader, retryFromMessage);
        await sleep(waitSeconds * 1000);
        i -= 1;
        continue;
      }

      if (!poll.ok) {
        throw new Error(`Azure取得エラー ${poll.status}: ${raw.slice(0, 500)}`);
      }

      rateLimitRetries = 0;
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
    const pages = normalizePages(analyzeResult.pages ?? []);
    const text = [
      ...tables.map((table) => table.rows.map((row) => row.join("\t")).join("\n")),
      content,
    ]
      .filter(Boolean)
      .join("\n\n");

    return res.status(200).json({
      text,
      tables,
      pages,
      pageCount: pages.length,
      apiVersion: API_VERSION,
      model: MODEL_ID,
    });
  } catch (error: unknown) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Azure解析で不明なエラーが発生しました";
    return res.status(500).json({ error: message });
  }
}
