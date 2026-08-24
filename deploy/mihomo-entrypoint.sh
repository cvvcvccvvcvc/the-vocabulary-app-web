#!/bin/sh
set -eu

if [ -z "${NOFOX_SUBSCRIPTION_URL:-}" ]; then
  echo "NOFOX_SUBSCRIPTION_URL is required" >&2
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
runtime_directory=/tmp/vocabulary-mihomo
mkdir -p "$runtime_directory/providers"
umask 077

{
  printf '%s\n' \
    'mixed-port: 7890' \
    'allow-lan: true' \
    "bind-address: '*'" \
    'mode: rule' \
    'log-level: warning' \
    'ipv6: false' \
    'proxy-providers:' \
    '  nofox:' \
    '    type: http'
  printf "    url: '%s'\n" "$escaped_subscription_url"
  printf '%s\n' \
    '    path: ./providers/nofox.yaml' \
    '    interval: 3600' \
    '    header:' \
    '      User-Agent:' \
    "        - 'FlClashX'" \
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
