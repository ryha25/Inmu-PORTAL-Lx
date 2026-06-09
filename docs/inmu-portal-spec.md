# INMU PORTAL 仕様書

> **正本** — 最終更新: 2026-06-09  
> コード修正時は必ずこのファイルも同時に更新してください。

---

## 目次

1. [システム概要](#1-システム概要)
2. [技術スタック](#2-技術スタック)
3. [DBスキーマ](#3-dbスキーマ)
4. [管理者仕様](#4-管理者仕様)
5. [ユーザー仕様](#5-ユーザー仕様)
6. [ミッション仕様](#6-ミッション仕様)
7. [INMU送金仕様](#7-inmu送金仕様)
8. [ポイント仕様](#8-ポイント仕様)
9. [セキュリティ仕様](#9-セキュリティ仕様)
10. [Publish運用ルール](#10-publish運用ルール)
11. [GitHub Push / Commit Hash報告ルール](#11-github-push--commit-hash-報告ルール)

---

## 1. システム概要

**INMU PORTAL** は、INMUトークン（Solana Token-2022）保有者向けのコミュニティ管理Webアプリケーション。  
Express API（バックエンド）+ React Vite（フロントエンド）の pnpm モノレポ構成。

| 項目 | 内容 |
|------|------|
| サービス名 | INMU PORTAL |
| リポジトリ | `ryha25/Inmu-PORTAL-Lx` |
| APIサーバー | Express + TypeScript（port 8080） |
| フロントエンド | React + Vite + Tailwind CSS |
| DB | PostgreSQL（Drizzle ORM） |
| Solana | Mainnet-beta、Token-2022 Program |
| INMUトークン Mint | `4FDtAagigMuFcPp36rbd9bzcYTJgQah2qLMYcYtfpump` |
| INMU小数点 | 6桁（decimals: 6） |

---

## 2. 技術スタック

```
monorepo/
├── artifacts/
│   ├── api-server/          # Express API (port 8080)
│   └── inmu-bank/           # React Vite フロントエンド
└── lib/
    └── db/                  # Drizzle スキーマ・DB接続
```

### 主要依存ライブラリ

| カテゴリ | ライブラリ |
|---------|-----------|
| ORM | drizzle-orm + drizzle-kit |
| 認証 | bcryptjs（パスワードハッシュ） |
| Solana | @solana/web3.js, @solana/spl-token |
| UI | shadcn/ui, Tailwind CSS, lucide-react |
| 通知 | sonner（トースト） |
| ルーティング | wouter |

---

## 3. DBスキーマ

### `user` テーブル
| カラム | 型 | 説明 |
|--------|-----|------|
| id | text PK | ユーザーID（UUID） |
| name | text | ユーザー名 |
| email | text UNIQUE | メールアドレス（`name@inmu.local` 形式） |
| passwordHash | text | bcryptハッシュ |
| emailVerified | boolean | メール確認済みフラグ |
| createdAt / updatedAt | timestamp | |

### `profile` テーブル
| カラム | 型 | 説明 |
|--------|-----|------|
| userId | text PK | userテーブルのID参照 |
| displayName | text | 表示名 |
| xId | text | X（Twitter）ID |
| discordId | text | Discord ID |
| discordUsername | text | Discord ユーザー名 |
| solWallet | text | Solanaウォレットアドレス |
| avatar | text | アバター画像URL |
| role | text | `user` or `admin` |
| balance | numeric | INMU残高（内部管理） |
| savingsBalance | numeric | 貯蓄残高 |
| totalReceived | numeric | 累計受取額 |
| totalSent | numeric | 累計送金額 |
| monthlyPoints | numeric | 月間ポイント |
| participationCount | integer | 参加回数 |
| passcodeHash | text | 送金パスコード bcryptハッシュ |

### `transactions` テーブル
| カラム | 型 | 説明 |
|--------|-----|------|
| id | serial PK | |
| userId | text | 対象ユーザーID |
| type | text | `send` / `receive` / `deposit` / `withdrawal` |
| amount | numeric | 金額 |
| category | text | カテゴリ |
| counterparty | text | 相手方表示名 |
| counterpartyId | text | 相手方ユーザーID |
| memo | text | メモ |
| txHash | text | Solana TxHash |
| jarId | integer | 貯蓄瓶ID |
| createdAt | timestamp | |

### `missionParticipations` テーブル（2026-06-09追加）
| カラム | 型 | 説明 |
|--------|-----|------|
| id | serial PK | |
| userId | text | ユーザーID |
| missionId | integer | ミッションID |
| period | text | 期間（daily: `YYYY-MM-DD`、weekly: `YYYY-WWW`） |
| status | text | `joined` / `achieved` / `rewarded` |
| achievedAt | timestamp | 達成日時 |
| rewardedAt | timestamp | 報酬受取日時 |

**UNIQUE制約**: `(userId, missionId, period)`

### その他テーブル（概要）

| テーブル | 用途 |
|---------|------|
| `jars` | 貯蓄瓶（ロック機能付き） |
| `goals` | 貯蓄目標 |
| `rewards` | 管理者付与報酬 |
| `notifications` | 通知 |
| `points` | ポイント履歴 |
| `loginStreaks` | ログインストリーク |
| `auditLog` | 管理者操作ログ |
| `securityLog` | セキュリティイベントログ |
| `activityFeed` | アクティビティフィード |
| `missions` | ミッション定義 |
| `missionCompletions` | ミッション完了（レガシー互換） |
| `app_settings` | アプリ設定KV（自動作成） |

---

## 4. 管理者仕様

### アクセスURL

| 画面 | URL |
|------|-----|
| 管理者ログイン | `/inmu1919-login` |
| 管理者ダッシュボード | `/inmu1919` |
| 管理者プロフィール | `/inmu1919/profile` |

> ⚠️ 旧URL `/admin` / `/admin-login` は廃止。必ず `/inmu1919` 系を使用すること。

### 管理者認証
- 専用セッション（ユーザーセッションとは独立）
- ログイン条件: `ADMIN_CODE` 環境変数と一致
- セッション有効期限: サーバー再起動まで（インメモリ）
- 失敗時: ロックなし（試行制限あり）

### 管理者ができる操作

#### ユーザー管理
- ユーザー一覧表示（displayName / solWallet / role / balance / monthlyPoints）
- ユーザー詳細・取引履歴確認
- 残高の手動調整（加算・減算）
- ポイント付与
- 通知送信
- ユーザーへの報酬付与

#### ウォレット管理（管理者プロフィール）
- 管理者の Solana ウォレットアドレス設定
- Phantom ウォレット接続
- ウォレット残高確認（INMU Token-2022）
- INMU エアドロップ送信（Phantom 署名）
  - 対象: solWallet 登録済みユーザー
  - Token-2022 Program 使用
  - Solscan 確認リンク表示

#### ミッション管理
- ミッション作成・編集・削除
- タイプ: `daily`（日次）/ `weekly`（週次）
- フィールド: title, description, points, startAt, endAt, linkUrl, isActive

#### API一覧（管理者）

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/auth/admin-sign-in` | 管理者ログイン |
| GET | `/api/auth/admin-session` | セッション確認 |
| POST | `/api/auth/admin-sign-out` | ログアウト |
| GET | `/api/admin/users` | ユーザー一覧 |
| GET | `/api/admin/users/:id` | ユーザー詳細 |
| POST | `/api/admin/users/:id/adjust-balance` | 残高調整 |
| POST | `/api/admin/users/:id/add-points` | ポイント付与 |
| POST | `/api/admin/users/:id/notify` | 通知送信 |
| POST | `/api/admin/users/:id/reward` | 報酬付与 |
| GET | `/api/admin/missions` | ミッション一覧 |
| POST | `/api/admin/missions` | ミッション作成 |
| PUT | `/api/admin/missions/:id` | ミッション更新 |
| DELETE | `/api/admin/missions/:id` | ミッション削除 |
| GET/POST | `/api/admin/wallet` | ウォレット設定 |
| POST | `/api/admin/verify-passcode` | 管理者パスコード確認 |

---

## 5. ユーザー仕様

### 認証フロー
1. `/sign-in` でユーザー名 + パスワードを入力
2. サーバーが bcrypt 照合 → セッションCookie（`inmu_session`）発行
3. セッション有効期限: **30分**（インメモリ）
4. ログイン失敗: **5回失敗 → 10分ロック**

### 新規登録
- ユーザー名（英数字）+ パスワード（6文字以上）
- 登録時に profile / loginStreaks / jars（デフォルト貯蓄瓶）を自動作成
- 初期残高: 0 INMU

### ユーザー画面一覧

| 画面 | パス | 説明 |
|------|------|------|
| ダッシュボード | `/` | 残高・最近の取引・デイリークレーム |
| 取引履歴 | `/history` | 取引一覧・フィルター |
| ポイント | `/points` | ポイント・ミッション・ランキング |
| アチーブメント | `/achievements` | 実績一覧 |
| 通知 | `/notifications` | 通知一覧 |
| プロフィール | `/profile` | プロフィール編集・パスコード設定 |

### ユーザープロフィール
- displayName（表示名）
- solWallet（Solanaウォレットアドレス）— 送金・エアドロップ受取に必須
- xId（X / Twitter ID）
- discordId（Discord ID）
- passcodeHash — INMU送金パスコード（bcrypt）

### ダッシュボード
- 内部残高（INMU）表示
- ウォレット残高（オンチェーン INMU）表示（solWallet設定時）
- 最近の取引一覧（直近10件）
- デイリーポイントクレームボタン
- **INMU送金ボタン**（ヘッダー右上） ← 2026-06-09追加

### API一覧（ユーザー）

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/session` | セッション確認 |
| POST | `/api/auth/sign-in` | ログイン |
| POST | `/api/auth/sign-up` | 新規登録 |
| POST | `/api/auth/sign-out` | ログアウト |
| GET | `/api/dashboard` | ダッシュボードデータ |
| GET | `/api/transactions` | 取引履歴 |
| GET | `/api/balance` | 残高 |
| GET | `/api/profile` | プロフィール取得 |
| PUT | `/api/profile` | プロフィール更新 |
| POST | `/api/profile/passcode` | パスコード設定 |
| GET | `/api/notifications` | 通知一覧 |
| POST | `/api/notifications/:id/read` | 既読 |
| GET | `/api/jars` | 貯蓄瓶一覧 |
| POST | `/api/jars` | 貯蓄瓶作成 |
| POST | `/api/jars/:id/deposit` | 積立 |
| POST | `/api/jars/:id/withdraw` | 引き出し |
| GET | `/api/goals` | 目標一覧 |
| POST | `/api/goals` | 目標作成 |
| GET | `/api/points` | ポイントデータ |
| POST | `/api/points/claim-daily` | デイリークレーム |
| GET | `/api/solana/inmu-balance` | オンチェーン残高確認 |

---

## 6. ミッション仕様

### ミッションタイプ

| タイプ | 期間単位 | period形式 |
|--------|---------|-----------|
| daily | 日次 | `YYYY-MM-DD` |
| weekly | 週次 | `YYYY-WWW`（ISO週番号） |

### ミッションステータス（参加フロー）

```
null（未参加）
  → [参加する] → joined
                   → linkUrlあり: [リンクを開く] → achieved
                   → linkUrlなし: [達成する]     → achieved
                                                    → [報酬を受け取る] → rewarded
```

| status | 表示ボタン | 処理 |
|--------|-----------|------|
| `null`（未参加） | 「参加する」 | `POST /missions/:id/join` |
| `joined` + linkUrlあり | 「リンクを開く」 | リンクを新タブで開く + `POST /missions/:id/achieve` |
| `joined` + linkUrlなし | 「達成する」 | `POST /missions/:id/achieve` |
| `achieved` | 「報酬を受け取る」 | `POST /missions/:id/claim` |
| `rewarded` | 「受取済み」バッジ | 操作不可 |

### ミッションAPI

| メソッド | パス | 認証 | 説明 |
|---------|------|------|------|
| GET | `/api/missions` | ユーザー | ミッション一覧（participationStatus付き） |
| POST | `/api/missions/:id/join` | ユーザー | 参加登録 |
| POST | `/api/missions/:id/achieve` | ユーザー | 達成報告 |
| POST | `/api/missions/:id/claim` | ユーザー | 報酬受取（ポイント付与） |
| POST | `/api/missions/:id/complete` | ユーザー | 旧エンドポイント（後方互換、非推奨） |

### 報酬付与処理（claim時）
1. `missionParticipations.status` → `rewarded` に更新
2. `missionCompletions` テーブルにもレコード挿入（後方互換）
3. `points` テーブルに月次ポイント記録（type: `mission`）
4. `profile.monthlyPoints` に加算
5. 通知（type: `mission`）を挿入

---

## 7. INMU送金仕様

### 概要
ユーザー間でオンチェーン INMU Token-2022 を送金する機能。  
Phantom ウォレット署名必須。送信者・受信者双方の内部トランザクション記録も行う。

### 前提条件
- 送金者: `profile.solWallet` 設定済み、`profile.passcodeHash` 設定済み
- 受信者: `profile.solWallet` 設定済み
- Phantom ウォレット拡張機能インストール済み
- 送金者ウォレット残高に十分な INMU

### 送金フロー

```
① 受取人検索（displayName / solWallet / xId / discordId）
② 送金量・メモ・パスコード入力
③ [Phantom で送金] クリック
④ サーバーでパスコード事前検証（POST /transfer/verify-passcode）
⑤ Phantom 接続・ウォレットアドレス一致確認
⑥ Token-2022 送金トランザクション構築
    - 受信者ATA（Associated Token Account）未作成の場合は作成命令を追加
⑦ Phantom 署名
⑧ Solana ネットワークへブロードキャスト
⑨ トランザクション確認（confirmTransaction）
⑩ POST /transfer/send でサーバー記録（passcode + txHash）
⑪ 完了: txHash + Solscanリンク表示
```

### 送金API

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/transfer/user-search?q=...` | 受取人検索（2文字以上で起動、最大10件） |
| POST | `/api/transfer/verify-passcode` | パスコード事前検証 |
| POST | `/api/transfer/send` | 送金記録（passcode再検証 + TX記録） |

### 受取人検索条件
- `displayName` ILIKE
- `solWallet` ILIKE
- `xId` ILIKE
- `discordId` ILIKE
- 自分自身は除外
- `solWallet` 未設定のユーザーは除外（送金不可）

### DB更新内容（send時）
1. `transactions` 挿入（送金者: type=`send`）
2. `transactions` 挿入（受信者: type=`receive`）
3. `profile.totalSent` 加算（送金者）
4. `profile.totalReceived` 加算（受信者）
5. `notifications` 挿入（受信者へ「INMU受取」通知）

### Solana 接続
- RPC: `/api/solana/rpc-proxy`（サーバーサイドプロキシ経由）
- Program: `TOKEN_2022_PROGRAM_ID`
- Commitment: `confirmed`
- Finalization: `finalized`（blockhash取得時）

### パスコードロック仕様（送金用）
- 5回失敗 → **30分ロック**
- ロック中はエラーメッセージと残り時間を表示
- 成功時にカウンターをリセット
- ロック状態はサーバーインメモリ（再起動でリセット）

---

## 8. ポイント仕様

### ポイント種別

| type | 発生タイミング |
|------|--------------|
| `daily_login` | 毎日ログイン（デイリークレーム） |
| `mission` | ミッション達成報酬 |
| `admin` | 管理者手動付与 |

### デイリークレーム

- 1日1回のみ（`loginStreaks.lastLogin` でチェック）
- ストリーク継続でボーナスポイント

| ストリーク | 付与ポイント |
|-----------|------------|
| 1日目 | 10 pts |
| 2日目 | 12 pts |
| 3日目 | 15 pts |
| 7日目以上 | 20 pts |
| 30日目以上 | 50 pts |

> ※実装値はpoints.tsを参照。上記は参考値。

### ポイント集計
- 月次集計（`points.month` = `YYYY-MM` 形式）
- 累計: `profile.monthlyPoints`
- ランキング: `profile.monthlyPoints` 降順 TOP20

---

## 9. セキュリティ仕様

### レート制限一覧

| 対象 | 上限 | ロック時間 |
|------|------|----------|
| ユーザーログイン | 5回失敗 | 10分 |
| 送金パスコード | 5回失敗 | 30分 |
| 管理者パスコード確認 | 5回失敗 | 30分 |

> ロック状態はすべてサーバーインメモリ（再起動でリセット）。

### パスワード・パスコード
- bcryptjs によるハッシュ化（salt rounds: 10）
- プレーンテキストをDBに保存しない
- セッションCookieには認証情報を含まない

### セッション管理
- Cookie名: `inmu_session`
- セッション有効期限: 30分（ユーザー）
- HttpOnly、Secure フラグ（本番環境）
- セッション情報はサーバーインメモリ

### 管理者セッション
- ユーザーセッションとは完全独立
- `ADMIN_CODE` 環境変数との照合
- 管理者専用Cookieで管理

### 監査ログ（auditLog）
管理者が行った操作をすべて記録:
- adminId, action, targetUserId, details, createdAt

### セキュリティログ（securityLog）
- ログイン失敗・ロック発動イベントを記録

### Phantom ウォレット検証
- 送金時: Phantom の `publicKey` と `profile.solWallet` が一致することを確認
- 不一致の場合はトランザクション中断

---

## 10. Publish運用ルール

### デプロイ環境
- **開発**: Replit ワークスペース（プレビュー）
- **本番**: Replit Deployments（`.replit.app` ドメイン）

### Publish前チェックリスト
1. ローカルで API サーバーが正常起動すること（`pnpm --filter @workspace/api-server run dev`）
2. フロントエンドビルドエラーなし（`pnpm --filter @workspace/inmu-bank run build`）
3. 管理者ログイン（`/inmu1919-login`）が機能すること
4. ユーザーログイン・送金・ミッションフローが機能すること
5. 本番DBマイグレーション適用済みであること

### 本番DB適用手順
スキーマ変更時は以下のSQLを本番DBに対して実行:
```sql
-- missionParticipations（2026-06-09追加）
CREATE TABLE IF NOT EXISTS "missionParticipations" (
  "id" serial PRIMARY KEY,
  "userId" text NOT NULL,
  "missionId" integer NOT NULL,
  "period" text NOT NULL,
  "status" text NOT NULL DEFAULT 'joined',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "achievedAt" timestamptz,
  "rewardedAt" timestamptz,
  UNIQUE ("userId", "missionId", "period")
);

-- transactions.txHash（2026-06-09追加）
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "txHash" text;
```

### 環境変数（必須）
| 変数名 | 説明 |
|--------|------|
| `DATABASE_URL` | PostgreSQL 接続文字列 |
| `ADMIN_CODE` | 管理者ログインコード |
| `GITHUB_TOKEN` | GitHub API トークン（Push用） |

---

## 11. GitHub Push / Commit Hash 報告ルール

### リポジトリ情報
- **URL**: `https://github.com/ryha25/Inmu-PORTAL-Lx`
- **ブランチ**: `main`

### コミット規約

```
<type>: <件名（日本語可）>

<詳細（任意）>
```

| type | 用途 |
|------|------|
| `feat` | 新機能追加 |
| `fix` | バグ修正 |
| `docs` | ドキュメント変更 |
| `refactor` | リファクタリング |
| `chore` | 設定・依存関係変更 |

### Push後の報告フォーマット

```
## GitHub Push 完了

- 作成/変更ファイル:
  - path/to/file1.ts (変更内容の概要)
  - path/to/file2.tsx (変更内容の概要)
- Commit Hash: <full SHA>
- Push先: ryha25/Inmu-PORTAL-Lx @ main
- Solscan: （Solana関連の場合のみ）
```

### Push ルール
1. **Main agent は `git commit` / `git push` を直接実行できない**（Replit セキュリティ制約）
2. コード変更後、GitHub Push は**バックグラウンドタスク（Project Task）として作成・提案**する
3. ユーザーが承認後、タスクエージェントが `git add → git commit → git push` を実行
4. Push完了後、コミットハッシュと変更ファイル一覧を報告する

### 仕様書更新ルール
- **コード変更と同時に `docs/inmu-portal-spec.md` も更新する**
- 更新箇所には `（YYYY-MM-DD追加/変更）` を付記する
- コミットメッセージには仕様書更新も含める

---

*本仕様書は INMU PORTAL の正本です。不明点・矛盾点がある場合はコードを正とし、仕様書を修正してください。*
