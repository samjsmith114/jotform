require('dotenv').config();
const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const { submitToTimePayment } = require('./submitToTimePayment');

const app = express();
const upload = multer();

// Allow parsing application/json, urlencoded, and multipart form-data (which Jotform sends)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(upload.any());

const PORT = process.env.PORT || 3000;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'sam@emergencyfundman.com';

// Setup mailer if SMTP settings provided
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Emergency Fund Man -> TimePayment Webhook Integration',
    timestamp: new Date().toISOString()
  });
});

// Helper to extract fields from Jotform payload
function parseJotformPayload(body) {
  let raw = body;

  // Jotform often sends rawRequest as a JSON string
  if (body.rawRequest) {
    try {
      raw = JSON.parse(body.rawRequest);
    } catch (e) {
      console.warn('Could not parse rawRequest JSON:', e.message);
    }
  }

  // Helper to find field by key prefix or label
  function getVal(keyPattern) {
    for (const [k, v] of Object.entries(raw)) {
      if (k.toLowerCase().includes(keyPattern.toLowerCase())) {
        return v;
      }
    }
    return '';
  }

  return {
    submissionId: raw.submissionID || body.submissionID || '',
    requestedAmount: getVal('q3') || getVal('amount'),
    equipmentCategory: getVal('q4'),
    equipmentDescription: getVal('q5') || getVal('description'),
    urgency: getVal('q6'),
    legalBusinessName: getVal('q8') || getVal('legal') || getVal('business'),
    dba: getVal('q9') || getVal('dba'),
    businessEntityType: getVal('q10') || getVal('entity'),
    federalTaxId: getVal('q11') || getVal('ein') || getVal('tax'),
    businessAddress: {
      line1: raw['q12_q12_address10[addr_line1]'] || getVal('addr_line1'),
      line2: raw['q12_q12_address10[addr_line2]'] || getVal('addr_line2'),
      city: raw['q12_q12_address10[city]'] || getVal('city'),
      state: raw['q12_q12_address10[state]'] || getVal('state'),
      postal: raw['q12_q12_address10[postal]'] || getVal('postal'),
      country: raw['q12_q12_address10[country]'] || getVal('country')
    },
    timeInBusiness: getVal('q13'),
    primaryOwner: {
      firstName: raw['q15_q15_fullname13[first]'] || getVal('fullname13[first]'),
      lastName: raw['q15_q15_fullname13[last]'] || getVal('fullname13[last]'),
      ownershipPercentage: getVal('q16'),
      phone: raw['q17_q17_phone15[full]'] || getVal('phone15'),
      email: getVal('q18') || getVal('email16'),
      ssn: getVal('q19') || getVal('textbox17'),
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
  console.log('Headers:', req.headers);

  try {
    const parsedData = parseJotformPayload(req.body);
    console.log('Parsed Submission Data:', {
      business: parsedData.legalBusinessName,
      amount: parsedData.requestedAmount,
      owner: `${parsedData.primaryOwner.firstName} ${parsedData.primaryOwner.lastName}`,
      email: parsedData.primaryOwner.email
    });

    // Send HTTP 200 immediately to Jotform so webhook doesn't time out
    res.status(200).json({ received: true, message: 'Processing application' });

    // Execute submission to TimePayment asynchronously
    submitToTimePayment(parsedData).then(async (result) => {
      console.log('[TimePayment Result]:', result);

      // Optionally send email confirmation to client
      if (process.env.SMTP_USER) {
        try {
          await transporter.sendMail({
            from: `"Application Automation" <${process.env.SMTP_USER}>`,
            to: NOTIFY_EMAIL,
            subject: `New Financing App Submitted: ${parsedData.legalBusinessName || 'New Applicant'}`,
            text: `A new application has been submitted to TimePayment!\n\nBusiness: ${parsedData.legalBusinessName}\nAmount: $${parsedData.requestedAmount}\nOwner: ${parsedData.primaryOwner.firstName} ${parsedData.primaryOwner.lastName}\nStatus: ${result.success ? 'SUBMITTED' : 'FAILED - ' + result.error}`
          });
          console.log(`[Email] Notification sent to ${NOTIFY_EMAIL}`);
        } catch (mailErr) {
          console.warn('[Email] Failed to send email alert:', mailErr.message);
        }
      }
    }).catch((err) => {
      console.error('[TimePayment Async Error]:', err);
    });

  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
