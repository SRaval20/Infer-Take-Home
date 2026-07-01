const path = require('path');
const BaseCarrier = require('./BaseCarrier');

const LOGIN_URL = 'https://www.progressive.com/logIn/';
const OUTPUT_DIR = path.join(__dirname, '../../output');

class ProgressiveCarrier extends BaseCarrier {
  async tryResumeSession() {
    // Valid session auto-redirects from login to account-home
    await this.page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await this.page.waitForTimeout(3000);
    return this.page.url().includes('account-home');
  }

  async login(username, password) {
    await this.page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Progressive's Angular app never reaches networkidle — wait for the input directly
    await this.page.waitForSelector('[data-pgr-id="inputUserName"]', { timeout: 20000 });

    await this.humanType(this.page.locator('[data-pgr-id="inputUserName"]'), username);
    await this.humanType(this.page.locator('[data-pgr-id="inputPassword"]'), password);
    await this.page.locator('[data-pgr-id="buttonSubmitLogin"]').click();

    const result = await Promise.race([
      this.page.waitForURL('**account-home**', { timeout: 25000 }).then(() => 'account'),
      this.page.waitForSelector('[data-pgr-id="buttonMultiContactSelectionContinue"]', { timeout: 25000 }).then(() => 'mfa_select'),
      this.page.waitForSelector('[data-pgr-id="inputOtp"]', { timeout: 25000 }).then(() => 'mfa_otp'),
      this.page.waitForSelector('[data-pgr-id*="error"], .error-message', { timeout: 25000 }).then(() => 'error'),
    ]);

    if (result === 'error') {
      const msg = await this.page.locator('[data-pgr-id*="error"], .error-message').first().textContent().catch(() => 'Login failed');
      throw new Error(msg.trim());
    }

    if (result === 'mfa_select') {
      await this.page.locator('label:has-text("Email Me"), pui-radio-medium:has-text("Email Me")').first().click();
      await this.page.waitForTimeout(500);
      await this.page.locator('[data-pgr-id="buttonMultiContactSelectionContinue"]').click();
      await this.page.waitForSelector('[data-pgr-id="inputOtp"]', { timeout: 15000 });
    }

    if (result === 'mfa_select' || result === 'mfa_otp') {
      this.emit('mfa_required', {});
      const code = await this.waitForMFA();
      await this.humanType(this.page.locator('[data-pgr-id="inputOtp"]'), code);
      await this.page.locator('[data-pgr-id="buttonOtpFormSubmit"]').click();
      await Promise.race([
        this.page.waitForURL('**account-home**', { timeout: 30000 }),
        this.page.waitForSelector('[data-pgr-id^="ttlStandardManagedTile"]', { timeout: 30000 }),
      ]);
    }
  }

  async fetchDocuments() {
    // Click the policy tile
    const tile = this.page.locator('[data-pgr-id^="ttlStandardManagedTile"]').first();
    await tile.waitFor({ timeout: 15000 });
    await tile.click();

    // After clicking the tile, Progressive loads policy details — wait for URL to settle
    await this.page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await this.page.waitForTimeout(3000);

    const isHeadless = process.env.HEADLESS !== 'false';
    if (!isHeadless) {
      return [{ name: 'Policy Details (run headless for PDF)', url: this.page.url(), type: 'page' }];
    }

    const filename = `progressive_${Date.now()}.pdf`;
    const filepath = path.join(OUTPUT_DIR, filename);

    await this.page.pdf({ path: filepath, format: 'A4', printBackground: true });

    return [{
      name: 'Progressive Policy Details',
      url: `/output/${filename}`,
      type: 'pdf',
    }];
  }
}

module.exports = ProgressiveCarrier;
