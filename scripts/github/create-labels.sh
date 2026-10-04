#!/usr/bin/env bash
# Crée les labels listés dans .github/labels.yml avec le CLI `gh`.
set -euo pipefail
python3 - <<'PY'
import subprocess, yaml
for l in yaml.safe_load(open(".github/labels.yml", encoding="utf-8")):
    subprocess.run(["gh", "label", "create", l["name"], "--color", l["color"],
                    "--description", l["description"], "--force"], check=True)
PY
