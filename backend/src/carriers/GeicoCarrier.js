const path = require('path');
const BaseCarrier = require('./BaseCarrier');

const LOGIN_URL = 'https://www.geico.com/account/';
const OUTPUT_DIR = path.join(__dirname, '../../output');

class GeicoCarrier extends BaseCarrier {
  async tryResumeSession() {
    await this.page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    return this._isOnAccountPortal();
  }

  // A valid authenticated session redirects away from www.geico.com (the marketing/login
  // domain) to an account subdomain (ecams.geico.com, portfolio.geico.com, etc). An invalid
  // or expired session simply stays on www.geico.com — its URL doesn't contain "/login" or
  // "/mfa" literally, so checking those alone isn't enough to detect a failed resume.
  _isOnAccountPortal() {
    const url = new URL(this.page.url());
    return url.hostname !== 'www.geico.com' && !url.pathname.includes('/login') && !url.pathname.includes('/mfa');
  }

  async login(username, password) {
    await this.page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });

    await this.humanType(this.page.locator('#LOGIN_policyNo'), username);
    await this.humanType(this.page.locator('#LOGIN_password'), password);
    await this.page.locator('input[type="submit"].btn--primary').click();

    // Wait for all redirects to fully settle before checking URL
    await this.page.waitForLoadState('networkidle', { timeout: 25000 });
    const url = this.page.url();

    if (url.includes('geico.com') && url.includes('/login')) {
      throw new Error('Login failed — please check your credentials');
    }

    if (url.includes('/mfa/options')) {
      await this._handleMFAOptions();
      return;
    }

    // No MFA — already on account portal
  }

  async _handleMFAOptions() {
    // Wait for Flutter MFA options to render
    await this.page.waitForSelector(
      'flt-semantics[flt-semantics-identifier="mfaOptions_RadioButtons_Get an Email_RadioButton"]',
      { timeout: 15000 }
    );

    // Select email and confirm selection registered
    await this.page.locator('flt-semantics[flt-semantics-identifier="mfaOptions_RadioButtons_Get an Email_RadioButton"]').click();
    await this.page.waitForSelector(
      'flt-semantics[flt-semantics-identifier="mfaOptions_RadioButtons_Get an Email_RadioButton"][aria-checked="true"]',
      { timeout: 5000 }
    );

    // Click Next
    await this.page.getByRole('button', { name: 'Next' }).click();

    // Real <input> backing the Flutter field — aria-label is the stable selector
    const codeInput = this.page.locator('input[aria-label="Verification code"]');
    await codeInput.waitFor({ state: 'attached', timeout: 20000 });

    // Show MFA input in our UI and wait for user to submit code
    this.emit('mfa_required', {});
    const code = await this.waitForMFA();

    await codeInput.click();
    await this.page.keyboard.type(code, { delay: 80 });
    await this.page.getByRole('button', { name: 'Submit Code' }).click({ force: true });

    // Wait until we land on the actual account portal — not just "any page that isn't /mfa",
    // since Geico can bounce through transient redirects (including back to /login) before settling.
    // Geico's post-login destination domain has changed before (ecams.geico.com -> portfolio.geico.com),
    // so we only check the path, not a specific hostname.
    await this.page.waitForFunction(
      () => {
        const { pathname } = window.location;
        return !pathname.includes('/mfa') && !pathname.includes('/login');
      },
      undefined,
      { timeout: 25000 }
    );
    await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  }

  async fetchDocuments() {
    // Dismiss cookie banner if present
    const cookieBtn = this.page.locator('#onetrust-accept-btn-handler, button:has-text("Accept Cookies")').first();
    await cookieBtn.click({ timeout: 5000 }).catch(() => {});

    // Wait for the "Please wait while we process" loading screen to disappear
    await this.page.waitForSelector('text=Please wait', { state: 'hidden', timeout: 30000 }).catch(() => {});

    // Extra buffer for the account content to fully paint
    await this.page.waitForTimeout(3000);

    if (!this._isOnAccountPortal()) {
      throw new Error('Session did not reach the account portal — landed on login/MFA page instead');
    }

    const isHeadless = process.env.HEADLESS !== 'false';
    if (!isHeadless) {
      return [{ name: 'Policy Overview (run headless for PDF)', url: this.page.url(), type: 'page' }];
    }

    const filename = `geico_${Date.now()}.pdf`;
    const filepath = path.join(OUTPUT_DIR, filename);

    await this.page.pdf({ path: filepath, format: 'A4', printBackground: true });

    return [{
      name: 'Geico Policy Overview',
      url: `/output/${filename}`,
      type: 'pdf',
    }];
  }
}

module.exports = GeicoCarrier;
