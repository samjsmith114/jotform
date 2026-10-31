const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'submissions.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.warn('Could not create data dir:', e.message);
  }
}

class SubmissionsStore {
  constructor() {
    this.submissions = [];
    this.loadFromDisk();
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        this.submissions = JSON.parse(raw);
        if (!Array.isArray(this.submissions)) {
          this.submissions = [];
        }
      }
    } catch (e) {
      console.warn('[SubmissionsStore] Load error:', e.message);
      this.submissions = [];
    }
  }

  saveToDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.submissions.slice(0, 100), null, 2), 'utf8');
    } catch (e) {
      console.warn('[SubmissionsStore] Save error:', e.message);
    }
  }

  create(parsedData, source = 'Jotform Webhook') {
    const id = 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const submission = {
      id,
      timestamp: new Date().toISOString(),
      formattedDate: new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }) + ' CT',
      source,
      jotformSubmissionId: parsedData.submissionId || '',
      business: parsedData.legalBusinessName || 'N/A',
      dba: parsedData.dba || '',
      owner: `${parsedData.primaryOwner?.firstName || ''} ${parsedData.primaryOwner?.lastName || ''}`.trim() || 'N/A',
      email: parsedData.primaryOwner?.email || 'N/A',
      phone: parsedData.primaryOwner?.phone || 'N/A',
      amount: parsedData.requestedAmount || '0',
      timeInBusiness: parsedData.timeInBusiness ? `${parsedData.timeInBusiness} years` : 'N/A',
      monthlyRevenue: parsedData.monthlyRevenue || 'N/A',
      equipmentCategory: parsedData.equipmentCategory || 'Commercial Equipment',
      equipmentDescription: parsedData.equipmentDescription || 'Equipment',
      formattedEquipmentDescription: parsedData.formattedEquipmentDescription || '',
      status: 'PROCESSING', // RECEIVED, PROCESSING, SUCCESS, FAILED
      applicationNumber: null,
      mode: 'Initiating...',
      logs: [
        `[${new Date().toLocaleTimeString()}] Webhook received from ${source}`,
        `[${new Date().toLocaleTimeString()}] Applicant: ${parsedData.legalBusinessName || 'New Business'} ($${parsedData.requestedAmount})`
      ],
      error: null,
      parsedData
    };

    this.submissions.unshift(submission);
    if (this.submissions.length > 100) {
      this.submissions = this.submissions.slice(0, 100);
    }
    this.saveToDisk();
    return submission;
  }

  addLog(id, message) {
    const item = this.submissions.find(s => s.id === id);
    if (item) {
      const timeStr = new Date().toLocaleTimeString();
      item.logs.push(`[${timeStr}] ${message}`);
      this.saveToDisk();
    }
  }

  update(id, updates) {
    const index = this.submissions.findIndex(s => s.id === id);
    if (index !== -1) {
      this.submissions[index] = {
        ...this.submissions[index],
        ...updates
      };
      this.saveToDisk();
      return this.submissions[index];
    }
    return null;
  }

  getAll() {
    return this.submissions;
  }

  getById(id) {
    return this.submissions.find(s => s.id === id) || null;
  }

  clear() {
    this.submissions = [];
    this.saveToDisk();
  }
}

const submissionsStore = new SubmissionsStore();

module.exports = { submissionsStore };
