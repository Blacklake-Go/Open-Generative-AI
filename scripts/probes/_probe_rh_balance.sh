#!/usr/bin/env bash
set -a; . /etc/supdance.env; set +a
curl -s "https://www.runninghub.ai/api/openapi/v2/user/remain" \
  -H "Content-Type: application/json" \
  -d "{\"apiKey\":\"${RUNNINGHUB_API_KEY}\"}"
echo ""
