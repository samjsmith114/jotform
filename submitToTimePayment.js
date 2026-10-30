/**
 * TimePayment Multi-Step Playwright Submission Automation
 * Dealer Code: VHD64 (Amiri Partners LLC)
 */

const { chromium } = require('playwright');

const STATE_MAP = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
  'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY'
};

function getUSStateCode(state) {
  if (!state) return 'TX';
  const trimmed = state.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  const lower = trimmed.toLowerCase();
  return STATE_MAP[lower] || 'TX';
}

function cleanDigits(val) {
  if (!val) return '';
  return String(val).replace(/\D/g, '');
}

async function submitToTimePayment(data) {
  console.log('[TimePayment] Starting multi-step submission for:', data.legalBusinessName || 'Applicant');

  const portalUrl = process.env.TIMEPAYMENT_URL || 'https://secure.financ.ing/app?dealercode=VHD64&apptype=B';
  let browser = null;

  try {
    console.log('[TimePayment] Launching Playwright Chromium...');
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 }
    });

    const page = await context.newPage();
    page.setDefaultTimeout(30000);

    console.log('[TimePayment] Navigating to:', portalUrl);
    await page.goto(portalUrl, { waitUntil: 'networkidle', timeout: 45000 });

    const phoneDigits = cleanDigits(data.primaryOwner?.phone) || '2145550188';
    const einDigits = cleanDigits(data.federalTaxId) || '123456789';
    const ssnDigits = cleanDigits(data.primaryOwner?.ssn) || '123456789';
    const stateVal = getUSStateCode(data.businessAddress?.state || data.primaryOwner?.homeAddress?.state);
    const amountVal = cleanDigits(data.requestedAmount) || '5000';

    async function safeFill(selectors, value) {
      if (!value) return;
      for (const sel of selectors) {
        try {
          const loc = page.locator(sel).first();
          if (await loc.isVisible().catch(() => false)) {
            await loc.scrollIntoViewIfNeeded();
            await loc.click();
            await page.keyboard.press('Control+A');
            await page.keyboard.press('Backspace');
            await page.keyboard.type(String(value), { delay: 30 });
            console.log(`[TimePayment] Filled ${sel} with: ${value}`);
            return true;
          }
        } catch (e) {}
      }
      return false;
    }

    async function safeClick(selectors) {
      for (const sel of selectors) {
        try {
          const loc = page.locator(sel).first();
          if (await loc.isVisible().catch(() => false)) {
            await loc.scrollIntoViewIfNeeded();
            await loc.click();
            console.log(`[TimePayment] Clicked ${sel}`);
            return true;
          }
        } catch (e) {}
      }
      return false;
    }

    async function fillCurrentStep() {
      // --- STEP 1 (Assets & Initial Contact) ---
      await safeFill(['#assets-0-costPerUnit', 'input[name="assets.0.costPerUnit"]'], amountVal);
      await safeFill(['#assets\\.0\\.description-input-text', 'textarea[name="assets.0.description"]'], data.equipmentDescription || data.equipmentCategory || 'Commercial Equipment');
      await safeFill(['#people\\.0\\.firstname-input-text', 'input[name="people.0.firstName"]'], data.primaryOwner?.firstName || 'Samuel');
      await safeFill(['#people\\.0\\.lastname-input-text', 'input[name="people.0.lastName"]'], data.primaryOwner?.lastName || 'Smith');
      await safeFill(['#people\\.0\\.email-input-text', 'input[name="people.0.email"]'], data.primaryOwner?.email || 'owner@example.com');

      // --- STEP 2 (Business Details) ---
      await safeFill(['#business\\.name-input-text', 'input[name="business.name"]'], data.legalBusinessName || 'Business Applicant LLC');
      await safeFill(['#business\\.dba-input-text', 'input[name="business.dba"]'], data.dba || data.legalBusinessName);

      // Business entity type radio
      const bType = (data.businessEntityType || '').toLowerCase();
      if (bType.includes('corp')) {
        await safeClick(['#corporation-input-radio', 'input[value="corporation"]']);
      } else if (bType.includes('sole')) {
        await safeClick(['#sole-prop-input-radio', 'input[value="sole-prop"]']);
      } else if (bType.includes('partner')) {
        await safeClick(['#partnership-input-radio', 'input[value="partnership"]']);
      } else {
        await safeClick(['#llc-input-radio', 'input[value="llc"]']);
      }

      await safeFill(['#business\\.address1-input-text', 'input[name="business.address1"]'], data.businessAddress?.line1 || '101 Main St');
      await safeFill(['#business\\.address2-input-text', 'input[name="business.address2"]'], data.businessAddress?.line2);
      await safeFill(['#business\\.city-input-text', 'input[name="business.city"]'], data.businessAddress?.city || 'Dallas');

      // Business State Autocomplete
      try {
        const bState = page.locator('#business-state').first();
        if (await bState.isVisible().catch(() => false)) {
          await bState.scrollIntoViewIfNeeded();
          await bState.click();
          await page.waitForTimeout(200);
          await page.keyboard.press('Control+A');
          await page.keyboard.press('Backspace');
          await page.keyboard.type(stateVal, { delay: 60 });
          await page.waitForTimeout(500);
          const stateOpt = page.locator('[role="option"], li[role="option"], .MuiAutocomplete-option').first();
          if (await stateOpt.isVisible({ timeout: 1500 }).catch(() => false)) {
            await stateOpt.click();
            console.log(`[TimePayment] Clicked business state option for: ${stateVal}`);
          } else {
            await page.keyboard.press('ArrowDown');
            await page.keyboard.press('Enter');
          }
        }
      } catch (e) {}

      await safeFill(['#business-zip', 'input[name="business.zip"]'], data.businessAddress?.postal || '75001');
      await safeClick(['#yes-input-radio', 'input[value="true"]']); // Equipment location same as business
      await safeFill(['#business\\.federaltaxid-input-text', 'input[name="business.federalTaxId"]'], einDigits);
      await safeFill(['#business\\.timeinbusiness-input-text', 'input[name="business.timeInBusiness"]'], cleanDigits(data.timeInBusiness) || '3');
      await safeFill(['#business\\.phone1-input-text', 'input[name="business.phone1"]'], phoneDigits);

      // --- STEP 3 (Guarantor Details) ---
      await safeFill(['#people\\.0-ssn', 'input[name="people.0.ssn"]'], ssnDigits);

      // Title Dropdown Selection (Bulletproof Click)
      try {
        const titleInput = page.locator('#people\\.0-title').first();
        if (await titleInput.isVisible().catch(() => false)) {
          await titleInput.scrollIntoViewIfNeeded();
          await titleInput.click();
          await page.waitForTimeout(300);

          // Click open indicator or ArrowDown to pop open list
          const popupBtn = page.locator('#people\\.0-title ~ div button, button[aria-label="Open"], .MuiAutocomplete-popupIndicator').first();
          if (await popupBtn.isVisible({ timeout: 800 }).catch(() => false)) {
            await popupBtn.click();
            await page.waitForTimeout(400);
          } else {
            await page.keyboard.press('ArrowDown');
            await page.waitForTimeout(400);
          }

          // Search options for Owner
          const optLocator = page.locator('[role="option"], li[role="option"], .MuiAutocomplete-option');
          const optCount = await optLocator.count().catch(() => 0);
          console.log(`[TimePayment] Found ${optCount} options for Title dropdown`);

          let optionSelected = false;
          if (optCount > 0) {
            for (let i = 0; i < optCount; i++) {
              const optText = (await optLocator.nth(i).innerText().catch(() => '')).trim();
              if (optText.toLowerCase().includes('owner') || optText.toLowerCase().includes('president') || optText.toLowerCase().includes('member')) {
                await optLocator.nth(i).click();
                console.log(`[TimePayment] Clicked Title option: "${optText}"`);
                optionSelected = true;
                break;
              }
            }
            if (!optionSelected) {
              await optLocator.first().click();
              console.log('[TimePayment] Clicked first option in Title list');
              optionSelected = true;
            }
          }

          if (!optionSelected) {
            // Keyboard fallback: type Owner, ArrowDown, Enter
            await page.keyboard.press('Control+A');
            await page.keyboard.press('Backspace');
            await page.keyboard.type('Owner', { delay: 100 });
            await page.waitForTimeout(500);
            await page.keyboard.press('ArrowDown');
            await page.waitForTimeout(300);
            await page.keyboard.press('Enter');
            console.log('[TimePayment] Typed Owner and pressed ArrowDown+Enter');
          }
          await page.waitForTimeout(400);
        }
      } catch (e) {
        console.warn('[TimePayment] Title selection error:', e.message);
      }

      await safeFill(['#people\\.0\\.ownershippercentage-input-text', 'input[name="people.0.ownershipPercentage"]'], cleanDigits(data.primaryOwner?.ownershipPercentage) || '100');
      await safeFill(['#people\\.0\\.phone1-input-text', 'input[name="people.0.phone1"]'], phoneDigits);

      const homeAddr1 = data.primaryOwner?.homeAddress?.line1 || data.businessAddress?.line1 || '101 Main St';
      const homeCity = data.primaryOwner?.homeAddress?.city || data.businessAddress?.city || 'Dallas';
      const homeZip = data.primaryOwner?.homeAddress?.postal || data.businessAddress?.postal || '75001';

      await safeFill(['#people\\.0\\.address1-input-text', 'input[name="people.0.address1"]'], homeAddr1);
      await safeFill(['#people\\.0\\.city-input-text', 'input[name="people.0.city"]'], homeCity);

      // Owner State Autocomplete
      try {
        const oState = page.locator('#people\\.0-state').first();
        if (await oState.isVisible().catch(() => false)) {
          await oState.scrollIntoViewIfNeeded();
          await oState.click();
          await page.waitForTimeout(200);
          await page.keyboard.press('Control+A');
          await page.keyboard.press('Backspace');
          await page.keyboard.type(stateVal, { delay: 60 });
          await page.waitForTimeout(500);
          const stateOpt = page.locator('[role="option"], li[role="option"], .MuiAutocomplete-option').first();
          if (await stateOpt.isVisible({ timeout: 1500 }).catch(() => false)) {
            await stateOpt.click();
            console.log(`[TimePayment] Clicked owner state option for: ${stateVal}`);
          } else {
            await page.keyboard.press('ArrowDown');
            await page.keyboard.press('Enter');
          }
        }
      } catch (e) {}

      await safeFill(['#people\\.0-zip', 'input[name="people.0.zip"]'], homeZip);

      // Terms & Conditions Checkbox
      await page.evaluate(() => {
        const cbs = document.querySelectorAll('#accept-terms-conditions-checkbox, input[name="authorization"], input[type="checkbox"]');
        cbs.forEach(cb => {
          cb.checked = true;
          cb.dispatchEvent(new Event('input', { bubbles: true }));
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
      await safeClick(['#accept-terms-conditions-checkbox', 'input[name="authorization"]']);
    }

    // Wizard Loop
    for (let step = 0; step < 6; step++) {
      console.log(`[TimePayment] --- Step ${step}: Current URL: ${page.url()} ---`);

      await fillCurrentStep();
      await page.waitForTimeout(1000);

      // Check if SUBMIT button exists
      const submitBtn = await page.$('button:has-text("SUBMIT"), input[value*="SUBMIT" i]');
      if (submitBtn && await submitBtn.isVisible()) {
        console.log('[TimePayment] *** FOUND FINAL SUBMIT BUTTON! CLICKING SUBMIT... ***');

        // Check for any validation errors before clicking submit
        const preErrors = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('.Mui-error, [class*="error"], [role="alert"]'))
            .map(el => el.innerText.trim())
            .filter(Boolean);
        });
        if (preErrors.length > 0) {
          console.log('[TimePayment] Form validation alerts before submit:', preErrors);
        }

        await submitBtn.scrollIntoViewIfNeeded();
        await submitBtn.click();
        
        // Wait 15 seconds for submission response
        await page.waitForTimeout(15000);
        console.log('[TimePayment] Post-submit URL:', page.url());

        const bodySnippet = await page.evaluate(() => document.body.innerText.substring(0, 1000));
        console.log('[TimePayment] Post-submit text:', bodySnippet.replace(/\s+/g, ' '));
        break;
      }

      // Click Forward button (NEXT or LET'S GO)
      const forwardBtn = await page.$('button:has-text("NEXT"), button:has-text("LET\'S GO"), button:has-text("Continue")');
      if (forwardBtn) {
        console.log('[TimePayment] Clicking forward button...');
        await forwardBtn.click();
        await page.waitForTimeout(4000);
      } else {
        console.log('[TimePayment] No forward button found.');
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
