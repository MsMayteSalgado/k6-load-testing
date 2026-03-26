/**
 * Rich browser identity profiles.
 * Each profile includes a User-Agent + matching Client-Hint headers
 * so the simulated VU looks like a real, consistent browser identity.
 * Modern servers (Cloudflare, Nginx) fingerprint these together — mismatches
 * reveal synthetic traffic instantly. Keeping them paired is critical for
 * realistic soak and endurance testing.
 */
export const BROWSER_PROFILES = [
    {
        name: "chrome-windows",
        ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        hints: {
            "Sec-CH-UA": '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
            "Sec-CH-UA-Mobile": "?0",
            "Sec-CH-UA-Platform": '"Windows"',
        },
        mobile: false,
        languages: "en-US,en;q=0.9",
    },
    {
        name: "chrome-mac",
        ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        hints: {
            "Sec-CH-UA": '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
            "Sec-CH-UA-Mobile": "?0",
            "Sec-CH-UA-Platform": '"macOS"',
        },
        mobile: false,
        languages: "en-GB,en;q=0.9",
    },
    {
        name: "edge-windows",
        ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
        hints: {
            "Sec-CH-UA": '"Microsoft Edge";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
            "Sec-CH-UA-Mobile": "?0",
            "Sec-CH-UA-Platform": '"Windows"',
        },
        mobile: false,
        languages: "en-US,en;q=0.9",
    },
    {
        name: "firefox-linux",
        ua: "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0",
        hints: {},  // Firefox does not send Sec-CH-UA hints
        mobile: false,
        languages: "en-US,en;q=0.5",
    },
    {
        name: "firefox-windows",
        ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
        hints: {},
        mobile: false,
        languages: "en-US,en;q=0.5",
    },
    {
        name: "safari-mac",
        ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
        hints: {},  // Safari does not send Sec-CH-UA hints
        mobile: false,
        languages: "en-US,en;q=0.9",
    },
    {
        name: "chrome-android",
        ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36",
        hints: {
            "Sec-CH-UA": '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
            "Sec-CH-UA-Mobile": "?1",
            "Sec-CH-UA-Platform": '"Android"',
        },
        mobile: true,
        languages: "en-US,en;q=0.9",
    },
    {
        name: "safari-ios",
        ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
        hints: {},
        mobile: true,
        languages: "en-US,en;q=0.9",
    },
    {
        name: "samsung-internet",
        ua: "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36",
        hints: {
            "Sec-CH-UA": '"Samsung Internet";v="24", "Not:A-Brand";v="8", "Chromium";v="117"',
            "Sec-CH-UA-Mobile": "?1",
            "Sec-CH-UA-Platform": '"Android"',
        },
        mobile: true,
        languages: "en-US,en;q=0.9",
    },
];

// Kept for backward compatibility — some helpers use a flat UA string
export const USER_AGENTS = BROWSER_PROFILES.map(p => p.ua);

export const TRAFFIC_SOURCES = [
    "https://www.google.com/",
    "https://www.google.co.uk/",
    "https://www.google.in/",
    "https://www.bing.com/",
    "https://duckduckgo.com/",
    "https://search.yahoo.com/",
    "https://t.co/",
    "https://l.facebook.com/",
    "https://www.reddit.com/",
    "https://www.linkedin.com/",
    "https://www.instagram.com/",
    "https://www.youtube.com/",
    "",  // direct / no referrer
];