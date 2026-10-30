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

    // Track relevant network traffic and capture response bodies
    page.on('request', req => {
      const u = req.url();
      if (req.method() === 'POST' || u.includes('applications')) {
        console.log(`[TimePayment Network] -> ${req.method()} ${u.substring(0, 120)}`);
      }
    });

    page.on('response', async res => {
      const u = res.url();
      if (u.includes('applications') || (res.status() >= 400 && u.includes('timepayment'))) {
        console.log(`[TimePayment Network Response] <- [${res.status()}] ${u}`);
        try {
          const body = await res.text();
          console.log(`[TimePayment Network API Body]:`, body);
        } catch (e) {}
      }
    });

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

    async function selectState(selectorId, state) {
      try {
        const sel = `#${selectorId.replace('.', '\\.')}`;
        const input = page.locator(sel).first();
        if (await input.isVisible().catch(() => false)) {
          await input.scrollIntoViewIfNeeded();
          await input.click();
          await page.waitForTimeout(200);
          await page.keyboard.press('Control+A');
          await page.keyboard.press('Backspace');
          await page.keyboard.type(state, { delay: 60 });
          await page.waitForTimeout(400);

          const opt = page.locator('[role="option"], li[role="option"], .MuiAutocomplete-option').first();
          if (await opt.isVisible({ timeout: 1200 }).catch(() => false)) {
            await opt.click();
            console.log(`[TimePayment] Clicked state option for ${selectorId}: ${state}`);
            return;
          } else {
            await page.keyboard.press('ArrowDown');
            await page.keyboard.press('Enter');
            console.log(`[TimePayment] Pressed ArrowDown+Enter for state ${selectorId}: ${state}`);
          }
        } else {
          // If not visible directly, set via JS evaluate
          await page.evaluate(({ id, val }) => {
            const el = document.getElementById(id);
            if (el) {
              el.value = val;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, { id: selectorId, val: state });
        }
      } catch (err) {
        console.warn(`[TimePayment] State selection warning for ${selectorId}:`, err.message);
      }
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

      await safeFill(['#business\\.address1-input-text', 'input[name="business.address1"]'], data.businessAddress?.line1 || '200 Logistics Blvd');
      await safeFill(['#business\\.address2-input-text', 'input[name="business.address2"]'], data.businessAddress?.line2);
      await safeFill(['#business\\.city-input-text', 'input[name="business.city"]'], data.businessAddress?.city || 'Dallas');

      // Business State
      await selectState('business-state', stateVal);

      await safeFill(['#business-zip', 'input[name="business.zip"]'], data.businessAddress?.postal || '75001');
      await safeClick(['#yes-input-radio', 'input[value="true"]']); // Equipment location same as business
      await safeFill(['#business\\.federaltaxid-input-text', 'input[name="business.federalTaxId"]'], einDigits);
      await safeFill(['#business\\.timeinbusiness-input-text', 'input[name="business.timeInBusiness"]'], cleanDigits(data.timeInBusiness) || '4');
      await safeFill(['#business\\.phone1-input-text', 'input[name="business.phone1"]'], phoneDigits);

      // --- STEP 3 (Guarantor Details) ---
      await safeFill(['#people\\.0-ssn', 'input[name="people.0.ssn"]'], ssnDigits);

      // Title Dropdown Selection
      try {
        const titleLoc = page.locator('#people\\.0-title').first();
        if (await titleLoc.isVisible().catch(() => false)) {
          await titleLoc.scrollIntoViewIfNeeded();
          await titleLoc.click();
          await page.waitForTimeout(300);
          await page.keyboard.press('ArrowDown');
          await page.waitForTimeout(400);

          const opt = page.locator('[role="option"]:has-text("Owner"), li:has-text("Owner"), .MuiAutocomplete-option:has-text("Owner")').first();
          if (await opt.isVisible({ timeout: 1500 }).catch(() => false)) {
            await opt.click();
            console.log('[TimePayment] Successfully clicked Owner option!');
          } else {
            const anyOpt = page.locator('[role="option"], li[role="option"], .MuiAutocomplete-option').first();
            if (await anyOpt.isVisible({ timeout: 1500 }).catch(() => false)) {
              await anyOpt.click();
              console.log('[TimePayment] Clicked first option in title listbox!');
            } else {
              await page.keyboard.type('Owner', { delay: 60 });
              await page.keyboard.press('Enter');
            }
          }
        }
      } catch (e) {
        console.warn('[TimePayment] Title selection error:', e.message);
      }

      await safeFill(['#people\\.0\\.ownershippercentage-input-text', 'input[name="people.0.ownershipPercentage"]'], cleanDigits(data.primaryOwner?.ownershipPercentage) || '100');
      await safeFill(['#people\\.0\\.phone1-input-text', 'input[name="people.0.phone1"]'], phoneDigits);

      const homeAddr1 = data.primaryOwner?.homeAddress?.line1 || data.businessAddress?.line1 || '200 Logistics Blvd';
      const homeCity = data.primaryOwner?.homeAddress?.city || data.businessAddress?.city || 'Dallas';
      const homeZip = data.primaryOwner?.homeAddress?.postal || data.businessAddress?.postal || '75001';

      await safeFill(['#people\\.0\\.address1-input-text', 'input[name="people.0.address1"]'], homeAddr1);
      await safeFill(['#people\\.0\\.city-input-text', 'input[name="people.0.city"]'], homeCity);

      // Owner State
      await selectState('people.0-state', stateVal);

      await safeFill(['#people\\.0-zip', 'input[name="people.0.zip"]'], homeZip);

      // Terms & Conditions Checkbox
      try {
        const cb = page.locator('#accept-terms-conditions-checkbox').first();
        if (await cb.isVisible().catch(() => false)) {
          if (!await cb.isChecked()) {
            await cb.click();
            console.log('[TimePayment] Clicked terms checkbox locator');
          }
        } else {
          const cbLabel = page.locator('label:has(#accept-terms-conditions-checkbox), label:has-text("authorize")').first();
          if (await cbLabel.isVisible().catch(() => false)) {
            await cbLabel.click();
            console.log('[TimePayment] Clicked terms label/container');
          }
        }
      } catch (e) {}

      await page.evaluate(() => {
        const cbs = document.querySelectorAll('#accept-terms-conditions-checkbox, input[name="authorization"], input[type="checkbox"]');
        cbs.forEach(cb => {
          if (!cb.checked) cb.click();
        });
      });
    }

    // Wizard Loop
    for (let step = 0; step < 6; step++) {
      console.log(`[TimePayment] --- Step ${step}: Current URL: ${page.url()} ---`);

      await fillCurrentStep();
      await page.waitForTimeout(1000);

      // Check if SUBMIT button exists
      const submitBtn = await page.$('button:has-text("SUBMIT"), input[value*="SUBMIT" i]');
      if (submitBtn && await submitBtn.isVisible()) {
        console.log('[TimePayment] *** FOUND FINAL SUBMIT BUTTON! ***');

        // Detailed Form State and Error Check
        const formState = await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim().toUpperCase() === 'SUBMIT');
          const errors = Array.from(document.querySelectorAll('.Mui-error, [class*="error"], [role="alert"]')).map(e => e.innerText.trim()).filter(Boolean);
          const stateEls = Array.from(document.querySelectorAll('[id*="state"]')).map(s => ({ id: s.id, val: s.value }));
          return {
            buttonFound: !!btn,
            buttonDisabled: btn ? btn.disabled : false,
            errors,
            states: stateEls
          };
        });
        console.log('[TimePayment Form State Before Submit]:', JSON.stringify(formState));

        await submitBtn.scrollIntoViewIfNeeded();
        await submitBtn.click({ force: true });
        console.log('[TimePayment] Clicked submit button!');
        
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
