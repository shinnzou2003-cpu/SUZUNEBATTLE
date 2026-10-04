# ENJO（煙女）追加 — 引き継ぎメモ (2026-10-04)

7人目のファイター。クラウドセッションでは Topview / ElevenLabs の生成物をダウンロードできないため、**素材生成〜取り込み〜実装はPC（ローカル）セッションで行う**。このメモと refs/ の4枚だけで作業を始められるようにまとめてある。

## 出典（SZOUの過去チャットで確定済みの設定）
- 世界観: 『UKIYO -浮世斬-』（『UKIYO WORRIES／憂いを喰らう者たち』）。メタルパンク廃都×浮世。
- ENJOは浮世の**胴元**（賭場の支配者）。「憂いを喰らえば人は苦しまずに済む」という救済者。2026-08にOiiOii×Seedance2.5でキャラ紹介MV『煙 -ENJO-』を完成・投稿済み。
- 演技の芯: **本人は優雅で静か、周囲（煙・機巧獣）だけが暴力的に速い**。歩きは遅く、技は召喚と煙で戦う。
- 決め台詞（MV由来）: 「切り札はまだ、水の底」「浮世は煙 斬るも掴めぬ」「月を割るのは 翡翠の三日月」「賽の目ひとつで 楼は崩れる」

## 参照画像（refs/）
- `enjo_portrait.jpg` … メインポートレート。宙に浮く**金の機巧髑髏**（歯車の眼窩・翡翠の目）が相棒。
- `enjo_sheet.jpg` … 三面図（首なし前・横・後ろ）。**正式デザイン**。
- `enjo_gashira.jpg` … 召喚獣 **GASHIRA（骸獅子）**：数百の金の骸骨面が鱗として組み上がった唐獅子。目と吐息は翡翠。黒い煙のたてがみ。座り姿と跳びかかり姿。
- `enjo_rindo.jpg` … 切り札 **RINDO（リンドウ）**：黒い機械の龍。たてがみと体に**赤い彼岸花**、赤い目、墨だまりから立ち上がる。

## デザイン固定（変更禁止）
- 黒髪の結い上げ（ゆるいお団子）、翡翠の牡丹の髪飾り、金の簪と歩揺（ほよう）、翡翠の耳飾り
- 翡翠ティールのチャイナドレス（金の雲紋刺繍・高い立て襟・深いスリット）＋黒のシースルー長袖ローブ（金縁）
- 翡翠の長い爪、**白磁の煙管（キセル）＋翡翠の房**、黒の厚底ヒール（金の足首飾り）
- 瞳は翡翠グリーン。**ENJO本人は赤を一切持たない**（赤はRINDOだけの色）
- カラー: JADE #1F8A7A / JADE LIGHT #5FD3BC / GOLD #C9A24A / INK #14110F / PAPER #EFE6D6 / RINDO RED #C8202A

## ゲームデータ案（CHARS）
```js
enjo: { id: 'enjo', name: 'ENJO', role: '煙管・召喚の胴元', c1: '#5fd3bc', c2: '#c9a24a', rgb: '95,211,188', rgb2: '201,162,74',
        speed: 4.6, jump: -23.5, anchor: .55, hurtW: 50, hurtH: 285,
        exName: '骸獅子・ガシラ', ultName: '浮世斬・リンドウ' }
```
- 身長は**他キャラと同程度**（SAKURA/SUZUNEの0.9倍調整後の見た目の高さに合わせる。ARIA .95・MIO 1.22を目安に CHAR_SCALE を決める）
- 歩きは遅め（優雅）。ダッシュなし（CAN_DASHに入れない）。代わりに**煙になって短距離ワープ**する後退ステップがあると個性が出る（任意）

## 技（ゲーム側）
| 入力 | 技 | 内容 |
|---|---|---|
| a1 | 煙管の一打 | 白磁の煙管で手首だけの軽い突き |
| a2 | 房払い | 翡翠の房を振る裏拳。煙の弧が残る |
| a3 | 翡翠の三日月（小） | 煙管が一瞬伸びて煙の鎌になり、横一閃。打ち上げ |
| b（必殺） | 骸の吐息 | 浮遊する**機巧髑髏**が口から翡翠の煙弾を撃つ（弾はビーム相殺の対象・通常攻撃で消せる） |
| ex | 骸獅子・ガシラ | 煙を吐く→煙が廃材を喰って**GASHIRA**が組み上がる→画面を横切って跳びかかり、噛みつき＋翡翠の吐息。MIOの犬／SAKURAの龍と同じ「別スプライトの召喚獣」方式 |
| ult | 浮世斬・リンドウ | 「切り札はまだ、水の底」。足元に墨だまりが広がる→**RINDO**が墨から立ち上がり、とぐろを巻いて相手を締め上げ→急降下して噛み砕く。赤い彼岸花の花弁が舞う（翡翠の世界に赤が一滴＝演出の肝）。ガードで削りのみ（`ult: true`、`unblock` は使わない） |
- 機巧髑髏はAOIのドローンと同じ「常に浮いて付いてくる相棒」として描画（髑髏は1枚絵 or 短いループで可）
- 光・煙・花弁・墨だまりは**すべてコード側のfx**（翡翠の煙はfxSmoke系を新設、彼岸花の花弁はSUZUNEのfxPetalsを赤で流用、墨だまりはMIOのpaintFloorの黒版）
- 新しいWebGL後処理（衝撃波・放射ブラー・インパクトフレーム）は既存フックで自動的に効く。ULTフィニッシュは赤のインパクトフレームにする（`pfxKick({ rgb: '200,32,42' })`）

## 素材ルール（SZOUの方針）
- 動画は Topview MCP、**480p・16:9**、ファイル数は最小限。各動画はできるだけ長尺にまとめる
- **グリーンバック動画に光・オーラ・煙・火・花弁・粒子を入れない**（SAKURAで緑と混ざりカーキのもやが残った）。煙と花弁はゲーム側で描く
- キャラは固定カメラ・真横〜3/4・足が常にフレーム内・同じスケール
- セリフは ElevenLabs（eleven_v4）で**18本を1本に繋げて1テイク生成**→無音で分割（`-ss` は `-i` の前に置く）
- 生成ビジュアルに実在の作家名・サイン・透かしを入れない

## Topview 生成プロンプト（英語・コピペ用）

### ① ENJO 全モーション（参照: enjo_sheet.jpg ＋ enjo_portrait.jpg）
```
Solid pure green screen background (#00FF00), flat, evenly lit, no shadows on the backdrop. Fixed locked-off camera, full body always in frame including feet, side view facing right (3/4 at most), same scale for the whole clip. Character: ENJO, an elegant woman, black hair in a loose updo with a jade peony hair ornament and gold hairpins with dangling chains, jade-teal qipao with gold cloud embroidery and high collar and thigh-high slit, long black sheer outer robe with gold trim, long jade nails, white porcelain kiseru pipe with a jade tassel, black platform heels with gold anklets, jade-green eyes. She carries no red anywhere. 2.5D real-anime style, consistent design matching the reference sheet. Motion sequence, each beat clearly separated by a brief neutral pose: 1) graceful idle stance holding the kiseru near her lips, gentle breathing, robe sleeves swaying; 2) slow elegant walk forward, 4 steps; 3) quick wrist-flick jab with the kiseru; 4) backhand swing of the kiseru with the jade tassel trailing; 5) wide horizontal sweep, the kiseru held like a long scythe handle; 6) she exhales toward the right and flicks the kiseru forward as if commanding something (summon gesture); 7) guard: robe sleeve raised in front of her face; 8) hit reaction: knocked back, head turned; 9) knocked down to the floor and lying still, then rising gracefully; 10) small jump with robe flaring; 11) ultimate charge: she slowly raises the kiseru overhead, eyes closed, then opens her eyes and points the kiseru down at the floor; 12) victory pose: turns three-quarters to camera, kiseru at her lips, a calm smile. No glow, no aura, no smoke, no particles, no petals, no light effects, solid character only, no text, no watermark.
```

### ② GASHIRA（参照: enjo_gashira.jpg）
```
Solid pure green screen background (#00FF00), flat and evenly lit. Fixed camera, side view facing right, the whole creature always in frame, same scale throughout. Creature: GASHIRA, a giant guardian lion (karajishi) whose body is built from hundreds of golden skull masks and brass gear plates like scales, a mane of black wispy ink-like strands, glowing jade-green eyes, golden claws. Motion sequence: 1) crouched low, growling, shoulders rolling; 2) full gallop to the right, legs fully extended, 2 strides; 3) leaping pounce with claws forward and jaws open; 4) landing and biting down; 5) sitting proudly upright. No breath effects, no fire, no smoke, no particles, no glow, solid creature only, no ground splashes, no text, no watermark.
```

### ③ RINDO（参照: enjo_rindo.jpg）
```
Solid pure green screen background (#00FF00), flat and evenly lit. Fixed camera, side view facing right, the whole dragon in frame. Creature: RINDO, a long serpentine black mechanical Eastern dragon with segmented black armor plates, brass joints and pistons, mechanical clawed arms, long whiskers and swept-back horns, red spider-lily flowers growing along its mane and spine, glowing red eyes. Motion sequence: 1) rising vertically upward from the bottom edge of the frame in an S-curve; 2) coiling in a loop, body undulating; 3) rearing its head back and roaring with jaws wide open; 4) diving forward and down to the right with jaws open to bite; 5) sinking back down out of the bottom edge. No ink splashes, no water, no petals in the air, no glow, no particles, solid dragon only, no text, no watermark.
```

### ④ 演出（キャラ選択イントロ／決定・EXムービー・ULTムービー・勝利ムービー・ステージ）
既存キャラ（ARIA: media/select_aria_*.mp4, ex_aria.mp4, stage_aria.mp4）と同じ尺・構成で。背景は**メタルパンク廃都の豪奢な賭場（胴元の座敷）**：鉄骨の高楼、蒸気配管、錆に食い込む金装飾、揺れる金の簾、濡れた黒い床。舞台は無彩色、色は翡翠ティールと金だけ。
- EXムービー: ENJOが煙を吐く→翡翠の煙が廃材を喰い、金の骸骨面が組み上がってGASHIRAが咆哮
- ULTムービー: 「切り札はまだ、水の底」→黒い墨の水面が盛り上がり、赤い彼岸花をまとった黒い機械龍RINDOが立ち上がる。翡翠の世界に赤が一滴
- 勝利ムービー: 煙管を一服、髑髏が肩の横で翡翠の目を灯し、ENJOが振り向いて微笑む
- ステージ: 上記の賭場をゆっくりパンするループ（人物なし）
- SZOUのアクション演出ルール（極端パース・ハイスピード・激しいカメラ、Bounce speed ramp）を演出動画には全開で適用。グリーンバック素材だけは固定カメラ

## セリフ（ElevenLabs・1テイク）
声: 落ち着いた低めの女性、20代後半、艶と余裕があり少しハスキー、からかうような笑みを含む。早口にしない。
割当（MIO/ARIAと同じ枠）: a0[01,03] a1[02] a2[04] b[05] jump[06] guard[07] hit[08] hitBig[09] getup[10] ko[11] ex[12] ult[13] select[14] round[15] winMovie[16] win[17] lose[18] → `media/voice/en_01..18.mp3`
```
01 ふっ。
02 おいで。
03 そら。
04 一服、いかが？
05 三日月よ。
06 よっと。
07 無粋ね。
08 っ……。
09 あぁっ！
10 ……着物が汚れたじゃない。
11 賽の目……読み違えたわね……。
12 喰らいなさい、ガシラ！
13 切り札はまだ、水の底——浮世斬、リンドウ！
14 煙女、エンジョ。胴元のお相手、してくださる？
15 さあ——丁か、半か。
16 浮世は煙。掴めたと思った？
17 ふふ、勝負あり。また遊びにいらして。
18 ……今宵は、ツキがなかったわね。
```

## 実装チェックリスト（ARIA追加コミット 9be35a1〜0bcfec7 が雛形）
1. `git pull` してから作業（main は 2026-10-04 時点で WebGL後処理・ズームカメラ・RESIZE 導入済み）
2. 動画→キーイング→フレーム抽出→`anim/enjo_*.webp` アトラス＋`anim/enjo.json`（ANIM_META に登録、遅延読み込み対応）
3. 召喚獣: GASHIRA は MIO の犬（`updateDog`/`drawDog`）、RINDO は SAKURA の龍（`summonDragon`/`updateDragon`/`drawDragon`）を雛形に
4. CHARS / MOVES / pickFrame / VOICE / 選択カード / タイトル顔パネル / カットイン / EX・ULT・勝利ムービー / ステージ / ラウンド勝利カットイン / 勝利セリフ(WINQ) を追加
5. ULTはガード可能（`ult: true`）。弾は clash 対象
6. `index.html` の `game.js?v=` を更新、Playwright で全技・ガード・交代・KO・ULT を確認してから main へ

## 実装メモ（2026-10-05 ローカル実装）
- 素材: Topview Seedance 2.5（480p・16:9）で5本 — 全モーション30s / GASHIRA 15s / RINDO 15s / 演出リール30s（イントロ→決定→EX→ULT→勝利）/ ステージ20s。原本は `C:\Users\szou\enjo_work\`（容量のためリポジトリ外）
- `ex_enjo.mp4` は ULT 開始時に流れる枠（startUlt → exMovieStart）なので、リールの RINDO ショットを使用。GASHIRA の組み上がりショットは未使用
- キーイング: 翡翠のドレスが緑幕と近いため `tools/enjo_sprites.json` の `"key": {"lo":20,"span":22,"hue":0,"spill":12}` で緩めた（sprite_tool に key/crop/box/groupAnchor オプション追加。既存キャラはデフォルト値のまま）
- 再パック: `wip/enjo/*.mp4` に原本を戻してから `python tools/sprite_tool.py pack tools/enjo_sprites.json`
- セリフ: ElevenLabs eleven_v4・声 Haruno（Calm & Low）で18本を1テイク → Whisper の時刻で分割して `media/voice/en_01..18.mp3`。テイク原本は `wip/enjo/voice_take.mp3`
- 機巧髑髏は肖像画から切り出し（`assets/enjo_skull.webp`）。ステージは往復ループ（10s 正再生＋逆再生）
- 煙=fxSmoke、彼岸花=fxPetals(…, red)、墨だまり=drawInk、ULT フィニッシュは赤のインパクトフレーム
