# Court Manager

[English README](README.md)

屋内スポーツ施設（HADO ARENA等）向けのリアルタイムコート予約・スタッフ管理システム

## デモサイト

- **フロントエンド**: <https://court-management-frontend.sasagar-2ef.workers.dev>
- **API**: <https://court-management-api.sasagar-2ef.workers.dev>

## 主な機能

- **コート管理**: リアルタイムのコート状況監視と予約管理
- **スタッフシフト管理**: スケジューリング、アサイン、引き継ぎ追跡
- **リアルタイム更新**: Server-Sent Events (SSE) による即時同期
- **公開ビュー**: QRコードで共有可能な読み取り専用ビュー
- **コートブロック**: 日付または曜日指定で利用不可時間帯を管理
- **マルチ施設対応**: 複数施設を一元管理

## 技術スタック

| コンポーネント   | 技術                                                       |
| ---------------- | ---------------------------------------------------------- |
| フロントエンド   | [Waku](https://waku.gg/) (React RSC) on Cloudflare Workers |
| バックエンド     | [Hono](https://hono.dev/) on Cloudflare Workers            |
| データベース     | Cloudflare D1 (SQLite)                                     |
| 認証             | [Better Auth](https://www.better-auth.com/)                |
| リアルタイム通信 | Server-Sent Events (SSE)                                   |

## プロジェクト構造

```
court-manager/
├── api/                    # Cloudflare Workers API (Hono)
│   ├── src/
│   │   ├── index.ts        # メインエントリーポイント
│   │   ├── auth.ts         # Better Auth設定
│   │   ├── routes/         # APIルートハンドラ
│   │   ├── middleware/     # 認証・施設アクセス制御
│   │   └── lib/sse.ts      # SSE管理
│   └── migrations/         # D1 SQLマイグレーション
│
└── waku/                   # フロントエンド (Waku/React)
    └── src/
        ├── pages/          # ルートページ
        ├── components/     # Reactコンポーネント
        ├── hooks/          # カスタムフック (SSE, API)
        └── lib/            # APIクライアント、認証クライアント
```

## セットアップ

### 前提条件

- Node.js 18以上
- npm または pnpm
- Wrangler CLI (`npm install -g wrangler`)
- Cloudflareアカウント

### API セットアップ

```bash
cd api
npm install

# wrangler設定テンプレートをコピー
cp wrangler.toml.example wrangler.toml

# D1データベースを作成
wrangler d1 create court-management-db
# 出力されたIDをwrangler.tomlのdatabase_idに設定

# R2バケットを作成（画像保存用）
wrangler r2 bucket create court-management-images

# マイグレーション実行（ローカル）
wrangler d1 execute court-management-db --file=migrations/0001_initial.sql --local

# 開発サーバーを起動
wrangler dev
```

### フロントエンド セットアップ

```bash
cd waku
npm install

# wrangler設定テンプレートをコピー
cp wrangler.toml.example wrangler.toml

# 開発サーバーを起動
npm run dev
```

### デプロイ

```bash
# APIをデプロイ
cd api
npm run deploy

# フロントエンドをデプロイ
cd waku
npm run build
wrangler deploy
```

## 環境変数

### API (`api/wrangler.toml`)

```toml
[vars]
BETTER_AUTH_URL = "https://your-api-domain.workers.dev"
BETTER_AUTH_SECRET = "your-secret-key"
```

### フロントエンド (`waku/.env`)

```env
WAKU_PUBLIC_API_URL=https://your-api-domain.workers.dev
```

## セッションステータスフロー

```
available → locking → reserved → in_use → completed
（空き）   （ロック中）（予約済）  （使用中） （完了）
```

- **available**: コートが空いている状態
- **locking**: 予約のためにロック中（60秒でタイムアウト）
- **reserved**: 予約確定、開始待ち
- **in_use**: セッション進行中
- **completed**: セッション終了

## ユーザーロール

| ロール | 権限                                                       |
| ------ | ---------------------------------------------------------- |
| admin  | フルアクセス: コート、スタッフ、ユーザー、設定の管理       |
| staff  | 運用アクセス: コートのロック、セッション管理、シフト閲覧   |
| viewer | 読み取り専用: コート状況とスケジュールの閲覧               |

## タイムゾーン

本システムは**JST（日本標準時、UTC+9）固定**で動作します。ブラウザのタイムゾーン設定に関わらず、すべての時刻表示はJSTで処理されます。

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。詳細は[LICENSE](LICENSE)ファイルをご覧ください。

## コントリビューション

プルリクエスト歓迎です！お気軽にご貢献ください。
