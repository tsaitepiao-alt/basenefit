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

<!-- trail:start -->
## Trail — repo context graph

This repo is indexed in `.trail/cache/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `trail map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `trail ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `trail grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `trail skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `trail callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `.trail/cache/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `trail ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `trail build` (deterministic,
no API key, $0).
<!-- trail:end -->
