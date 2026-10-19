#!/usr/bin/env bash
# ============================================================
# 微工具工厂验收套件 v1 — 这是验证器（VERIFIER）
# 契约 v3：agent 不得修改/删除/弱化本文件；修改需成员或 Mika 批准
# Usage:
#   ./acceptance.sh --app <app-dir> --base-url <url> [--page /p]... [--exported-file f.jpg]
# v1 范围：build / HTTP 状态与 meta / Lighthouse 移动端 / EXIF(可选)
# v2 计划（由 Mika/成员追加）：零上传抓包 + 交互 smoke (playwright)
# ============================================================
set -uo pipefail
PASS=0; FAIL=0
ok(){ echo "  PASS  $1"; PASS=$((PASS+1)); }
bad(){ echo "  FAIL  $1"; FAIL=$((FAIL+1)); }
APP_DIR=""; BASE_URL=""; EXPORTED_FILE=""; PAGES=("/")
while [[ $# -gt 0 ]]; do case "$1" in
  --app) APP_DIR="$2"; shift 2;;
  --base-url) BASE_URL="$2"; shift 2;;
  --page) PAGES+=("$2"); shift 2;;
  --exported-file) EXPORTED_FILE="$2"; shift 2;;
  *) shift;;
esac; done
[[ -z "$APP_DIR" || -z "$BASE_URL" ]] && { echo "need --app and --base-url"; exit 2; }

echo "== 1/4 Build ($APP_DIR) =="
if (cd "$APP_DIR" && npm run build > /tmp/acc-build.log 2>&1); then ok "npm run build"; else bad "build failed -> /tmp/acc-build.log"; fi

echo "== 2/4 HTTP ($BASE_URL) =="
for p in "${PAGES[@]}"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 25 "$BASE_URL$p")
  [[ "$code" == "200" ]] && ok "$p -> 200" || bad "$p -> $code"
done

echo "== 3/4 Lighthouse mobile (perf>=90, CLS<=0.1) =="
if command -v npx >/dev/null 2>&1; then
  npx --yes lighthouse "$BASE_URL" --form-factor=mobile --throttling-method=simulate \
    --only-categories=performance --output=json --output-path=/tmp/acc-lh.json \
    --quiet --chrome-flags="--headless=new" >/dev/null 2>&1
  perf=$(python3 -c "import json;print(int(json.load(open('/tmp/acc-lh.json'))['categories']['performance']['score']*100))" 2>/dev/null || echo -1)
  cls=$(python3 -c "import json;print(round(json.load(open('/tmp/acc-lh.json'))['audits']['cumulative-layout-shift']['numericValue'],3))" 2>/dev/null || echo -1)
  [[ "$perf" -ge 90 ]] && ok "Performance=$perf" || bad "Performance=$perf (<90)"
  python3 -c "import sys;sys.exit(0 if float('$cls')<=0.1 else 1)" 2>/dev/null && ok "CLS=$cls" || bad "CLS=$cls (>0.1)"
else
  bad "npx unavailable"
fi

echo "== 4/4 EXIF (optional) =="
if [[ -n "$EXPORTED_FILE" ]]; then
  if command -v exiftool >/dev/null 2>&1; then
    if exiftool "$EXPORTED_FILE" | grep -qiE "GPS|GPS Position"; then bad "GPS metadata present"; else ok "no GPS metadata"; fi
  else
    bad "exiftool not installed"
  fi
else
  echo "  SKIP  (no --exported-file)"
fi

echo
echo "ACCEPTANCE RESULT: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
