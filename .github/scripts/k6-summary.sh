#!/usr/bin/env bash

FILE=$1
REGION=$2
INSTANCE=$3

REQS=$(jq '.metrics.http_reqs.values.count // 0' "$FILE")
FAIL_RATE=$(jq '.metrics.failed_requests.values.rate // 0' "$FILE")
P95=$(jq '.metrics.http_req_duration.values["p(95)"] // 0' "$FILE")

echo "## k6 Load Test Summary" >> $GITHUB_STEP_SUMMARY
echo "" >> $GITHUB_STEP_SUMMARY

echo "- Region: $REGION" >> $GITHUB_STEP_SUMMARY
echo "- Instance: $INSTANCE" >> $GITHUB_STEP_SUMMARY
echo "- Total Requests: $REQS" >> $GITHUB_STEP_SUMMARY
echo "- Failure Rate: $FAIL_RATE" >> $GITHUB_STEP_SUMMARY
echo "- P95 Latency (ms): $P95" >> $GITHUB_STEP_SUMMARY