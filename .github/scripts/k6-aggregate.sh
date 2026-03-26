#!/usr/bin/env bash

DIR=$1

FILES=$(find "$DIR" -type f -name "*.json")

TOTAL_REQS=0
TOTAL_FAIL_REQS=0
TOTAL_DURATION=0

echo "## Combined k6 Load Test Summary" >> $GITHUB_STEP_SUMMARY
echo "" >> $GITHUB_STEP_SUMMARY

echo "| Region | Requests | Fail Rate | P95 | Avg Latency |" >> $GITHUB_STEP_SUMMARY
echo "|---|---|---|---|---|" >> $GITHUB_STEP_SUMMARY

for f in $FILES; do
  REQS=$(jq '.metrics.http_reqs.values.count // 0' "$f")
  FAIL_RATE=$(jq '.metrics.failed_requests.values.rate // 0' "$f")
  P95=$(jq '.metrics.http_req_duration.values["p(95)"] // 0' "$f")
  AVG=$(jq '.metrics.http_req_duration.values.avg // 0' "$f")

  NAME=$(basename "$f")

  REGION=$(echo "$NAME" | cut -d'-' -f2)
  INSTANCE=$(echo "$NAME" | cut -d'-' -f3 | cut -d'.' -f1)

  FAIL_REQS=$(echo "$REQS * $FAIL_RATE" | bc)

  TOTAL_REQS=$(echo "$TOTAL_REQS + $REQS" | bc)
  TOTAL_FAIL_REQS=$(echo "$TOTAL_FAIL_REQS + $FAIL_REQS" | bc)
  TOTAL_DURATION=$(echo "$TOTAL_DURATION + ($REQS * $AVG)" | bc)

  echo "| $REGION-$INSTANCE | $REQS | $FAIL_RATE | $P95 | $AVG |" >> $GITHUB_STEP_SUMMARY
done

if [ "$TOTAL_REQS" -gt 0 ]; then
  WEIGHTED_LATENCY=$(echo "scale=2; $TOTAL_DURATION / $TOTAL_REQS" | bc)
  GLOBAL_FAIL_RATE=$(echo "scale=6; $TOTAL_FAIL_REQS / $TOTAL_REQS" | bc)
else
  WEIGHTED_LATENCY=0
  GLOBAL_FAIL_RATE=0
fi

echo "" >> $GITHUB_STEP_SUMMARY
echo "### Global Metrics" >> $GITHUB_STEP_SUMMARY
echo "" >> $GITHUB_STEP_SUMMARY

echo "| Metric | Value |" >> $GITHUB_STEP_SUMMARY
echo "|---|---|" >> $GITHUB_STEP_SUMMARY
echo "| Total Requests | $TOTAL_REQS |" >> $GITHUB_STEP_SUMMARY
echo "| Failure Rate | $GLOBAL_FAIL_RATE |" >> $GITHUB_STEP_SUMMARY
echo "| Weighted Avg Latency (ms) | $WEIGHTED_LATENCY |" >> $GITHUB_STEP_SUMMARY