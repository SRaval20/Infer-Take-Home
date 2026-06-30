# Insurance Policy Fetcher

A web app that automates login to insurance carrier portals and retrieves your policy documents. Built with React, Node.js/Express, WebSockets, and Playwright.

---

## Supported Carriers

| Carrier | Login | MFA | Documents |
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
1. User picks carrier, enters credentials in the UI
2. Frontend opens a WebSocket to the backend and sends a `start` event
3. Backend launches a stealth Chromium browser, navigates to the carrier portal
4. Status events stream back over WebSocket: `logging_in → mfa_required → fetching_docs → complete`
5. If MFA is required, the UI surfaces an input field. The user enters the code — it gets sent back over the same WebSocket and injected into the browser
6. After login, the account page is captured as a PDF and served back as a downloadable link

**Session reuse:** after a successful login, the browser's storage state (cookies, localStorage) is saved to `backend/sessions/`. On the next run for the same carrier + username, the backend attempts to resume that session — skipping login and MFA entirely.

---

## Stack

- **Frontend:** React 18, Vite, vanilla CSS
- **Backend:** Node.js, Express, `ws` (WebSockets)
- **Automation:** Playwright + `playwright-extra` + `puppeteer-extra-plugin-stealth`
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
npm install          # also runs: playwright install chromium
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

Frontend starts on `http://localhost:5173`.

### 4. Open the app

Navigate to `http://localhost:5173`, pick a carrier, enter your credentials, and follow the prompts.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Port the Express server listens on |
| `NODE_ENV` | `development` | Set to `production` on Railway |
| `SESSION_DIR` | `./sessions` | Where browser session state is stored |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin |
| `PROXY_SERVER` | _(unset)_ | Optional residential proxy (see Anti-Bot section) |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_WS_URL` | `ws://localhost:3001/ws` | WebSocket URL — set to `wss://your-backend.railway.app/ws` in production |
| `VITE_BACKEND_URL` | `http://localhost:3001` | Backend base URL for serving PDFs — set to `https://your-backend.railway.app` in production |

---

## Security & Credential Handling

**Your credentials never touch disk.** Here is exactly what happens to them:

1. Typed into the React form → held in React component state (browser memory only)
2. Sent over WebSocket to the backend → held in a JS variable in `AutomationEngine`
3. Typed into the carrier portal by Playwright
4. Discarded when the session ends

**What IS saved to disk:** the browser's storage state (cookies, session tokens) in `backend/sessions/`. This is equivalent to what your browser stores when you check "Remember me" — it contains auth tokens, not your password.

**No logging:** the backend has zero `console.log` statements that touch user data.

**In production:** Railway terminates TLS, so the WebSocket connection is `wss://` (encrypted in transit). Credentials are never sent in plaintext over the network.

**Intended use:** personal use — one user, their own insurance accounts. Not architected as a multi-tenant service.

---

## Anti-Bot Strategy

| Technique | Implementation | Effect |
|---|---|---|
| Stealth plugin | `puppeteer-extra-plugin-stealth` | Patches ~15 automation signals: `navigator.webdriver`, `chrome.runtime`, WebGL vendor, etc. |
| Realistic user agent | Hardcoded Windows Chrome UA in `browserFactory.js` | Avoids headless UA strings |
| Human-like typing | Random 50–130ms delay between keystrokes in `BaseCarrier.humanType()` | Defeats keystroke timing analysis |
| Proper viewport + locale | 1280×800, `en-US`, `America/Chicago` | Matches a typical US user profile |

**Residential proxies:** datacenter IPs (Railway, AWS, GCP) are flagged by Akamai and PerimeterX by default. A residential proxy routes traffic through real ISP IPs and is the production-grade fix. The proxy config is wired up in `browserFactory.js` and takes one env var:

```bash
PROXY_SERVER=http://user:pass@proxy-host:port
```

Both Progressive and Geico loaded without blocks during testing on Railway's datacenter IPs. If a carrier starts blocking, adding a residential proxy is the fix.

---

## Deployment (Railway)

See the step-by-step guide below.

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
│   ├── scripts/
│   │   └── recon.js                    # Dev tool: dump page selectors for a given URL
│   └── .env.example
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

- **Single concurrent user:** no job queue — parallel users would need a session pool
- **MFA timeout:** if the user doesn't enter the MFA code within ~10 minutes, the carrier portal expires it and the flow fails
- **Hosted IP blocking:** see Anti-Bot section above — residential proxy is the fix if needed
