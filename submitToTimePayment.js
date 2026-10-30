let playwright;
let chromium;

try {
  playwright = require('playwright');
} catch (e) {
  try {
    playwright = require('playwright-core');
    chromium = require('@sparticuz/chromium');
  } catch (err) {
    console.warn('Playwright load warning:', err.message);
  }
}

/**
 * Automates multi-step submission to TimePayment application portal
 * URL: https://secure.financ.ing/app?dealercode=VHD64&apptype=B
 */
async function submitToTimePayment(data) {
  console.log('[TimePayment] Starting multi-step submission for:', data.legalBusinessName || 'Applicant');

  let browser;
  try {
    if (playwright && playwright.chromium) {
      console.log('[TimePayment] Launching standard Playwright Chromium...');
      browser = await playwright.chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });
    } else if (chromium && typeof chromium.executablePath === 'function') {
      const execPath = await chromium.executablePath();
      browser = await playwright.chromium.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: execPath,
        headless: true,
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
          if (el && await el.isVisible()) {
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
          if (el && await el.isVisible()) {
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
          if (el && await el.isVisible()) {
            await el.check();
            console.log(`[TimePayment] Checked ${sel}`);
            return true;
          }
        } catch (e) {}
      }
      return false;
    }

    // Fill function to run on every step
    async function fillCurrentStep() {
      // Log available visible inputs on this step
      try {
        const inputs = await page.$$eval('input, select, textarea', els =>
          els.filter(e => e.offsetParent !== null).map(e => ({
            tag: e.tagName.toLowerCase(),
            name: e.name,
            id: e.id,
            type: e.type,
            placeholder: e.placeholder
          }))
        );
        console.log(`[TimePayment] Step inputs count: ${inputs.length}`, JSON.stringify(inputs));
      } catch (e) {}

      // 1. Initial Contact / Owner Details
      await safeFill(['input[name*="firstName" i]', 'input[id*="firstName" i]', 'input[placeholder*="First Name" i]'], data.primaryOwner?.firstName);
      await safeFill(['input[name*="lastName" i]', 'input[id*="lastName" i]', 'input[placeholder*="Last Name" i]'], data.primaryOwner?.lastName);
      await safeFill(['input[name*="phone" i]', 'input[type="tel"]'], data.primaryOwner?.phone || data.businessPhone);
      await safeFill(['input[name*="email" i]', 'input[type="email"]'], data.primaryOwner?.email || data.businessEmail);
      await safeFill(['input[name*="title" i]', 'input[placeholder*="Title" i]'], data.primaryOwner?.title || 'Owner');
      await safeFill(['input[name*="ownership" i]', 'input[placeholder*="%" i]'], data.primaryOwner?.ownershipPercentage || '100');
      await safeFill(['input[name*="ssn" i]', 'input[id*="ssn" i]', 'input[placeholder*="SSN" i]'], data.primaryOwner?.ssn);

      // 2. Business Details
      await safeFill(['input[name*="legal" i]', 'input[name*="businessName" i]', 'input[id*="businessName" i]', 'input[placeholder*="Legal Name" i]'], data.legalBusinessName);
      await safeFill(['input[name*="dba" i]', 'input[id*="dba" i]', 'input[placeholder*="DBA" i]'], data.dba || data.legalBusinessName);
      await safeFill(['input[name*="ein" i]', 'input[name*="tax" i]', 'input[id*="taxId" i]', 'input[placeholder*="EIN" i]'], data.federalTaxId);
      await safeSelect(['select[name*="entity" i]', 'select[id*="entity" i]', 'select[name*="businessType" i]'], data.businessEntityType || 'LLC');
      await safeFill(['input[name*="timeInBusiness" i]', 'input[name*="years" i]'], '3');

      // Addresses (Business & Home)
      await safeFill(['input[name*="address1" i]', 'input[name*="bizAddress" i]', 'input[name*="street" i]'], data.businessAddress?.line1);
      await safeFill(['input[name*="city" i]', 'input[name*="bizCity" i]'], data.businessAddress?.city);
      await safeSelect(['select[name*="state" i]', 'select[name*="bizState" i]'], data.businessAddress?.state);
      await safeFill(['input[name*="zip" i]', 'input[name*="postal" i]', 'input[name*="bizZip" i]'], data.businessAddress?.postal);

      // Home Address
      await safeFill(['input[name*="homeAddress" i]', 'input[name*="ownerAddress" i]'], data.primaryOwner?.homeAddress?.line1 || data.businessAddress?.line1);
      await safeFill(['input[name*="homeCity" i]', 'input[name*="ownerCity" i]'], data.primaryOwner?.homeAddress?.city || data.businessAddress?.city);
      await safeSelect(['select[name*="homeState" i]', 'select[name*="ownerState" i]'], data.primaryOwner?.homeAddress?.state || data.businessAddress?.state);
      await safeFill(['input[name*="homeZip" i]', 'input[name*="ownerZip" i]'], data.primaryOwner?.homeAddress?.postal || data.businessAddress?.postal);

      // 3. Equipment & Amount
      await safeFill(['input[name*="amount" i]', 'input[id*="amount" i]', 'input[name*="cost" i]', 'input[placeholder*="amount" i]'], data.requestedAmount);
      await safeFill(['textarea[name*="equip" i]', 'input[name*="equip" i]', 'textarea[id*="equip" i]'], data.equipmentDescription);

      // 4. Terms Checkboxes
      await safeCheck(['input[type="checkbox"][name*="agree" i]', 'input[type="checkbox"][id*="terms" i]', 'input[type="checkbox"][name*="warrant" i]', 'input[type="checkbox"]']);
    }

    // Step-by-step navigation loop (up to 6 steps)
    for (let step = 0; step < 6; step++) {
      console.log(`[TimePayment] --- Step ${step}: Current URL: ${page.url()} ---`);

      await fillCurrentStep();
      await page.waitForTimeout(1000);

      // Find the next or submit button
      const nextBtn = await page.$(
        'button[type="submit"], input[type="submit"], button:has-text("Continue"), button:has-text("Next"), button:has-text("Submit"), button:has-text("Apply")'
      );

      if (!nextBtn) {
        console.log('[TimePayment] No further navigation button found. Wizard completed or final step reached.');
        break;
      }

      const prevUrl = page.url();
      console.log('[TimePayment] Clicking next/continue button...');
      await nextBtn.click();
      await page.waitForTimeout(3500);

      const newUrl = page.url();
      if (newUrl.toLowerCase().includes('confirm') || newUrl.toLowerCase().includes('thank') || newUrl.toLowerCase().includes('success')) {
        console.log('[TimePayment] Final confirmation page reached!', newUrl);
        break;
      }

      if (newUrl === prevUrl && step > 0) {
        // Try clicking submit if button text changed
        const finalSubmit = await page.$('button:has-text("Submit"), input[value*="Submit" i]');
        if (finalSubmit) {
          await finalSubmit.click();
          await page.waitForTimeout(4000);
        }
        break;
      }
    }

    const finalUrl = page.url();
    console.log('[TimePayment] Wizard finished at:', finalUrl);

    await browser.close();
    return {
      success: true,
      finalUrl
    };

  } catch (error) {
    console.error('[TimePayment] Execution error:', error.message);
    if (browser) await browser.close().catch(() => {});
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = { submitToTimePayment };
