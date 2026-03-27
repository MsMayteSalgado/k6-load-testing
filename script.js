import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";
import { BROWSER_PROFILES, TRAFFIC_SOURCES } from "./src/data.js";

// require target
if (!__ENV.TARGET_URL) {
    throw new Error("TARGET_URL is required");
}

// normalize URL
const BASE = __ENV.TARGET_URL.endsWith("/")
    ? __ENV.TARGET_URL.slice(0, -1)
    : __ENV.TARGET_URL;

// load paths dynamically from target website sitemap
function loadPathsFromTarget() {
    try {
        // Try to fetch sitemap.xml
        const sitemapRes = http.get(BASE + "/sitemap.xml", {
            timeout: "5s",
        });

        if (sitemapRes.status === 200) {
            const sitemapPaths = sitemapRes.body.match(/<loc>.*?<\/loc>/g) || [];
            const paths = new Set();
            sitemapPaths.forEach(loc => {
                const url = loc.replace(/<\/?loc>/g, "");
                const path = url.replace(/https?:\/\/[^/]*/, "");
                if (path) paths.add(path);
            });
            console.log(`✓ Loaded ${sitemapPaths.length} paths from sitemap.xml`);
            return Array.from(paths);
        }
    } catch (e) {
        console.log("✗ Could not fetch sitemap.xml");
    }

    return null;
}

// load paths
const PATHS = loadPathsFromTarget();

if (!PATHS || !PATHS.length) {
    console.log("⚠ No sitemap.xml found. Page requests will be skipped.");
}

// metrics
export const failedRequests = new Rate("failed_requests");
export const slowRequests = new Rate("slow_requests");
export const perPathTrend = new Trend("per_path_duration");

// tracking maps
let slowMap = {};
let failMap = {};
let notFoundMap = {};

export const options = {
    vus: Number(__ENV.VUS) || 50,
    duration: __ENV.DURATION || "30s",
    thresholds: {
        failed_requests: ["rate<0.05"],
        slow_requests: ["rate<0.10"],
        http_req_duration: ["p(95)<700"],
    },
};

// helpers
function pickBrowserProfile() {
    return BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)];
}

function pickReferrer() {
    return TRAFFIC_SOURCES[Math.floor(Math.random() * TRAFFIC_SOURCES.length)];
}

function pickPath() {
    return PATHS[Math.floor(Math.random() * PATHS.length)];
}

function mergeHeaders(base, extra) {
    return Object.assign({}, base, extra);
}

// main test
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

    // landing
    http.get(BASE + "/", { headers, jar, expectedStatuses: [200, 301, 302, 304, 307, 308, 404] });

    sleep(1 + Math.random());

    // page request - only if sitemap was found
    if (!PATHS || PATHS.length === 0) {
        console.log("⚠ Skipping page request - no sitemap.xml found");
        return;
    }

    const path = pickPath();
    const url = BASE + path;

    const res = http.get(url, {
        headers: mergeHeaders(headers, { referer: BASE + "/" }),
        jar,
        tags: { path: path },
        expectedStatuses: [200, 301, 302, 304, 307, 308, 404],
    });

    const duration = res.timings.duration;

    // metrics
    perPathTrend.add(duration, { path: path });

    const isSlow = duration > 700;
    const isServerError = res.status >= 500;

    slowRequests.add(isSlow);
    failedRequests.add(isServerError);

    // track slow
    if (isSlow) {
        slowMap[path] = (slowMap[path] || 0) + 1;
        console.log(`SLOW ${duration}ms ${path}`);
    }

    // track server errors
    if (isServerError) {
        failMap[path] = (failMap[path] || 0) + 1;
        console.log(`SERVER ERROR ${res.status} ${path}`);
    }

    // track 404 separately
    if (res.status === 404) {
        notFoundMap[path] = (notFoundMap[path] || 0) + 1;
    }

    // validation
    check(res, {
        "status ok": (r) => r.status < 500,
    });

    sleep(0.5 + Math.random() * 1.5);
}

// export results
export function handleSummary(data) {
    return {
        "summary.json": JSON.stringify(data, null, 2),
        "slow-endpoints.json": JSON.stringify(slowMap, null, 2),
        "failed-endpoints.json": JSON.stringify(failMap, null, 2),
        "notfound-endpoints.json": JSON.stringify(notFoundMap, null, 2),
    };
}
