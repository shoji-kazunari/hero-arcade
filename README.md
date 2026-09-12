# Hero Arcade

スマホで遊べる、「ヒーローが何かを守る」ミニゲームを集めたサイト。
ビルド工程なし。素のHTML/CSS/JSをそのまま配信する。

## 構成

| 場所 | 中身 |
|---|---|
| `index.html` | トップページ（ゲーム一覧） |
| `assets/css/` | 共通スタイル |
| `assets/js/games-data.js` | ゲーム一覧のデータ。新しいゲームを追加したらここに1行足す |
| `games/<slug>/` | 1ゲーム1ディレクトリ（`index.html` / `style.css` / `game.js`） |

## 新しいゲームを追加する

1. `games/<slug>/` を作り、`index.html` / `style.css` / `game.js` を書く
2. `assets/js/games-data.js` の配列にゲーム情報を1件追加する
3. トップページの一覧に自動で表示される
