# NOX × NIX（ノクス×ニクス）追加 — 設定とゲーム設計 (2026-10-07・案)

12人目のファイター枠。**2人1組のペアファイター**（ツインギター）。設定は SZOU 提供。
リファレンス：`refs/nox_sheet.jpg`（NOX — CYBER WITCH / 27）／`refs/nix_sheet.jpg`（NIX-09 ターンアラウンド）／`refs/jackoark_1.webp`・`refs/jackoark_2.webp`（カボチャ宇宙船 JACK-O' ARK）

## 原設定（要約）
- 2人組の宇宙ハロウィン・ユニット。カボチャ宇宙船で星から星へ渡り、ハロウィンの夜にだけ現れてライブをする「流しの魔女バンド」。テーマ曲『未来のハロウィン（FUTURE HALLOWEEN）』、合言葉「明日を盗もう」
- **NOX（ノクス）**：船長・作曲。銀白ショート、灰色の瞳、黒×紫縁の魔女帽、黒革ハイネックロングコート、両手は精密な機械義手。クールな皮肉屋、計画担当。口ぐせ（仮）「夜明けまでが、私たちの時間」。設定上はキーボード担当だが、**ゲームではツインギターの片割れとしてギターを持つ**（SZOU 指示）
- **NIX（ニクス）／NIX-09**：ギター／ボーカル。2029年東京の「記憶の運び屋」アンドロイド。紫×黒ウェーブヘア、琥珀×紫オッドアイ、頬にサイバーラインと「09」、紫の魔女帽にカボチャバッジ、黒×紫コルセット衣装、機械の肩と手。人懐っこい行動派。運んだ「誰かの記憶」を音に変えて鳴らす。口ぐせ（仮）「ねえ、今夜いちばん楽しいのはどこ？」
- **母艦 JACK-O' ARK（仮）**：全長約60m、黒い縦リブ装甲のカボチャ型。オレンジに光る窓（カボチャの顔）、トゲ付きヒレ、紫のプラズマ噴射。船内はライブホール。着陸すると野外ステージに変形。弱点：着陸が下手（だいたい墜落）
- 色：黒 #141414／銀白 #d8d8dc／紫 #8a3cff（発光 #b06bff）／オレンジ #ff8a1e（カボチャ・アンバー）
- 既出：『FUTURE HALLOWEEN』『PART II』（蒸気都市に墜落、SUZUNE と3人でハロウィン限定バンド）

## ゲーム設計（SZOU 指示：2人一組・ツインギター・ULT でカボチャ宇宙船を使って大ダメージ）
```js
noxnix: { id: 'noxnix', name: 'NOX×NIX', role: 'ツインギター・魔女バンド', c1: '#b06bff', c2: '#ff8a1e', rgb: '176,107,255', rgb2: '255,138,30',
          speed: 5.4, jump: -24.5, anchor: .5, hurtW: 220, hurtH: 285, exName: 'ツイン・リフ', ultName: 'ジャック・オー・アーク' }   // EN telop: JACK-O' ARK : FUTURE HALLOWEEN
```
- 見た目：2人が並んで1体として動く（1枚のスプライトに2人。前＝NIX、後ろ＝NOX）。横幅が広いので当たり判定も横長
- a1/a2/a3：NIX のギター振り抜き → NOX のギター突き → 2人同時のパワーコード（衝撃波で打ち上げ）。軌跡は紫×オレンジの音波弧
- b 記憶の音弾：NIX がギターをかき鳴らし、紫の音符弾（projectile `note`）を3発。通常攻撃で相殺可
- ex ツイン・リフ：背中合わせでツインギター → 前方に音の壁（音波リング）を連続5ヒット、最後で吹き飛ばし
- ult JACK-O' ARK ― 未来のハロウィン：ムービー（宇宙船の飛来・正面窓のステージ）→ 画面上空にカボチャ宇宙船が覆いかぶさるように出現 → 顔の窓（目・口）から紫×オレンジのライブ光線＋スピーカー音圧で多段 → **最後は船ごと相手の上に墜落**（弱点の「着陸下手」をフィニッシュに）＝ 全キャラ中トップクラスのダメージ。ガード可（削りのみ）
- ヒット演出：紫の音符＋オレンジのカボチャ火花（fxHalloween）
- ミラー時の色：紫→エメラルド、オレンジ→水色
- 勝利セリフ（仮）：NOX「夜明けまでが、私たちの時間」／NIX「ねえ、今夜いちばん楽しいのはどこ？」

## 実装メモ
- 1枠に2人（1枚のスプライトに NOX 左・NIX 右）。当たり判定は横長 hurtW 220。ダッシュあり
- ULT（NOXNIX_ULT）：ムービー → 宇宙船が相手の頭上へ降下 → 顎（ステージ窓）が開いてビーム 2×10ヒット → 墜落 22 ＝ 合計42（全キャラ最大級）。ガード時は削りのみ。宇宙船はキャンバス描画（drawJackOArk）。宇宙船が出ている間はカメラを CAM.zGiant まで引く
- 発動条件は他キャラと同じ（ゲージ100＋体力50%以下）
- 新しい fx `note`（♪♫が浮かぶ）、projectile `note`（b）／`riff`（EX の音の輪）
- タイトル画面のコラージュは12枚割りに変更（`.trio .p12` / `.s11`）

## 素材（2026-10-07）
- Topview Seedance 2.5（480p・16:9）で3本。原本は `C:\Users\szou\noxnix_work\`（リポジトリ外。game.js / index.html のパッチスクリプトもここ）
  - 全モーション30s（グリーンバック）→ `python tools/sprite_tool.py pack tools/noxnix_sprites.json`。11.5–12.25s／18.0s／26s付近は背景ごと光ってキーが抜けないので不使用
  - 演出リール30s → 選択 intro 0.25–3.6s／confirm 3.75–6.0s／ULT 6.25–17.25s（接近→ビーム→墜落→爆発）／勝利 18.25–21.25s＋24.5–27.5s（白フラッシュでつなぎ）／ラウンド勝利カットイン 25.25–26.5s
  - **注意**：リールの宇宙のカット（6.25–24.25s）に、参照に使った宇宙船画像の透かし「PixVerse.ai」が右上に写り込んでいた → `delogo=x=714:y=16:w=116:h=30` で消去済み。作り直すときは透かしの無い参照画像を使うこと
  - ステージ20s → 9.5–19.5s を往復ループ `stage_noxnix.mp4`
- 静止画：`noxnix.webp`（モーション動画の立ち絵をキー抜き）、`noxnix_card`／`noxnix_cutin`／`title_noxnix`（リールの顔アップ）
- セリフ（2026-10-07 差し替え）：最初の Topview TTS 版はロボットのようで感情が出なかったため、ElevenLabs **eleven_v3**（感情タグ付き）で全18本を作り直し。NIX＝**Kano - Cute & Anime**（`OSwaPSNdfituxkWcjlkR`、元気で明るい）、NOX＝**Sakuya - Cheerful and Clear**（`8kgj5469z1URcH4MB2G4`、明るく澄んだ少しクールな声）。2人とも「人間の元気な女の子の歌手」に寄せて、NOX のセリフも明るい言い回しに変更。1本ずつ生成 → 無音カット → -18 LUFS → `media/voice/nx_01..18.mp3`。掛け合いの3本は0.2s空けて連結。原本 `C:\Users\szou\noxnix_work\voice2\`。**全部仮セリフ**
```
01 NIX [energetic] はっ！      02 NOX [confident] 遅いよ！      03 NIX [energetic] それっ！
04 NIX [shouting excitedly] せーのっ！   05 NIX [cheerful] 記憶、鳴らすよっ！   06 NIX [playful] よっと！
07 NOX [smug] 読めてるって！   08 NIX [surprised] きゃっ！      09 NOX [pained] くっ……！
10 NOX [determined] まだまだ、夜は明けてないよ！   11 NIX [sad, weakly] ごめん、ノクス……アンコール、できないや……
12 NIX [excited shouting] ツイン・リフ、いっくよー！
13 NOX 来て、ジャック・オー・アーク！／NIX 未来のハロウィン、開演だよっ！
14 NIX ねえ、今夜いちばん楽しいのはどこ？／NOX [laughs] ……ここ、みたいだね！
15 NOX [energetic] 明日を盗もう！
16 NOX [sheepish laugh] 着陸は……まあ、いつも通りかな！／NIX [laughing] それ、墜落って言うんだよ！
17 NOX [cheerful, proud] 夜明けまでが、私たちの時間！   18 NOX [sad, softly] 今夜のライブは……ここまで、かぁ。
```

## 大きさ（2026-10-07）
- NOX×NIX は他キャラより小さく見えたので拡大（`RESIZE.noxnix` 1.32。スプライト・当たり判定・技の出る位置ごと拡大）。同時に全キャラ（巨大キャラ ARCA／KANNA／SHUTEN を除く）を SUZUNE／AOI の頭の高さに揃えた：勝利ポーズを同じ地面に並べて頭頂（帽子・耳は除く）を比較
  - RESIZE: suzune .9 / aoi .9 / sakura .90→.95 / mio 1→1.08 / aria 1 / enjo 1.15→1.17 / rei 1.15→1.28 / ichika 1→1.12 / isana 1→1.15 / noxnix 1→1.32
  - 比較用スクリプト `C:\Users\szou\noxnix_work\lineup.py '{RESIZE}' out.jpg winPose|walk|idle`

## 未対応
- ~~ULT／勝利ムービーの BGM~~ → 2026-10-07 に Topview Music で作成済み（`movie_ex_noxnix.mp3`・`movie_win_noxnix.mp3`、詳細は wip/shuten/HANDOFF.md）
- ~~a1 の床の砂ぼこり~~ → 対応済み（下記）

## a1 の砂ぼこり除去（2026-10-07）
- 元動画の a1（8.25–8.75s）に床の砂ぼこり（黄みがかった明るい灰色）が写り込み、スプライトに残っていた
- `python tools/noxnix_dedust.py anim/noxnix.json a1`／`python tools/noxnix_dedust.py anim/hi/noxnix.json a1` で除去（フレーム下40%の暖色寄りの明るい灰色の塊＋周囲5pxの縁を透明化。斬撃の弧は紫ピンク系なので残る）。json の参照は `?v=2`
- 処理前の原本は `C:\Users\szou\noxnix_work\dust_backup\`。スプライトを作り直したら同じ処理をかけ直すこと

## 1VS1 倍フレームレート版（2026-10-07）
- `python tools/hifps.py tools/noxnix_sprites.json` → `anim/hi/noxnix.json` + 12クリップ（約9.2MB）
  - idle 8→16fps / walk 10→20 / dash 12→24 / a1・a2 14→24 / b・ex・ultFire・ultEnd・winPose 12→24 / air・getup 10→20
  - times 指定のクリップ（a3 / guard / jump / hit / down / ultCharge）と cutin は対象外（通常版のまま）
- 足元の高さ・大きさは通常版と一致を確認（anchorX は 421→422 の 1px 差）。通常の `anim/noxnix*` は sha1 で無変更を確認
