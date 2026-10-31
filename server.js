require('dotenv').config();
const path = require('path');
const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const { timePaymentApi } = require('./timepaymentApi');
const { submitToTimePayment } = require('./submitToTimePayment');
const { submissionsStore } = require('./submissionsStore');

const app = express();
const upload = multer();

// Parse JSON & URL-Encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend dashboard
app.use(express.static(path.join(__dirname, 'public')));

// Parse Multipart only when content-type is multipart
app.use((req, res, next) => {
  const type = req.headers['content-type'] || '';
  if (type.includes('multipart/form-data')) {
    upload.any()(req, res, (err) => {
      if (err) {
        console.warn('Multer parse warning:', err.message);
      }
      next();
    });
  } else {
    next();
  }
});

const PORT = process.env.PORT || 3000;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'sam@emergencyfundman.com';

// Frontend Dashboard Route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'Emergency Fund Man -> TimePayment Webhook Integration',
    mode: 'REST API + Headless Fallback',
    dealer: 'VHD64 (Amiri Partners LLC)',
    timestamp: new Date().toISOString()
  });
});

// Submissions API for Dashboard
app.get('/api/submissions', (req, res) => {
  const list = submissionsStore.getAll();
  const metrics = {
    total: list.length,
    success: list.filter(s => s.status === 'SUCCESS').length,
    processing: list.filter(s => s.status === 'PROCESSING').length,
    failed: list.filter(s => s.status === 'FAILED').length
  };
  res.json({ submissions: list, metrics });
});

app.get('/api/submissions/:id', (req, res) => {
  const item = submissionsStore.getById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Submission not found' });
  res.json(item);
});

app.post('/api/submissions/clear', (req, res) => {
  submissionsStore.clear();
  res.json({ success: true, message: 'Submission history cleared' });
});

// Helper to clean and sanitize Time in Business (Years)
function cleanTimeInBusiness(val) {
  if (!val) return '3';
  const cleanStr = String(val).trim();
  const num = parseFloat(cleanStr.replace(/[^\d.]/g, ''));
  if (isNaN(num) || num <= 0) return '3';
  // If user entered a calendar year like 2019 or 1998
  if (num >= 1950 && num <= 2026) {
    return String(Math.max(1, 2026 - Math.floor(num)));
  }
  // If user entered months or large numbers like 120 or 345
  if (num > 60) {
    return String(Math.min(50, Math.max(1, Math.round(num / 12))));
  }
  return String(Math.round(num));
}

// Helper to combine Equipment Category & Description for TimePayment categorizer
function formatEquipmentDescription(category, description) {
  const cat = (category && !category.toLowerCase().includes('other') && !category.toLowerCase().includes('select')) ? category.trim() : '';
  const desc = (description && description.trim()) ? description.trim() : '';
  
  if (cat && desc) {
    if (desc.toLowerCase().includes(cat.toLowerCase())) return desc;
    return `${cat} - ${desc}`;
  }
  return desc || cat || 'Commercial Food Service & Restaurant Equipment';
}

// Helper to extract fields from Jotform payload
function parseJotformPayload(body) {
  let raw = body || {};

  if (typeof body === 'string') {
    try {
      raw = JSON.parse(body);
    } catch (e) {
      raw = {};
    }
  }

  // Jotform rawRequest parsing
  if (raw && raw.rawRequest) {
    try {
      const parsedRaw = JSON.parse(raw.rawRequest);
      raw = { ...raw, ...parsedRaw };
    } catch (e) {
      console.warn('Could not parse rawRequest JSON:', e.message);
    }
  }

  function getVal(pattern) {
    if (!raw) return '';
    for (const [k, v] of Object.entries(raw)) {
      if (k.toLowerCase().includes(pattern.toLowerCase())) {
        return typeof v === 'object' ? JSON.stringify(v) : String(v || '');
      }
    }
    return '';
  }

  const rawCategory = getVal('q4') || 'Commercial Equipment';
  const rawDescription = getVal('q5') || getVal('description') || 'Business Equipment';
  const formattedEquipmentDescription = formatEquipmentDescription(rawCategory, rawDescription);
  const timeInBusiness = cleanTimeInBusiness(getVal('time') || getVal('q13') || '3');

  return {
    submissionId: raw.submissionID || '',
    requestedAmount: getVal('q3') || getVal('amount') || '5000',
    equipmentCategory: rawCategory,
    equipmentDescription: rawDescription,
    formattedEquipmentDescription,
    urgency: getVal('q6'),
    legalBusinessName: getVal('q8') || getVal('legal') || getVal('business') || 'Business Applicant',
    dba: getVal('q9') || getVal('dba'),
    businessEntityType: getVal('q10') || 'LLC',
    federalTaxId: getVal('q11') || getVal('ein') || getVal('tax') || '123456789',
    businessAddress: {
      line1: raw['q12_q12_address10[addr_line1]'] || getVal('addr_line1') || '100 Innovation Way',
      line2: raw['q12_q12_address10[addr_line2]'] || '',
      city: raw['q12_q12_address10[city]'] || getVal('city') || 'Dallas',
      state: raw['q12_q12_address10[state]'] || getVal('state') || 'TX',
      postal: raw['q12_q12_address10[postal]'] || getVal('postal') || '75001',
      country: raw['q12_q12_address10[country]'] || 'United States'
    },
    timeInBusiness,
    monthlyRevenue: getVal('q36') || getVal('revenue') || getVal('monthly') || '',
    primaryOwner: {
      firstName: raw['q15_q15_fullname13[first]'] || getVal('fullname13[first]') || 'Samuel',
      lastName: raw['q15_q15_fullname13[last]'] || getVal('fullname13[last]') || 'Smith',
      title: 'Member',
      ownershipPercentage: getVal('q16') || '100',
      phone: raw['q17_q17_phone15[full]'] || getVal('phone') || '2145550188',
      email: getVal('q18') || getVal('email') || 'owner@example.com',
      ssn: getVal('q19') || getVal('ssn') || '232432432',
      dob: getVal('dob') || '',
      homeAddress: {
        line1: raw['q20_q20_address18[addr_line1]'] || '100 Innovation Way',
        city: raw['q20_q20_address18[city]'] || 'Dallas',
        state: raw['q20_q20_address18[state]'] || 'TX',
        postal: raw['q20_q20_address18[postal]'] || '75001'
      }
    },
    raw
  };
}

async function sendNotificationEmail(parsedData, result) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const appNum = result.applicationNumber ? `\nApplication #: ${result.applicationNumber}` : '';
    const statusText = result.success ? `SUCCESS (App #${result.applicationNumber || 'Approved'})` : `FAILED - ${result.error}`;

    await transporter.sendMail({
      from: `"Emergency Fund Man" <${process.env.SMTP_USER}>`,
      to: NOTIFY_EMAIL,
      subject: `New Financing App: ${parsedData.legalBusinessName || 'New Applicant'} (${result.success ? 'SUBMITTED' : 'FAILED'})`,
      text: `Financing Application Processed!\n\nBusiness: ${parsedData.legalBusinessName}\nOwner: ${parsedData.primaryOwner.firstName} ${parsedData.primaryOwner.lastName}\nAmount: $${parsedData.requestedAmount}\nTime in Business: ${parsedData.timeInBusiness} years\nMonthly Revenue: $${parsedData.monthlyRevenue || 'N/A'}\nStatus: ${statusText}${appNum}`
    });
    console.log(`[Email] Notification sent to ${NOTIFY_EMAIL}`);
  } catch (mailErr) {
    console.warn('[Email Warning]:', mailErr.message);
  }
}

/**
 * Common pipeline execution for both Jotform webhooks and Dashboard tests
 */
async function processApplicationPipeline(parsedData, submissionRecord, clientIp = '127.0.0.1') {
  const subId = submissionRecord.id;

  try {
    // 1. Try Direct REST API Submission
    submissionsStore.addLog(subId, 'Attempting direct REST API submission with OAuth 2.0...');
    submissionsStore.update(subId, { mode: 'REST API' });

    let apiSucceeded = false;
    let finalResult = null;

    try {
      const apiResult = await timePaymentApi.submitApplication(parsedData, clientIp);
      submissionsStore.addLog(subId, `REST API Success: ${JSON.stringify(apiResult)}`);
      apiSucceeded = true;
      finalResult = apiResult;

      submissionsStore.update(subId, {
        status: 'SUCCESS',
        applicationNumber: apiResult.applicationNumber || 'Approved',
        mode: 'Direct REST API'
      });
      await sendNotificationEmail(parsedData, apiResult);
    } catch (apiErr) {
      submissionsStore.addLog(subId, `REST API unavailable (${apiErr.message}). Falling back to Headless Playwright Automation.`);
    }

    // 2. Playwright Automation Fallback
    if (!apiSucceeded) {
      submissionsStore.update(subId, { mode: 'Playwright Automation' });
      
      const browserResult = await submitToTimePayment(parsedData, (logMsg) => {
        submissionsStore.addLog(subId, logMsg);
      });

      if (browserResult.success) {
        submissionsStore.update(subId, {
          status: 'SUCCESS',
          applicationNumber: browserResult.applicationNumber || 'Submitted',
          mode: 'Playwright Automation'
        });
        submissionsStore.addLog(subId, `Application confirmed in TimePayment portal! (App #${browserResult.applicationNumber || 'Submitted'})`);
        await sendNotificationEmail(parsedData, browserResult);
      } else {
        throw new Error(browserResult.error || 'Playwright submission failed');
      }
    }

  } catch (err) {
    console.error(`[Pipeline Error subId: ${subId}]:`, err.message);
    submissionsStore.addLog(subId, `CRITICAL ERROR: ${err.message}`);
    submissionsStore.update(subId, {
      status: 'FAILED',
      error: err.message
    });
    await sendNotificationEmail(parsedData, { success: false, error: err.message });
  }
}

// Trigger test submission directly from dashboard
app.post('/api/test-submission', async (req, res) => {
  const testData = {
    submissionId: 'test_' + Date.now(),
    requestedAmount: '5500',
    equipmentCategory: 'Commercial Kitchen Gear',
    equipmentDescription: 'Commercial Reach-In Refrigerator',
    formattedEquipmentDescription: 'Commercial Kitchen Gear - Commercial Reach-In Refrigerator',
    urgency: 'Immediate',
    legalBusinessName: 'Amiri Commercial Kitchens LLC',
    dba: 'Amiri Kitchens',
    businessEntityType: 'LLC',
    federalTaxId: '123456789',
    businessAddress: {
      line1: '100 Innovation Way',
      line2: '',
      city: 'Dallas',
      state: 'TX',
      postal: '75001',
      country: 'United States'
    },
    timeInBusiness: '3',
    monthlyRevenue: '25000',
    primaryOwner: {
      firstName: 'Samuel',
      lastName: 'Smith',
      title: 'Member',
      ownershipPercentage: '100',
      phone: '2145550188',
      email: 'samuel.smith@amiripartners.com',
      ssn: '232432432',
      homeAddress: {
        line1: '100 Innovation Way',
        city: 'Dallas',
        state: 'TX',
        postal: '75001'
      }
    }
  };

  const record = submissionsStore.create(testData, 'Dashboard Test Trigger');
  res.json({ success: true, submissionId: record.id });

  // Run in background
  processApplicationPipeline(testData, record, '127.0.0.1');
});

// Webhook endpoint for Jotform
app.post('/webhook', async (req, res) => {
  console.log('--- [Jotform Webhook Received] ---');

  try {
    const parsedData = parseJotformPayload(req.body);
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';

    console.log('Parsed Submission Data:', {
      business: parsedData.legalBusinessName,
      amount: parsedData.requestedAmount,
      owner: `${parsedData.primaryOwner.firstName} ${parsedData.primaryOwner.lastName}`,
      email: parsedData.primaryOwner.email,
      timeInBusiness: parsedData.timeInBusiness,
      monthlyRevenue: parsedData.monthlyRevenue,
      equipment: parsedData.formattedEquipmentDescription
    });

    // Record submission immediately in store
    const record = submissionsStore.create(parsedData, 'Jotform Webhook');

    // Send HTTP 200 immediately to Jotform so webhook acknowledges success
    res.status(200).json({ received: true, submissionId: record.id, message: 'Processing application' });

    // Process pipeline asynchronously
    processApplicationPipeline(parsedData, record, clientIp);

  } catch (err) {
    console.error('Webhook processing error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Live Dashboard running on http://localhost:${PORT}/dashboard`);
});
