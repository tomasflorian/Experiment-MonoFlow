#!/usr/bin/env bash
set -euo pipefail

commands="$(
  for file in log/*.log; do
    sed -n '1p' "$file"
  done | sort -u
)"

while IFS= read -r command; do
  if [[ -z "$command" ]]; then
    continue
  fi

  echo "$command"
  eval "$command"
done <<< "$commands"
