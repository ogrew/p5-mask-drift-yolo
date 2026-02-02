# mask-drift-yolo

https://ogrew.github.io/p5-mask-drift-yolo/

## Deploy (gh-pages)

### 最小手順（推奨）
```bash
npm run build
npx gh-pages -d dist -b gh-pages -m "Deploy"
```

### うまくいかない場合（原因と対処）
- `rejected (fetch first)` が出る  
  → **リモートの gh-pages が先に進んでいる**状態です。  
  基本はもう一度同じコマンドでOKですが、確実に更新したい場合は強制上書きします。  
  ```bash
  npx gh-pages -d dist -b gh-pages -m "Deploy" -f
  ```
  ※ `-f` は履歴を強制上書きするので、他の更新と競合しても手元の `dist` を反映できます。

### なぜ以前は手順が回りくどく見えたか
- 直前に `gh-pages` が更新されていたため **fast-forward できず push が拒否**されました。
- このリポジトリでは `gh-pages` は **ビルド成果物専用ブランチ**なので、  
  衝突解消よりも **最新 `dist` を上書き**するほうが安全で分かりやすいです。
