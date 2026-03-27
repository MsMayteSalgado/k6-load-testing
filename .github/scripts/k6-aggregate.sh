#!/usr/bin/env bash

DIR=$1

FILES=$(find "$DIR" -type f -name "*.json")

TOTAL_REQS=0
TOTAL_FAIL_REQS=0
TOTAL_DURATION=0

{
  echo "## Combined k6 Load Test Summary"
  echo ""
  echo "| Region | Instance | Requests | Fail Rate | P95 (ms) | Avg Latency (ms) |"
  echo "|---|---|---|---|---|---|"
} >> "$GITHUB_STEP_SUMMARY"

for f in $FILES; do

  # ✅ Correct paths for summary-export
  REQS=$(jq -r '.metrics.http_reqs.count // 0' "$f" | head -n1 | tr -d '[:space:]')
  FAIL_RATE=$(jq -r '.metrics.failed_requests.rate // 0' "$f" | head -n1 | tr -d '[:space:]')
  P95=$(jq -r '.metrics.http_req_duration["p(95)"] // 0' "$f" | head -n1 | tr -d '[:space:]')
  AVG=$(jq -r '.metrics.http_req_duration.avg // 0' "$f" | head -n1 | tr -d '[:space:]')

  # Fallback safety
  REQS=${REQS:-0}
  FAIL_RATE=${FAIL_RATE:-0}
  P95=${P95:-0}
  AVG=${AVG:-0}

  # Ensure numeric only
  REQS=$(echo "$REQS" | grep -Eo '[0-9.]+' | head -n1)
  FAIL_RATE=$(echo "$FAIL_RATE" | grep -Eo '[0-9.]+' | head -n1)
  P95=$(echo "$P95" | grep -Eo '[0-9.]+' | head -n1)
  AVG=$(echo "$AVG" | grep -Eo '[0-9.]+' | head -n1)

  REQS=${REQS:-0}
  FAIL_RATE=${FAIL_RATE:-0}
  P95=${P95:-0}
  AVG=${AVG:-0}

  NAME=$(basename "$f")

  REGION=$(echo "$NAME" | cut -d'-' -f2)
  INSTANCE=$(echo "$NAME" | cut -d'-' -f3 | cut -d'.' -f1)

  # Safe math
  FAIL_REQS=$(echo "$REQS * $FAIL_RATE" | bc 2>/dev/null || echo 0)

  TOTAL_REQS=$(echo "$TOTAL_REQS + $REQS" | bc)
  TOTAL_FAIL_REQS=$(echo "$TOTAL_FAIL_REQS + $FAIL_REQS" | bc)
  TOTAL_DURATION=$(echo "$TOTAL_DURATION + ($REQS * $AVG)" | bc)

  echo "| $REGION | $INSTANCE | $REQS | $FAIL_RATE | $P95 | $AVG |" >> "$GITHUB_STEP_SUMMARY"

done

# Global metrics
if [ "$TOTAL_REQS" -gt 0 ]; then
  WEIGHTED_LATENCY=$(echo "scale=2; $TOTAL_DURATION / $TOTAL_REQS" | bc)
  GLOBAL_FAIL_RATE=$(echo "scale=6; $TOTAL_FAIL_REQS / $TOTAL_REQS" | bc)
else
  WEIGHTED_LATENCY=0
  GLOBAL_FAIL_RATE=0
fi

{
  echo ""
  echo "### Global Metrics"
  echo ""
  echo "| Metric | Value |"
  echo "|---|---|"
  echo "| Total Requests | $TOTAL_REQS |"
  echo "| Failure Rate | $GLOBAL_FAIL_RATE |"
  echo "| Weighted Avg Latency (ms) | $WEIGHTED_LATENCY |"
} >> "$GITHUB_STEP_SUMMARY"