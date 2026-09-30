# TemporalワークフローMVP設計

## 目的

ワークフローノードを組み合わせてDSLを作成し、Temporal上で耐障害性のある処理として起動できるかを検証する。フロントエンドはReact/TypeScript、APIとWorkerはNode.js/TypeScript、パッケージ管理はYarn 1 workspaces。

## MVPの範囲

- ノード: 手動開始、待機、Webhook送信（GET/POST）、承認、URL画面表示
- UI: ノード追加、接続、属性変更、保存、テスト実行
- DSL: ノードとエッジをJSONで表現し、APIで検証後に直列ステップへコンパイル
- 実行: Temporal Workflowが待機を管理し、Webhookは再試行付きActivityで送信。承認と画面確認はSignalを受け取るまでWorkflowを待機
- 利用者画面: `/executions/:workflowId`で実行状態を表示。承認ノードは「はい」で続行、「いいえ」で拒否終了。画面表示ノードはURLをiframe表示し、「次へ」で続行
- ローカル表示テストページ: `/demo-pages/welcome.html`、`/demo-pages/review.html`。JavaScriptを使わない静的HTMLのため、sandbox付きiframeで表示を試せる
- 保存: APIプロセス内メモリ。再起動で消えるため本番利用不可
- 接続: 分岐、並列実行、条件、認証情報、複数テナント、実行履歴UIは対象外

## 構成

```text
React Flow UI
  -> Express API (DSL検証、メモリ保存、Workflow起動)
  -> Temporal Server (Workflow履歴と耐障害実行)
  -> Node.js Worker (Workflow DSL解釈、Webhook Activity)
```

APIとWorkerは同じ`TEMPORAL_TASK_QUEUE`を使う。Workflowコード内では副作用を実行せず、HTTP通信をActivityに分離する。待機はTemporal timerを使うため、Worker再起動をまたいで継続できる。

実行画面は次のAPIをポーリングして状態を更新する。

- `GET /api/executions/:workflowId`: Queryで現在の実行状態を取得
- `POST /api/executions/:workflowId/approval`: `{ "decision": "yes" | "no" }`をSignalとして送信
- `POST /api/executions/:workflowId/continue`: 画面確認完了をSignalとして送信

URL画面表示は外部サイトの埋め込み設定（CSPや`X-Frame-Options`）によって表示できない場合がある。その場合、実行画面から別タブで開ける。APIは現状認証なしの開発用であり、本番利用前に実行閲覧・承認権限の認証認可が必要。

## 起動

1. Temporal CLIをインストールし、`temporal server start-dev`で開発サーバーを起動する。
2. リポジトリのルートで`yarn install`を実行する。
3. `yarn dev`でフロント、API、Workerを起動する。
4. `http://localhost:5173`を開き、ノードを編集して保存後にテスト実行する。

Temporalが未起動でも編集とAPI内メモリ保存は利用できる。テスト実行にはTemporal ServerとWorkerの両方が必要。Temporal UIは通常`http://localhost:8233`。

## 主な環境変数

- `PORT`: APIポート（既定値`4000`）
- `CLIENT_ORIGIN`: APIが許可するフロントエンドOrigin（既定値`http://localhost:5173`）
- `TEMPORAL_ADDRESS`: Temporal gRPCアドレス（既定値`localhost:7233`）
- `TEMPORAL_NAMESPACE`: Namespace（既定値`default`）
- `TEMPORAL_TASK_QUEUE`: Task Queue（既定値`workflow-studio`）
- `VITE_API_URL`: UIから接続するAPI URL（既定値`http://localhost:4000`）

## 本番化前の課題

テナント認可、DB永続化とバージョン管理、Webhook送信先のSSRF防御と秘密情報保管、認証・監査ログ、実行状態と履歴のUI表示、DSLの互換性方針、レート制限、運用監視を追加する。このMVPは検証専用であり、本番トラフィックや実顧客データでの運用には使わない。
