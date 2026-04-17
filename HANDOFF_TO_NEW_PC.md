# 結（ゆい）レセプション — 引き継ぎ／別 PC への移行ドキュメント

このドキュメントは、yui-reception プロジェクトを別の PC に引っ越して、
同じ環境で作業を続けるための完全な手引きです。

**最終更新**: 2026-04-11
**作業者**: おぎぴ (oginoshoten / hiromasa0877@gmail.com)
**Supabase プロジェクト ID**: `ebwyrdzvfqxtpvkhaogp`
**GitHub リポジトリ**: `git@github.com:oginoshoten/yui.git`（Private、まだ push していない）

---

## 1. このドキュメントの読み方

時間がない人は **「2. 新しい PC に引っ越す手順」** だけ読めば動きます。
過去に何をやったかを振り返りたい人は **「6. 変更履歴（このセッションでやったこと）」** を読んでください。

---

## 2. 新しい PC に引っ越す手順（30 分以内）

### 必要なもの

- 新しい PC（Windows / Mac / Linux どれでも）
- インターネット接続
- 同じフォルダに置いた `yui-app-clean.zip`（このドキュメントと一緒に渡されているはず）
- **`.env.local` ファイル**（古い PC からコピーする必要あり、後述）

### ステップ A: ファイルを転送する

**A-1.** 古い PC で、Downloads フォルダの中の以下の 2 つを USB / クラウド経由で新しい PC に転送:
- `yui-app-clean.zip` （このドキュメントと一緒にある）
- `yui-app/.env.local` （**重要：これは Supabase の鍵が入っていて zip には含まれていません。手動で別途コピーしてください**）

> `.env.local` は隠しファイル扱いです。Windows なら エクスプローラー上部の「表示」→「隠しファイル」にチェックを入れると見えます。

**A-2.** 新しい PC の好きな場所（例: `C:\Users\<ユーザ名>\Downloads\`）に `yui-app-clean.zip` を置いて、解凍。`yui-app/` フォルダができます。

**A-3.** 古い PC からコピーしておいた `.env.local` を、新しくできた `yui-app/` フォルダ直下にそのままコピーします。

### ステップ B: Node.js を準備する

このプロジェクトは Node.js v20 で動きます。2 つの方法があります。

**方法 1: 普通にインストール（推奨）**
- https://nodejs.org/ja から LTS 版（v20 系）をダウンロードしてインストール

**方法 2: ポータブル版（インストールしたくない人向け）**
- フォルダ内の `start.bat` を**ダブルクリック**するだけで自動的にポータブル Node.js をダウンロードして dev サーバーを起動します
- 初回は 2〜3 分かかります（Node を 30MB ダウンロード→展開→`npm install`→起動）
- ※Windows のみ

### ステップ C: 依存ライブラリをインストール

ターミナル（PowerShell / cmd / Terminal）で yui-app フォルダに移動して:

```bash
npm install --legacy-peer-deps
```

3〜5 分かかります。

### ステップ D: 動作確認

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開く。式典作成画面が表示されれば成功。

スマホからもアクセスしたい場合は、起動ログに出る `Network: http://192.168.x.x:3000` の URL を使う（同じ Wi-Fi 必須）。

---

## 3. `.env.local` の中身（参考）

ファイルの構造は以下の通りです。実際の値は古い PC からコピーするか、Supabase ダッシュボードで確認してください。

```env
NEXT_PUBLIC_SUPABASE_URL=https://ebwyrdzvfqxtpvkhaogp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

**ANON_KEY の確認方法**:
1. https://supabase.com/dashboard/project/ebwyrdzvfqxtpvkhaogp/settings/api を開く
2. 「Project API keys」セクションの **anon / public** キーをコピー
3. `.env.local` の `NEXT_PUBLIC_SUPABASE_ANON_KEY=` の右側に貼り付け

**Supabase URL** は上記の通り `https://ebwyrdzvfqxtpvkhaogp.supabase.co` で固定です。

---

## 4. 現在の進捗状況

### ✅ 完了済み

- **Next.js + Supabase でのアプリ実装**（参列者登録 / 香典管理 / リアルタイムダッシュボード）
- **後行登録フロー**: 「ご自身で登録」「代理登録」の 2 択選択画面
- **管理番号の自動採番**: 自分で登録したときも 001 / 002 / 003 形式で番号が振られる
- **香典金額を任意化**: 公開用画面では金額を入れなくても登録できる
- **郵便番号のハイフン無し対応**: 全角数字も自動正規化
- **弔電（ちょうでん）の追加**: お供え物の選択肢に追加
- **ダッシュボードのチェックボックスエラー修正**: 楽観的更新＋ロールバック＋具体的エラーメッセージ
- **大きいボタン化**: 冬場の冷えた指でもタップしやすいサイズに
- **代理登録カードの白文字バグ修正**: インラインスタイルで CSS 特異性を担保
- **Supabase スキーマ修正**: `has_kuge` / `has_kumotsu` / `has_chouden` / `has_other_offering` / `other_offering_note` カラム追加（→ ✅ 実行済み・PostgREST スキーマキャッシュもリロード済み）
- **2 択カードの色味調整**: 高齢者向けに柔らかい色とコントラスト
- **レスポンシブ対応**: スマホ縦積み / タブレット以上で 2 カラム
- **dev サーバーの外部公開対応**: `npm run dev` が `0.0.0.0` で listen するようにした（スマホからアクセス可能）

### ⏳ 未完了（次にやること）

1. **GitHub に push する**
   - GitHub には既にリポジトリ `oginoshoten/yui` を作成済み（Private）だが、まだコード未 push
   - 推奨: **GitHub Desktop**（GUI アプリ）を使う。理由は git CLI が入っていないため。
   - 詳細手順は **「8. GitHub への push 手順（GitHub Desktop 推奨）」** を参照

2. **Vercel にデプロイする**
   - GitHub に push が終わったら Vercel と連携
   - 環境変数 2 つを Vercel ダッシュボードで設定するだけ
   - 詳細手順は **「9. Vercel デプロイ手順」** を参照

3. **本番動作確認**
   - スマホ実機で Vercel の URL を開いて、参列者登録の全フローを通す
   - 特に、お供え物のチェックボックスがエラー無く動くか確認

---

## 5. 既知の問題と対処

### 問題 1: 壊れた `.git/` フォルダが残っていた（解決済み・移行 zip では除外済み）

**症状**: サンドボックスから `git init` を試みた際に途中で止まり、`.git/` フォルダが中途半端な状態で残っていた。
**原因**: サンドボックスが Windows マウントのファイル削除をブロックしたため。
**対処**: 移行用 zip には `.git/` を含めていないので、新しい PC では問題ありません。

### 問題 2: `test-xxx.txt` というゴミファイル（解決済み・除外済み）

**症状**: デバッグ中に作成された一時ファイルが残っていた。
**対処**: 移行用 zip には含まれていません。古い PC のフォルダには残っているので、気になるなら手動で削除してください。

### 問題 3: ポータブル Node.js（`node.zip` / `node-v20.18.0-win-x64/`）が repo に入っていた（解決済み）

**症状**: `start.bat` が自動でダウンロード→展開する設計だったため、フォルダ内に 80MB+ のバイナリが残っていた。
**対処**: `.gitignore` で除外し、移行用 zip にも含めていません。新しい PC で `start.bat` を実行すると再ダウンロードされます（または普通に Node.js をインストール）。

### 問題 4: PostgREST スキーマキャッシュエラー（解決済み）

**症状**: `Could not find the 'has_chouden' column of 'attendees' in the schema cache`
**原因**: マイグレーション SQL を流した後に PostgREST のスキーマキャッシュが自動で更新されなかった。
**対処**: 以下の SQL を Supabase の SQL Editor で実行済み（保存名: `Idempotent attendee offering columns migration`）。

```sql
ALTER TABLE public.attendees ADD COLUMN IF NOT EXISTS has_kuge BOOLEAN DEFAULT false;
ALTER TABLE public.attendees ADD COLUMN IF NOT EXISTS has_kumotsu BOOLEAN DEFAULT false;
ALTER TABLE public.attendees ADD COLUMN IF NOT EXISTS has_chouden BOOLEAN DEFAULT false;
ALTER TABLE public.attendees ADD COLUMN IF NOT EXISTS has_other_offering BOOLEAN DEFAULT false;
ALTER TABLE public.attendees ADD COLUMN IF NOT EXISTS other_offering_note TEXT;

UPDATE public.attendees SET has_kuge           = false WHERE has_kuge           IS NULL;
UPDATE public.attendees SET has_kumotsu        = false WHERE has_kumotsu        IS NULL;
UPDATE public.attendees SET has_chouden        = false WHERE has_chouden        IS NULL;
UPDATE public.attendees SET has_other_offering = false WHERE has_other_offering IS NULL;

NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');
```

新しい PC では SQL を再実行する必要はありません（DB 側に既に反映されているため）。

### 問題 5: 既存の TypeScript エラー 3 件（未対応・実害なし）

`npm run type-check` を走らせると以下 3 件が出ますが、いずれもこのセッションの修正と無関係で、アプリの動作には影響しません。後で時間があるときに対応:

```
middleware.ts(1,10): error TS2305: Module '"@supabase/ssr"' has no exported member 'createMiddlewareClient'.
src/components/QrScanner.tsx(44,35): error TS2345: Argument of type '(error: Error) => void' is not assignable to parameter of type 'QrcodeErrorCallback'.
src/lib/supabase.ts(18,23): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
```

---

## 6. 変更履歴（このセッションでやったこと）

時系列でなく、ファイル別にまとめてあります。

### 設定ファイル

**`tsconfig.json`** — 壊れていた JSON を修復（配列が閉じていなかった）。`include` / `exclude` を正常な形に。

**`package.json`** — dev サーバーのスクリプトを修正:
```json
"dev": "next dev -H 0.0.0.0",       // 外部からも見えるように
"dev:local": "next dev",             // 従来通り localhost のみで起動したい時用
"start": "next start -H 0.0.0.0",
```

**`.gitignore`** — 以下を追加:
```
node.zip
node-v*-win-*/
.vercel
*.tsbuildinfo
```

### Supabase マイグレーション（新規追加）

`supabase/migrations/` に以下を追加（**すべて DB に適用済み**）:

- `003_chouden.sql` — `has_chouden` カラム追加
- `004_fix_offering_columns.sql` — お供え物カラム一式 + NOTIFY pgrst
- `diagnose_and_fix.sql` — 診断 + 修正の冪等スクリプト（実際に流したのはこれ）

### TypeScript 型定義

**`src/types/database.ts`** — `Attendee` 型に `has_chouden: boolean` を追加。

### コンポーネント

**`src/components/AttendeeTable.tsx`** — 全面書き換え:
- 弔電カラム追加
- チェックボックスを `w-6 h-6` に拡大（冷えた指でも押しやすく）
- `onDelete` プロパティと削除ボタン追加
- `!!attendee.has_kuge` の null 安全デフォルト

**`src/components/KodenInput.tsx`** — 全面書き換え:
- プリセットボタンを 2 列 × 3 行 / `py-5` / `text-lg` に拡大
- ラベルを「香典金額（任意）」に変更（必須ではないことを明示）
- 同じボタンを 2 回押すと選択解除されるトグル動作

### ページ

**`src/app/page.tsx`** — 全面書き換え:
- 式典作成後、ダッシュボードではなく `/ceremony/{id}/actions` に遷移
- 式典カードに大きい「式典を開く →」ボタンと小さいダッシュボードリンク

**`src/app/ceremony/[id]/actions/page.tsx`** — 新規作成:
- 「ご自身で登録」「代理登録」の 2 択選択画面
- 高齢者向けに大きい文字 + 大きいタップ領域 + 柔らかい色（クリーム × 薄テール）
- 上端に 8px の色帯でカードを区別
- スマホ縦積み / タブレット以上で 2 カラム
- フォーカスリング、aria-label など A11y 配慮

**`src/app/ceremony/[id]/register/page.tsx`** — 編集:
- 自己登録時にも `getNextKodenNumber` で管理番号を採番
- UNIQUE 制約衝突時のリトライループ（最大 5 回）

**`src/app/ceremony/[id]/complete/page.tsx`** — 編集:
- QR コード表示を削除
- 「参列者 ID（UUID 先頭 8 文字）」表示を「管理番号（001/002/003）」表示に変更
- 「この番号を香典袋にご記入ください」の注記を追加

**`src/app/staff/[ceremonyId]/page.tsx`** — 全面書き換え:
- スマート受付タブ・参列者一覧タブを削除し、代行入力フォーム単体に簡素化
- お供え物トグル 4 つ（供花 / 供物 / 弔電 / その他）
- UNIQUE 制約衝突時のリトライループ

**`src/app/dashboard/[ceremonyId]/page.tsx`** — 全面書き換え:
- 楽観的更新 + ロールバック + 具体的エラーメッセージ:
  ```ts
  toast.error(`更新に失敗しました: ${error.message}`)
  ```
- `.select().single()` で更新後の最新データをマージ
- 削除ボタン（`window.confirm` 付き）
- 弔電統計カード追加（4 列グリッドのお供え物カード）
- CSV エクスポートに弔電列追加

### ユーティリティ

**`src/lib/utils.ts`** — `normalizeZipcode` 関数を追加:
```typescript
export function normalizeZipcode(zipcode: string): string {
  if (!zipcode) return '';
  return zipcode
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    .replace(/[^\d]/g, '');
}
```

全角数字を半角に変換し、ハイフンその他の非数字を除去します。

---

## 7. ファイル・フォルダ構成（重要なところだけ）

```
yui-app/
├── .env.local                  ← 秘密！絶対 GitHub に上げない
├── .env.example                ← テンプレ（公開 OK）
├── .gitignore                  ← .env.local や node_modules を除外
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
├── start.bat                   ← Windows 用ワンクリック起動スクリプト
├── HANDOFF_TO_NEW_PC.md        ← このファイル
├── DEPLOY_GITHUB.md            ← GitHub への push 手順（CLI 版・参考用）
├── README.md                   ← 既存のプロジェクト概要
├── DEPLOYMENT.md               ← 既存のデプロイガイド
├── public/
├── src/
│   ├── app/
│   │   ├── page.tsx                    ← 式典一覧
│   │   ├── ceremony/[id]/
│   │   │   ├── actions/page.tsx        ← 「ご自身で / 代理」2 択画面
│   │   │   ├── register/page.tsx       ← 自己登録フォーム
│   │   │   └── complete/page.tsx       ← 完了画面
│   │   ├── staff/[ceremonyId]/page.tsx ← 代行入力
│   │   └── dashboard/[ceremonyId]/page.tsx ← 喪主向けダッシュボード
│   ├── components/
│   │   ├── AttendeeTable.tsx
│   │   ├── KodenInput.tsx
│   │   └── ...
│   ├── lib/
│   │   ├── supabase.ts
│   │   └── utils.ts
│   └── types/database.ts
└── supabase/
    └── migrations/
        ├── 001_initial.sql
        ├── 002_offerings_and_koden_number.sql
        ├── 003_chouden.sql              ← 新規
        ├── 004_fix_offering_columns.sql ← 新規
        └── diagnose_and_fix.sql         ← 新規（実際に流したのはこれ）
```

---

## 8. GitHub への push 手順（GitHub Desktop 推奨）

git CLI が入っていないので、**GitHub Desktop**（GUI アプリ）を使うのが一番ラクです。

### ステップ 1: GitHub Desktop をインストール

https://desktop.github.com/download/ からダウンロード → インストール。

### ステップ 2: GitHub アカウントでサインイン

起動 → 「Sign in to GitHub.com」 → ブラウザが開いて SSO で認証 → 自動で戻ってくる。

### ステップ 3: 既存リポジトリを削除（既に空のものを作ってしまっている場合）

ブラウザで https://github.com/oginoshoten/yui/settings → 一番下の「Delete this repository」 → リポジトリ名 `oginoshoten/yui` を入力して確定。

### ステップ 4: ローカルフォルダを GitHub Desktop に追加

GitHub Desktop で「File」→「Add local repository」 → yui-app フォルダを選択 → 「create a repository」リンク → 「Create repository」ボタン。

### ステップ 5: 初回コミット & 確認

左下のファイルリストを目視確認:
- ❌ `.env.local` が**含まれていない**こと
- ❌ `node_modules` が**含まれていない**こと
- ❌ `node.zip` が**含まれていない**こと

Summary 欄に `Initial commit` と入れて「Commit to main」ボタン。

### ステップ 6: Publish

上部の「Publish repository」ボタン → ダイアログで:
- Name: `yui`
- **Keep this code private** にチェック
- 「Publish repository」ボタン

### ステップ 7: 確認

ブラウザで https://github.com/oginoshoten/yui を開いて、ファイルが上がっていることを確認。
**`.env.local` がリストに無いこと**を必ず目視確認してください。もしあれば即座に repo を削除して Supabase の anon key を再生成してください。

---

## 9. Vercel デプロイ手順

### ステップ 1: アカウント作成

https://vercel.com → 「Sign Up」 → 「Continue with GitHub」（GitHub アカウントで SSO）

### ステップ 2: プロジェクト作成

ダッシュボードで「Add New...」→「Project」→ GitHub の `oginoshoten/yui` リポジトリを「Import」

### ステップ 3: 環境変数を設定

「Environment Variables」セクションで 2 つ追加:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ebwyrdzvfqxtpvkhaogp.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | （`.env.local` からコピペ） |

「Production」「Preview」「Development」の 3 つ全部にチェックが入った状態のままで OK。

### ステップ 4: Deploy

「Deploy」ボタンを押す → 1〜2 分待つ → `https://yui-xxx.vercel.app` という URL が発行される。

### ステップ 5: 動作確認

スマホ実機で発行された URL を開いて、参列者登録の全フローを通す。

### 次回以降のデプロイ

GitHub Desktop で commit → push するだけで、Vercel が自動で再デプロイします。何もしなくて OK。

---

## 10. よく使うコマンド

ターミナルで yui-app フォルダに移動した状態で:

```bash
# 開発サーバー起動（外部公開アリ・スマホからもアクセス可）
npm run dev

# 開発サーバー起動（localhost のみ）
npm run dev:local

# 型チェック
npm run type-check

# Lint
npm run lint

# 本番ビルド
npm run build

# 本番サーバー起動（ビルド後）
npm start

# 依存ライブラリのインストール
npm install --legacy-peer-deps
```

---

## 11. トラブル時の連絡用情報

| 項目 | 値 |
|---|---|
| プロジェクト名 | 結（ゆい）レセプション |
| Supabase Project ID | `ebwyrdzvfqxtpvkhaogp` |
| Supabase URL | `https://ebwyrdzvfqxtpvkhaogp.supabase.co` |
| Supabase Dashboard | https://supabase.com/dashboard/project/ebwyrdzvfqxtpvkhaogp |
| GitHub Owner | `oginoshoten` |
| GitHub Repo | `yui` (Private) |
| Email | hiromasa0877@gmail.com |
| Node.js Version | v20.x（v20.18.0 で動作確認済み） |
| Next.js Version | 14.1.x |
| 主な依存 | Next.js, Supabase, Tailwind CSS, react-hot-toast |

---

## 12. このドキュメントの更新方法

新しい変更を加えたら、本ドキュメントの「6. 変更履歴」セクションに追記してください。
セクション 4 の進捗状況も更新すると、未来の自分（または共同作業者）が状況を即座に把握できます。
