---
name: Gacha feature implementation
description: gachaResults + gachaInmuWins tables; free daily gacha; bulk Phantom INMU send; per-win tracking
---

## テーブル構成

### gachaResults（スピン単位）
- 1スピン = 1行
- `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT EXISTS` で安全マイグレーション
- 列: id, userId, pullType, results(JSONB), totalPoints, hasInmu, inmuCount, inmuSentStatus, wasGuaranteed, costPoints, isFree, txHash, solWallet, failureReason, createdAt

### gachaInmuWins（INMU当選個別管理）⭐ 新設
- **1当選 = 1行**（10連でINMU×2なら2行）
- 管理画面・送金処理はこのテーブルを対象にする
- 列: id, spinId(→gachaResults.id), userId, pullType, inmuAmount(常に10000), inmuSentStatus, inmuSentAt, inmuSentByAdminId, txHash, solWallet, failureReason, createdAt
- 既存 gachaResults 当選は手動 INSERT で移行済（新スピンは自動 insert）

## 確率・ガチャ仕様
- 880/80/30/10 per 1000（pts100/pts1000/pts5000/inmu10k）
- GUARANTEED_RATE = 1/114

## 無料ガチャ（JST基準日次リセット）
- `GET /api/gacha/free-status` → `{ used, nextReset }`
- `POST /api/gacha/free-spin` → 通常と同じレスポンス形状
- pullType='free', costPoints=0, isFree=true

## 管理 API エンドポイント
- `GET /api/admin/gacha/results` → **gachaInmuWins** JOIN gachaResults JOIN profile
  - profileSolWallet（profile最新）/ solWallet（送金済時に記録）の両方を返す
- `PUT /api/admin/gacha/results/:id/mark-sent` → gachaInmuWins.id を対象
  - txHash + solWallet 必須; transactions/profile/notifications も更新
- `PUT /api/admin/gacha/results/:id/mark-failed`
- `PUT /api/admin/gacha/results/:id/reset-pending`（failed→pending）

## 管理 UI（admin-panel.tsx）

### GachaResultRow 型
- id = gachaInmuWins.id, spinId = gachaResults.id
- profileSolWallet（最新）/ solWallet（送金済のみ）
- inmuAmount = 10000 固定, hasInmu/inmuCount は不要で削除

### チェックボックス一括送金
- `gachaSelectedIds: Set<number>` + `bulkSending: boolean` state
- 全選択/全解除ボタン → sendableInFiltered（pending/failed かつ wallet あり）を対象
- `markGachaBulkSent(rows)`: 選択行を **1つの Solana TX** にまとめる
  - 各行に transfer instruction を追加 → 1回の Phantom 署名
  - 成功後: 全行に同一 txHash で mark-sent を個別 API call
  - ユーザーキャンセル → pending に戻す
  - エラー → 全行 mark-failed
- `markGachaSent(row)`: 個別送金（1当選1TX）は引き続き利用可能
- フィルタ切り替え時にチェック選択はリセット

## drizzle-kit push 禁止
- TTY エラーになるため使用不可
- 全マイグレーションは raw SQL `ALTER TABLE ADD COLUMN IF NOT EXISTS` か `CREATE TABLE IF NOT EXISTS`

## 二重ガチャシステムの罠（要注意）
- legacy (`gacha.ts`: `/gacha/spin`, `/gacha/free-spin`) と新 PET系 (`pet-commerce.ts`: `/pet-gacha/points`, `/pet-gacha/paid`, `/pet-gacha/paid-free`) が並存
- 管理画面「全スピン履歴」(`/admin/gacha/spins`) は `gachaResults` テーブルを無条件・無フィルタで読む
- **Why:** `pet-gacha/points`（現行「通常ガチャ」ポイント消費タブ）が以前は INMU当選時だけ `gachaResults` に insert していたため、それ以外の大半のスピンが管理画面「全スピン履歴」に一切反映されなかった。加えて insert時に `gachaKind` を誤って `'paid'` 固定にしていた（本来 `'normal'`）
- **How to apply:** PET系のどのエンドポイントを新設/変更する際も、`gachaResults` へは **勝敗に関わらず毎スピン** insert すること。`gachaKind` は実際のタブ（'normal'=ポイント消費, 'paid'=INMU消費TXID）と一致させる。PAID_PRIZES に "inmu" type が無いため `/pet-gacha/paid` は元々 INMU当選しない設計 — gachaResults未挿入で問題ない
