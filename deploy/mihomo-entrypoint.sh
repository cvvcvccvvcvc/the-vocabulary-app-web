#!/bin/sh
set -eu

runtime_directory=/tmp/vocabulary-mihomo
persisted_provider=/opt/vocabulary/provider/nofox.yaml
umask 077
mkdir -p "$runtime_directory/providers"

{
  printf '%s\n' \
    'mixed-port: 7890' \
    'allow-lan: true' \
    "bind-address: '*'" \
    'mode: rule' \
    'log-level: warning' \
    'ipv6: false' \
    'proxy-providers:' \
    '  nofox:'

  if [ -s "$persisted_provider" ]; then
    if ! grep -q '^[[:space:]]*proxies:' "$persisted_provider"; then
      echo "Persisted NoFox provider is not a Clash provider" >&2
      exit 1
    fi

    cp "$persisted_provider" "$runtime_directory/providers/nofox.yaml"
    printf '%s\n' \
      '    type: file' \
      '    path: ./providers/nofox.yaml'
  else
    if [ -z "${NOFOX_SUBSCRIPTION_URL:-}" ]; then
      echo "A persisted NoFox provider or NOFOX_SUBSCRIPTION_URL is required" >&2
      exit 1
    fi

    case "$NOFOX_SUBSCRIPTION_URL" in
      https://*) ;;
      *)
        echo "NOFOX_SUBSCRIPTION_URL must use HTTPS" >&2
        exit 1
        ;;
    esac

    escaped_subscription_url=$(printf '%s' "$NOFOX_SUBSCRIPTION_URL" | sed "s/'/''/g")
    printf '%s\n' '    type: http'
    printf "    url: '%s'\n" "$escaped_subscription_url"
    printf '%s\n' \
      '    path: ./providers/nofox.yaml' \
      '    interval: 3600' \
      '    header:' \
      '      User-Agent:' \
      "        - 'FlClashX'"
  fi

  printf '%s\n' \
    '    health-check:' \
    '      enable: true' \
    "      url: 'https://api.telegram.org'" \
    '      interval: 300' \
    'proxy-groups:' \
    '  - name: TELEGRAM' \
    '    type: url-test' \
    '    use:' \
    '      - nofox' \
    "    url: 'https://api.telegram.org'" \
    '    interval: 300' \
    'rules:' \
    '  - MATCH,TELEGRAM'
} > "$runtime_directory/config.yaml"

exec /mihomo -d "$runtime_directory"
