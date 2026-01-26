# mask-drift-yolo

https://ogrew.github.io/mask2ascii/

## Deploy (gh-pages)

### 基本手順
```bash
npm run build
git fetch origin gh-pages
npx gh-pages -d dist -b gh-pages -m "Deploy"
```

### つまずきポイントと対処
- `rejected (fetch first)` が出る  
  → **リモートの gh-pages が先に進んでいる**状態です。  
  `git fetch origin gh-pages` を実行してから、もう一度 `npx gh-pages -d dist -b gh-pages -m "Deploy"` を実行してください。
- どうしても上書きで進めたい場合  
  → `npx gh-pages -d dist -b gh-pages -m "Deploy" -f`（履歴は強制上書きされます）
