#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

node scripts/md-to-html.js docs/architecture.md docs/architecture.html

rm -f docs/architecture.pdf
libreoffice --headless --convert-to pdf --outdir docs docs/architecture.html >/dev/null 2>&1

if [ ! -f docs/architecture.pdf ]; then
  echo "PDF generation failed" >&2
  exit 1
fi

echo "Wrote docs/architecture.pdf"
if command -v pdfinfo >/dev/null 2>&1; then
  pdfinfo docs/architecture.pdf | grep -E "^Pages|^Page size"
fi
