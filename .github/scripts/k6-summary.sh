#!/usr/bin/env bash

FILE=$1
REGION=$2
INSTANCE=$3

# Correct paths for summary-export
REQS=$(jq -r '.metrics.http_reqs.count // 0' "$FILE" | head -n1 | tr -d '[:space:]')
FAIL_RATE=$(jq -r '.metrics.failed_requests.rate // 0' "$FILE" | head -n1 | tr -d '[:space:]')
P95=$(jq -r '.metrics.http_req_duration["p(95)"] // 0' "$FILE" | head -n1 | tr -d '[:space:]')

# Fallback safety
REQS=${REQS:-0}
FAIL_RATE=${FAIL_RATE:-0}
P95=${P95:-0}

# Ensure numeric only
REQS=$(echo "$REQS" | grep -Eo '[0-9.]+' | head -n1)
FAIL_RATE=$(echo "$FAIL_RATE" | grep -Eo '[0-9.]+' | head -n1)
P95=$(echo "$P95" | grep -Eo '[0-9.]+' | head -n1)

REQS=${REQS:-0}
FAIL_RATE=${FAIL_RATE:-0}
P95=${P95:-0}

# Output table
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