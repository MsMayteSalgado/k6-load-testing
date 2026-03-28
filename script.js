import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// ─── SAFE DATA IMPORT WITH FALLBACKS ───────────────────────────────────────
let BROWSER_PROFILES, TRAFFIC_SOURCES;

try {
    const data = await import("./src/data.js");
    BROWSER_PROFILES = data.BROWSER_PROFILES;
    TRAFFIC_SOURCES = data.TRAFFIC_SOURCES;
} catch (e) {
    console.warn("Failed to import src/data.js, using fallback profiles");
    BROWSER_PROFILES = [
        {
            name: "chrome-default",
            ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            hints: {},
            mobile: false,
            languages: "en-US,en;q=0.9",
        },
    ];
    TRAFFIC_SOURCES = ["https://www.google.com/", ""];  
}

// ─── LRU CACHE IMPLEMENTATION ──────────────────────────────────────────────
class LRUCache {
    constructor(maxSize = 1000) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        this.cache.set(key, value);
        if (this.cache.size > this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
    }

    get(key) {
        if (!this.cache.has(key)) return undefined;
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    clear() {
        this.cache.clear();
    }
}

// ─── ENV ──────────────────────────────────────────────────────────────────────
if (!__ENV.TARGET_URL) {
    throw new Error("TARGET_URL is required");
}

const BASE = __ENV.TARGET_URL.endsWith("/")
    ? __ENV.TARGET_URL.slice(0, -1)
    : __ENV.TARGET_URL;

const INSTANCE = Number(__ENV.INSTANCE) || 1;
const TOTAL_INSTANCES = Number(__ENV.TOTAL_INSTANCES) || 1;
const VUS = Number(__ENV.VUS) || 50;
const MAX_MAP_SIZE = Number(__ENV.MAX_MAP_SIZE) || 1000;

const USE_SITEMAP = (__ENV.USE_SITEMAP || "true") === "true";
const USE_WORDLIST = (__ENV.USE_WORDLIST || "true") === "true";

// ─── OPTIMIZED TRACKING WITH LRU CACHES ───────────────────────────────────
const slowMap = new LRUCache(MAX_MAP_SIZE);
const failMap = new LRUCache(MAX_MAP_SIZE);
const notFoundMap = new LRUCache(MAX_MAP_SIZE);

// ─── CACHED INDEX ARRAYS ──────────────────────────────────────────────────
let profileIndices = [];
let trafficIndices = [];

function initializeIndices() {
    profileIndices = Array.from(
        { length: BROWSER_PROFILES.length },
        (_, i) => i
    );
    trafficIndices = Array.from(
        { length: TRAFFIC_SOURCES.length },
        (_, i) => i
    );
}

// ─── WORDLIST (init stage — open() only allowed here) ────────────────────
let WORDLIST_PATHS = [];

if (USE_WORDLIST) {
    try {
        const raw = open("wordlists/common.txt");
        WORDLIST_PATHS = raw
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => (l.startsWith("/") ? l : "/" + l));
        console.log(`Loaded ${WORDLIST_PATHS.length} paths from wordlists/common.txt`);
    } catch (_) {
        console.log("wordlists/common.txt not found or unreadable — wordlist disabled");
    }
} else {
    console.log("USE_WORDLIST=false — skipping wordlists/common.txt");
}

// ─── OPTIMIZED XML PARSER FOR SITEMAP ─────────────────────────────────────
function parseSitemapXML(xmlBody) {
    const paths = new Set();
    const locPattern = /<loc>([^<]+)<\/loc>/g;
    let match;

    while ((match = locPattern.exec(xmlBody)) !== null) {
        const url = match[1].trim();
        const pathMatch = url.match(/https?:\/\/[^/]*(\/.*)?/);
        const path = (pathMatch && pathMatch[1]) ? pathMatch[1] : "/";
        paths.add(path);
    }

    return Array.from(paths);
}

// ─── SITEMAP LOADER ───────────────────────────────────────────────────────
function loadSitemapPaths() {
    try {
        const res = http.get(BASE + "/sitemap.xml", { timeout: "5s" });

        if (res.status !== 200) {
            console.log(`Sitemap HTTP ${res.status} — skipping`);
            return null;
        }

        const paths = parseSitemapXML(res.body);
        console.log(`Found ${paths.length} paths from sitemap`);

        if (paths.length > 0) {
            for (let i = 0; i < Math.min(5, paths.length); i++) {
                console.log(`  [${i + 1}] ${paths[i]}`);
            }
        }

        console.log(`✓ Sitemap: ${paths.length} unique paths`);
        return paths;
    } catch (e) {
        console.log(`✗ Sitemap fetch error: ${e}`);
        return null;
    }
}

// ─── SETUP ────────────────────────────────────────────────────────────────
export function setup() {
    initializeIndices();

    if (USE_SITEMAP) {
        const allPaths = loadSitemapPaths();

        if (allPaths && allPaths.length > 0) {
            const chunkSize = Math.ceil(allPaths.length / TOTAL_INSTANCES);
            const start = (INSTANCE - 1) * chunkSize;
            const instancePaths = allPaths.slice(start, start + chunkSize);

            console.log(
                `Instance ${INSTANCE}/${TOTAL_INSTANCES}: ` +
                `sitemap slice [${start}..${start + instancePaths.length - 1}] ` +
                `(${instancePaths.length} paths)`
            );

            return { mode: "sitemap", paths: instancePaths };
        }

        console.log("USE_SITEMAP=true but sitemap unavailable — falling through");
    } else {
        console.log("USE_SITEMAP=false — skipping sitemap");
    }

    if (USE_WORDLIST && WORDLIST_PATHS.length > 0) {
        const effective = Math.min(WORDLIST_PATHS.length, VUS);
        console.log(
            `Wordlist mode: ${WORDLIST_PATHS.length} words, ${VUS} VUs → ` +
            `${effective} VUs get a unique path, ` +
            `${Math.max(0, VUS - effective)} VUs fall back to /`
        );
        return { mode: "wordlist", paths: WORDLIST_PATHS };
    }

    console.log("⚠ No sitemap or wordlist active — all requests will target /");
    return { mode: "root", paths: ["/"] };
}

// ─── METRICS ──────────────────────────────────────────────────────────────
export const failedRequests = new Rate("failed_requests");
export const slowRequests = new Rate("slow_requests");
export const perPathTrend = new Trend("per_path_duration");

// ─── OPTIONS ──────────────────────────────────────────────────────────────
export const options = {
    vus: VUS,
    duration: __ENV.DURATION || "30s",
    thresholds: {
        failed_requests: ["rate<0.05"],
        slow_requests: ["rate<0.10"],
        http_req_duration: ["p(95)<700"],
    },
    setupTimeout: "30s",
};

// ─── OPTIMIZED HELPERS ────────────────────────────────────────────────────
function pickRandomIndex(indices) {
    return indices[Math.floor(Math.random() * indices.length)];
}

function pickBrowserProfile() {
    return BROWSER_PROFILES[pickRandomIndex(profileIndices)];
}

function pickReferrer() {
    return TRAFFIC_SOURCES[pickRandomIndex(trafficIndices)];
}

function pickPath(data) {
    if (data.mode === "sitemap") {
        return data.paths[Math.floor(Math.random() * data.paths.length)];
    }

    if (data.mode === "wordlist") {
        const idx = __VU - 1;
        return idx < data.paths.length ? data.paths[idx] : "/";
    }

    return "/";
}

// ─── MAIN TEST ────────────────────────────────────────────────────────────
export default function (data) {
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

    // Spread profile hints directly
    Object.keys(profile.hints).forEach((key) => {
        headers[key.toLowerCase()] = profile.hints[key];
    });

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
    const url = BASE + path;

    const res = http.get(url, {
        headers: { ...headers, referer: BASE + "/" },
        jar,
        tags: { path },
        expectedStatuses: [200, 301, 302, 304, 307, 308, 404],
    });

    const duration = res.timings.duration;
    const isSlow = duration > 700;
    const isServerError = res.status >= 500;

    perPathTrend.add(duration, { path });
    slowRequests.add(isSlow);
    failedRequests.add(isServerError);

    if (isSlow) {
        const count = (slowMap.get(path) || 0) + 1;
        slowMap.set(path, count);
        console.log(`SLOW ${duration.toFixed(0)}ms  ${path}`);
    }

    if (isServerError) {
        const count = (failMap.get(path) || 0) + 1;
        failMap.set(path, count);
        console.log(`SERVER ERROR ${res.status}  ${path}`);
    }

    if (res.status === 404) {
        const count = (notFoundMap.get(path) || 0) + 1;
        notFoundMap.set(path, count);
    }

    check(res, { "status ok": (r) => r.status < 500 });

    sleep(0.5 + Math.random() * 1.5);
}

// ─── SUMMARY EXPORT ───────────────────────────────────────────────────────
function convertMapToObject(lruCache) {
    const obj = {};
    lruCache.cache.forEach((value, key) => {
        obj[key] = value;
    });
    return obj;
}

export function handleSummary(data) {
    return {
        "summary.json": JSON.stringify(data, null, 2),
        "slow-endpoints.json": JSON.stringify(convertMapToObject(slowMap), null, 2),
        "failed-endpoints.json": JSON.stringify(convertMapToObject(failMap), null, 2),
        "notfound-endpoints.json": JSON.stringify(convertMapToObject(notFoundMap), null, 2),
    };
}

// ─── TEARDOWN ──────────────────────────────────────────────────────────────
export function teardown(data) {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Test Summary  [instance ${INSTANCE}/${TOTAL_INSTANCES}]  mode: ${data.mode}`);
    console.log(`Flags: USE_SITEMAP=${USE_SITEMAP}  USE_WORDLIST=${USE_WORDLIST}`);
    console.log("Slow Endpoints:", slowMap.cache.size > 0 ? JSON.stringify(convertMapToObject(slowMap)) : "None");
    console.log("Failed Endpoints:", failMap.cache.size > 0 ? JSON.stringify(convertMapToObject(failMap)) : "None");
    console.log("Not Found (404):", notFoundMap.cache.size > 0 ? JSON.stringify(convertMapToObject(notFoundMap)) : "None");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Cleanup
    slowMap.clear();
    failMap.clear();
    notFoundMap.clear();
}