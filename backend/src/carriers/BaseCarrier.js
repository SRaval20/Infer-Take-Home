class BaseCarrier {
  constructor(page, onEvent) {
    this.page = page;
    this.emit = onEvent; // (type, payload) => void
  }

  // Returns true if existing session is still valid, false if full login needed
  async tryResumeSession() {
    throw new Error('Not implemented');
  }

  // Performs full login. Calls this.emit('mfa_required') if MFA needed,
  // then awaits this.resolveMFA() to get the code.
  async login(username, password) {
    throw new Error('Not implemented');
  }

  // Returns array of { name, url, type }
  async fetchDocuments() {
    throw new Error('Not implemented');
  }

  // Called by AutomationEngine when user submits MFA code
  supplyMFA(code) {
    if (this._mfaResolve) this._mfaResolve(code);
  }

  // Awaited inside login() when MFA screen is detected
  waitForMFA() {
    return new Promise((resolve) => {
      this._mfaResolve = resolve;
    });
  }

  async humanType(locator, text) {
    await locator.click();
    for (const char of text) {
      await this.page.keyboard.type(char, { delay: 50 + Math.random() * 80 });
    }
  }
}

module.exports = BaseCarrier;
