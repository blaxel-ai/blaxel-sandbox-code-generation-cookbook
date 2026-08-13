#!/bin/sh
set -eu

mkdir -p /home/builder /workspace
chown -R builder:builder /home/builder /workspace

exec /usr/local/bin/sandbox-api --user builder "$@"
