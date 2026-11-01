# AGENTS.md — basenefit 學員平台（basefit）

## 這個專案是什麼
靜態網站（單檔 `index.html` 為主）＋ `assets/` 內的 3D 教學頁（three.js）＋ `deploy/` 的 Google Apps Script（成績雲端同步）。
部署：推上 GitHub，由 Pages 提供。

## 給 agent 的硬規則
1. **只改你被指派範圍內的檔案**；`index.html` 很大（26 萬字），一次只改一段。
2. **不准改 `*.bak_*`、`*.orig`、`*_old*`、`*_mine*`** —— 那是歷史版本，不是現行網站。
3. **不准新增第三方套件**；three.js 已在 `assets/*/vendor/`，用現成的。
4. 完成前**必須**跑 `bash scripts/check.sh`，最後一行 `CHECK OK`。
5. 不要 `git push`；不要 force push；不要改 `deploy/`（Apps Script 由人工部署）。
6. 改 `index.html` 前先 `cp index.html index.bak_$(date +%Y%m%d_%H%M%S)`。

## 完成定義
- [ ] `bash scripts/check.sh` → CHECK OK（連結、JS 語法、首頁大小、洩密掃描）
- [ ] 有改動的頁面用瀏覽器實際開過（或截圖），不是只看 diff
- [ ] 回報：改了哪些檔、check 最後一行、怎麼驗的

## 專案結構
```
index.html            主站（單頁，含 CSS/JS）
assets/tactics/       戰術互動頁（three.js）
assets/stadium/       球場 3D（GLB + vendor）
assets/*.html         其他教學頁（部分為歷史版本，勿動）
deploy/               Google Apps Script 同步
tools/check_links.py  本地連結檢查
scripts/check.sh      統一閘門
```
