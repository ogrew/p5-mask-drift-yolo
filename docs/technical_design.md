# 技術詳細設計書 — mask-drift-yolo（仮）

作成日: 2026-01-24  
版: v0.1（レビュー用）

---

## 0. 前提と方針

- **静止画のみ**。RUNで一連処理を開始し、完了まで待つ設計。
- **STOPで中断可能**（=処理中でもUIが固まらないことが前提）。
- セグメンテーションは **YOLO Seg（ONNX Runtime Web）**。
- マスク生成は **instance mask の union**（選択クラスのみ OR 合成）。
- モザイク色は **下地画像の平均RGB** を使用。
- 描画は **Flow Field によるアニメーション描画**。完成まで時間がかかってOK。
- 公開は **GitHub Pages**（静的配信）。パス解決（base）を最初から意識する。

---

## 1. 全体アーキテクチャ

### 1.1 モジュール分割

**UI / 描画（Main thread）**
- Tweakpane（RUN_UI / PARAMS_UI）
- p5.js Canvas 表示
- 実行状態管理（IDLE / RUNNING / STOPPED / DONE / ERROR）
- Worker起動・停止、進捗表示、描画データ受信
- MosaicCell保持（後述の上限チェックあり）

**重い処理（Web Worker）**
- 画像前処理（縮小・ImageData化）
- ONNX Runtime Web + YOLO Seg のロード＆推論
- instance masks → unionマスク生成（選択クラスのみ）
- グリッド分割、セル単位の被覆率・平均RGB計算
- チャンク単位で結果をMainへ送る（逐次描画用）

> 重要：STOPを「ちゃんと効かせる」ために、推論・大規模配列処理は **Worker前提**。  
> Main threadが固まるとSTOPできないため、要件と矛盾する。

### 1.2 データフロー（概略）

```
[Main: UI] RUN
  -> lock PARAMS_UI
  -> create Worker + send {image, params}

[Worker]
  -> STATUS: loading image
  -> preprocess (resize <= 2560)
  -> STATUS: segmenting
  -> segment(image) => instance masks + class ids
  -> unionMask (selected classes, OR)
  -> STATUS: building cells
  -> for each cell chunk:
       compute coverage + average RGB
       postMessage(chunk)
  -> STATUS: done

[Main: p5]
  -> receive chunk -> create MosaicCell particles -> enqueue
  -> animate particles via Flow Field, paint to buffer
  -> STOP => terminate worker + stop drawing + unlock PARAMS_UI
```

---

## 2. UI設計（Tweakpane）

### 2.1 パネル分割

- **RUN_UI**
  - RUN（開始）
  - STOP（中断）
  - STATUS表示エリア（例：「推論中…」「レンダリング中…」）
- **PARAMS_UI**
  - A.入力 / B.セグメンテーション / C.レンダリング の各パラメータ

### 2.2 UIのロック方針

- RUN押下後は **PARAMS_UIを操作不可**にする
  - Tweakpaneにdisableが無い/弱い場合は、透明overlayで `pointer-events:none` にする
- STOPまたは完了で **PARAMS_UIを再度操作可能**に戻す

### 2.3 状態機械（Main側）

- `IDLE`
- `RUNNING`（内部ステージ：LOADING / SEGMENTING / BUILDING / RENDERING）
- `STOPPED`
- `DONE`
- `ERROR`

補助：`runToken`（連番）をMainで持ち、古いWorkerメッセージを無視可能にする（STOP後の迷子データ対策）。

---

## 3. Worker側パイプライン詳細

### 3.1 入力受け取り

Workerが受け取るデータ（例）:

- `image`: ImageBitmap（推奨：transferable）
- `params`:
  - `maxLongEdge = 2560`
  - `cellSizePx`
  - `tileShape` / `tileAlpha`
  - `moveFrames` / `maxSpeed`
  - `flowFreq` / `flowTwist` / `flowZSpeed` / `force`
  - `snapToGrid` / `wrapEdges`
  - `coverageThreshold = 0.2`
  - `selectedClassIndices: number[]`（COCO class ids）
  - `cellsChunkSize`（例：5000セル単位でpostMessage）
  - `samplesPerCell`（例：4 → 4x4=16点サンプリング）

### 3.2 画像前処理（縮小 + ピクセル参照用）

- 入力画像の長辺が2560pxを超える場合、処理用に縮小する。
- Worker内で `OffscreenCanvas` に描画し `ImageData` を取得。
- 以後のグリッド基準は処理用画像サイズ（`renderW x renderH`）。

### 3.3 セグメンテーション推論（YOLO Seg / ONNX Runtime Web）

- Workerで **ONNX Runtime Web** をロードし、YOLO Seg モデルを初期化。
- 推論入力は OffscreenCanvas（またはImageData）を使う。
- 出力は **クラスID + インスタンスマスク**（COCO前提）。

中断：STOPはWorkerを `terminate()` する想定。推論途中でも止まる（固まらないのが最優先）。

### 3.4 unionマスク生成（選択クラスのインスタンスをOR合成）

- `selectedClassIndices` に対応する **instance masks** を選別し、
  画素ごとに **OR（0/1）** を取って unionMask を作る。
- unionMaskは `Float32Array` を推奨（0..1）。

### 3.5 マスク解像度と画像解像度のズレ（座標マッピング）

- 画像サイズ：`renderW x renderH`
- マスクサイズ：`maskW x maskH`（一致しない可能性あり）

変換：
- `mx = floor(x / renderW * maskW)`
- `my = floor(y / renderH * maskH)`

セル内サンプリングで、画像は `ImageData`、マスクは unionMask をこの変換で参照する。

---

## 4. セル生成アルゴリズム（Worker）

### 4.1 グリッド分割

- `cols = floor(renderW / cellSizePx)`
- `rows = floor(renderH / cellSizePx)`
- `totalCells = cols * rows`

### 4.2 “保持できるセル数”の上限チェック（重要）

セルサイズが小さすぎると、MosaicCellインスタンス数が爆発してメモリで死ぬ。  
今回の方針として **MosaicCellは全件保持してOK**（ユーザー前提：cellSize 5〜10pxが中心で、想定は数万程度）だが、念のため上限を設ける。

- 定数：`MAX_CELLS`（例：200,000〜300,000から開始）
- `totalCells > MAX_CELLS` の場合は **処理を中断（ERROR）**し、画面に次のようなメッセージを出す：
  - 「解析の結果、セル数が上限を超えました。セルサイズを大きくするか、Segmentation検知対象クラスを減らしてください。」

> ここは“安全装置”。本番でのクラッシュ回避が目的。  
> なお「対象セルだけ保持」も可能だが、今回は要件上必須ではない。

### 4.3 セル内の被覆率（coverage）計算

- セル内を `samplesPerCell x samplesPerCell` でサンプリング（例：4x4=16点）
- 各サンプル点で unionMask を参照し、平均α（または α>0 の割合）を計算
- `coverage >= 0.2` を対象セルとする（閾値は定数）

### 4.4 明度（luminance）計算

- 同じサンプル点で `ImageData` からRGBを読み、輝度 `Y` を計算して平均
  - `Y = 0.2126R + 0.7152G + 0.0722B`（0..255）

### 4.5 文字選択（明度 → charSet）

- `t = Y / 255`（0=暗い、1=明るい）
- `idx = floor((1 - t) * (len-1))`
  - 暗いほど idx が大きく（濃い文字側）なる
- charSetの入力順序は「薄い→濃い」として解釈（ユーザー責任で順序を決める）

### 4.6 チャンク送信（逐次描画用）

- セル情報を `cellsChunkSize`（例：5000件）ごとにMainへ送る
- 送るデータは軽量構造体（後述）にし、MainでMosaicCell化する

送信例（概念）:
- `{type:'cells', payload:{cells:[...], progress:{done,total}}}`
- `{type:'status', payload:{stage:'SEGMENTING', text:'推論中…'}}`

---

## 5. Main側描画（p5.js）

### 5.1 MosaicCellの保持方針

- 今回は **MosaicCellを全件保持**する（前提：セルサイズ5〜10px中心 → 多くて数万規模を想定）。
- ただし安全装置として `MAX_CELLS` を超えたらエラーで止める（4.2）。

保持する理由（メリット）:
- 後々の演出追加（フェード、揺らぎ、再描画）に対応しやすい
- 中間状態の管理が簡単

想定するMosaicCellの最小フィールド:
- `x, y`（セル中心座標）
- `char`（決定済み1文字）
- `active`（対象セルかどうか）
- （任意）`luma`, `coverage`（デバッグや演出用）

### 5.2 描画方式

- RUN開始時にCanvasをクリア
- p5は `loop()` で回し、毎フレーム `cellsPerFrame` 件だけ描画
- 受信したチャンクをキューに積み、キューから取り出してMosaicCell化→描画対象に追加

**描画完了判定**
- Workerから `done` を受け取る
- かつ Main側のキューが空になり、全セル描画が完了したら DONE

### 5.3 STOP時の挙動

- Workerを `terminate()`
- キューを破棄
- `loop()` 停止（`noLoop()`）
- PARAMS_UIをアンロック
- STATUS=中断

---

## 6. モデル／ラベルの扱い（重要）

### 6.1 ラベル一覧の取得

理想：モデルからラベル一覧を取得してUIへ反映。  
現実：多くのONNXモデルはlabel mapを同梱しないため、**固定ラベル配列の同梱**が必須。

初期実装の安全策：
- YOLO Seg（COCO）については **COCOラベル配列（固定順）**を同梱する（例：`coco_labels.json`）。
- UIのチェックボックス生成はこの固定配列を使う。
- 選択クラスindexは、この配列のindexに従う。

> ここを曖昧にすると「UIは出たがマスクがズレる」という最悪のデバッグ地獄になる。  
> 初期は固定で割り切るのが最短。

### 6.2 デバッグ表示（推奨）

開発段階で、次の簡易表示を入れると事故率が下がる：
- unionマスクのオーバーレイ表示（ON/OFF）
- 単一クラスだけ選択して妥当性確認できる

※必須ではないが、ラベル順や閾値検証が一発でできる保険。

---

## 7. エラーハンドリング／STATUS設計

### 7.1 典型エラーと表示

- 文字候補が空 → RUN不可（エラー表示）
- クラス未選択 → RUN不可（エラー表示）
- セル数が `MAX_CELLS` 超過 → ERROR（「セルサイズを大きく…」）
- 推論初期化失敗（モデル/wasmパス） → ERROR（ログはconsoleへ）

### 7.2 STATUS（例）

- 待機中
- 画像読み込み中…
- 推論中…
- セル生成中…（xx%）
- 描画中…（xx%）
- 完了
- 中断
- エラー: ...

---

## 8. ファイル構成（提案）

```
public/
  models/
    yolo_seg.onnx
    coco_labels.json
  samples/
    sample_01.jpg
    sample_02.jpg
  wasm/                         # onnxruntime-web の wasm (or webgpu) 一式

src/
  main.js                       # 起動、pane生成、状態管理、worker制御
  ui/
    panes.js                    # RUN_UI / PARAMS_UI 作成、disable/enable
    status.js
  render/
    sketch.js                   # p5 初期化と描画キュー処理
    mosaic_cell.js              # MosaicCell クラス
  worker/
    pipeline.worker.js          # 画像前処理→推論→セル生成→チャンク送信
  shared/
    constants.js                # coverage=0.2, MAX_CELLS, defaults
    voc_labels.js               # labels json のローダ
```

---

## 9. 実装順序（推奨）

1. p5 canvas + RUN/STOP + STATUS（ダミーで逐次描画だけ通す）
2. Worker導入（チャンク送信→Main描画）
3. 画像読み込み（Sample/Upload）→ Workerへ送る
4. Worker側で縮小+平均RGBベースのセル生成（セグメンテーション無し）を完成させる
5. YOLO Seg + ONNX Runtime Web導入（推論が動くところまで）
6. instance masks → unionMask → coverage判定
7. 複数クラス選択UIを接続してunionが変わることを確認
8. （任意）マスクオーバーレイでデバッグ性を上げる

---

## 10. 未決定事項（早めに固める）

- ビルド方式（Vite等）と、GitHub Pages配下での `base` 設定
- ONNX Runtime Web の wasm / model の配置とURL解決
- `MAX_CELLS` 初期値（保守的に開始して調整）
- 逐次描画テンポ（cellsPerFrame, delay）と見た目の最適値
