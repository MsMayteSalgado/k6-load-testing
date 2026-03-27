import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";
import { BROWSER_PROFILES, TRAFFIC_SOURCES } from "./src/data.js";

// ✅ load file once
const COMMON_PATHS = open("./wordlists/common.txt")
    .split("\n")
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => p.startsWith("/") ? p : "/" + p);

export const failedRequests = new Rate("failed_requests");

const targetUrl = __ENV.TARGET_URL || "https://localhost:3000/";

export const options = {
    vus: Number(__ENV.VUS) || 100,
    duration: __ENV.DURATION || "30s",
    thresholds: {
        failed_requests: ["rate<0.01"],
        http_req_duration: ["p(95)<700"],
    },
};

function pickBrowserProfile() {
    return BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)];
}

function pickReferrer() {
    return TRAFFIC_SOURCES[Math.floor(Math.random() * TRAFFIC_SOURCES.length)];
}

// ✅ pick random path
function pickPath() {
    if (!COMMON_PATHS || COMMON_PATHS.length === 0) {
        return "/";
    }
    return COMMON_PATHS[Math.floor(Math.random() * COMMON_PATHS.length)];
}

function mergeHeaders(base, extra) {
    return Object.assign({}, base, extra);
}

export default function () {
    const profile = pickBrowserProfile();
    const jar = http.cookieJar();

    const headers = {
        "user-agent": profile.ua,
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "accept-language": profile.languages,
        "accept-encoding": "gzip, deflate, br",
        "connection": "keep-alive",
        "upgrade-insecure-requests": "1",
        "cache-control": "no-cache",
    };

    for (const key in profile.hints) {
        headers[key.toLowerCase()] = profile.hints[key];
    }

    if (profile.mobile) {
        headers["sec-ch-ua-mobile"] = "?1";
    }

    const ref = pickReferrer();
    if (ref) {
        headers["referer"] = ref;
    }

    // ---- Step 1: landing ----
    const res1 = http.get(targetUrl, { headers, jar });

    const ok1 = check(res1, {
        "landing status 200": (r) => r.status === 200,
        "landing < 700ms": (r) => r.timings.duration < 700,
    });

    sleep(1 + Math.random());

    // ---- Step 2: random page from common.txt ----
    const path = pickPath();
    const base = targetUrl.endsWith("/") ? targetUrl.slice(0, -1) : targetUrl;
    const url = base + path;

    const res2 = http.get(url, {
        headers: mergeHeaders(headers, { referer: targetUrl }),
        jar,
    });

    const ok2 = check(res2, {
        "page status 200": (r) => r.status === 200,
        "page < 700ms": (r) => r.timings.duration < 700,
    });

    failedRequests.add(!(ok1 && ok2));

    sleep(1 + Math.random() * 2);
}
