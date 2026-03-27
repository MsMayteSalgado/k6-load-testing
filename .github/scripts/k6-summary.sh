#!/usr/bin/env bash

FILE=$1
REGION=$2
INSTANCE=$3

# Extract values (correct for summary-export)
REQS=$(jq -r '.metrics.http_reqs.count // 0' "$FILE")
FAIL_RATE=$(jq -r '.metrics.failed_requests.rate // 0' "$FILE")
P95=$(jq -r '.metrics.http_req_duration["p(95)"] // 0' "$FILE")

# Fallback safety
REQS=${REQS:-0}
FAIL_RATE=${FAIL_RATE:-0}
P95=${P95:-0}

# Format values
REQS=$(printf "%.0f" "$REQS")
FAIL_RATE=$(printf "%.4f" "$FAIL_RATE")
P95=$(printf "%.0f" "$P95")

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