import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";
import { BROWSER_PROFILES, TRAFFIC_SOURCES } from "./src/data.js";

export const failedRequests = new Rate("failed_requests");

const targetUrl = __ENV.TARGET_URL || "https://localhost:3000/";

export function pickBrowserProfile() {
    return BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)];
}

export function pickReferrer() {
    return TRAFFIC_SOURCES[Math.floor(Math.random() * TRAFFIC_SOURCES.length)];
}

export const options = {
    vus: Number(__ENV.VUS) || 100,
    duration: __ENV.DURATION || "30s",
    thresholds: {
        failed_requests: ["rate<0.01"],
        http_req_duration: ["p(95)<700"],
    },
};

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

    // Attach client hints
    for (const key in profile.hints) {
        headers[key.toLowerCase()] = profile.hints[key];
    }

    // Mobile consistency
    if (profile.mobile) {
        headers["sec-ch-ua-mobile"] = "?1";
    }

    // Referrer simulation
    const ref = pickReferrer();
    if (ref) {
        headers["referer"] = ref;
    }

    // ---- Step 1: landing page ----
    const res1 = http.get(targetUrl, {
        headers: headers,
        jar: jar,
    });

    const ok1 = check(res1, {
        "landing status 200": function (r) { return r.status === 200; },
        "landing < 700ms": function (r) { return r.timings.duration < 700; },
    });

    sleep(1 + Math.random());

    // ---- Step 2: navigation ----
    const nextPath = "/?page=" + Math.floor(Math.random() * 10);

    const res2 = http.get(targetUrl + nextPath, {
        headers: mergeHeaders(headers, { referer: targetUrl }),
        jar: jar,
    });

    const ok2 = check(res2, {
        "nav status 200": function (r) { return r.status === 200; },
        "nav < 700ms": function (r) { return r.timings.duration < 700; },
    });

    // ---- Step 3: asset fetch ----
    const asset = "/favicon.ico";

    http.get(targetUrl + asset, {
        headers: mergeHeaders(headers, { referer: targetUrl }),
        jar: jar,
    });

    const success = ok1 && ok2;
    failedRequests.add(!success);

    sleep(1 + Math.random() * 2);
}