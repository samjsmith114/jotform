require('dotenv').config();
const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const { timePaymentApi } = require('./timepaymentApi');
const { submitToTimePayment } = require('./submitToTimePayment');

const app = express();
const upload = multer();

// Parse JSON & URL-Encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Emergency Fund Man -> TimePayment Webhook Integration',
    mode: 'REST API + Headless Fallback',
    dealer: 'VHD64 (Amiri Partners LLC)',
    timestamp: new Date().toISOString()
  });
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
    federalTaxId: getVal('q11') || getVal('ein') || getVal('tax'),
    businessAddress: {
      line1: raw['q12_q12_address10[addr_line1]'] || getVal('addr_line1') || '',
      line2: raw['q12_q12_address10[addr_line2]'] || '',
      city: raw['q12_q12_address10[city]'] || getVal('city') || '',
      state: raw['q12_q12_address10[state]'] || getVal('state') || '',
      postal: raw['q12_q12_address10[postal]'] || getVal('postal') || '',
      country: raw['q12_q12_address10[country]'] || 'United States'
    },
    timeInBusiness,
    monthlyRevenue: getVal('q36') || getVal('revenue') || getVal('monthly') || '',
    primaryOwner: {
      firstName: raw['q15_q15_fullname13[first]'] || getVal('fullname13[first]') || 'Owner',
      lastName: raw['q15_q15_fullname13[last]'] || getVal('fullname13[last]') || 'Applicant',
      title: 'Member',
      ownershipPercentage: getVal('q16') || '100',
      phone: raw['q17_q17_phone15[full]'] || getVal('phone') || '',
      email: getVal('q18') || getVal('email') || '',
      ssn: getVal('q19') || getVal('ssn') || '',
      dob: getVal('dob') || '',
      homeAddress: {
        line1: raw['q20_q20_address18[addr_line1]'] || '',
        city: raw['q20_q20_address18[city]'] || '',
        state: raw['q20_q20_address18[state]'] || '',
        postal: raw['q20_q20_address18[postal]'] || ''
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
      monthlyRevenue: parsedData.monthlyRevenue
    });

    // Send HTTP 200 immediately to Jotform so webhook acknowledges success
    res.status(200).json({ received: true, message: 'Processing application' });

    // 1. Try Direct REST API Submission (Instant & Official)
    (async () => {
      try {
        console.log('[TimePayment] Attempting direct REST API submission...');
        const apiResult = await timePaymentApi.submitApplication(parsedData, clientIp);
        console.log('[TimePayment REST API Success]:', apiResult);
        await sendNotificationEmail(parsedData, apiResult);
      } catch (apiErr) {
        console.warn('[TimePayment REST API Failed, falling back to Playwright Automation]:', apiErr.message);
        
        // 2. Headless Browser Automation Fallback
        try {
          const browserResult = await submitToTimePayment(parsedData);
          console.log('[TimePayment Playwright Fallback Result]:', browserResult);
          await sendNotificationEmail(parsedData, browserResult);
        } catch (browserErr) {
          console.error('[TimePayment All Methods Failed]:', browserErr.message);
          await sendNotificationEmail(parsedData, { success: false, error: browserErr.message });
        }
      }
    })();

  } catch (err) {
    console.error('Webhook processing error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
