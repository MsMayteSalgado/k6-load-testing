#!/usr/bin/env bash

set -e

DIR=$1

FILES=$(find "$DIR" -type f -name "summary-*.json" 2>/dev/null || true)

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

  REQS=$(jq -r '.metrics.http_reqs.count // 0' "$f")
  FAIL_RATE=$(jq -r '.metrics.failed_requests.rate // 0' "$f")
  P95=$(jq -r '.metrics.http_req_duration["p(95)"] // 0' "$f")
  AVG=$(jq -r '.metrics.http_req_duration.avg // 0' "$f")

  REQS=${REQS:-0}
  FAIL_RATE=${FAIL_RATE:-0}
  P95=${P95:-0}
  AVG=${AVG:-0}

  REQS=$(printf "%.0f" "$REQS")
  FAIL_RATE=$(printf "%.4f" "$FAIL_RATE")
  P95=$(printf "%.0f" "$P95")
  AVG=$(printf "%.0f" "$AVG")

  NAME=$(basename "$f" .json)
  NAME=${NAME#summary-}
  INSTANCE=${NAME##*-}
  REGION=${NAME%-*}

  if [ "$REQS" -eq 0 ]; then
    continue
  fi

  FAIL_REQS=$(echo "$REQS * $FAIL_RATE" | bc)
  TOTAL_REQS=$(echo "$TOTAL_REQS + $REQS" | bc)
  TOTAL_FAIL_REQS=$(echo "$TOTAL_FAIL_REQS + $FAIL_REQS" | bc)
  TOTAL_DURATION=$(echo "$TOTAL_DURATION + ($REQS * $AVG)" | bc)

  echo "| $REGION | $INSTANCE | $REQS | $FAIL_RATE | $P95 | $AVG |" >> "$GITHUB_STEP_SUMMARY"

done

# global metrics
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

# slow endpoints
echo "" >> "$GITHUB_STEP_SUMMARY"
echo "### Top Slow Endpoints" >> "$GITHUB_STEP_SUMMARY"

find "$DIR" -name "slow-endpoints.json" -exec cat {} \; 2>/dev/null \
  | jq -s 'add // {} | to_entries | sort_by(-.value) | .[:10]' \
  >> "$GITHUB_STEP_SUMMARY"

# failed endpoints
echo "" >> "$GITHUB_STEP_SUMMARY"
echo "### Top Failed Endpoints" >> "$GITHUB_STEP_SUMMARY"

find "$DIR" -name "failed-endpoints.json" -exec cat {} \; 2>/dev/null \
  | jq -s 'add // {} | to_entries | sort_by(-.value) | .[:10]' \
  >> "$GITHUB_STEP_SUMMARY"