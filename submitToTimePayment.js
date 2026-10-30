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
    await page.waitForTimeout(2500);

    // Safe Fill Helper
    async function safeFill(selectors, value) {
      if (!value) return false;
      for (const sel of (Array.isArray(selectors) ? selectors : [selectors])) {
        try {
          const el = await page.$(sel);
          if (el && await el.isVisible()) {
            await el.scrollIntoViewIfNeeded();
            await el.fill(String(value));
            console.log(`[TimePayment] Filled ${sel} with: ${value}`);
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

    // Fill all matching fields on current step
    async function fillCurrentStep() {
      // 1. Exact step 0 known inputs
      await safeFill(['input[name="assets.0.costPerUnit"]', '#assets-0-costPerUnit'], data.requestedAmount);
      await safeFill(['textarea[name="assets.0.description"]', 'textarea[id*="description" i]'], data.equipmentDescription);
      await safeFill(['input[name="people.0.firstName"]', '#people\\.0\\.firstname-input-text'], data.primaryOwner?.firstName);
      await safeFill(['input[name="people.0.lastName"]', '#people\\.0\\.lastname-input-text'], data.primaryOwner?.lastName);
      await safeFill(['input[name="people.0.email"]', '#people\\.0\\.email-input-text'], data.primaryOwner?.email);

      // 2. Business details
      await safeFill(['input[name*="legal" i]', 'input[name*="businessName" i]', 'input[id*="businessName" i]', 'input[placeholder*="Legal Name" i]'], data.legalBusinessName);
      await safeFill(['input[name*="dba" i]', 'input[id*="dba" i]'], data.dba || data.legalBusinessName);
      await safeFill(['input[name*="ein" i]', 'input[name*="tax" i]', 'input[id*="tax" i]'], data.federalTaxId);
      await safeSelect(['select[name*="entity" i]', 'select[id*="entity" i]', 'select[name*="businessType" i]'], data.businessEntityType || 'LLC');
      await safeFill(['input[name*="timeInBusiness" i]', 'input[name*="years" i]'], '3');

      // 3. Contacts & SSN
      await safeFill(['input[name*="phone" i]', 'input[name*="mobile" i]', 'input[type="tel"]:not([name*="cost" i])'], data.primaryOwner?.phone);
      await safeFill(['input[name*="title" i]', 'input[placeholder*="Title" i]'], data.primaryOwner?.title || 'Owner');
      await safeFill(['input[name*="ownership" i]', 'input[placeholder*="%" i]'], data.primaryOwner?.ownershipPercentage || '100');
      await safeFill(['input[name*="ssn" i]', 'input[id*="ssn" i]'], data.primaryOwner?.ssn);

      // 4. Addresses
      await safeFill(['input[name*="address1" i]', 'input[name*="street" i]', 'input[name*="bizAddress" i]'], data.businessAddress?.line1);
      await safeFill(['input[name*="city" i]', 'input[name*="bizCity" i]'], data.businessAddress?.city);
      await safeSelect(['select[name*="state" i]', 'select[name*="bizState" i]'], data.businessAddress?.state);
      await safeFill(['input[name*="zip" i]', 'input[name*="postal" i]', 'input[name*="bizZip" i]'], data.businessAddress?.postal);

      // 5. Checkboxes
      await safeCheck(['input[type="checkbox"]']);
    }

    // Step-by-step navigation loop (up to 7 steps)
    for (let step = 0; step < 7; step++) {
      console.log(`[TimePayment] --- Step ${step}: Current URL: ${page.url()} ---`);

      // Introspect inputs on this step
      try {
        const inputs = await page.$$eval('input, select, textarea', els =>
          els.filter(e => e.offsetParent !== null).map(e => ({
            tag: e.tagName.toLowerCase(),
            name: e.name,
            id: e.id,
            type: e.type
          }))
        );
        console.log(`[TimePayment] Step ${step} inputs:`, JSON.stringify(inputs));
      } catch (e) {}

      // Fill current step fields
      await fillCurrentStep();
      await page.waitForTimeout(1000);

      // Introspect clickable buttons
      try {
        const buttons = await page.$$eval('button, a.btn, input[type="submit"], [role="button"]', els =>
          els.filter(e => e.offsetParent !== null).map(e => ({
            tag: e.tagName.toLowerCase(),
            text: (e.innerText || e.value || '').trim()
          }))
        );
        console.log(`[TimePayment] Step ${step} buttons:`, JSON.stringify(buttons));
      } catch (e) {}

      // Click the next / submit button
      const nextBtn = await page.$(
        'button[type="submit"], button:has-text("Continue"), button:has-text("Next"), button:has-text("Submit"), button:has-text("Apply"), a:has-text("Continue"), a:has-text("Next")'
      );

      if (!nextBtn) {
        // Try any primary button
        const anyBtn = await page.$('button.btn-primary, button:not([disabled])');
        if (anyBtn) {
          console.log('[TimePayment] Clicking fallback primary button...');
          await anyBtn.click();
          await page.waitForTimeout(3500);
        } else {
          console.log('[TimePayment] No further buttons found. Finished.');
          break;
        }
      } else {
        console.log('[TimePayment] Clicking next button...');
        await nextBtn.click();
        await page.waitForTimeout(3500);
      }

      const currentUrl = page.url();
      if (currentUrl.toLowerCase().includes('confirm') || currentUrl.toLowerCase().includes('thank') || currentUrl.toLowerCase().includes('success')) {
        console.log('[TimePayment] Final Confirmation reached!', currentUrl);
        break;
      }
    }

    const finalUrl = page.url();
    console.log('[TimePayment] Submission flow completed at:', finalUrl);

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
