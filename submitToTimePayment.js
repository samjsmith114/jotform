const { chromium } = require('playwright');

/**
 * Automates submission to TimePayment application portal
 * URL: https://secure.financ.ing/app?dealercode=VHD64&apptype=B
 */
async function submitToTimePayment(data) {
  console.log('[TimePayment] Starting submission process for:', data.legalBusinessName || data.businessName);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  try {
    const targetUrl = process.env.TIMEPAYMENT_URL || 'https://secure.financ.ing/app?dealercode=VHD64&apptype=B';
    console.log('[TimePayment] Navigating to:', targetUrl);

    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);

    // Helper to safely fill an input by selector
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
        } catch (e) {
          // try next selector
        }
      }
      return false;
    }

    // Helper to select dropdown option
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

    // Helper to check checkbox
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

    // 1. Equipment & Amount details
    await safeFill(['input[name*="amount" i]', 'input[id*="amount" i]', 'input[name*="cost" i]', 'input[placeholder*="amount" i]'], data.requestedAmount);
    await safeFill(['textarea[name*="equip" i]', 'input[name*="equip" i]', 'textarea[id*="equip" i]'], data.equipmentDescription);

    // 2. Business Details
    await safeFill(['input[name*="legal" i]', 'input[name*="businessName" i]', 'input[id*="businessName" i]', 'input[placeholder*="Business Name" i]'], data.legalBusinessName);
    await safeFill(['input[name*="dba" i]', 'input[id*="dba" i]'], data.dba);
    await safeFill(['input[name*="ein" i]', 'input[name*="tax" i]', 'input[id*="taxId" i]', 'input[placeholder*="EIN" i]'], data.federalTaxId);
    await safeSelect(['select[name*="entity" i]', 'select[id*="entity" i]'], data.businessEntityType);

    // Business Address
    await safeFill(['input[name*="bizAddress1" i]', 'input[name*="bAddress" i]', 'input[name*="address1" i]'], data.businessAddress?.line1);
    await safeFill(['input[name*="bizCity" i]', 'input[name*="bCity" i]', 'input[name*="city" i]'], data.businessAddress?.city);
    await safeSelect(['select[name*="bizState" i]', 'select[name*="bState" i]', 'select[name*="state" i]'], data.businessAddress?.state);
    await safeFill(['input[name*="bizZip" i]', 'input[name*="bZip" i]', 'input[name*="zip" i]'], data.businessAddress?.postal);

    // Business Contact
    await safeFill(['input[name*="bizPhone" i]', 'input[name*="bPhone" i]', 'input[type="tel"]'], data.primaryOwner?.phone || data.businessPhone);
    await safeFill(['input[name*="bizEmail" i]', 'input[name*="bEmail" i]', 'input[type="email"]'], data.primaryOwner?.email || data.businessEmail);

    // 3. Primary Owner (Guarantor)
    await safeFill(['input[name*="ownerFirstName" i]', 'input[name*="firstName" i]', 'input[placeholder*="First Name" i]'], data.primaryOwner?.firstName);
    await safeFill(['input[name*="ownerLastName" i]', 'input[name*="lastName" i]', 'input[placeholder*="Last Name" i]'], data.primaryOwner?.lastName);
    await safeFill(['input[name*="title" i]', 'input[placeholder*="Title" i]'], data.primaryOwner?.title || 'Owner');
    await safeFill(['input[name*="ownership" i]', 'input[placeholder*="%" i]'], data.primaryOwner?.ownershipPercentage || '100');
    await safeFill(['input[name*="ssn" i]', 'input[id*="ssn" i]', 'input[placeholder*="SSN" i]'], data.primaryOwner?.ssn);
    await safeFill(['input[name*="dob" i]', 'input[placeholder*="DOB" i]', 'input[placeholder*="Birth" i]'], data.primaryOwner?.dob);

    // Owner Home Address
    await safeFill(['input[name*="homeAddress" i]', 'input[name*="ownerAddress" i]'], data.primaryOwner?.homeAddress?.line1);
    await safeFill(['input[name*="homeCity" i]', 'input[name*="ownerCity" i]'], data.primaryOwner?.homeAddress?.city);
    await safeSelect(['select[name*="homeState" i]', 'select[name*="ownerState" i]'], data.primaryOwner?.homeAddress?.state);
    await safeFill(['input[name*="homeZip" i]', 'input[name*="ownerZip" i]'], data.primaryOwner?.homeAddress?.postal);

    // 4. Agreement Checkboxes
    await safeCheck(['input[type="checkbox"][name*="agree" i]', 'input[type="checkbox"][id*="terms" i]', 'input[type="checkbox"]']);

    // Small delay to let page inputs settle
    await page.waitForTimeout(1500);

    // 5. Submit Application
    console.log('[TimePayment] Attempting to click submit button...');
    const submitBtn = await page.$('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Apply")');

    if (submitBtn) {
      await submitBtn.click();
      console.log('[TimePayment] Submit button clicked. Waiting for confirmation...');
      await page.waitForTimeout(5000);
    } else {
      console.warn('[TimePayment] Submit button not found automatically. Check page selectors.');
    }

    // Capture confirmation or screenshot for verification
    const screenshot = await page.screenshot({ fullPage: true });
    const pageTitle = await page.title();
    const finalUrl = page.url();

    await browser.close();

    return {
      success: true,
      finalUrl,
      pageTitle,
      screenshotBase64: screenshot.toString('base64')
    };

  } catch (error) {
    console.error('[TimePayment] Error during automated submission:', error.message);
    await browser.close().catch(() => {});
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = { submitToTimePayment };
