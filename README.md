# Mask-to-ASCII

MediaPipe Image Segmenter (DeepLab-v3/VOC) のセグメンテーション結果を使って、対象領域のみをASCIIアートとして描画するWebアプリです。

## できること（予定）
- サンプル画像 / アップロード画像の読み込み
- クラス選択によるマスク生成（union）
- 明度ベースのASCII描画（逐次描画）
- PNG保存

## できないこと（予定）
- 動画入力
- インスタンス分離
- サーバ側推論

## 使い方（予定）
1. 画像を選択（Sample / Upload）
2. クラスを選択
3. RUN
4. 出力を保存（PNG）

## 開発メモ
- 仕様: `docs/requirements.md`
- 技術設計: `docs/technical_design.md`
- タスク: `docs/tasks.md`
