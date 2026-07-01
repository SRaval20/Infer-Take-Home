const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
  '--ignore-certificate-errors',
];

const CONTEXT_OPTIONS = {
  ignoreHTTPSErrors: true,
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 },
  locale: 'en-US',
  timezoneId: 'America/Chicago',
  extraHTTPHeaders: {
    'Accept-Language': 'en-US,en;q=0.9',
  },
};

async function createBrowser({ headless = process.env.HEADLESS !== 'false' } = {}) {
  const args = [...LAUNCH_ARGS];
  if (process.env.PROXY_SERVER) {
    const url = new URL(process.env.PROXY_SERVER);
    args.push(`--proxy-server=${url.protocol}//${url.hostname}:${url.port}`);
  }
  return chromium.launch({ headless, args });
}

async function createContext(browser, savedState = null) {
  const opts = { ...CONTEXT_OPTIONS };
  if (process.env.PROXY_SERVER) {
    const url = new URL(process.env.PROXY_SERVER);
    opts.proxy = {
      server: `${url.protocol}//${url.hostname}:${url.port}`,
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
    };
  }
  if (savedState) opts.storageState = savedState;
  return browser.newContext(opts);
}

module.exports = { createBrowser, createContext };
