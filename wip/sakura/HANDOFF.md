# SAKURA 追加 — 引き継ぎメモ (2026-10-02)

## 状態
- 声: ElevenLabs eleven_v4 / voice "Sakura - Sweet, Gentle" (gHBfNp2PWSyFgpPlzCOd)。
  1本取り(wip/sakura/voice_take.mp3)を18本に分割済み → media/voice/sa_01..18.mp3
  01えいっ 02はっ 03やあっ 04これで、どうっ 05設計図、展開 06飛ぶよっ 07計算どおり 08きゃっ 09ああああっ
  10まだ、描きかけなんだから 11空が…遠い… 12おいで、アイディア・ドラゴン 13描いた想いは…桜龍、ドラフト・ノヴァ
  14空は、まだ設計途中。サクラ、行きます 15設計開始、だよ 16わたしの設計に、狂いはないの 17ねっ、言ったでしょ？ 18設計、やり直しかな…
  VOICE_MAP割当: a0[01,03] a1[02] a2[04] b[05] jump[06] guard[07] hit[08] hitBig[09] getup[10] ko[11] ex[12] ult[13] select[14] round[15] winMovie[16] win[17] lose[18]
- 参照画像: refs/sakura_*.jpg (キャラシート2枚・ドラゴンシート・ドラゴン絵)
- Topview canvas: "CHRONO FIGHT - SAKURA" (id ffa4422d41504fd8afa64d374e1ffbec)
  クラウド環境ではTopviewのS3アップロード/CloudFrontダウンロードが遮断されるため、PCで作業すること。

## 残り (ファイル数を最小に: 30秒動画3本)
1. 参照画像をTopviewにアップロード → GPT Image 2 image_edit で開始フレーム生成
   (グリーンバック#00B140の立ち姿・右向き / グリーンバックのドラゴン側面・右向き / キービジュアル)
2. Seedance 2.5 image_to_video 480p 16:9 30秒 ×3
   ② SAKURA全モーション(固定カメラ・グリーンバック): idle/walk/guard/jump/攻撃3段/b/ex召喚/被弾/吹っ飛び/ダウン/起き上がり/ULT溜め→発射/勝利ポーズ
   ③ ドラゴン(固定カメラ・グリーンバック): 飛行ループ/ブレス/急降下/爪
   ④ 演出: 選択画面イントロ/決定/ULTムービー/勝利ムービー
3. 抽出・パック (/home/claude/work/arca/ext_arca.py, pack_arca.py が雛形) → anim/sakura.json
4. game.js: CHARS.sakura(身長は他キャラと同程度)、AOI型の召喚キャラとしてドラゴンを技に、VOICE_MAP.sakura、選択カード、ex/winムービー
