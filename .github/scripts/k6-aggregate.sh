#!/usr/bin/env bash

DIR=$1

FILES=$(find "$DIR" -name "*.json")

TOTAL_REQS=0
TOTAL_FAIL_REQS=0
TOTAL_DURATION=0

echo "## Combined k6 Load Test Summary" >> $GITHUB_STEP_SUMMARY
echo "" >> $GITHUB_STEP_SUMMARY

echo "| Region | Requests | Fail Rate | P95 (ms) | Avg Latency (ms) |" >> $GITHUB_STEP_SUMMARY
echo "|---|---|---|---|---|" >> $GITHUB_STEP_SUMMARY

for f in $FILES; do
  REQS=$(jq '.metrics.http_reqs.values.count' "$f")
  FAIL_RATE=$(jq '.metrics.failed_requests.values.rate' "$f")
  P95=$(jq '.metrics.http_req_duration.values["p(95)"]' "$f")
  AVG=$(jq '.metrics.http_req_duration.values.avg' "$f")

  # Extract region from filename
  NAME=$(basename "$f")
  REGION=$(echo "$NAME" | cut -d'-' -f2)

  FAIL_REQS=$(echo "$REQS * $FAIL_RATE" | bc)

  TOTAL_REQS=$(echo "$TOTAL_REQS + $REQS" | bc)
  TOTAL_FAIL_REQS=$(echo "$TOTAL_FAIL_REQS + $FAIL_REQS" | bc)
  TOTAL_DURATION=$(echo "$TOTAL_DURATION + ($REQS * $AVG)" | bc)

  echo "| $REGION | $REQS | $FAIL_RATE | $P95 | $AVG |" >> $GITHUB_STEP_SUMMARY
done

# ---- Global metrics ----

WEIGHTED_LATENCY=$(echo "scale=2; $TOTAL_DURATION / $TOTAL_REQS" | bc)
GLOBAL_FAIL_RATE=$(echo "scale=6; $TOTAL_FAIL_REQS / $TOTAL_REQS" | bc)

echo "" >> $GITHUB_STEP_SUMMARY
echo "### Global Metrics" >> $GITHUB_STEP_SUMMARY
echo "" >> $GITHUB_STEP_SUMMARY

echo "| Metric | Value |" >> $GITHUB_STEP_SUMMARY
echo "|---|---|" >> $GITHUB_STEP_SUMMARY
echo "| Total Requests | $TOTAL_REQS |" >> $GITHUB_STEP_SUMMARY
echo "| Failure Rate | $GLOBAL_FAIL_RATE |" >> $GITHUB_STEP_SUMMARY
echo "| Weighted Avg Latency (ms) | $WEIGHTED_LATENCY |" >> $GITHUB_STEP_SUMMARY