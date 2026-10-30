let chromium;
let playwright;

try {
  chromium = require('@sparticuz/chromium');
  playwright = require('playwright-core');
} catch (e) {
  try {
    playwright = require('playwright');
  } catch (err) {
    console.warn('Playwright fallback mode');
  }
}

/**
 * Automates submission to TimePayment application portal
 * URL: https://secure.financ.ing/app?dealercode=VHD64&apptype=B
 */
async function submitToTimePayment(data) {
  console.log('[TimePayment] Starting submission for:', data.legalBusinessName || data.businessName);

  let browser;
  try {
    if (chromium && typeof chromium.executablePath === 'function') {
      // Vercel Serverless environment
      const execPath = await chromium.executablePath();
      browser = await playwright.chromium.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: execPath,
        headless: chromium.headless,
      });
    } else {
      // Local or standard environment
      browser = await playwright.chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();
    const targetUrl = process.env.TIMEPAYMENT_URL || 'https://secure.financ.ing/app?dealercode=VHD64&apptype=B';
    console.log('[TimePayment] Navigating to:', targetUrl);

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2000);

    // Safe Fill Helper
    async function safeFill(selectors, value) {
      if (!value) return false;
      for (const sel of (Array.isArray(selectors) ? selectors : [selectors])) {
        try {
          const el = await page.$(sel);
          if (el) {
            await el.scrollIntoViewIfNeeded();
            await el.fill(String(value));
            console.log(`[TimePayment] Filled ${sel} with ${value}`);
            return true;
          }
        } catch (e) {}
      }
      return false;
    }

    // Safe Select Helper
    async function safeSelect(selectors, value) {
      if (!value) return false;
      for (const sel of (Array.isArray(selectors) ? selectors : [selectors])) {
        try {
          const el = await page.$(sel);
          if (el) {
            await el.selectOption({ label: String(value) }).catch(async () => {
              await el.selectOption({ value: String(value) });
            });
            console.log(`[TimePayment] Selected ${sel} option ${value}`);
            return true;
          }
        } catch (e) {}
      }
      return false;
    }

    // Safe Check Helper
    async function safeCheck(selectors) {
      for (const sel of (Array.isArray(selectors) ? selectors : [selectors])) {
        try {
          const el = await page.$(sel);
          if (el) {
            await el.check();
            console.log(`[TimePayment] Checked ${sel}`);
            return true;
          }
        } catch (e) {}
      }
      return false;
    }

    // 1. Equipment & Requested Amount
    await safeFill(['input[name*="amount" i]', 'input[id*="amount" i]', 'input[placeholder*="amount" i]'], data.requestedAmount);
    await safeFill(['textarea[name*="equip" i]', 'input[name*="equip" i]', 'textarea[id*="equip" i]'], data.equipmentDescription);

    // 2. Business Details
    await safeFill(['input[name*="legal" i]', 'input[name*="businessName" i]', 'input[id*="businessName" i]'], data.legalBusinessName);
    await safeFill(['input[name*="dba" i]', 'input[id*="dba" i]'], data.dba);
    await safeFill(['input[name*="ein" i]', 'input[name*="tax" i]', 'input[id*="taxId" i]'], data.federalTaxId);
    await safeSelect(['select[name*="entity" i]', 'select[id*="entity" i]'], data.businessEntityType);

    // Business Address
    await safeFill(['input[name*="bizAddress1" i]', 'input[name*="bAddress" i]', 'input[name*="address1" i]'], data.businessAddress?.line1);
    await safeFill(['input[name*="bizCity" i]', 'input[name*="bCity" i]', 'input[name*="city" i]'], data.businessAddress?.city);
    await safeSelect(['select[name*="bizState" i]', 'select[name*="bState" i]', 'select[name*="state" i]'], data.businessAddress?.state);
    await safeFill(['input[name*="bizZip" i]', 'input[name*="bZip" i]', 'input[name*="zip" i]'], data.businessAddress?.postal);

    // Business Contact
    await safeFill(['input[name*="bizPhone" i]', 'input[name*="bPhone" i]', 'input[type="tel"]'], data.primaryOwner?.phone);
    await safeFill(['input[name*="bizEmail" i]', 'input[name*="bEmail" i]', 'input[type="email"]'], data.primaryOwner?.email);

    // 3. Primary Owner (Guarantor)
    await safeFill(['input[name*="ownerFirstName" i]', 'input[name*="firstName" i]'], data.primaryOwner?.firstName);
    await safeFill(['input[name*="ownerLastName" i]', 'input[name*="lastName" i]'], data.primaryOwner?.lastName);
    await safeFill(['input[name*="title" i]'], data.primaryOwner?.title || 'Owner');
    await safeFill(['input[name*="ownership" i]'], data.primaryOwner?.ownershipPercentage || '100');
    await safeFill(['input[name*="ssn" i]', 'input[id*="ssn" i]'], data.primaryOwner?.ssn);

    // Owner Home Address
    await safeFill(['input[name*="homeAddress" i]', 'input[name*="ownerAddress" i]'], data.primaryOwner?.homeAddress?.line1);
    await safeFill(['input[name*="homeCity" i]', 'input[name*="ownerCity" i]'], data.primaryOwner?.homeAddress?.city);
    await safeSelect(['select[name*="homeState" i]', 'select[name*="ownerState" i]'], data.primaryOwner?.homeAddress?.state);
    await safeFill(['input[name*="homeZip" i]', 'input[name*="ownerZip" i]'], data.primaryOwner?.homeAddress?.postal);

    // 4. Accept terms & authorizations
    await safeCheck(['input[type="checkbox"][name*="agree" i]', 'input[type="checkbox"][id*="terms" i]', 'input[type="checkbox"]']);

    await page.waitForTimeout(1000);

    // 5. Submit Application
    console.log('[TimePayment] Clicking submit button...');
    const submitBtn = await page.$('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Apply")');

    if (submitBtn) {
      await submitBtn.click();
      console.log('[TimePayment] Submitted successfully!');
      await page.waitForTimeout(3000);
    }

    const finalUrl = page.url();
    await browser.close();

    return {
      success: true,
      finalUrl
    };

  } catch (error) {
    console.error('[TimePayment] Submission error:', error.message);
    if (browser) await browser.close().catch(() => {});
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = { submitToTimePayment };
