# 1VS1 2倍フレームレート素材 — PCセッション向け手順

ゲーム側（クラウド）で 1VS1 モードを追加し、1VS1 のときだけ `anim/hi/<id>.json` があれば
そのクリップを差し替えて読み込む仕組みを入れた。素材はここ（元動画のあるPC）で作る。

## やること
1. `git pull`（main）
2. キャラごとに実行（元動画のパスは各 `tools/<id>_sprites.json` に書いてある C:/Users/szou/... ）
   ```
   python tools/hifps.py tools/rei_sprites.json
   python tools/hifps.py tools/enjo_sprites.json
   python tools/hifps.py tools/kanna_sprites.json
   python tools/hifps.py tools/ichika_sprites.json
   python tools/hifps.py tools/isana_sprites.json
   python tools/hifps.py tools/sakura_sprites.json
   python tools/hifps.py tools/mio_sprites.json
   python tools/hifps.py tools/aria_sprites.json
   ```
   - 出力: `anim/hi/<id>.json` と `anim/hi/<id>_<clip>_0.webp`。通常の `anim/<id>.json` や `anim/<id>_*.webp` は**絶対に上書きしない**（hifps.py は anim/hi/ にしか書かない）
   - cutin / guard / jump / down / times指定 / take指定 のクリップは対象外（ゲームがコマ番号で参照するため）
3. 後処理（通常素材に過去かけた修正を hi にも同じくかける）
   - **ISANA**: 全 hi アトラスに `python tools/isana_rematte.py anim/hi/isana_<clip>_0.webp anim/hi/isana_<clip>_0.webp`（緑青の鎧の抜け穴埋め）→ さらに commit d490522 と同じ輪郭スムージング
   - 他キャラも `git log -- anim/<id>_*` で通常素材に後から修正（色抜け・グロー除去・島ノイズ除去など）が入っていれば同じ処理を hi にかける
4. 目視チェック：各キャラ idle / walk / a1 を通常版と並べ、**足元の位置・大きさが一致**していること、抜けや緑フチがないこと
5. サイズ目安：1キャラ +5〜10MB 程度。極端に大きい（20MB超）ものは quality を 76 程度に下げて再出力
6. ブランチ `add-hifps` にコミットして push（main へは直接入れない）。PR 作成まで

## 対象外
- SUZUNE / AOI / ARCA は sprite 設定ファイルがない（旧パイプライン）。元動画と切り出し区間が分かる場合のみ
  `tools/<id>_sprites.json` を作って同様に。分からなければスキップでOK（1VS1 でも通常フレームで動く）

## 2026-10-07 結果（PCセッション）
- 作成済み: REI / ENJO / KANNA / ICHIKA / ISANA → `anim/hi/`（合計 約52MB：REI 8.5 / ENJO 14 / KANNA 16 / ICHIKA 6.4 / ISANA 8.1MB）
  - ENJO の元動画は `C:/Users/szou/enjo_work/`（設定ファイルの `wip/enjo/*.mp4` は存在しないため、パスを差し替えた一時設定で実行）
- **未作成: SAKURA / MIO / ARIA** — 元動画（moves.mp4 / dragon.mp4 / dog.mp4）がPCに無いためスキップ（1VS1 でも通常フレームで動く）
- ISANA 後処理: 全15アトラスに `isana_rematte.py` → `isana_work/smooth/smooth.py` の `smooth()` を1コマずつ（d490522 と同じ）。処理前の原本は `C:/Users/szou/hifps_tmp/isana_raw/`
- 他4キャラは通常素材に後付けの修正コミットが無い（cut-in 追加のみ）ので後処理なし
- 目視チェック: 5キャラの idle / walk / a1（先頭・中間コマ）を足元基準で通常版と重ねて比較。足元の高さ・大きさ一致、先頭コマの原点ずれは数px以内。抜け・緑フチなし
- 通常の `anim/<id>.json` / `anim/<id>_*.webp` は作業前後で sha1 一致（無変更）

## 2026-10-08 追記：アトラス縮小（スマホのメモリ対策）
- 全キャラの通常・hi アトラスを 75% に縮小済み（`tools/shrink_atlas.py`）。フレームは論理サイズ w/h/ox/oy を保ったまま、アトラス上の矩形を x/y/sw/sh で持つ。cutin は等倍のまま
- **新しく sprite_tool / hifps / interp_hi で書き出したら、最後に必ず** `python3 tools/shrink_atlas.py 0.75 anim/<id>.json anim/hi/<id>.json` を実行（既に縮小済みのクリップは自動でスキップ）
