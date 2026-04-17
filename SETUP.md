# 結（ゆい）レセプション - セットアップガイド

このガイドに従って、本番環境で動作する葬儀受付DXサービスをセットアップしてください。

## 前提条件

- Node.js 18.17 以上
- npm または yarn
- Supabaseアカウント（無料プランで開始可能）
- Vercelアカウント（デプロイ用、オプション）

## ステップ1: Supabaseプロジェクト作成

### 1.1 Supabaseアカウント作成
1. https://supabase.com にアクセス
2. GitHub または Google でサインアップ

### 1.2 新規プロジェクト作成
1. Supabaseダッシュボード > New Project
2. 以下を設定:
   - **Organization**: 新規作成 または 既存選択
   - **Project Name**: `yui-reception` (任意)
   - **Database Password**: 強力なパスワードを設定（重要！）
   - **Region**: 東京推奨
3. "Create new project" をクリック

### 1.3 認証情報取得
1. Project Settings > API
2. 以下をコピー:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`

## ステップ2: ローカル開発環境セットアップ

### 2.1 リポジトリクローン
```bash
git clone <your-repository-url>
cd yui-reception
```

### 2.2 依存関係インストール
```bash
npm install
# または
yarn install
```

### 2.3 環境変数設定
`.env.local` ファイルを作成:

```env
# Supabase設定（ステップ1.3から取得）
NEXT_PUBLIC_SUPABASE_URL=https://[project-id].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...

# Zipcloud API（そのまま使用可能）
NEXT_PUBLIC_ZIPCLOUD_API_URL=https://zipcloud.ibsnet.co.jp/api/search

# サーバーサイド処理用（オプション）
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

### 2.4 データベース初期化

#### オプションA: Supabaseダッシュボードから実行（推奨）
1. Supabase Dashboard > SQL Editor
2. "New Query" > 下記SQLを貼付
3. Run を実行

```sql
-- supabase/migrations/001_initial.sql の内容をコピー＆ペースト
```

#### オプションB: Supabase CLIから実行
```bash
npm install -g supabase
supabase link --project-ref [project-id]
supabase db push
```

### 2.5 認証設定
1. Supabase Dashboard > Authentication > Providers
2. Email/Password を "Enabled" に設定
3. Settings で以下を確認:
   - "Enable email confirmations" のON/OFF選択（開発環境ではOFFが便利）
   - "Allow self-signups" を有効

### 2.6 Realtime設定
1. Supabase Dashboard > Database > Publications
2. 以下が有効になっているか確認:
   - `supabase_realtime` publication
   - `attendees` table が含まれているか

## ステップ3: ローカルでの動作確認

### 3.1 開発サーバー起動
```bash
npm run dev
```

### 3.2 ブラウザで確認
1. http://localhost:3000 を開く
2. ログイン画面が表示されることを確認

### 3.3 テストアカウント作成
1. "サインアップ" をクリック
2. メールアドレスとパスワードを入力
3. アカウント作成

### 3.4 基本動作テスト

#### 式典作成テスト
1. ホーム画面で「新しい式典を登録」フォームに入力
2. "式典を作成" をクリック
3. 作成された式典が一覧に表示されることを確認

#### 参列登録テスト
1. 作成した式典の「参列登録へ」をクリック
2. 氏名、郵便番号（例: 100-0001）を入力
3. "参列登録を完了" をクリック
4. 完了画面でQRコードが表示されることを確認

#### 受付スタッフ機能テスト
1. ホーム画面で式典の「受付」をクリック
2. 各タブ（スマート受付、代行入力、参列者一覧）が正常に動作することを確認

#### ダッシュボードテスト
1. ホーム画面で式典の「ダッシュボード」をクリック
2. 統計情報が正しく表示されることを確認
3. CSVエクスポート機能をテスト

## ステップ4: 本番デプロイ

### 4.1 ビルド確認
```bash
npm run build
npm start
```

### 4.2 Vercelへのデプロイ

#### オプションA: GitHubとの連携（推奨）
1. コードをGitHubにプッシュ
2. https://vercel.com/new にアクセス
3. GitHubリポジトリをインポート
4. 環境変数を設定:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. "Deploy" をクリック

#### オプションB: Vercel CLIから
```bash
npm install -g vercel
vercel login
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel
```

### 4.3 本番環境での確認
1. Vercelが提供するURLにアクセス
2. ログイン、式典作成、参列登録などの動作確認
3. HTTPS接続されていることを確認

### 4.4 Supabase本番設定
1. Supabase Dashboard > Project Settings > Security
2. 以下を確認:
   - JWT Secret は安全か
   - API キーのアクセス権限は適切か
   - データベースバックアップは有効か

## セキュリティチェックリスト

デプロイ前に以下を確認してください:

- [ ] 本番環境での `.env.local` に本番キーを設定
- [ ] Supabase RLSポリシーが有効（デフォルトで有効）
- [ ] JWTトークンの有効期限を設定（推奨: 1時間）
- [ ] 定期的なバックアップが設定されている
- [ ] API キーの権限は最小限に制限
- [ ] CORS設定が本番ドメインに限定されている
- [ ] 郵便番号入力値のバリデーション実装済み
- [ ] XSS対策: Next.js の自動エスケープを使用
- [ ] CSRF対策: SameSite Cookie設定済み

## トラブルシューティング

### エラー: "Invalid API Key"
**原因**: NEXT_PUBLIC_SUPABASE_KEY が誤っている
**解決**: Supabase Dashboard > Settings > API で正しいキーをコピー

### エラー: "Connection refused"
**原因**: Supabaseプロジェクトが正しく作成されていない
**解決**: Supabase Dashboard でプロジェクトが "Active" 状態か確認

### Zipcode API が動作しない
**原因**: 郵便番号の形式が正しくない
**解決**: `XXX-XXXX` または `XXXXXXX` 形式で入力

### データベースマイグレーション失敗
**原因**: SQLの構文エラー
**解決**:
1. Supabase Dashboard > SQL Editor で手動実行
2. エラーメッセージを確認

### QRコードスキャンできない
**原因**: ブラウザのカメラ許可が下りていない
**解決**: ブラウザ設定でカメラアクセスを許可

## パフォーマンス最適化

### データベースインデックス
```sql
-- 既に実装済み:
CREATE INDEX idx_ceremonies_mourner_user_id ON ceremonies(mourner_user_id);
CREATE INDEX idx_attendees_ceremony_id ON attendees(ceremony_id);
CREATE INDEX idx_attendees_checked_in ON attendees(checked_in);
```

### ページ遅延ロード
Next.js の dynamic import を使用（コンポーネントに実装済み）

### 画像最適化
本番環境では以下を推奨:
- WebP形式での配信
- 適切なリサイズ

## ログとモニタリング

### Supabase ログビューアー
Supabase Dashboard > Logs で以下を確認:
- API呼び出しの成功/失敗
- データベースエラー
- 認証エラー

### アプリケーションログ
ブラウザの開発者ツール (F12) > Console で確認:
```javascript
// デバッグモード有効化
localStorage.setItem('debug', 'true');
```

## メンテナンスタスク

### 定期実行（毎日）
- [ ] ログの確認
- [ ] エラーレートの確認

### 定期実行（毎週）
- [ ] データベースバックアップの確認
- [ ] ユーザーアクティビティの確認

### 定期実行（毎月）
- [ ] セキュリティアップデートの確認
- [ ] 依存関係のアップデート: `npm update`

## サポート

### 公式ドキュメント
- [Next.js ドキュメント](https://nextjs.org/docs)
- [Supabase ドキュメント](https://supabase.com/docs)

### コミュニティ
- GitHub Issues: このリポジトリの Issues
- Supabase Community: https://discord.supabase.com

## よくある質問 (FAQ)

### Q: 郵便番号検索が遅い
**A**: Zipcloud API は外部APIのため、ネットワーク遅延が発生します。タイムアウト処理を2-3秒に設定してください。

### Q: ユーザー数が増えたらどうする？
**A**: Supabase の有料プランへのアップグレードを検討してください。

### Q: データのバックアップ方法は？
**A**: Supabase Dashboard > Database > Backups から自動バックアップを有効化してください。

### Q: モバイルアプリ化したい
**A**: React Native または Flutter での実装を検討してください。バックエンドは同じSupabaseを使用可能です。

## ライセンスと利用条件

このプロジェクトは Proprietary です。
詳細は LICENSE ファイルを参照してください。
