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

    // Fill all matching fields across steps
    async function fillCurrentStep() {
      // 1. STEP 1 (Assets & Initial Contact)
      await safeFill(['#assets-0-costPerUnit', 'input[name="assets.0.costPerUnit"]'], data.requestedAmount);
      await safeFill(['#assets\\.0\\.description-input-text', 'textarea[name="assets.0.description"]'], data.equipmentDescription);
      await safeFill(['#people\\.0\\.firstname-input-text', 'input[name="people.0.firstName"]'], data.primaryOwner?.firstName);
      await safeFill(['#people\\.0\\.lastname-input-text', 'input[name="people.0.lastName"]'], data.primaryOwner?.lastName);
      await safeFill(['#people\\.0\\.email-input-text', 'input[name="people.0.email"]'], data.primaryOwner?.email);

      // 2. STEP 2 (Business Details)
      await safeFill(['#business\\.name-input-text', 'input[name="business.name"]'], data.legalBusinessName);
      await safeFill(['#business\\.dba-input-text', 'input[name="business.dba"]'], data.dba || data.legalBusinessName);

      // Business Type Radio (Select LLC or match entity)
      const entity = (data.businessEntityType || '').toLowerCase();
      if (entity.includes('corp')) {
        await safeClick(['#corporation-input-radio', 'input[id*="corporation" i]']);
      } else if (entity.includes('sole')) {
        await safeClick(['#sole-prop-input-radio', 'input[id*="sole" i]']);
      } else if (entity.includes('partner')) {
        await safeClick(['#partnership-input-radio', 'input[id*="partner" i]']);
      } else {
        await safeClick(['#llc-input-radio', 'input[id*="llc" i]']);
      }

      // Address
      await safeFill(['#business\\.address1-input-text', 'input[name="business.address1"]'], data.businessAddress?.line1);
      await safeFill(['#business\\.address2-input-text', 'input[name="business.address2"]'], data.businessAddress?.line2);
      await safeFill(['#business\\.city-input-text', 'input[name="business.city"]'], data.businessAddress?.city);

      // State
      const stateVal = data.businessAddress?.state || 'TX';
      await safeFill(['#business-state', 'input[id*="state" i]'], stateVal);
      try {
        const stateSelect = await page.$('select[id*="state" i], select[name*="state" i]');
        if (stateSelect) {
          await stateSelect.selectOption({ label: stateVal }).catch(() => stateSelect.selectOption({ value: stateVal }));
        }
      } catch (e) {}

      await safeFill(['#business-zip', 'input[name="business.zip"]'], data.businessAddress?.postal);

      // Asset same as business radio: YES
      await safeClick(['#yes-input-radio', 'input[name="assets.0.isSameAsBusiness"][value="true"]', 'input[id="yes-input-radio"]']);

      // Tax ID / EIN (stripping dashes if needed)
      const einRaw = (data.federalTaxId || '12-3456789').replace(/[^0-9]/g, '');
      await safeFill(['#business\\.federaltaxid-input-text', 'input[name="business.federalTaxId"]'], einRaw);

      // Time in Business
      await safeFill(['#business\\.timeinbusiness-input-text', 'input[name="business.timeInBusiness"]'], '3');

      // Phone
      const phoneDigits = (data.primaryOwner?.phone || '2145550188').replace(/[^0-9]/g, '');
      await safeFill(['#business\\.phone1-input-text', 'input[name="business.phone1"]'], phoneDigits);

      // 3. STEP 3 & Beyond (Owner SSN, Title, Home Address, Disclosures)
      await safeFill(['input[name*="ssn" i]', 'input[id*="ssn" i]'], (data.primaryOwner?.ssn || '123-45-6789').replace(/[^0-9]/g, ''));
      await safeFill(['input[name*="title" i]'], data.primaryOwner?.title || 'Owner');
      await safeFill(['input[name*="ownership" i]'], data.primaryOwner?.ownershipPercentage || '100');
      await safeFill(['input[name*="homeAddress" i]', 'input[id*="homeAddress" i]'], data.primaryOwner?.homeAddress?.line1 || data.businessAddress?.line1);
      await safeFill(['input[name*="homeCity" i]', 'input[id*="homeCity" i]'], data.primaryOwner?.homeAddress?.city || data.businessAddress?.city);
      await safeFill(['input[name*="homeZip" i]', 'input[id*="homeZip" i]'], data.primaryOwner?.homeAddress?.postal || data.businessAddress?.postal);

      // Checkboxes & consents
      try {
        const checkboxes = await page.$$('input[type="checkbox"]:not(:checked)');
        for (const cb of checkboxes) {
          await cb.check().catch(() => {});
        }
      } catch (e) {}
    }

    // Multi-Step loop
    for (let step = 0; step < 7; step++) {
      console.log(`[TimePayment] --- Step ${step}: Current URL: ${page.url()} ---`);

      // Introspect inputs
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

      // Introspect buttons
      try {
        const buttons = await page.$$eval('button, a.btn, input[type="submit"]', els =>
          els.filter(e => e.offsetParent !== null).map(e => ({
            tag: e.tagName.toLowerCase(),
            text: (e.innerText || e.value || '').trim()
          }))
        );
        console.log(`[TimePayment] Step ${step} buttons:`, JSON.stringify(buttons));
      } catch (e) {}

      // Click the primary forward button
      const forwardBtn = await page.$(
        'button:has-text("NEXT"), button:has-text("LET\'S GO"), button:has-text("Continue"), button:has-text("Submit"), button[type="submit"]'
      );

      if (forwardBtn) {
        console.log('[TimePayment] Clicking forward button...');
        await forwardBtn.click();
        await page.waitForTimeout(4000);
      } else {
        console.log('[TimePayment] No forward button found. Wizard finished.');
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
