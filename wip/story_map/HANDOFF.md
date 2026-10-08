# ストーリーマップ用 チビSUZUNE — PCセッション向け手順

ストーリーモードのマップ画面で、チビSUZUNEが地点から地点へちょこちょこ歩く。そのスプライト素材をここで作る。
（マップ画像は SZOU が GPTimg で生成して別途チャットに添付。ゲーム側の組み込みはクラウド側で行う）

## 1. Topview で動画生成（1本にまとめる・480p・16:9）
- 参照画像：`wip/story_map/chibi_suzune_ref.jpg`（通常衣装のチビSUZUNE）
- 背景はベタのグリーンバック #00B140（影・床・反射なし）、カメラ完全固定
- プロンプト（英語・そのまま貼る）：

```
Chibi SUZUNE from the reference image, exact same design: golden cat-ear helmet with white sakura crest and red headphones, long brown ponytail, black-and-gold sakura coat, black crop top, harness belts, black shorts, fishnet on one leg, chunky black-red platform boots. Super-deformed chibi proportions (big head, small body), polished 3D anime render.
Full body always in frame, side view facing RIGHT, centered, small enough that head and boots never touch the frame edge.
Background: solid flat chroma-key green #00B140 filling the whole frame, no floor, no shadow, no reflection, no props, no text. Camera completely locked: no zoom, no pan, no shake.
Action, one continuous take:
0-5s: a bouncy cheerful walk cycle IN PLACE (does not travel across the frame), short quick steps, ponytail and coat tails swinging, arms swinging, small up-down bob each step. Loop-friendly.
5-8s: stops and does an idle: gentle breathing bounce, ponytail sways, looks forward with a grin.
8-11s: happy victory jump in place: hops up with a fist pump and a wink, lands back in the same spot.
Keep the character the same size and in the same spot for the whole video.
```

## 2. スプライト化
```
python tools/sprite_tool.py sheet <動画> wip/story_map/sheet.jpg      # 区間確認
```
`tools/chibi_sprites.json` を作って pack（区間は sheet を見て調整）：
```json
{ "id": "chibi", "video": "<動画のパス>", "out": "anim",
  "anims": {
    "walk": { "t0": 0.4, "t1": 4.8, "fps": 12 },
    "idle": { "t0": 5.2, "t1": 7.8, "fps": 10, "pingpong": true },
    "win":  { "t0": 8.0, "t1": 10.8, "fps": 12 }
  } }
```
```
python tools/sprite_tool.py pack tools/chibi_sprites.json
python tools/shrink_atlas.py 0.75 anim/chibi.json
```
- walk は**一周がきれいにつながる区間**を選ぶ（最初と最後のコマの脚の位置がそろうように t0/t1 を調整）
- 緑フチ・抜けがないか目視。足元の位置が全コマでそろっていること
- 元動画は `wip/story_map/chibi_src.mp4`（480p なら数MB）としてコミットしておく

## 3. ブランチ `add-chibi` に push して PR
