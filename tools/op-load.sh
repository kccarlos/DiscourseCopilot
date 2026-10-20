#!/usr/bin/env bash
# op-load.sh NAME=op://vault/item/field ...
#
# Reads each 1Password reference with `op read` (OP_SERVICE_ACCOUNT_TOKEN
# from the environment) and writes it as a step output NAME. 1Password is
# sometimes flaky, so each read is tried up to OP_LOAD_ATTEMPTS times
# (default 4) with growing sleeps between attempts. Every line of every
# value is masked before it is written; values never reach the log.
set -euo pipefail

attempts=${OP_LOAD_ATTEMPTS:-4}
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is not set}"
[ -n "${OP_SERVICE_ACCOUNT_TOKEN:-}" ] || { echo "::error::OP_SERVICE_ACCOUNT_TOKEN is not set"; exit 1; }

for pair in "$@"; do
  name=${pair%%=*}
  ref=${pair#*=}
  [[ "$name" =~ ^[A-Z0-9_]+$ && "$ref" == op://* ]] || { echo "::error::bad argument (want NAME=op://...): $name"; exit 1; }
  value=""
  for ((i = 1; i <= attempts; i++)); do
    if value=$(op read --no-newline "$ref" 2>/dev/null); then
      break
    fi
    value=""
    if ((i < attempts)); then
      sleep_s=$((i * i * 3))
      echo "op read for $name failed (attempt $i of $attempts); retrying in ${sleep_s}s"
      sleep "$sleep_s"
    fi
  done
  if [ -z "$value" ]; then
    echo "::error::could not read $name from 1Password after $attempts attempts"
    exit 1
  fi
  while IFS= read -r line; do
    [ -n "$line" ] && echo "::add-mask::$line"
  done <<<"$value"
  delim="OP_EOF_$(openssl rand -hex 16)"
  {
    echo "$name<<$delim"
    printf '%s\n' "$value"
    echo "$delim"
  } >>"$GITHUB_OUTPUT"
  echo "loaded $name"
done
