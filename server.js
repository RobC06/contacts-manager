const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const nodemailer = require('nodemailer');

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));

// Data file path
const DATA_DIR = path.join(__dirname, 'data');
const CONTACTS_FILE = path.join(DATA_DIR, 'contacts.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// Initialize contacts file if it doesn't exist
if (!fs.existsSync(CONTACTS_FILE)) {
  fs.writeFileSync(CONTACTS_FILE, JSON.stringify([], null, 2));
}

// Initialize config file if it doesn't exist
if (!fs.existsSync(CONFIG_FILE)) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({
    emailEnabled: false,
    notificationEmail: '',
    smtpConfig: {
      host: '',
      port: 587,
      secure: false,
      auth: {
        user: '',
        pass: ''
      }
    }
  }, null, 2));
}

// Helper functions
function readContacts() {
  const data = fs.readFileSync(CONTACTS_FILE, 'utf8');
  return JSON.parse(data);
}

function writeContacts(contacts) {
  fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2));
}

function readConfig() {
  const data = fs.readFileSync(CONFIG_FILE, 'utf8');
  return JSON.parse(data);
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// API Routes

// Get all contacts
app.get('/api/contacts', (req, res) => {
  try {
    const contacts = readContacts();
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read contacts' });
  }
});

// Get single contact
app.get('/api/contacts/:id', (req, res) => {
  try {
    const contacts = readContacts();
    const contact = contacts.find(c => c.id === req.params.id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    res.json(contact);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read contact' });
  }
});

// Create new contact
app.post('/api/contacts', (req, res) => {
  try {
    const contacts = readContacts();
    const newContact = {
      id: Date.now().toString(),
      name: req.body.name || '',
      company: req.body.company || '',
      title: req.body.title || '',
      tag: req.body.tag || 'no action',
      followUpDate: req.body.followUpDate || null,
      communications: req.body.communications || [],
      createdAt: new Date().toISOString()
    };
    contacts.push(newContact);
    writeContacts(contacts);
    res.status(201).json(newContact);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// Update contact
app.put('/api/contacts/:id', (req, res) => {
  try {
    const contacts = readContacts();
    const index = contacts.findIndex(c => c.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    contacts[index] = {
      ...contacts[index],
      ...req.body,
      id: req.params.id // Ensure ID doesn't change
    };

    writeContacts(contacts);
    res.json(contacts[index]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// Delete contact
app.delete('/api/contacts/:id', (req, res) => {
  try {
    const contacts = readContacts();
    const filteredContacts = contacts.filter(c => c.id !== req.params.id);
    if (contacts.length === filteredContacts.length) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    writeContacts(filteredContacts);
    res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// Add communication to contact
app.post('/api/contacts/:id/communications', (req, res) => {
  try {
    const contacts = readContacts();
    const contact = contacts.find(c => c.id === req.params.id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const newCommunication = {
      id: Date.now().toString(),
      date: req.body.date || new Date().toISOString().split('T')[0],
      type: req.body.type || 'email',
      description: req.body.description || ''
    };

    contact.communications = contact.communications || [];
    contact.communications.unshift(newCommunication); // Add to beginning
    writeContacts(contacts);
    res.status(201).json(newCommunication);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add communication' });
  }
});

// Get config
app.get('/api/config', (req, res) => {
  try {
    const config = readConfig();
    // Don't send password to frontend
    const safeConfig = {
      ...config,
      smtpConfig: {
        ...config.smtpConfig,
        auth: {
          user: config.smtpConfig.auth.user,
          pass: config.smtpConfig.auth.pass ? '********' : ''
        }
      }
    };
    res.json(safeConfig);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read config' });
  }
});

// Update config
app.put('/api/config', (req, res) => {
  try {
    const currentConfig = readConfig();
    const newConfig = {
      ...currentConfig,
      ...req.body
    };

    // If password is masked, keep the old one
    if (req.body.smtpConfig && req.body.smtpConfig.auth && req.body.smtpConfig.auth.pass === '********') {
      newConfig.smtpConfig.auth.pass = currentConfig.smtpConfig.auth.pass;
    }

    writeConfig(newConfig);
    res.json({ message: 'Config updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// Email notification function
async function sendFollowUpNotification(contact) {
  try {
    const config = readConfig();

    if (!config.emailEnabled || !config.notificationEmail) {
      console.log('Email notifications disabled or no email configured');
      return;
    }

    const transporter = nodemailer.createTransport(config.smtpConfig);

    const mailOptions = {
      from: config.smtpConfig.auth.user,
      to: config.notificationEmail,
      subject: `Follow-up Reminder: ${contact.name}`,
      html: `
        <h2>Follow-up Reminder</h2>
        <p><strong>Contact:</strong> ${contact.name}</p>
        <p><strong>Company:</strong> ${contact.company || 'N/A'}</p>
        <p><strong>Title:</strong> ${contact.title || 'N/A'}</p>
        <p><strong>Follow-up Date:</strong> ${contact.followUpDate}</p>
        <p><strong>Tag:</strong> ${contact.tag}</p>
        <br>
        <p>This is an automated reminder from your Contact Outreach Manager.</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Follow-up notification sent for ${contact.name}`);
  } catch (error) {
    console.error('Failed to send email notification:', error);
  }
}

// Check for follow-ups daily at 9 AM
cron.schedule('0 9 * * *', () => {
  console.log('Checking for follow-ups...');
  const contacts = readContacts();
  const today = new Date().toISOString().split('T')[0];

  contacts.forEach(contact => {
    if (contact.followUpDate === today) {
      sendFollowUpNotification(contact);
    }
  });
});

// Serve index.html for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Contact Outreach Manager running on http://localhost:${PORT}`);
});
