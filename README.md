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
React (Vite)  ──WebSocket──►  Express + ws  ──►  Playwright (Chromium)
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
- **Hosting:** Frontend on Railway; backend runs locally, exposed via Cloudflare Tunnel (see [Deployment](#deployment) for why)
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

For the live demo these point to the Cloudflare Tunnel exposing the backend (see [Deployment](#deployment)).

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

**On datacenter IPs (Railway, Render, DigitalOcean):** both Progressive and Geico actively block traffic from cloud/datacenter IP ranges — logins either fail outright or silently hang. `browserFactory.js` supports routing through a residential proxy via one env var:

```bash
PROXY_SERVER=http://user:pass@proxy-host:port
```

In practice, residential proxy providers (tested: BrightData) gate insurance/financial-site targeting behind a business KYC verification (company email required), which isn't practical for a personal-use project. Since this app is designed for **personal use from your own residential IP** (see Security section), the simplest and most reliable path turned out to be running the backend from a real home network instead of a datacenter — see Deployment below.

---

## Deployment

**Why not a single Railway/Render/DigitalOcean deployment for everything?**

Progressive and Geico both block traffic from datacenter IP ranges — every PaaS/VPS provider tried (Railway, Render, DigitalOcean) got flagged. The correct production fix is a residential proxy, but every proxy provider tested requires business KYC verification to target financial/insurance sites, which blocks a personal project. Since this app is built for one person accessing their own accounts, the pragmatic solution is to run the backend from an actual residential network — which trivially passes carrier bot checks — rather than adding proxy infrastructure.

**Current setup:**
- **Frontend** — deployed on Railway as a static Vite build (Dockerfile-based), same as any standard deployment
- **Backend** — runs locally (`npm run dev` in `backend/`) and is exposed publicly via [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/):
  ```bash
  cloudflared tunnel --url http://localhost:3001
  ```
  This prints a public `https://<random>.trycloudflare.com` URL, which is set as `VITE_WS_URL` / `VITE_BACKEND_URL` on the Railway frontend service (as a Docker build arg, since Vite bakes these in at build time).

**Implication:** the live demo depends on the backend machine and tunnel staying online. If the demo link isn't responding, the backend host is likely offline — reach out (see top of README) and it can be restarted quickly.

**For a fully-hosted setup** (no dependency on a personal machine), the two viable paths are:
1. A residential proxy provider that has completed KYC for financial-site targeting, routed through `PROXY_SERVER`
2. A dedicated small residential/business internet connection running the backend as a permanent service

Railway project (frontend service): https://railway.com/project/b4a2a3d3-c42b-46a3-a5d9-e3ed7e666630

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
- **Backend depends on a residential host machine:** see [Deployment](#deployment) — the live demo's backend runs on a personal machine tunneled via Cloudflare, since carrier bot-detection blocks every datacenter/PaaS IP tested. If the demo appears down, the host machine is likely offline.
- **Carrier selectors are brittle by nature:** both carriers changed page structure mid-development (Progressive moved its MFA page to a new subdomain with different markup; Geico's post-MFA redirect domain changed). Selectors target stable `data-pgr-id`/`aria-label` attributes where possible, but carrier-side changes can break the flow without warning — this is an inherent tradeoff of unofficial browser automation against a third-party UI.
- **PDF fidelity:** PDFs are generated from the live authenticated page via `page.pdf()`. Content accuracy depends on what the carrier renders post-login
