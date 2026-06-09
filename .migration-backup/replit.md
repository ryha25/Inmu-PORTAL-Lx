# INMU Bank

INMUコミュニティ向けの内部バンキングアプリ。INMU残高管理・貯蓄・ロック・ランキング・管理者機能・Phantom Wallet連携を提供。

---

## Stable Releases

| Tag | Commit | 内容 |
|-----|--------|------|
| `INMU-BANK-v1.1` | `416749ba0f01458ffc9b7b9dcefef6a0d41b2a71` | ランキング2タブ・ログアウト・Phantom INMU残高 |
| `INMU-BANK-v1.0` | `6a2d685ca908c0ddc2b00444564a42f732dc8afc` | 初回安定版リリース |

---

### INMU-BANK-v1.1 — 最新安定版

```
Stable Version: INMU-BANK-v1.1
Commit:         416749ba0f01458ffc9b7b9dcefef6a0d41b2a71
```

**変更内容:**
- ランキング 2タブ構成（INMU保有 / ポイント）
- プロフィール画面にログアウトボタン追加
- Phantom Wallet 接続後に INMU トークン残高のみ取得・表示
- 管理画面 管理コード認証ゲート確認済み

**この Commit から復元する方法:**
```bash
git checkout -b restore-v1.1 416749ba0f01458ffc9b7b9dcefef6a0d41b2a71
```

---

### INMU-BANK-v1.0 — 初回安定版

```
Stable Version: INMU-BANK-v1.0
Commit:         6a2d685ca908c0ddc2b00444564a42f732dc8afc
```

**この Commit から復元する方法:**
```bash
git checkout -b restore-v1.0 6a2d685ca908c0ddc2b00444564a42f732dc8afc
```

---

## Run & Operate

```bash
# フロントエンド (port $PORT)
pnpm --filter @workspace/inmu-bank run dev

# APIサーバー (port 8080)
pnpm --filter @workspace/api-server run dev

# 型チェック（全体）
pnpm run typecheck

# ビルド（全体）
pnpm run build
```

### 必須環境変数

| 変数 | 説明 | デフォルト |
|------|------|-----------|
| `DATABASE_URL` | PostgreSQL接続文字列 | — |
| `SESSION_SECRET` | HMACセッション署名キー | — |
| `ADMIN_CODE` | 管理画面認証コード | `0000` |
| `VITE_INMU_TOKEN_MINT` | INMUトークンのSPLミントアドレス（Phantom残高取得に必須） | 未設定（残高0表示） |
| `VITE_SOLANA_RPC` | Solana RPC エンドポイント | `https://api.mainnet-beta.solana.com` |
| `VITE_INMU_TOKEN_DECIMALS` | INMUトークンのdecimal数 | `6` |

### テストアカウント

| メール | パスワード | 権限 |
|--------|----------|------|
| alice@inmu.bank | securepass123 | admin |

---

## Stack

- **Monorepo**: pnpm workspaces, Node.js 24, TypeScript 5.9
- **フロントエンド**: Vite + React 18, Wouter (routing), shadcn/ui, Tailwind CSS
- **API**: Express 5, bcrypt, HMAC cookie sessions
- **DB**: PostgreSQL + Drizzle ORM
- **Wallet**: Phantom (Solana) — iPhone deep-link対応

---

## Where things live

| 場所 | 内容 |
|------|------|
| `artifacts/inmu-bank/src/pages/` | 15ページ（dashboard / balance / history / points / ranking / notifications / community / profile / admin 等） |
| `artifacts/inmu-bank/src/components/` | 20コンポーネント（app-shell / admin-panel / profile-view 等） |
| `artifacts/inmu-bank/src/lib/i18n/dict.ts` | 日英翻訳辞書（source of truth） |
| `artifacts/api-server/src/routes/` | 13 APIルート |
| `artifacts/api-server/src/db/schema.ts` | DBスキーマ（source of truth） |

---

## Architecture decisions

- **HMAC cookie sessions** — JWTなしでサーバー側セッション管理
- **管理画面2段階認証** — ログイン済み + 管理者コード入力の2段階ゲート
- **既存コード削除禁止** — ユーザー指示。機能追加は上書きではなく拡張で行う
- **下部ナビ固定9項目** — 横スクロール方式（admin項目は isAdmin のみ表示）
- **Phantom iPhoneディープリンク** — `phantom://ul/browse/` でアプリ内ブラウザを起動

---

## Product

- **ダッシュボード**: INMU残高・月次増減・最近の履歴
- **残高管理**: 通常残高/貯蓄/ロック残高、30/90/180/365日ロック
- **入出金履歴**: 全トランザクション一覧・フィルター
- **ポイント**: 月次ポイント・履歴
- **ランキング**: INMU保有ランキング / ポイントランキング（2タブ）
- **通知**: プッシュ通知・既読管理
- **コミュニティ**: 参加統計・順位
- **プロフィール**: X/Discord/SOLウォレット設定、Phantom接続
- **管理画面**: ユーザー管理・INMU配布・ポイント付与・残高操作・CSV出力・監査ログ

---

## User preferences

- 既存コードは削除禁止（機能追加は拡張で行う）
- 日本語UIを優先（`/ja` ロケールデフォルト）
- 管理者テストアカウント: alice@inmu.bank

---

## Gotchas

- `ADMIN_CODE` 未設定時のデフォルトは `"0000"` — 本番前に必ず変更すること
- APIサーバーは port 8080 固定（フロントエンドの `/api` プロキシ経由）
- Phantom接続: Phantom内蔵ブラウザでのみ `window.phantom` が存在する
- `profile` テーブルに `role` カラムあり（`user` テーブルではない）
- `/dev-login?to=<path>` — 開発用自動ログインページ（alice でログイン）

---

## Pointers

- pnpm workspace 構成は `.local/skills/pnpm-workspace/SKILL.md` 参照
