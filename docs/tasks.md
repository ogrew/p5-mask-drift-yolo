# タスクリスト — mask-drift-yolo（仮）

作成日: 2026-01-24  
版: v0.1

---

## 0. 進め方（このタスクリストの使い方）
- 各タスクは「大項目 → 中項目 → 小項目」で分解する。
- **先に“動く骨格”を作ってから**、推論・マスク・モザイク品質を順に上げる。
- STOPが効くこと（=UIが固まらないこと）を常に優先し、重い処理はWorkerに寄せる。

---

## 1. プロジェクト土台（開発環境・ビルド・配布）

### 1.1 リポジトリ初期化
- [ ] リポジトリ作成（GitHub）
  - [ ] READMEに概要（目的/デモ/使い方）を仮置き
  - [ ] LICENSE（MIT等）を設定
- [ ] `.gitignore` 整備（node, dist, .DS_Storeなど）

### 1.2 ビルド方式の決定（Vite等）
- [ ] ビルドツールを選定して初期化（推奨: Vite）
  - [ ] `src/` と `public/` の基本構成を作る
  - [ ] Workerの取り扱い方法を確定（Vite worker import等）
- [ ] GitHub Pages配下を前提に `base` 設定を入れる
  - [ ] ルート配信ではなく `/<repo>/` 配下でも asset/wasm/model が解決できることを確認

### 1.3 静的アセット配置（モデル/wasm/サンプル画像）
- [ ] `public/models/` を用意
  - [ ] `yolo_seg.onnx` を配置
  - [ ] `coco_labels.json` を配置（固定ラベル順のため）
- [ ] `public/samples/` を用意
  - [ ] サンプル画像を複数枚配置（2〜5枚で良い）
- [ ] `public/wasm/`（またはビルドツール推奨配置）を用意
  - [ ] onnxruntime-web の wasm / webgpu 関連ファイルを配置/参照できるようにする
  - [ ] パスがGitHub Pagesでも解決できるようにする

### 1.4 GitHub Pages デプロイ
- [ ] GitHub ActionsでPagesデプロイを構築
  - [ ] `npm ci` → `npm run build` → `dist` をPagesへ
  - [ ] PR/Push時のビルド確認（最低限push時）
- [ ] 公開URLで最低限のページが表示されることを確認（空ページでもOK）

---

## 2. UI骨格（Tweakpane + 状態管理 + p5 Canvas）

### 2.1 画面レイアウトの骨格
- [ ] `index.html` に最低限のレイアウトを作る
  - [ ] RUN_UI領域
  - [ ] PARAMS_UI領域
  - [ ] p5 Canvas領域

### 2.2 状態管理（Main）
- [ ] 状態定義（IDLE/RUNNING/STOPPED/DONE/ERROR）を作る
  - [ ] 内部ステージ（LOADING/SEGMENTING/BUILDING/RENDERING）も定義
- [ ] `runToken` 仕組みを入れる（古いWorkerからのメッセージ無視）

### 2.3 RUN_UI（RUN/STOP/STATUS）
- [ ] TweakpaneでRUN_UIを作成
  - [ ] RUNボタン
  - [ ] STOPボタン
  - [ ] STATUS表示（文字列）
- [ ] RUN/STOPの有効/無効切り替え
  - [ ] IDLE: RUN enabled, STOP disabled
  - [ ] RUNNING: RUN disabled, STOP enabled
  - [ ] DONE/STOPPED/ERROR: RUN enabled, STOP disabled

### 2.4 PARAMS_UI（入力/推論/レンダリング）
- [ ] TweakpaneでPARAMS_UIを作成
  - [ ] A.入力
    - [ ] Image Source: Sample / Upload
    - [ ] Sample選択: サンプル画像ドロップダウン
    - [ ] Upload選択: ファイル選択ボタン（隠しinput type=file）
  - [ ] B.セグメンテーション
    - [ ] Detect Classes（チェックボックス群）用のUI枠を用意（初期はダミーでも可）
  - [ ] C.レンダリング
    - [ ] Grid size（cellSizePx）スライダー
    - [ ] Characters（charSet）テキスト入力
    - [ ] 逐次描画テンポ（cellsPerFrameなど）※UIに出すか内部定数か決める
- [ ] PARAMS_UIのロック/アンロック
  - [ ] RUN開始でPARAMS_UI操作不可（disable or overlay）
  - [ ] STOP/完了/エラーで操作可能に戻す

### 2.5 p5.js Canvasの初期表示
- [ ] p5 sketchの最小実装
  - [ ] Canvas生成
  - [ ] 画面クリア
  - [ ] “待機中”のダミー描画（任意）

---

## 3. Worker通信の骨格（STOPが効く経路を先に完成）

### 3.1 Worker起動・停止（Main）
- [ ] RUNでWorkerを生成してメッセージ送信できるようにする
  - [ ] Workerへ `start` メッセージ（ダミー画像なしでも良い）
- [ ] STOPでWorkerを `terminate()` できるようにする
  - [ ] STOP時に描画キューを破棄できるようにする
  - [ ] STOP後、STATUS=中断、PARAMS_UIをアンロック

### 3.2 WorkerからMainへのステータス通知
- [ ] Workerが `status` メッセージを送れるようにする（ダミーで良い）
  - [ ] MainがSTATUS表示を更新できる

### 3.3 Worker→Mainのチャンク描画（ダミー）
- [ ] Workerが `cells`（ダミー）をチャンク送信
- [ ] Mainが受信して描画キューに積み、p5が逐次描画できる
  - [ ] `cellsPerFrame` に従って描画量を制御

> ここまでで「RUN→描画が進む→STOPが効く」骨格が完成。  
> 推論導入前に、アニメーション/逐次描画の気持ちよさと中断耐性を確立する。

---

## 4. 画像入力（Sample / Upload）をWorkerへ渡す

### 4.1 サンプル画像ロード（Main）
- [ ] サンプル画像の一覧を定義（ファイル名配列など）
- [ ] サンプル一覧は `src/shared/samples.js` に固定リストで管理（追加時は追記）
- [ ] Sample選択時、画像をロードしてプレビュー表示（任意）
- [ ] RUN時に選択サンプル画像を `ImageBitmap` にしてWorkerへ渡す（transferable）

### 4.2 アップロード画像ロード（Main）
- [ ] Upload選択時、ローカルファイル選択を実装
- [ ] 選択画像を `ImageBitmap` にして保持
- [ ] RUN時に選択画像をWorkerへ渡す（transferable）

### 4.3 画像サイズ制限（長辺2560）
- [ ] サイズ制限の適用方針を確定（Worker側で縮小が基本）
- [ ] 想定外（極端に巨大）な画像でのメモリ事故を避けるチェックを入れる（任意）

---

## 5. モザイクレンダリング（セグメンテーション無しで完成形に寄せる）

### 5.1 Worker側：画像前処理
- [ ] WorkerでOffscreenCanvas + ImageData取得
  - [ ] 長辺2560に縮小して ImageData を作る
  - [ ] `renderW/renderH` を確定

### 5.2 Worker側：グリッド分割＆セル計算（明度のみ）
- [ ] `cellSizePx` で cols/rows を計算
- [ ] セル内サンプリング（例：4x4=16点）で平均明度 `Y` を計算
- [ ] `Y` → `charSet` で文字選択
- [ ] チャンク送信（cellsChunkSizeごと）
  - [ ] 送信データは軽量（x,y,char 等）

### 5.3 Main側：MosaicCell化＆逐次描画
- [ ] `MosaicCell` クラス実装
  - [ ] フィールド：x, y, char, active（当面active=true）
  - [ ] `draw(p5)` メソッド（任意）
- [ ] 受信セルをMosaicCell化して保持＋描画
- [ ] 逐次描画テンポ（cellsPerFrame）の反映
- [ ] 完了判定（Worker done + キュー空）

### 5.4 エラー条件（セル数上限）
- [ ] `MAX_CELLS` 定数を導入
  - [ ] `totalCells > MAX_CELLS` の場合、WorkerがERRORを返す
  - [ ] MainがエラーメッセージをSTATUSに表示して停止

---

## 6. セグメンテーション導入（YOLO Seg / ONNX Runtime Web）

### 6.1 ONNX Runtime Web 依存導入と初期化
- [ ] onnxruntime-web の導入（ビルド方式に合わせる）
- [ ] wasm/asset/モデル参照パスの確定（GitHub Pagesでも動く）
- [ ] Worker内でYOLO Seg推論器初期化（onnx session）

### 6.2 COCOラベル固定の実装（順序の事故回避）
- [ ] `coco_labels.json` を読み込んでラベル配列を確定
- [ ] Main側：この配列からチェックボックス群を生成
  - [ ] 背景はUIから除外
- [ ] Main→Workerへ `selectedClassIndices` を渡す

### 6.3 推論実行（Worker）
- [ ] 画像（OffscreenCanvas等）を入力して推論
- [ ] **インスタンスマスク + クラスID** を取得できることを確認
- [ ] 推論中のSTATUS更新（推論開始/終了）

### 6.4 unionマスク生成（instance masks方式）
- [ ] 選択クラスの instance masks を OR 合成して unionMask を作る
- [ ] unionMaskの型と参照方法を確定（Float32Array推奨）

### 6.5 マスク解像度差の座標マッピング
- [ ] `maskW/maskH` と `renderW/renderH` の比でサンプリング座標を変換
- [ ] テスト用に “マスクが粗い” ケースでも破綻しないことを確認

---

## 7. マスク×モザイク（coverage閾値0.2）

### 7.1 被覆率（coverage）計算の実装
- [ ] セル内サンプリングで unionMask の平均α or on率を計算
- [ ] `coverageThreshold = 0.2` を適用
  - [ ] `coverage < threshold` のセルは `active=false`（背景扱い）
  - [ ] `coverage >= threshold` のセルは `active=true`（モザイク描画対象）

### 7.2 モザイク色決定（平均RGB）
- [ ] `active=true` セルのみタイルを描く

### 7.3 “複数クラス選択”の検証
- [ ] dog + chair + bus などで union が期待通り効くことを確認
- [ ] クラス未選択時はRUN不可（UIまたはWorker側でガード）

---

## 8. 逐次描画（演出＋負荷分散）を仕上げる

### 8.1 逐次描画の見た目調整
- [ ] デフォルト `cellsPerFrame` を決める
- [ ] チャンクサイズ `cellsChunkSize` を決める
- [ ] 描画順（scanline）を揃える
  - [ ] Workerが生成する順序と、Mainが描く順序を一致させる

### 8.2 STOPの体感改善
- [ ] STOP押下時に「中断中…」→「中断」へ遷移する表示
- [ ] STOP後、描画キューが即座に空になる（残描画しない）
- [ ] STOP直後にRUNできる（状態リセットが正しい）

### 8.3 STATUSの粒度改善
- [ ] セル生成進捗（xx%）を表示
- [ ] 描画進捗（xx%）を表示（任意）

---

## 9. 出力（JPGダウンロード）

### 9.1 Canvas→JPG保存
- [ ] `S` キーでキャンバスをJPG保存できるようにする
- [ ] 保存名を `<basename>_<unixtime>.jpg` にする

### 9.2 ファイル名規則（最低限）
- [ ] `<basename>_<unixtime>.jpg` 等の簡易ルールを決める（任意）

---

## 10. 例外・品質・保険（タスク漏れ防止のための必須チェック）

### 10.1 入力バリデーション（Main）
- [ ] 画像が選ばれていない場合、RUN不可
- [ ] charSetが空の場合、RUN不可 or デフォルトへ
- [ ] クラスが未選択の場合、RUN不可
- [ ] cellSizeが小さすぎて `MAX_CELLS` 超過しそうな場合の事前警告（任意）

### 10.2 エラーメッセージ整備
- [ ] STATUSにエラー理由を出す（ユーザーが次の行動を取れる文章）
  - [ ] セル数上限超過
  - [ ] 推論初期化失敗（パス）
  - [ ] 推論失敗（例外）

### 10.3 デバッグ機能（推奨）
- [ ] unionマスクをオーバーレイ表示するデバッグモード（ON/OFF）
  - [ ] 初期は隠しフラグでもよい
- [ ] 単一クラス選択時のマスク確認手順をREADMEに記載（任意）

---

## 11. ドキュメント整備

### 11.1 README（使い方）
- [ ] 目的/できること/できないこと
- [ ] 使い方（Sample/Upload→クラス選択→RUN→保存）
- [ ] 推奨文字セット例（薄い→濃い）
- [ ] 制約（VOCクラス、個体分離なし、長辺2560、セル数上限）

### 11.2 仕様ドキュメントの同梱
- [ ] `requirements.md` と `technical_design.md` を `docs/` に配置（任意でも良いが推奨）
- [ ] 変更履歴（v0.1→）の運用方針を決める（任意）

---

## 12. 受け入れテスト（チェックリスト）

### 12.1 基本動作
- [ ] Sample画像でRUN→完了まで到達
- [ ] Upload画像でRUN→完了まで到達
- [ ] STOPが推論中/描画中いずれでも効く（UIが固まらない）

### 12.2 パラメータ反映
- [ ] クラス複数選択がunionとして反映される
- [ ] cellSize変更が反映される（STOP→変更→RUN）
- [ ] charSet変更が反映される（STOP→変更→RUN）

### 12.3 保存
- [ ] JPGダウンロードができる（内容がCanvas一致）

### 12.4 公開環境（GitHub Pages）
- [ ] 公開URLで wasm/model/assets が正しくロードされる
- [ ] ローカルと同じ操作でRUNが完走する

---

## 13. 仕上げ（任意の磨き込み）

### 13.1 見た目（UI）
- [ ] パネル配置の微調整（見やすさ優先）
- [ ] STATUSの見やすさ（改行/色/スピナー等）

### 13.2 演出
- [ ] 描画順の切替（scanline / random）
- [ ] 段階的に文字が“埋まる”演出（density ramp等）

---

## 特別: MosaicCell → CellParticle 方式へのアップデート（見積もり）

### S1. 仕様整理（約1h）
- [ ] CellParticle由来の挙動を採用する範囲を決める（flow/寿命/ラップ/形状/グリッドスナップ）
- [ ] UIで露出するパラメータと固定値を決める

### S2. データ構造・描画基盤（約2h）
- [ ] `MosaicCell` を `CellParticle` 相当の状態（vx/vy/age/fade 等）に拡張
- [ ] p5バッファに「軌跡を焼き付ける」モードを追加（毎フレーム clear しない）

### S3. Flow Field 実装（約3h）
- [ ] noiseベースの流れ場計算（cellSize/flowFreq/flowTwist）
- [ ] 粒子の加速度/速度制限/移動/ラップorデッド処理

### S4. 色・形状・スナップ（約2h）
- [ ] セルごとのRGBを保持し描画
- [ ] circle/rect 切替、snapToGrid 対応

### S5. UI・パラメータ接続（約2h）
- [ ] パラメータをPARAMS_UIへ追加（必要なもののみ）
- [ ] RUN/STOP に合わせて粒子群の生成/破棄を制御

### S6. 検証（約1h）
- [ ] 表示の破綻がないか、負荷が許容か、STOP挙動が破綻しないかを確認

> 合計目安: 11h（実装 9h + 仕様/検証 2h）
