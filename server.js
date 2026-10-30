require('dotenv').config();
const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
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
    dealer: 'VHD64 (Amiri Partners LLC)',
    timestamp: new Date().toISOString()
  });
});

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

  return {
    submissionId: raw.submissionID || '',
    requestedAmount: getVal('q3') || getVal('amount') || '5000',
    equipmentCategory: getVal('q4') || 'Commercial Equipment',
    equipmentDescription: getVal('q5') || getVal('description') || 'Business Equipment',
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
    timeInBusiness: getVal('q13'),
    primaryOwner: {
      firstName: raw['q15_q15_fullname13[first]'] || getVal('fullname13[first]') || 'Owner',
      lastName: raw['q15_q15_fullname13[last]'] || getVal('fullname13[last]') || 'Applicant',
      title: 'Owner',
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

// Webhook endpoint for Jotform
app.post('/webhook', async (req, res) => {
  console.log('--- [Jotform Webhook Received] ---');

  try {
    const parsedData = parseJotformPayload(req.body);
    console.log('Parsed Submission Data:', {
      business: parsedData.legalBusinessName,
      amount: parsedData.requestedAmount,
      owner: `${parsedData.primaryOwner.firstName} ${parsedData.primaryOwner.lastName}`,
      email: parsedData.primaryOwner.email
    });

    // Send HTTP 200 immediately to Jotform so webhook acknowledges success
    res.status(200).json({ received: true, message: 'Processing application' });

    // Execute submission to TimePayment asynchronously
    submitToTimePayment(parsedData).then(async (result) => {
      console.log('[TimePayment Result]:', result);

      // Email notification to client if configured
      if (process.env.SMTP_USER && process.env.SMTP_PASS) {
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

          await transporter.sendMail({
            from: `"Application Automation" <${process.env.SMTP_USER}>`,
            to: NOTIFY_EMAIL,
            subject: `New Financing App Submitted: ${parsedData.legalBusinessName || 'New Applicant'}`,
            text: `A new application has been submitted to TimePayment!\n\nBusiness: ${parsedData.legalBusinessName}\nAmount: $${parsedData.requestedAmount}\nOwner: ${parsedData.primaryOwner.firstName} ${parsedData.primaryOwner.lastName}\nStatus: ${result.success ? 'SUBMITTED' : 'FAILED - ' + result.error}`
          });
          console.log(`[Email] Notification sent to ${NOTIFY_EMAIL}`);
        } catch (mailErr) {
          console.warn('[Email Warning]:', mailErr.message);
        }
      }
    }).catch((err) => {
      console.error('[TimePayment Async Error]:', err);
    });

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
