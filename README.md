# JRA-AI v1.9.0

スマホ向け中央競馬タイム指数予想ツールです。

## v1.9.0 最終調整

- 解析後は「レースを保存」で予想を保存
- 「保存済みレース」一覧から過去の予想を呼び出し
- レース終了後だけ「結果を入力」モードを開き、着順を登録
- 「結果保存・学習」で結果を保存し、初回のみ学習へ反映
- 入力済み結果の修正では二重学習しない
- 通常の予想画面では着順欄を非表示
- Azureの表解析結果を優先し、座標解析は空欄だけ補完するよう修正
- 正しく読めた指数を座標OCRが上書きして列ズレする問題を軽減

## Azure Document Intelligence

VercelのProject Settingsで次の環境変数を登録し、登録後にRedeployしてください。

- `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`
- `AZURE_DOCUMENT_INTELLIGENCE_KEY`

キーはGitHubやReactコードへ直接書かないでください。画像解析は `/api/analyze` のVercel FunctionからAzureへ送信されます。

## 公開

GitHubへ上書きするとVercelが自動デプロイします。ビルドログで `jra-ai@1.9.0 build` と表示されれば最新版です。
