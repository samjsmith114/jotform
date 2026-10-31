/**
 * TimePayment Multi-Step Playwright Submission Automation
 * Dealer Code: VHD64 (Amiri Partners LLC)
 */

const { chromium } = require('playwright');
const path = require('path');

const STATE_NAMES = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
  'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
  'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
  'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
  'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
  'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
  'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
  'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
};

function getStateFullName(input) {
  if (!input) return 'Texas';
  const trimmed = input.trim();
  if (trimmed.length === 2 && STATE_NAMES[trimmed.toUpperCase()]) {
    return STATE_NAMES[trimmed.toUpperCase()];
  }
  for (const [code, name] of Object.entries(STATE_NAMES)) {
    if (trimmed.toLowerCase() === name.toLowerCase()) return name;
  }
  return 'Texas';
}

function cleanDigits(val) {
  if (!val) return '';
  return String(val).replace(/\D/g, '');
}

async function submitToTimePayment(data, onLog) {
  function emitLog(msg) {
    console.log(`[TimePayment] ${msg}`);
    if (typeof onLog === 'function') {
      try { onLog(msg); } catch (e) {}
    }
  }

  emitLog(`Starting multi-step submission for: ${data.legalBusinessName || 'Applicant'}`);

  const portalUrl = process.env.TIMEPAYMENT_URL || 'https://secure.financ.ing/app?dealercode=VHD64&apptype=B';
  let browser = null;
  let page = null;

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

    page = await context.newPage();
    page.setDefaultTimeout(30000);

    // Track relevant network traffic
    page.on('request', req => {
      const u = req.url();
      if (req.method() === 'POST' || u.includes('applications')) {
        console.log(`[TimePayment Network] -> ${req.method()} ${u.substring(0, 120)}`);
      }
    });

    page.on('response', async res => {
      const u = res.url();
      if (u.includes('applications')) {
        console.log(`[TimePayment Network Response] <- [${res.status()}] ${u}`);
        try {
          const body = await res.text();
          console.log(`[TimePayment API Response Body]:`, body.substring(0, 500));
        } catch (e) {}
      }
    });

    console.log('[TimePayment] Navigating to:', portalUrl);
    emitLog('Navigating to TimePayment financing portal...');
    await page.goto(portalUrl, { waitUntil: 'networkidle', timeout: 45000 });
    emitLog('Loaded portal successfully. Beginning step-by-step submission.');

    const phoneDigits = cleanDigits(data.primaryOwner?.phone) || '2145550188';
    const einDigits = cleanDigits(data.federalTaxId) || '123456789';
    const ssnDigits = cleanDigits(data.primaryOwner?.ssn) || '123456789';
    const stateName = getStateFullName(data.businessAddress?.state || data.primaryOwner?.homeAddress?.state);
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

    async function selectState(elementId, state) {
      try {
        const input = page.locator(`[id="${elementId}"]`).first();
        if (await input.isVisible().catch(() => false)) {
          await input.scrollIntoViewIfNeeded();
          await input.click();
          await page.waitForTimeout(200);
          await page.keyboard.press('Control+A');
          await page.keyboard.press('Backspace');
          await page.keyboard.type(state, { delay: 80 });
          await page.waitForTimeout(500);

          const opt = page.locator(`[role="option"]:has-text("${state}"), li:has-text("${state}"), .MuiAutocomplete-option:has-text("${state}")`).first();
          if (await opt.isVisible({ timeout: 1500 }).catch(() => false)) {
            await opt.click();
            console.log(`[TimePayment] Clicked state option "${state}" for id="${elementId}"`);
            return;
          } else {
            await page.keyboard.press('ArrowDown');
            await page.waitForTimeout(200);
            await page.keyboard.press('Enter');
            console.log(`[TimePayment] Pressed ArrowDown+Enter for state id="${elementId}"`);
          }
        } else {
          // If input not directly visible, click the container or label
          console.warn(`[TimePayment] State input [id="${elementId}"] not visible directly. Trying container...`);
          const container = page.locator(`div:has(>[id="${elementId}"])`).first();
          if (await container.isVisible().catch(() => false)) {
            await container.click();
            await page.keyboard.type(state, { delay: 80 });
            await page.waitForTimeout(400);
            await page.keyboard.press('ArrowDown');
            await page.keyboard.press('Enter');
          }
        }
      } catch (err) {
        console.warn(`[TimePayment] State selection warning for id="${elementId}":`, err.message);
      }
    }

    async function fillCurrentStep() {
      // --- STEP 1 (Assets & Initial Contact) ---
      await safeFill(['[id="assets-0-costPerUnit"]', 'input[name="assets.0.costPerUnit"]'], amountVal);
      const fullEquipmentDesc = data.formattedEquipmentDescription || (data.equipmentCategory && data.equipmentDescription ? `${data.equipmentCategory} - ${data.equipmentDescription}` : (data.equipmentDescription || data.equipmentCategory || 'Commercial Equipment'));
      await safeFill(['[id="assets.0.description-input-text"]', 'textarea[name="assets.0.description"]'], fullEquipmentDesc);
      await safeFill(['[id="people.0.firstname-input-text"]', 'input[name="people.0.firstName"]'], data.primaryOwner?.firstName || 'Samuel');
      await safeFill(['[id="people.0.lastname-input-text"]', 'input[name="people.0.lastName"]'], data.primaryOwner?.lastName || 'Smith');
      await safeFill(['[id="people.0.email-input-text"]', 'input[name="people.0.email"]'], data.primaryOwner?.email || 'owner@example.com');

      // --- STEP 2 (Business Details) ---
      await safeFill(['[id="business.name-input-text"]', 'input[name="business.name"]'], data.legalBusinessName || 'Business Applicant LLC');
      await safeFill(['[id="business.dba-input-text"]', 'input[name="business.dba"]'], data.dba || data.legalBusinessName);

      // Business entity type radio (LLC)
      const bType = (data.businessEntityType || '').toLowerCase();
      if (bType.includes('corp')) {
        await safeClick(['[id="corporation-input-radio"]', 'input[value="corporation"]']);
      } else if (bType.includes('sole')) {
        await safeClick(['[id="sole-prop-input-radio"]', 'input[value="sole-prop"]']);
      } else if (bType.includes('partner')) {
        await safeClick(['[id="partnership-input-radio"]', 'input[value="partnership"]']);
      } else {
        await safeClick(['[id="llc-input-radio"]', 'input[value="llc"]']);
      }

      await safeFill(['[id="business.address1-input-text"]', 'input[name="business.address1"]'], data.businessAddress?.line1 || '100 Innovation Way');
      await safeFill(['[id="business.address2-input-text"]', 'input[name="business.address2"]'], data.businessAddress?.line2);
      await safeFill(['[id="business.city-input-text"]', 'input[name="business.city"]'], data.businessAddress?.city || 'Dallas');

      // Business State
      await selectState('business-state', stateName);

      await safeFill(['[id="business-zip"]', 'input[name="business.zip"]'], data.businessAddress?.postal || '75001');
      await safeClick(['[id="yes-input-radio"]', 'input[value="true"]']);
      await safeFill(['[id="business.federaltaxid-input-text"]', 'input[name="business.federalTaxId"]'], einDigits);
      await safeFill(['[id="business.timeinbusiness-input-text"]', 'input[name="business.timeInBusiness"]'], data.timeInBusiness || '3');

      // CRITICAL: Ensure Time in Business units is strictly in YEARS mode (checkbox must be unchecked)
      try {
        const unitsCb = page.locator('[id="business-timeInBusinessUnits"]').first();
        if (await unitsCb.isVisible().catch(() => false)) {
          if (await unitsCb.isChecked()) {
            await unitsCb.click();
            console.log('[TimePayment] Unchecked business-timeInBusinessUnits to enforce YEARS mode');
          }
        }
      } catch (e) {}

      await safeFill(['[id="business.phone1-input-text"]', 'input[name="business.phone1"]'], phoneDigits);

      // --- STEP 3 (Guarantor Details) ---
      await safeFill(['[id="people.0-ssn"]', 'input[name="people.0.ssn"]'], ssnDigits);

      // Title Dropdown Selection (Member / Managing Member)
      try {
        const titleLoc = page.locator('[id="people.0-title"]').first();
        if (await titleLoc.isVisible().catch(() => false)) {
          await titleLoc.scrollIntoViewIfNeeded();
          await titleLoc.click();
          await page.waitForTimeout(300);
          await page.keyboard.press('ArrowDown');
          await page.waitForTimeout(400);

          const preferredTitles = ['Member', 'Managing Member', 'President', 'Owner'];
          let clicked = false;

          for (const t of preferredTitles) {
            const opt = page.locator(`[role="option"]:has-text("${t}"), li:has-text("${t}"), .MuiAutocomplete-option:has-text("${t}")`).first();
            if (await opt.isVisible({ timeout: 400 }).catch(() => false)) {
              await opt.click();
              console.log(`[TimePayment] Clicked valid Title option: "${t}"`);
              clicked = true;
              break;
            }
          }

          if (!clicked) {
            const anyOpt = page.locator('[role="option"], li[role="option"], .MuiAutocomplete-option').first();
            if (await anyOpt.isVisible({ timeout: 800 }).catch(() => false)) {
              await anyOpt.click();
              console.log('[TimePayment] Clicked first available option in Title listbox');
            } else {
              await page.keyboard.type('Member', { delay: 60 });
              await page.keyboard.press('ArrowDown');
              await page.keyboard.press('Enter');
            }
          }
        }
      } catch (e) {
        console.warn('[TimePayment] Title selection error:', e.message);
      }

      await safeFill(['[id="people.0.ownershippercentage-input-text"]', 'input[name="people.0.ownershipPercentage"]'], cleanDigits(data.primaryOwner?.ownershipPercentage) || '100');
      await safeFill(['[id="people.0.phone1-input-text"]', 'input[name="people.0.phone1"]'], phoneDigits);

      const homeAddr1 = data.primaryOwner?.homeAddress?.line1 || data.businessAddress?.line1 || '100 Innovation Way';
      const homeCity = data.primaryOwner?.homeAddress?.city || data.businessAddress?.city || 'Dallas';
      const homeZip = data.primaryOwner?.homeAddress?.postal || data.businessAddress?.postal || '75001';

      await safeFill(['[id="people.0.address1-input-text"]', 'input[name="people.0.address1"]'], homeAddr1);
      await safeFill(['[id="people.0.city-input-text"]', 'input[name="people.0.city"]'], homeCity);

      // Owner State
      await selectState('people.0-state', stateName);

      await safeFill(['[id="people.0-zip"]', 'input[name="people.0.zip"]'], homeZip);

      // Terms & Conditions Checkbox
      try {
        const cb = page.locator('[id="accept-terms-conditions-checkbox"]').first();
        if (await cb.isVisible().catch(() => false)) {
          if (!await cb.isChecked()) {
            await cb.click();
            console.log('[TimePayment] Clicked terms checkbox locator');
          }
        } else {
          const cbLabel = page.locator('label:has([id="accept-terms-conditions-checkbox"]), label:has-text("Terms"), label:has-text("Agree")').first();
          if (await cbLabel.isVisible().catch(() => false)) {
            await cbLabel.click();
            console.log('[TimePayment] Clicked terms label');
          }
        }
      } catch (e) {}

      await page.evaluate(() => {
        const cbs = document.querySelectorAll('[id="accept-terms-conditions-checkbox"], input[name="authorization"]');
        cbs.forEach(cb => {
          if (!cb.checked) cb.click();
        });
      });
    }

    let applicationNumber = null;

    // Wizard Loop
    for (let step = 0; step < 6; step++) {
      console.log(`[TimePayment] --- Step ${step}: Current URL: ${page.url()} ---`);

      await fillCurrentStep();
      await page.waitForTimeout(1000);

      // Check if SUBMIT button exists
      const submitBtn = await page.$('button:has-text("SUBMIT"), input[value*="SUBMIT" i]');
      if (submitBtn && await submitBtn.isVisible()) {
        console.log('[TimePayment] *** FOUND FINAL SUBMIT BUTTON! ***');

        // Detailed Input Dump Before Submit
        const inputDump = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('input, select')).map(i => ({
            id: i.id,
            name: i.name,
            val: i.value,
            checked: i.checked
          })).filter(i => i.id || i.name);
        });
        console.log('[TimePayment Form Inputs State]:', JSON.stringify(inputDump));

        await submitBtn.scrollIntoViewIfNeeded();
        emitLog('Found Final SUBMIT button. Submitting application to TimePayment...');
        await submitBtn.click({ force: true });
        console.log('[TimePayment] Clicked submit button!');
        emitLog('Submitted form! Waiting for underwriting response and confirmation...');
        
        // Wait up to 25 seconds for URL change or confirmation
        for (let w = 0; w < 10; w++) {
          await page.waitForTimeout(2500);
          const currentUrl = page.url();
          if (currentUrl.includes('success') || currentUrl.includes('confirm') || currentUrl.includes('app_number')) {
            break;
          }
        }
        
        const postSubmitUrl = page.url();
        console.log('[TimePayment] Post-submit URL:', postSubmitUrl);

        // Check for URL-based application number
        try {
          const urlObj = new URL(postSubmitUrl);
          const urlAppNum = urlObj.searchParams.get('app_number') || urlObj.searchParams.get('appNumber');
          if (urlAppNum) {
            applicationNumber = urlAppNum;
          }
        } catch (e) {}

        const bodySnippet = await page.evaluate(() => document.body.innerText.substring(0, 2000));
        console.log('[TimePayment] Post-submit text:', bodySnippet.replace(/\s+/g, ' '));

        // Check for body-based application number
        if (!applicationNumber) {
          const match = bodySnippet.match(/application number is\s*(\d+)/i) || 
                        bodySnippet.match(/application\s*#?:?\s*(\d{8})/i) ||
                        bodySnippet.match(/(\d{8})/);
          if (match) {
            applicationNumber = match[1];
          }
        }

        if (applicationNumber) {
          emitLog(`SUCCESS! TimePayment Application Number: ${applicationNumber}`);
          console.log(`🎉 [TimePayment] Extracted Application Number: ${applicationNumber}`);
          break;
        } else {
          // If still on step=3 or no app number, extract error message from page
          const errorList = await page.evaluate(() => {
            const errEls = Array.from(document.querySelectorAll('.Mui-error, [role="alert"], [class*="error" i], .text-danger, p:has-text("invalid"), p:has-text("match"), p:has-text("required")'));
            return [...new Set(errEls.map(e => e.innerText.trim()).filter(t => t.length > 2 && !t.includes('\n')))];
          });

          const errorDetail = errorList.length > 0 ? errorList.join(' | ') : 'Identity check / validation halted form on Step 3';
          emitLog(`Submission issue on Step 3: ${errorDetail}`);
          console.error(`[TimePayment Error Detail]: ${errorDetail}`);

          throw new Error(`TimePayment portal rejected submission on Step 3: ${errorDetail}`);
        }
      }

      // Click Forward button (NEXT or LET'S GO)
      const forwardBtn = await page.$('button:has-text("NEXT"), button:has-text("LET\'S GO"), button:has-text("Continue")');
      if (forwardBtn) {
        emitLog(`Navigating to next step (Step ${step + 1})...`);
        await forwardBtn.click();
        await page.waitForTimeout(4000);
      } else {
        console.log('[TimePayment] No forward button found.');
        break;
      }

      const currentUrl = page.url();
      if (currentUrl.toLowerCase().includes('confirm') || currentUrl.toLowerCase().includes('thank') || currentUrl.toLowerCase().includes('success')) {
        emitLog(`Reached confirmation screen: ${currentUrl}`);
        break;
      }
    }

    const finalUrl = page.url();
    console.log('[TimePayment] Flow complete at:', finalUrl);

    await browser.close();
    return {
      success: Boolean(applicationNumber),
      applicationNumber,
      finalUrl,
      error: applicationNumber ? null : 'Submission did not return a valid TimePayment application number'
    };

  } catch (error) {
    emitLog(`Execution error: ${error.message}`);
    console.error('[TimePayment] Execution error:', error.message);
    if (page) {
      try {
        const screenshotPath = path.join(__dirname, 'public', 'last_error.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log('[TimePayment] Saved portal error screenshot to public/last_error.png');
        emitLog('Saved screenshot of portal error to dashboard.');
      } catch (sErr) {}
    }
    if (browser) await browser.close().catch(() => {});
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = { submitToTimePayment };
