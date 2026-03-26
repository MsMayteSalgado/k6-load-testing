#!/usr/bin/env bash

FILE=$1
REGION=$2
INSTANCE=$3

REQS=$(jq -r '.metrics.http_reqs.values.count // 0' "$FILE" | tr -d '\n')
FAIL_RATE=$(jq -r '.metrics.failed_requests.values.rate // 0' "$FILE" | tr -d '\n')
P95=$(jq -r '.metrics.http_req_duration.values["p(95)"] // 0' "$FILE" | tr -d '\n')

REQS=${REQS:-0}
FAIL_RATE=${FAIL_RATE:-0}
P95=${P95:-0}

{
  echo "## k6 Load Test Summary"
  echo ""
  echo "| Metric | Value |"
  echo "|---|---|"
  echo "| Region | $REGION |"
  echo "| Instance | $INSTANCE |"
  echo "| Total Requests | $REQS |"
  echo "| Failure Rate | $FAIL_RATE |"
  echo "| P95 Latency (ms) | $P95 |"
  echo ""
} >> "$GITHUB_STEP_SUMMARY"