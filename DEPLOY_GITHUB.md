# GitHub へのアップロード手順（yui-reception）

このファイルは、ローカルのコードを GitHub リポジトリ
`git@github.com:oginoshoten/yui.git` に初めて push するための手順書です。

**所要時間の目安: 5分**

---

## 事前確認（30秒）

以下がすべて揃っていることを確認してください:

- [ ] GitHub アカウント `oginoshoten` にログイン済み
- [ ] GitHub 上にリポジトリ `yui`（Private）が作成済み
- [ ] このフォルダ（`yui-app`）が GitHub リポジトリの中身として正しい
- [ ] `.env.local` がこのフォルダに存在する（これは **絶対に GitHub にあげてはいけない** ファイルで、`.gitignore` で除外済み）

---

## ステップ 1: 壊れた `.git` フォルダと一時ファイルを削除

自動化を試みた際に中途半端に作られた `.git/` と `test-xxx.txt` が残っています。
まず、これらを削除してください。

### PowerShell の場合

```powershell
cd C:\path\to\yui-app
Remove-Item -Recurse -Force .git
Remove-Item -Force test-xxx.txt
```

### コマンドプロンプト（cmd.exe）の場合

```cmd
cd C:\path\to\yui-app
rmdir /s /q .git
del test-xxx.txt
```

> **補足**: `C:\path\to\yui-app` は実際のパスに置き換えてください。Windows エクスプローラーで yui-app を開いて、アドレスバーのパスをコピーすると楽です。

---

## ステップ 2: Git リポジトリを初期化して最初の commit を作る

以下のコマンドをコピペしてください（PowerShell / cmd 共通）:

```bash
git init -b main
git config user.email "hiromasa0877@gmail.com"
git config user.name "oginoshoten"
```

> `git config` はこのリポジトリ内だけに適用されます（`--global` じゃないので他の repo には影響しません）。

---

## ステップ 3: `.gitignore` が効いていることを確認（重要）

**`.env.local` が commit 対象に入っていないかを必ず確認**してください。

```bash
git status
```

の出力に、以下が**含まれていないこと**を確認:

- `.env.local`（Supabase の秘密鍵が入っている）
- `node_modules/`
- `.next/`
- `node.zip`
- `node-v20.18.0-win-x64/`

もし上記のどれかが表示されていたら、この時点で push せず、`.gitignore` の中身を確認してください。

---

## ステップ 4: ステージング & 初回 commit

```bash
git add .
git commit -m "Initial commit: yui-reception funeral reception DX service"
```

`git add .` の後、念のためもう一度:

```bash
git status
```

で、ステージされたファイルに `.env.local` が **含まれていないこと** を確認してください。

---

## ステップ 5: リモートリポジトリを追加して push

```bash
git remote add origin git@github.com:oginoshoten/yui.git
git push -u origin main
```

### SSH 鍵の設定が済んでいない場合

SSH 鍵を GitHub に登録していない場合は、HTTPS を使って push できます:

```bash
git remote add origin https://github.com/oginoshoten/yui.git
git push -u origin main
```

HTTPS だと push 時にユーザー名とパスワード（Personal Access Token）を聞かれます。

- ユーザー名: `oginoshoten`
- パスワード: GitHub の **Personal Access Token**（通常のパスワードでは認証できません）

Personal Access Token の作成手順:
1. https://github.com/settings/tokens/new を開く
2. Note: `yui-reception push`
3. Expiration: 90 days（お好みで）
4. Select scopes: `repo` にチェック
5. Generate token → 表示されたトークンをコピー（一度しか表示されません）
6. `git push` のパスワード欄にそのトークンを貼り付け

---

## ステップ 6: GitHub で確認

ブラウザで https://github.com/oginoshoten/yui を開き、ファイルがアップロードされていることを確認。

**重要**: ファイル一覧の中に `.env.local` が **無いこと** を必ず目視確認してください。
もしあれば、即座にそのリポジトリを削除し、Supabase の anon key を再生成してください。

---

## ステップ 7（次回以降）: コードを更新したとき

普段は:

```bash
git add .
git commit -m "変更内容の説明"
git push
```

これだけで OK。Vercel に連携済みなら自動で再デプロイされます。

---

## 次のステップ: Vercel デプロイ

GitHub への push が成功したら、次は Vercel へのデプロイです。
別途案内しますので、push 成功の報告をお願いします！
