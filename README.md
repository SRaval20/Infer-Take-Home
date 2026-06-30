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
- **Hosting:** Railway (backend + frontend as separate services)
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
| `NODE_ENV` | `development` | Set to `production` on Railway |
| `SESSION_DIR` | `./sessions` | Where browser session state is stored |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin |
| `PROXY_SERVER` | _(unset)_ | Optional residential proxy — see Anti-Bot section |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_WS_URL` | `ws://localhost:3001/ws` | WebSocket URL |
| `VITE_BACKEND_URL` | `http://localhost:3001` | Backend base URL for serving PDFs |

For production these are set to:
- `VITE_WS_URL` = `wss://infer-take-home-production.up.railway.app/ws`
- `VITE_BACKEND_URL` = `https://infer-take-home-production.up.railway.app`

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

**On datacenter IPs (Railway):** both Progressive and Geico loaded without blocks during testing. If a carrier starts fingerprint-blocking in production, the fix is a residential proxy — wired up in `browserFactory.js` and takes one env var:

```bash
PROXY_SERVER=http://user:pass@proxy-host:port
```

Residential proxies (BrightData, Oxylabs, ~$15/mo) route traffic through real ISP IPs and are the production-grade solution for sustained blocking.

---

## Deployment (Railway)

The app is deployed as two Railway services under one project.

**Backend service**
- Root directory: `backend/`
- Uses `backend/Dockerfile` (installs Chromium + all system deps)
- Env vars: `NODE_ENV=production`, `PORT=3001`, `FRONTEND_URL=<frontend-url>`

**Frontend service**
- Root directory: `frontend/`
- Uses `frontend/Dockerfile` (Vite build → served with `serve`)
- Env vars: `VITE_WS_URL=wss://<backend-url>/ws`, `VITE_BACKEND_URL=https://<backend-url>`

Railway project: https://railway.com/project/b4a2a3d3-c42b-46a3-a5d9-e3ed7e666630

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
- **Hosted IP blocking:** Both Progressive and Geico block Railway's datacenter IP range. The residential proxy integration is fully implemented (`PROXY_SERVER` env var, wired in `browserFactory.js`), but Railway's networking restricts outbound to ports 80/443 while BrightData residential proxy requires port 22225/33335 — making them incompatible. **The app works fully when run locally** (home IP passes carrier checks). For a production hosted deployment, the fix is a proxy provider that tunnels over port 443, or a VPS (DigitalOcean, Hetzner) where outbound ports aren't restricted.
- **PDF fidelity:** PDFs are generated from the live authenticated page via `page.pdf()`. Content accuracy depends on what the carrier renders post-login
