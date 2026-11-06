#!/bin/bash
# basefit 閘門：連結 / JS 語法 / 首頁完整性 / 洩密掃描
# 教訓：絕對不要 `cmd | tail` 之後才判斷 exit code
set -u
cd "$(dirname "$0")/.." || exit 2
fail=0
LOG="$(mktemp -t basefit_check.XXXXXX)"

echo "== 1. HTML 本地連結 =="
if ! python3 tools/check_links.py >"$LOG" 2>&1; then echo "!! 連結缺失"; tail -20 "$LOG"; fail=1; else tail -2 "$LOG"; fi

echo "== 2. JavaScript 語法 =="
js_fail=0; js_n=0
while IFS= read -r f; do
  js_n=$((js_n+1))
  if ! node --check "$f" >"$LOG" 2>&1; then echo "!! $f"; tail -3 "$LOG"; js_fail=1; fi
done < <(find . -name "*.js" -not -path "./node_modules/*" -not -path "./.git/*" | sort)
if [ "$js_fail" = 1 ]; then fail=1; else echo "$js_n 個 JS 檔語法 OK"; fi

echo "== 3. 首頁完整性 =="
if [ ! -s index.html ]; then echo "!! index.html 不存在或為空"; fail=1
elif [ "$(wc -c < index.html)" -lt 50000 ]; then echo "!! index.html 太小（$(wc -c < index.html) bytes），可能被截斷"; fail=1
else echo "index.html $(wc -c < index.html) bytes"; fi

echo "== 4. 洩密掃描 =="
if grep -rInE "AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY" \
     --include="*.html" --include="*.js" --include="*.json" --include="*.md" --include="*.gs" . >"$LOG" 2>/dev/null; then
  echo "!! 疑似金鑰"; head -10 "$LOG"; fail=1
else echo "未發現金鑰樣式"; fi

rm -f "$LOG"
if [ "$fail" = 0 ]; then echo "CHECK OK"; else echo "CHECK FAILED"; fi
exit $fail
