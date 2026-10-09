#!/usr/bin/env bash
# Crée les issues GitHub à partir de docs/team/backlog.csv avec le CLI `gh`.
# Prérequis : `gh auth login`, être dans le dépôt, avoir créé les labels (voir docs/team/github-setup.md).
# Usage : scripts/github/create-issues.sh [--dry-run]
set -euo pipefail

CSV="$(dirname "$0")/../../docs/team/backlog.csv"
DRY=false
[[ "${1:-}" == "--dry-run" ]] && DRY=true

python - "$CSV" "$DRY" <<'PY'
import csv, subprocess, sys
path, dry = sys.argv[1], sys.argv[2] == "True" or sys.argv[2] == "true"
with open(path, newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        title = f"[{row['id']}] {row['titre']}"
        body = (
            f"**Référence** : {row['id']} · **Fonctionnalité** : {row['fonctionnalite']}\n"
            f"**Prévu** : {row['jour']} · **Taille** : {row['taille']} · **Dépend de** : {row['depend_de'] or '—'}\n\n"
            "### Critères d'acceptation\n(à reprendre du cahier des charges, section 4)\n\n- [ ] \n"
        )
        labels = f"type:task,prio:{row['priorite']},lot:{row['lot']},area:{row['zone']}"
        cmd = ["gh", "issue", "create", "--title", title, "--body", body, "--label", labels]
        if dry:
            print("DRY-RUN", title, "|", labels)
        else:
            subprocess.run(cmd, check=True)
PY
