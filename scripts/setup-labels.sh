#!/usr/bin/env bash
# Crea o actualiza en GitHub los labels definidos en .github/labels.yml.
# Idempotente: se puede reejecutar tantas veces como haga falta.
#
# Requiere: gh (autenticado) con acceso de escritura al repo.
# Uso: scripts/setup-labels.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABELS_FILE="$REPO_ROOT/.github/labels.yml"

if [ ! -f "$LABELS_FILE" ]; then
  echo "No se encontró $LABELS_FILE" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "Se requiere la CLI 'gh' (https://cli.github.com/)" >&2
  exit 1
fi

# El archivo usa un formato deliberadamente simple (una entrada por línea,
# "nombre|color|descripción" entre comillas) para no depender de un parser YAML.
count=0
while IFS= read -r line; do
  entry="${line#*\"}"
  entry="${entry%\"*}"

  name="${entry%%|*}"
  rest="${entry#*|}"
  color="${rest%%|*}"
  description="${rest#*|}"

  echo "Label: $name (#$color) — $description"
  gh label create "$name" --color "$color" --description "$description" --force
  count=$((count + 1))
done < <(grep -E '^\s*-\s*"' "$LABELS_FILE")

echo "Listo: $count labels creados/actualizados."
