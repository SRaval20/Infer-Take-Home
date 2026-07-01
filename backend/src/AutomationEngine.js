const { createBrowser, createContext } = require('./browserFactory');
const SessionManager = require('./session/SessionManager');
const ProgressiveCarrier = require('./carriers/ProgressiveCarrier');
const GeicoCarrier = require('./carriers/GeicoCarrier');

const CARRIERS = {
  progressive: ProgressiveCarrier,
  geico: GeicoCarrier,
};

class AutomationEngine {
  constructor(sessionId, carrier, username, password, wsSend) {
    this.sessionId = sessionId;
    this.carrierKey = carrier;
    this.username = username;
    this.password = password;
    this.send = wsSend; // (type, payload) => void

    this.browser = null;
    this.context = null;
    this.page = null;
    this.carrierInstance = null;
    this.documents = [];
  }

  emit(type, payload = {}) {
    this.send(type, payload);
  }

  async run() {
    const CarrierClass = CARRIERS[this.carrierKey];
    if (!CarrierClass) {
      this.emit('error', { message: `Unknown carrier: ${this.carrierKey}` });
      return;
    }

    this.emit('status', { step: 'starting' });

    try {
      const savedState = SessionManager.load(this.carrierKey, this.username);
      this.browser = await createBrowser();
      this.context = await createContext(this.browser, savedState);
      this.page = await this.context.newPage();
      this.carrierInstance = new CarrierClass(this.page, (type, payload) => this.emit(type, payload));

      if (savedState) {
        this.emit('status', { step: 'resuming_session' });
        const resumed = await this.carrierInstance.tryResumeSession();
        if (!resumed) {
          SessionManager.clear(this.carrierKey, this.username);
          // Stale cookies from the failed session linger in this context —
          // start a clean context so login isn't confused by conflicting state.
          await this.page.close();
          await this.context.close();
          this.context = await createContext(this.browser, null);
          this.page = await this.context.newPage();
          this.carrierInstance = new CarrierClass(this.page, (type, payload) => this.emit(type, payload));
          await this._doFullLogin();
        }
      } else {
        await this._doFullLogin();
      }

      this.emit('status', { step: 'fetching_docs' });
      this.documents = await this.carrierInstance.fetchDocuments();

      const state = await this.context.storageState();
      SessionManager.save(this.carrierKey, this.username, state);

      this.emit('complete', { documents: this.documents });
    } catch (err) {
      this.emit('error', { message: err.message || 'Unexpected error occurred' });
    } finally {
      await this.cleanup();
    }
  }

  async _doFullLogin() {
    this.emit('status', { step: 'logging_in' });
    await this.carrierInstance.login(this.username, this.password);
  }

  submitMFA(code) {
    if (this.carrierInstance) this.carrierInstance.supplyMFA(code);
  }

  async cleanup() {
    try {
      if (this.page && !this.page.isClosed()) await this.page.close();
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();
    } catch (_) {}
  }
}

module.exports = AutomationEngine;
