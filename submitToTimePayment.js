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

    // Safe Click Helper
    async function safeClick(selectors) {
      for (const sel of (Array.isArray(selectors) ? selectors : [selectors])) {
        try {
          const el = await page.$(sel);
          if (el && await el.isVisible()) {
            await el.scrollIntoViewIfNeeded();
            await el.click();
            console.log(`[TimePayment] Clicked ${sel}`);
            return true;
          }
        } catch (e) {}
      }
      return false;
    }

    const phoneDigits = (data.primaryOwner?.phone || '2145550188').replace(/[^0-9]/g, '');
    const ssnDigits = (data.primaryOwner?.ssn || '123-45-6789').replace(/[^0-9]/g, '');
    const einDigits = (data.federalTaxId || '12-3456789').replace(/[^0-9]/g, '');
    const stateVal = data.businessAddress?.state || 'TX';

    // Fill all matching fields across steps
    async function fillCurrentStep() {
      // --- STEP 1 (Assets & Initial Contact) ---
      await safeFill(['#assets-0-costPerUnit', 'input[name="assets.0.costPerUnit"]'], data.requestedAmount);
      await safeFill(['#assets\\.0\\.description-input-text', 'textarea[name="assets.0.description"]'], data.equipmentDescription);
      await safeFill(['#people\\.0\\.firstname-input-text', 'input[name="people.0.firstName"]'], data.primaryOwner?.firstName);
      await safeFill(['#people\\.0\\.lastname-input-text', 'input[name="people.0.lastName"]'], data.primaryOwner?.lastName);
      await safeFill(['#people\\.0\\.email-input-text', 'input[name="people.0.email"]'], data.primaryOwner?.email);

      // --- STEP 2 (Business Details) ---
      await safeFill(['#business\\.name-input-text', 'input[name="business.name"]'], data.legalBusinessName);
      await safeFill(['#business\\.dba-input-text', 'input[name="business.dba"]'], data.dba || data.legalBusinessName);

      const entity = (data.businessEntityType || '').toLowerCase();
      if (entity.includes('corp')) {
        await safeClick(['#corporation-input-radio']);
      } else if (entity.includes('sole')) {
        await safeClick(['#sole-prop-input-radio']);
      } else if (entity.includes('partner')) {
        await safeClick(['#partnership-input-radio']);
      } else {
        await safeClick(['#llc-input-radio']);
      }

      await safeFill(['#business\\.address1-input-text', 'input[name="business.address1"]'], data.businessAddress?.line1);
      await safeFill(['#business\\.address2-input-text', 'input[name="business.address2"]'], data.businessAddress?.line2);
      await safeFill(['#business\\.city-input-text', 'input[name="business.city"]'], data.businessAddress?.city);

      // Business State
      try {
        const bState = await page.$('#business-state');
        if (bState && await bState.isVisible()) {
          await bState.click();
          await bState.fill(stateVal);
          await page.waitForTimeout(300);
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('Enter');
        }
      } catch (e) {}

      await safeFill(['#business-zip', 'input[name="business.zip"]'], data.businessAddress?.postal || '75001');
      await safeClick(['#yes-input-radio']);
      await safeFill(['#business\\.federaltaxid-input-text', 'input[name="business.federalTaxId"]'], einDigits);
      await safeFill(['#business\\.timeinbusiness-input-text', 'input[name="business.timeInBusiness"]'], '3');
      await safeFill(['#business\\.phone1-input-text', 'input[name="business.phone1"]'], phoneDigits);

      // --- STEP 3 (Owner Guarantor & Final Authorization) ---
      await safeFill(['#people\\.0-ssn', 'input[name="people.0.ssn"]'], ssnDigits);

      // Owner Title (Autocomplete dropdown handling)
      try {
        const titleInput = await page.$('#people\\.0-title');
        if (titleInput && await titleInput.isVisible()) {
          await titleInput.scrollIntoViewIfNeeded();
          await titleInput.click();
          await titleInput.fill('Owner');
          await page.waitForTimeout(400);
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('Enter');

          // If option list exists, click Owner item
          const opt = await page.$('[role="option"]:has-text("Owner"), li:has-text("Owner"), .MuiAutocomplete-option:has-text("Owner")');
          if (opt) {
            await opt.click();
            console.log('[TimePayment] Selected Owner from title dropdown');
          }
        }
      } catch (e) {}

      await safeFill(['#people\\.0\\.ownershippercentage-input-text', 'input[name="people.0.ownershipPercentage"]'], data.primaryOwner?.ownershipPercentage || '100');
      await safeFill(['#people\\.0\\.phone1-input-text', 'input[name="people.0.phone1"]'], phoneDigits);

      const homeAddr1 = data.primaryOwner?.homeAddress?.line1 || data.businessAddress?.line1 || '101 Elm Street';
      const homeCity = data.primaryOwner?.homeAddress?.city || data.businessAddress?.city || 'Dallas';
      const homeZip = data.primaryOwner?.homeAddress?.postal || data.businessAddress?.postal || '75001';

      await safeFill(['#people\\.0\\.address1-input-text', 'input[name="people.0.address1"]'], homeAddr1);
      await safeFill(['#people\\.0\\.city-input-text', 'input[name="people.0.city"]'], homeCity);

      // Owner State
      try {
        const oState = await page.$('#people\\.0-state');
        if (oState && await oState.isVisible()) {
          await oState.click();
          await oState.fill(stateVal);
          await page.waitForTimeout(300);
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('Enter');
        }
      } catch (e) {}

      await safeFill(['#people\\.0-zip', 'input[name="people.0.zip"]'], homeZip);

      // Explicitly check terms checkbox
      await page.evaluate(() => {
        const cb = document.querySelector('#accept-terms-conditions-checkbox') || document.querySelector('input[type="checkbox"]');
        if (cb) {
          cb.checked = true;
          cb.dispatchEvent(new Event('input', { bubbles: true }));
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await safeClick(['#accept-terms-conditions-checkbox', 'input[name="authorization"]']);
    }

    // Multi-Step loop
    for (let step = 0; step < 6; step++) {
      console.log(`[TimePayment] --- Step ${step}: Current URL: ${page.url()} ---`);

      // Fill current step fields
      await fillCurrentStep();
      await page.waitForTimeout(1000);

      // Check if SUBMIT button is available (Final Step)
      const submitBtn = await page.$('button:has-text("SUBMIT"), input[value*="SUBMIT" i]');
      if (submitBtn && await submitBtn.isVisible()) {
        console.log('[TimePayment] *** FOUND FINAL SUBMIT BUTTON! CLICKING SUBMIT... ***');
        await submitBtn.scrollIntoViewIfNeeded();
        await submitBtn.click();
        
        // Wait 10 seconds for submission completion
        await page.waitForTimeout(10000);
        console.log('[TimePayment] Post-submit URL:', page.url());

        const bodySnippet = await page.evaluate(() => document.body.innerText.substring(0, 700));
        console.log('[TimePayment] Post-submit page text snippet:', bodySnippet.replace(/\s+/g, ' '));
        break;
      }

      // Otherwise click forward button (LET'S GO or NEXT)
      const forwardBtn = await page.$(
        'button:has-text("NEXT"), button:has-text("LET\'S GO"), button:has-text("Continue")'
      );

      if (forwardBtn) {
        console.log('[TimePayment] Clicking forward button...');
        await forwardBtn.click();
        await page.waitForTimeout(4000);
      } else {
        console.log('[TimePayment] No forward button found. Checking state...');
        break;
      }

      const currentUrl = page.url();
      if (currentUrl.toLowerCase().includes('confirm') || currentUrl.toLowerCase().includes('thank') || currentUrl.toLowerCase().includes('success')) {
        console.log('[TimePayment] Final Confirmation reached!', currentUrl);
        break;
      }
    }

    const finalUrl = page.url();
    console.log('[TimePayment] Flow complete at:', finalUrl);

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
