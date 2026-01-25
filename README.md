# mask-drift-yolo

YOLO Seg (COCO) のセグメンテーション結果を使って、対象領域だけを **Flow Field で流れるモザイク表現**として描画するWebアプリです。

## できること
- サンプル画像 / アップロード画像の読み込み
- クラス選択によるマスク生成（union）
- モザイクタイル（Rect/Circle）を流すアニメーション描画
- `S` キーで現在のキャンバスを JPG 保存（`<basename>_<unixtime>.jpg`）

## できないこと
- 動画入力
- インスタンス分離（個別の個体選択）
- サーバ側推論

## 使い方
1. 画像を選択（Sample / Upload）
2. クラスを選択
3. RUN
4. `S` キーで保存（JPG）

## 開発メモ
- 仕様: `docs/requirements.md`
- 技術設計: `docs/technical_design.md`
- タスク: `docs/tasks.md`
