#!/usr/bin/env bash
# Builds the static GitHub Pages demo: the real dashboard + an in-browser simulated backend.
set -euo pipefail
out=${1:-_site}
cd "$(dirname "$0")/.."
rm -rf "$out" && mkdir -p "$out"
cp services/dashboard/app.js services/dashboard/demo-backend.js "$out/"

python3 - "$out" <<'PY'
import sys, pathlib
out = pathlib.Path(sys.argv[1])
html = pathlib.Path('services/dashboard/index.html').read_text()
banner = '''
  <div class="sim-banner" role="note">
    <b>Simulated backend.</b> This demo runs entirely in your browser. The real system is Node.js services,
    BullMQ, Postgres and Redis:
    <a href="https://github.com/IvanMerdzhanov/opsdeck" target="_blank" rel="noopener">source &amp; docs</a> ·
    run it for real with <code>docker run</code> (see README). Admin: any key works here.
  </div>'''
css = '''
    .sim-banner { padding:10px 24px; background:#1f2a3a; border-bottom:1px solid var(--line); color:var(--text); font-size:13px; }
    .sim-banner a { color:var(--accent); }
    .sim-banner code { background:#0f1115; padding:1px 5px; border-radius:4px; }
    @media (max-width: 600px) { .sim-banner { padding-left:16px; padding-right:16px; } }'''
assert '</header>' in html and '<script src="app.js"></script>' in html and '</style>' in html
html = html.replace('</header>', '</header>' + banner, 1)
html = html.replace('</style>', css + '\n  </style>', 1)
html = html.replace('<script src="app.js"></script>', '<script src="demo-backend.js"></script>\n  <script src="app.js"></script>', 1)
html = html.replace('<title>OpsDeck</title>', '<title>OpsDeck · live demo</title>', 1)
(out / 'index.html').write_text(html)
PY
touch "$out/.nojekyll"
echo "built $out"
