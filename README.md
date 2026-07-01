# Insurance Policy Fetcher

A web app that automates login to insurance carrier portals and retrieves your policy documents as PDFs.

**Live demo:** https://endearing-empathy-production-381e.up.railway.app

> If you have any difficulty accessing the app or running it locally, reach out at **raval.sagar.sr@gmail.com**

---

## Supported Carriers

| Carrier | Login | MFA | Output |
|---|---|---|---|
| Progressive | ✅ | ✅ Email code | PDF of policy details page |
| Geico | ✅ | ✅ Email code | PDF of account overview page |

---

## Architecture

```
React (Vite, Railway)  ──WSS──►  Caddy (auto-HTTPS)  ──►  Express + ws  ──►  Playwright (Chromium)
                                  on DigitalOcean            (DigitalOcean)         │
                                                                              residential proxy
                                                                               (IPRoyal, US,
                                                                                sticky session)
                                                                                    │
                                                                              SessionManager
                                                                            (cookies on disk,
                                                                             never passwords)
```

**Flow:**
1. User picks carrier and enters credentials in the UI
2. Frontend opens a WebSocket to the backend and sends a `start` event
3. Backend launches a stealth Chromium browser and navigates to the carrier portal
4. Status events stream back in real time: `logging_in → mfa_required → fetching_docs → complete`
5. If MFA is required, the UI surfaces an input field. The user enters the code — it is sent back over the same WebSocket and injected into the browser
6. After login, the account page is captured as a PDF and served back as a downloadable link

**Session reuse:** after a successful login, the browser's storage state (cookies, localStorage) is saved to `backend/sessions/`. On the next run for the same carrier + username, the backend resumes that session directly — skipping login and MFA entirely.

---

## Stack

- **Frontend:** React 18, Vite, vanilla CSS
- **Backend:** Node.js, Express, `ws` (WebSockets)
- **Automation:** Playwright + `playwright-extra` + `puppeteer-extra-plugin-stealth`
- **Hosting:** Frontend on Railway (Docker); backend on a DigitalOcean droplet behind Caddy (automatic HTTPS), routing carrier traffic through an IPRoyal residential proxy — see [Deployment](#deployment) for why this shape
- **Session storage:** JSON files on disk (cookies only, never credentials)

---

## Running Locally

### Prerequisites

- Node.js 20+
- Git

### 1. Clone

```bash
git clone <repo-url>
cd infer-take-home
```

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Backend starts on `http://localhost:3001`.

### 3. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend starts on `http://localhost:5173`. Open that URL in your browser.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Port the Express server listens on |
| `NODE_ENV` | `development` | Set to `production` when running the live demo |
| `SESSION_DIR` | `./sessions` | Where browser session state is stored |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin |
| `PROXY_SERVER` | _(unset)_ | Optional residential proxy — see Anti-Bot section |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_WS_URL` | `ws://localhost:3001/ws` | WebSocket URL |
| `VITE_BACKEND_URL` | `http://localhost:3001` | Backend base URL for serving PDFs |

For the live demo these point to the DigitalOcean-hosted backend behind Caddy (see [Deployment](#deployment)).

---

## Security & Credential Handling

**Credentials never touch disk.** The full lifecycle:

1. Typed into the React form → held in React component state (browser memory only)
2. Sent over WebSocket (`wss://` in production — encrypted in transit) → held in a JS variable in `AutomationEngine`
3. Typed into the carrier portal by Playwright
4. Discarded when the session ends

**What IS saved to disk:** browser storage state (cookies, session tokens) in `backend/sessions/`. This is equivalent to what your browser saves when you check "Remember me" — it contains auth tokens, not passwords.

**No logging:** the backend has zero `console.log` statements that touch user data.

**Intended use:** personal use — one user, their own insurance accounts. Not architected as a multi-tenant service.

---

## Anti-Bot Strategy

| Technique | Implementation | Effect |
|---|---|---|
| Stealth plugin | `puppeteer-extra-plugin-stealth` | Patches ~15 automation signals: `navigator.webdriver`, `chrome.runtime`, WebGL vendor, etc. |
| Realistic user agent | Windows Chrome UA hardcoded in `browserFactory.js` | Avoids headless UA strings |
| Human-like typing | Random 50–130ms delay per keystroke in `BaseCarrier.humanType()` | Defeats keystroke timing analysis |
| Viewport + locale | 1280×800, `en-US`, `America/Chicago` | Matches a typical US user profile |

**On datacenter IPs (Railway, Render, DigitalOcean's own IP):** both Progressive and Geico actively block traffic from cloud/datacenter IP ranges — logins either fail outright or silently hang. `browserFactory.js` routes all Playwright traffic through a residential proxy via one env var:

```bash
PROXY_SERVER=http://user:pass@proxy-host:port
```

**Provider used: [IPRoyal](https://iproyal.com) residential proxies**, configured as:
- **US-only** IPs (`country-us`) — both carriers are US-only insurance products; a non-US residential IP is its own fraud signal
- **Sticky session** (same IP held for the session's lifetime, not rotating per-request) — a multi-step login → MFA → fetch flow needs a consistent IP throughout, or it looks like session hijacking / impossible travel to the carrier's fraud detection
- Pay-as-you-go pricing (~$7/GB), no subscription commitment

This was not the first provider tried — see [Deployment](#deployment) for what didn't work and why.

---

## Deployment

### Current setup

- **Frontend** — Railway, static Vite build via Dockerfile (standard deployment, nothing unusual here)
- **Backend** — a DigitalOcean droplet (Ubuntu, Docker), running the same `backend/Dockerfile` image, behind [Caddy](https://caddyserver.com/) as a reverse proxy for automatic HTTPS
- **HTTPS without owning a domain** — the droplet has a static IP but no domain name. [sslip.io](https://sslip.io) resolves `<ip>.sslip.io` back to that IP for free, which is enough for Caddy to obtain a real Let's Encrypt certificate with zero manual DNS work: `64.225.42.181.sslip.io`
- **Carrier traffic** — routed through an IPRoyal residential proxy (`PROXY_SERVER` env var, wired in `browserFactory.js`) so Progressive/Geico see a real US residential IP instead of the droplet's own datacenter IP

Railway project (frontend service): https://railway.com/project/b4a2a3d3-c42b-46a3-a5d9-e3ed7e666630

### How we got here — difficulties, dead ends, and why each decision was made

This took several iterations to land on something both carriers accept. Documenting the path because the failed attempts are informative about how these carriers' bot-detection actually behaves:

**1. Backend on Railway (no proxy).**
Both Progressive and Geico blocked or silently hung on Railway's datacenter IP range — this is the first thing any carrier bot-detection checks (IP reputation / ASN lookup against known hosting providers). *Assumption disproven: "stealth plugin + realistic headers is enough." It isn't — IP origin is checked before any browser fingerprinting even matters.*

**2. Add a residential proxy (BrightData) on Railway.**
BrightData's residential proxy gated insurance/financial-site targeting behind business KYC (a company email — a solo/personal project doesn't have one). Separately, Railway's networking only allows outbound connections on ports 80/443; BrightData's proxy listens on 22225/33335, so even ignoring KYC, the connection would have been blocked by Railway itself. *Two independent blockers stacked here — this is what took the longest to isolate, since each failure looked like a different bug until tested in isolation with `curl -v`.*

**3. Try Render instead of Railway.**
Same non-standard-port outbound restriction as Railway. Confirms it's a PaaS-category limitation, not Railway-specific.

**4. DigitalOcean droplet (raw VPS, no port restrictions) + BrightData.**
Connectivity worked (droplet has no outbound firewall), but BrightData's KYC wall for financial-site targeting still applied regardless of hosting — that block is provider-side, not network-side, so moving hosts didn't fix it.

**5. Fallback: run the backend from an actual home network.**
A residential IP trivially passes carrier fraud checks — no stealth needed for the IP layer at all. Backend ran locally (`npm run dev`) and was exposed via [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) (`cloudflared tunnel --url http://localhost:3001`). This worked, but has an obvious tradeoff: the live demo depends on a personal machine staying powered on and connected, and Quick Tunnel URLs are ephemeral — every restart gives a new URL, requiring a Railway env var + rebuild each time. Fine for active debugging, not a real deployment.

**6. IPRoyal residential proxy (pay-as-you-go, no KYC wall hit) + DigitalOcean.**
Tested the same way as BrightData: raw `curl` against both carriers first (cheaper/faster to validate than a full Playwright run), then a real `login()` call through `browserFactory.js`, before committing to wiring it into the deployed backend. Two configuration details mattered:
- **Sticky IP, not rotating** — a rotating pool would change IP mid-session, which is itself a red flag (impossible-travel style detection) and would break resumed sessions
- **US-filtered** — an out-of-country residential IP hitting a US-only insurance carrier is still a mismatch signal, even if it's genuinely residential

Not every IP in the pool worked on the first try — one sticky session was dead at the network level (residential peer offline, a known characteristic of residential proxy pools since they route through real consumer devices), and one was IP-reputation-blocked specifically on Progressive's `/logIn/` path by Akamai (confirmed via plain `curl`, so it wasn't a Playwright fingerprinting issue — that exact IP had likely been used by other bots against that specific endpoint before). A freshly regenerated sticky IP worked cleanly for both carriers.

**7. Caddy + sslip.io for stable HTTPS on the droplet**, replacing the Cloudflare Quick Tunnel. This removes the "must keep a personal machine on" dependency entirely — the droplet runs the backend as an always-on Docker container (`--restart unless-stopped`), and the HTTPS endpoint is now permanent instead of regenerating on every tunnel restart.

### Tradeoffs of the current setup (being upfront about it)

- **Proxy bandwidth is metered** (IPRoyal, pay-as-you-go) — this is a per-GB cost, unlike the free home-IP-tunnel approach. Fine at low volume (PDF fetches are small), but not something to point unlimited traffic at without budgeting.
- **The droplet is a single point of failure** for the backend — no redundancy, no auto-restart across droplet-level failures (only container-level, via `--restart unless-stopped`). Acceptable for a personal-use take-home; would need a real orchestration layer (or at least a second region) for anything higher-stakes.
- **sslip.io is a third-party dependency** for domain resolution. If it ever goes down, so does the HTTPS cert renewal path and the current URL — a real owned domain would remove this, but wasn't worth the setup time/cost for this project's scope.
- **The IP a carrier sees can still get flagged over time** — residential proxy IPs are shared/recycled across the provider's user base, so reputation isn't permanent. If Progressive or Geico start blocking the current sticky IP, the fix is regenerating a new one (a UI action + updating `PROXY_SERVER`, no code changes needed).
- **Noticeably slower than direct/datacenter connections — a full run typically takes 30–60 seconds.** Every request now hops browser → Caddy → backend → IPRoyal's gateway → an actual residential device → the carrier site, and back. Residential peer connections have far more variable bandwidth than datacenter links, and that latency compounds with the deliberate `networkidle`/buffer waits already in `ProgressiveCarrier.js` and `GeicoCarrier.js` (added specifically to fix earlier bugs where PDFs were captured mid-load — see git history). This is the direct, accepted cost of looking like a real residential user instead of a datacenter bot; trimming those waits to speed things up would reintroduce the blank/wrong-PDF bugs they were added to fix.

---

## Project Structure

```
.
├── backend/
│   ├── src/
│   │   ├── carriers/
│   │   │   ├── BaseCarrier.js          # Abstract base: login(), fetchDocuments(), MFA promise pattern
│   │   │   ├── ProgressiveCarrier.js   # Progressive-specific selectors and flow
│   │   │   └── GeicoCarrier.js         # Geico-specific selectors and flow
│   │   ├── session/
│   │   │   └── SessionManager.js       # Save/load/clear browser storage state
│   │   ├── websocket/
│   │   │   └── wsHandler.js            # WebSocket connection manager
│   │   ├── routes/
│   │   │   └── api.js                  # REST endpoints (health, carriers, session status)
│   │   ├── AutomationEngine.js         # Orchestrates full flow per session
│   │   ├── browserFactory.js           # Stealth Chromium launcher
│   │   └── index.js                    # Express + WebSocket server entry
│   ├── sessions/                        # gitignored — browser storage state per carrier+user
│   ├── output/                          # gitignored — generated PDFs
│   └── scripts/
│       └── recon.js                    # Dev tool: dump page selectors for a given URL
│
└── frontend/
    └── src/
        ├── components/
        │   ├── LoginForm.jsx            # Carrier dropdown + credential fields
        │   ├── MFAPrompt.jsx            # Appears when backend emits mfa_required
        │   ├── StatusBanner.jsx         # Live status with spinner
        │   └── DocumentViewer.jsx       # Renders fetched document list
        ├── hooks/
        │   └── useInsuranceWS.js        # All WebSocket logic + state machine
        └── App.jsx                      # Root — wires components to hook state
```

---

## Known Limitations

- **Single concurrent user:** no job queue — parallel sessions would need a browser pool
- **MFA timeout:** if the user doesn't enter the code within ~10 minutes, the carrier portal expires it and the flow fails with a timeout error
- **Backend runs on a single DigitalOcean droplet:** no redundancy beyond Docker's own restart policy — see [Deployment tradeoffs](#tradeoffs-of-the-current-setup-being-upfront-about-it) for the full picture
- **Proxy IP reputation isn't permanent:** the residential IP currently in use could get flagged by a carrier over time (shared/recycled proxy pool) — the fix is regenerating a new sticky IP, not a code change
- **Carrier selectors are brittle by nature:** both carriers changed page structure mid-development (Progressive moved its MFA page to a new subdomain with different markup; Geico's post-MFA redirect domain changed). Selectors target stable `data-pgr-id`/`aria-label` attributes where possible, but carrier-side changes can break the flow without warning — this is an inherent tradeoff of unofficial browser automation against a third-party UI.
- **Geico's login/MFA flow has been observed to vary run-to-run on the same account** — sometimes a plain Flutter-based MFA code screen, other times what appears to be a second, distinct login gate on a different Geico subdomain, without a consistent URL pattern distinguishing "authenticated" from "not yet authenticated" pages. This is most likely Geico's fraud/bot-detection reacting to a high volume of automated login attempts on one test account during development (many IPs/hosts hit the same account in a short window). `GeicoCarrier.js` handles the flow observed in normal testing; if Geico serves a variant UI, the run will fail with a clear timeout/error rather than silently mislabeling a login page as success.
- **PDF fidelity:** PDFs are generated from the live authenticated page via `page.pdf()`. Content accuracy depends on what the carrier renders post-login
