import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";
import { BROWSER_PROFILES, TRAFFIC_SOURCES } from "./src/data.js";

// ─── ENV ──────────────────────────────────────────────────────────────────────
if (!__ENV.TARGET_URL) {
    throw new Error("TARGET_URL is required");
}

const BASE = __ENV.TARGET_URL.endsWith("/")
    ? __ENV.TARGET_URL.slice(0, -1)
    : __ENV.TARGET_URL;

const INSTANCE       = Number(__ENV.INSTANCE)        || 1;
const TOTAL_INSTANCES = Number(__ENV.TOTAL_INSTANCES) || 1;
const VUS            = Number(__ENV.VUS)              || 50;

// ─── WORDLIST (init stage — open() only allowed here) ─────────────────────────
// Each VU gets paths[__VU - 1]; VUs beyond the list length fall back to "/".
let WORDLIST_PATHS = [];
try {
    const raw = open("wordlists/common.txt");
    WORDLIST_PATHS = raw
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => (l.startsWith("/") ? l : "/" + l));
    console.log(`Loaded ${WORDLIST_PATHS.length} paths from wordlists/common.txt`);
} catch (_) {
    // file absent — handled in setup()
}

// ─── SITEMAP LOADER ───────────────────────────────────────────────────────────
function loadSitemapPaths() {
    try {
        const res = http.get(BASE + "/sitemap.xml", { timeout: "5s" });

        if (res.status !== 200) {
            console.log(`Sitemap HTTP ${res.status} — skipping`);
            return null;
        }

        const locs = res.body.match(/<loc>.*?<\/loc>/g) || [];
        console.log(`Found ${locs.length} <loc> entries in sitemap`);

        const paths = new Set();
        locs.forEach((loc, i) => {
            const url  = loc.replace(/<\/?loc>/g, "").trim();
            const m    = url.match(/https?:\/\/[^/]*(\/.*)?/);
            const path = m && m[1] ? m[1] : "/";
            paths.add(path);
            if (i < 5) console.log(`  [${i + 1}] ${path}`);
        });

        const all = Array.from(paths);
        console.log(`✓ Sitemap: ${all.length} unique paths`);
        return all;
    } catch (e) {
        console.log(`✗ Sitemap fetch error: ${e}`);
        return null;
    }
}

// ─── SETUP ────────────────────────────────────────────────────────────────────
// Returns { mode, paths } consumed by default() and teardown().
export function setup() {
    // ── Sitemap mode ──────────────────────────────────────────────────────────
    const allPaths = loadSitemapPaths();

    if (allPaths && allPaths.length > 0) {
        // Divide sitemap evenly across instances; this instance gets its slice.
        const chunkSize    = Math.ceil(allPaths.length / TOTAL_INSTANCES);
        const start        = (INSTANCE - 1) * chunkSize;
        const instancePaths = allPaths.slice(start, start + chunkSize);

        console.log(
            `Instance ${INSTANCE}/${TOTAL_INSTANCES}: ` +
            `assigned paths [${start}..${start + instancePaths.length - 1}] ` +
            `(${instancePaths.length} paths)`
        );

        return { mode: "sitemap", paths: instancePaths };
    }

    // ── Wordlist mode ─────────────────────────────────────────────────────────
    if (WORDLIST_PATHS.length > 0) {
        // VU assignment (see pickPath):
        //   VU __VU (1-based) → WORDLIST_PATHS[__VU - 1]  (if it exists)
        //   otherwise → "/"
        const effective = Math.min(WORDLIST_PATHS.length, VUS);
        console.log(
            `No sitemap. Wordlist mode: ${WORDLIST_PATHS.length} words, ` +
            `${VUS} VUs → ${effective} VUs get a unique path, ` +
            `${Math.max(0, VUS - effective)} VUs fall back to /`
        );
        return { mode: "wordlist", paths: WORDLIST_PATHS };
    }

    // ── Fallback ──────────────────────────────────────────────────────────────
    console.log("⚠ No sitemap or wordlist. All page requests will target /");
    return { mode: "root", paths: ["/"] };
}

// ─── METRICS ──────────────────────────────────────────────────────────────────
export const failedRequests = new Rate("failed_requests");
export const slowRequests   = new Rate("slow_requests");
export const perPathTrend   = new Trend("per_path_duration");

// ─── TRACKING ─────────────────────────────────────────────────────────────────
let slowMap    = {};
let failMap    = {};
let notFoundMap = {};

// ─── OPTIONS ──────────────────────────────────────────────────────────────────
export const options = {
    vus:      VUS,
    duration: __ENV.DURATION || "30s",
    thresholds: {
        failed_requests:  ["rate<0.05"],
        slow_requests:    ["rate<0.10"],
        http_req_duration: ["p(95)<700"],
    },
    setupTimeout: "30s",
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function pickBrowserProfile() {
    return BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)];
}

function pickReferrer() {
    return TRAFFIC_SOURCES[Math.floor(Math.random() * TRAFFIC_SOURCES.length)];
}

/**
 * Path selection strategy:
 *
 * sitemap  → random from this instance's slice
 * wordlist → VU-index based:
 *              __VU (1-based) ≤ paths.length  →  paths[__VU - 1]
 *              __VU > paths.length             →  "/"
 * root     → always "/"
 */
function pickPath(data) {
    if (data.mode === "sitemap") {
        return data.paths[Math.floor(Math.random() * data.paths.length)];
    }

    if (data.mode === "wordlist") {
        const idx = __VU - 1; // __VU is 1-based
        return idx < data.paths.length ? data.paths[idx] : "/";
    }

    return "/";
}

function mergeHeaders(base, extra) {
    return Object.assign({}, base, extra);
}

// ─── MAIN TEST ────────────────────────────────────────────────────────────────
export default function (data) {
    const profile = pickBrowserProfile();
    const jar     = http.cookieJar();

    const headers = {
        "user-agent":               profile.ua,
        "accept":                   "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "accept-language":          profile.languages,
        "accept-encoding":          "gzip, deflate, br",
        "connection":               "keep-alive",
        "upgrade-insecure-requests": "1",
        "cache-control":            "no-cache",
    };

    for (const key in profile.hints) {
        headers[key.toLowerCase()] = profile.hints[key];
    }

    if (profile.mobile) {
        headers["sec-ch-ua-mobile"] = "?1";
    }

    const ref = pickReferrer();
    if (ref) headers["referer"] = ref;

    // Landing page warm-up
    http.get(BASE + "/", {
        headers,
        jar,
        expectedStatuses: [200, 301, 302, 304, 307, 308, 404],
    });

    sleep(1 + Math.random());

    // Target path request
    const path = pickPath(data);
    const url  = BASE + path;

    const res = http.get(url, {
        headers: mergeHeaders(headers, { referer: BASE + "/" }),
        jar,
        tags: { path },
        expectedStatuses: [200, 301, 302, 304, 307, 308, 404],
    });

    const duration     = res.timings.duration;
    const isSlow       = duration > 700;
    const isServerError = res.status >= 500;

    perPathTrend.add(duration, { path });
    slowRequests.add(isSlow);
    failedRequests.add(isServerError);

    if (isSlow) {
        slowMap[path] = (slowMap[path] || 0) + 1;
        console.log(`SLOW ${duration.toFixed(0)}ms  ${path}`);
    }

    if (isServerError) {
        failMap[path] = (failMap[path] || 0) + 1;
        console.log(`SERVER ERROR ${res.status}  ${path}`);
    }

    if (res.status === 404) {
        notFoundMap[path] = (notFoundMap[path] || 0) + 1;
    }

    check(res, { "status ok": (r) => r.status < 500 });

    sleep(0.5 + Math.random() * 1.5);
}

// ─── SUMMARY EXPORT ───────────────────────────────────────────────────────────
export function handleSummary(data) {
    return {
        "summary.json":          JSON.stringify(data, null, 2),
        "slow-endpoints.json":   JSON.stringify(slowMap, null, 2),
        "failed-endpoints.json": JSON.stringify(failMap, null, 2),
        "notfound-endpoints.json": JSON.stringify(notFoundMap, null, 2),
    };
}

// ─── TEARDOWN ─────────────────────────────────────────────────────────────────
export function teardown(data) {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Test Summary  [instance ${INSTANCE}/${TOTAL_INSTANCES}]  mode: ${data.mode}`);
    console.log("Slow Endpoints:", Object.keys(slowMap).length > 0 ? JSON.stringify(slowMap) : "None");
    console.log("Failed Endpoints:", Object.keys(failMap).length > 0 ? JSON.stringify(failMap) : "None");
    console.log("Not Found (404):", Object.keys(notFoundMap).length > 0 ? JSON.stringify(notFoundMap) : "None");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}
