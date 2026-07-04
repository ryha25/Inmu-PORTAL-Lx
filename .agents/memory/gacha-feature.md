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

## Phantom送金「ハッシュ発行されたが実際は送られていない」バグ（全送金フロー共通）
- **症状:** UIは「送金完了」と表示するが、後でsolscanで見るとtxハッシュが "not found"（オンチェーンに一度も乗っていない）。同一txHashが複数の異なるDB行に記録されることもある（stale blockhash/未確定txの再利用）。
- **Why:** `sendRawTransaction({ skipPreflight: true })` はブロックチェーンが実際にtxを処理する前に signature を返す。それを `connection.confirmTransaction()` で待たずに即DB「sent」記録すると、失効/失敗したtxでも成功扱いになる。
- **How to apply:** Phantom経由で送金するコードは全て `sendRawTransaction` の後に必ず `getLatestBlockhash` の `lastValidBlockHeight` を保持し `connection.confirmTransaction({signature, blockhash, lastValidBlockHeight}, 'confirmed')` を待ち、`confirmation.value.err` をチェックしてから成功として扱う/DBに記録すること。該当箇所: `user-send-dialog.tsx`(ユーザー間送金), `admin-panel.tsx`のmarkGachaSent/markGachaBulkSent/handlePhantomAirdropSend/購入申請リベート送金, `lib/admin-inmu-transfer.ts`のsendInmuWithPhantom（ペット購入・ガチャ課金・報酬申請で共用）。新しい送金コードを書く際は必ずこのパターンに従うこと。

## 有償ガチャ「送金成功したのに結果が出ない/何もなく終わる」バグ
- **症状:** Phantomでの送金・サーバー側の確認・抽選（`petGachaHistory` insert）はすべて成功しているのに、画面には結果画面が出ず「処理中…」のままか、リロード後も何も起きない。DBで確認すると txId は `petPaymentAttempts.status='verified'` かつ `petGachaHistory` に正しい results が入っている＝資産的な損失は無い、純粋なUI表示バグ。
- **Why:** 送金直後は `localStorage`（例: `inmu-pet-paid-gacha-pending`）に txId を保存し、ページ再訪問時に useEffect で復旧・結果取得する設計だった。その復旧処理が誤って `getPhantomProvider()!=null` を前提条件にしていたため、Phantom拡張機能の非同期注入がまだ完了していないタイミングでマウントされると復旧自体が丸ごとスキップされ、結果が二度と表示されなかった。
- **How to apply:** 「送金/決済のtxIdをlocalStorageに保存して後で結果を取りに行く」系の復旧ロジックは、その取得APIがwalletを必要としない（txIdのみで完結する）なら、ウォレットプロバイダの検出条件と絶対に結合しないこと。ウォレット検出が必要なのは別の目的（例: mobile intentからの自動タブ切り替え）だけであり、それとは別のuseEffect/分岐にする。

## 無料ガチャ「残り回数」表示の仕様（誤バグ報告に注意）
- `getFreeGachaState`: normalRemaining = normalBaseRemaining(1本分) + sharedRemaining（拓也スキル有効時+3の共有プール）、paidRemainingも同様に共有プールを足す。
- **Why:** 仕様上、共有プールは各ガチャ種別の自前1回分を使い切った後にのみ消費される「合算表示」。自前1回を使用済みでも共有分が残っていれば「残り3回」等と表示されるのは意図通りであり、バグではない（誤って「本日利用済み」的な表示を期待しないこと）。
- **How to apply:** このロジックを変更/テストする際は、表示される remaining は「自前+共有の合算」であるという前提を崩さないこと。UIのサブキャプション「うち拓也共通ボーナス残りX回」は sharedRemaining>0 の時だけ出す。

## gacha-page.tsx の改行コード混在に注意
- **症状:** `gacha-page.tsx` は CRLF と bare LF が混在したファイルだったことがある（他の pet-page.tsx は純CRLF）。`/\r\n/` のみで split して行番号ベース編集をすると位置がずれ、JSXの閉じタグを誤挿入/削除して壊れる。
- **How to apply:** 行番号ベースでNode script編集する前に、対象ファイルの改行コードが統一されているか確認する（bare LF数をカウント）。混在していれば `/\r\n|\n/` で split するか、先にファイル全体を `\n` に正規化してから編集する。JSX破損時は div/要素の開閉深度を行ごとに集計するスクリプトで壊れた行を特定するのが有効。

## 二重ガチャシステムの罠（要注意）
- legacy (`gacha.ts`: `/gacha/spin`, `/gacha/free-spin`) と新 PET系 (`pet-commerce.ts`: `/pet-gacha/points`, `/pet-gacha/paid`, `/pet-gacha/paid-free`) が並存
- 管理画面「全スピン履歴」(`/admin/gacha/spins`) は `gachaResults` テーブルを無条件・無フィルタで読む
- **Why:** `pet-gacha/points`（現行「通常ガチャ」ポイント消費タブ）が以前は INMU当選時だけ `gachaResults` に insert していたため、それ以外の大半のスピンが管理画面「全スピン履歴」に一切反映されなかった。加えて insert時に `gachaKind` を誤って `'paid'` 固定にしていた（本来 `'normal'`）
- **How to apply:** PET系のどのエンドポイントを新設/変更する際も、`gachaResults` へは **勝敗に関わらず毎スピン** insert すること。`gachaKind` は実際のタブ（'normal'=ポイント消費, 'paid'=INMU消費TXID）と一致させる。PAID_PRIZES に "inmu" type が無いため `/pet-gacha/paid` は元々 INMU当選しない設計 — gachaResults未挿入で問題ない
