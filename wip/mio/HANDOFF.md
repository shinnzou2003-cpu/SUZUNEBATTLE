# MIO-07 追加 — 引き継ぎメモ (2026-10-02)

## キャラ設定（SZOU指定）
- 名前: MIO-07（ミオ・ゼロセブン）／Android Painter・World Creator／IF TOKYO 2099／口癖「一緒に描こっ！」
- 参照: refs/mio_sheet.jpg（三面図・ヘッドユニット猫耳ヘッドホン「07」・バックパックのペイントカプセル青/ピンク/金・浮遊ドローン）
- カラー: WHITE #FFFFFF / GOLD #DAAF37 / DARK #262E34 / SKY BLUE #9ACFFF / PINK #FF688A
- 戦い方: **青い巨大な筆（メインウェポン「希望筆」約175cm）と絵具**で戦う近〜中距離
  - 通常: 筆の薙ぎ払い3段（青/ピンクの絵具の弧が残る）
  - b: 絵具弾を飛ばす（着弾で飛沫）
  - EX: 地面に大きく塗った絵具の帯を走らせる等
- **超必殺技(ULT): ブルーの大型犬を召喚して攻撃**（絵具から描き出された青い大型犬が突進・噛みつき）
  → SAKURAのドラゴン(dFly/dBreath + updateDragon)と同じ作りで、犬を別スプライトに
- 身長: 他キャラと同程度（SAKURAは最終 CHAR_SCALE 1.33。立ち姿の見た目の高さをSAKURA/SUZUNEに合わせる）

## 素材ルール（SZOUの方針）
- 動画は Topview MCP、**480p・16:9**、ファイル数最小（**30秒動画にまとめる**: ①MIO全モーション ②犬 ③演出[選択イントロ/決定/ULTムービー/勝利ムービー]）
- セリフは ElevenLabs（eleven_v4・1パターン・**18本を1本に繋げて生成**→分割）。「SZOU」は「エスゾウ」と書く
  割当: a0[01,03] a1[02] a2[04] b[05] jump[06] guard[07] hit[08] hitBig[09] getup[10] ko[11] ex[12] ult[13] select[14] round[15] winMovie[16] win[17] lose[18] → media/voice/mi_01..18.mp3
- クラウドセッションはTopview/ElevenLabsのファイル転送が遮断されるので、生成と取り込みはPC(ローカル)で

## SAKURAで分かった注意点
- グリーンバック動画に**発光・オーラ・ブレスなどの光エフェクトを入れない**こと。光が緑と混ざり、キーイング後にカーキ/オリーブの不透明なもやが残る（SAKURAのdBreath/ultFireで発生→後から修正した）。光はゲーム側のコード演出で足す。
  プロンプトに「no glow, no light effects, no paint splashes floating in the air, no particles, solid character only」と明記。絵具の飛沫もコード側(fx)で描く。
- キャラは固定カメラ・真横〜3/4・足が常にフレーム内・同じスケールで。
- 交代ジャンプ(tagin)・倒れたまま残る(benched)・2人分HPバーは実装済み。新キャラは pickFrame の jump フレームがあれば自動で対応。
- 選択画面カード・ex/winムービー・ステージ動画・ラウンド勝利カットイン・タイトル顔パネルもSAKURAと同様に追加（index.html / game.js の sakura 箇所が雛形）。
