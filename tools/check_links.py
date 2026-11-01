#!/usr/bin/env python3
"""檢查 HTML 內部連結與資源是否存在（不含外部網址、錨點、data:）。

用法: python3 tools/check_links.py [--verbose]
離開碼: 0 = 全部存在，1 = 有缺失
"""
import re
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
LEGACY = re.compile(r"(?:\.bak|\.orig|_old|\bold\b|-old|_mine|_models)", re.I)
ATTR = re.compile(r"""(?:href|src)\s*=\s*["\']([^"\']+)["\']""", re.I)
SKIP = ("http://", "https://", "//", "#", "mailto:", "tel:", "data:", "javascript:", "blob:")


def pages():
    for p in ROOT.rglob("*.html"):
        rel = p.relative_to(ROOT)
        if any(part in {"node_modules", ".git"} for part in rel.parts):
            continue
        if LEGACY.search(str(rel)):
            continue
        yield p


def main() -> int:
    verbose = "--verbose" in sys.argv
    missing, checked = [], 0
    for page in pages():
        html = page.read_text(encoding="utf-8", errors="ignore")
        for raw in ATTR.findall(html):
            url = raw.strip()
            if not url or url.lower().startswith(SKIP):
                continue
            if "${" in url or "{{" in url:   # JS 樣板字串，不是真連結
                continue
            path = unquote(url.split("#")[0].split("?")[0])
            if not path:
                continue
            target = (page.parent / path).resolve() if not path.startswith("/") else (ROOT / path.lstrip("/")).resolve()
            checked += 1
            if not target.exists():
                missing.append((str(page.relative_to(ROOT)), url))
            elif verbose:
                print(f"ok   {page.relative_to(ROOT)} -> {url}")

    print(f"檢查 {len(list(pages()))} 個頁面、{checked} 個本地連結")
    if missing:
        print(f"!! 缺失 {len(missing)} 個:")
        for page, url in missing[:40]:
            print(f"   {page} -> {url}")
        return 1
    print("所有本地連結都存在")
    return 0


if __name__ == "__main__":
    sys.exit(main())
