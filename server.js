const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'contact-manager-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

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
    passwordHash: null,
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

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

// Check if setup is needed
function isSetupNeeded() {
  const config = readConfig();
  return !config.passwordHash;
}

// Authentication Routes

// Check auth status
app.get('/api/auth/status', (req, res) => {
  res.json({
    authenticated: req.session && req.session.authenticated,
    setupNeeded: isSetupNeeded()
  });
});

// Setup password (first-time only)
app.post('/api/auth/setup', async (req, res) => {
  try {
    if (!isSetupNeeded()) {
      return res.status(400).json({ error: 'Setup already completed' });
    }

    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const config = readConfig();
    config.passwordHash = passwordHash;
    writeConfig(config);

    req.session.authenticated = true;
    res.json({ message: 'Setup completed successfully' });
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({ error: 'Failed to complete setup' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { password } = req.body;
    const config = readConfig();

    if (!config.passwordHash) {
      return res.status(400).json({ error: 'Setup required' });
    }

    const isValid = await bcrypt.compare(password, config.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    req.session.authenticated = true;
    res.json({ message: 'Login successful' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.json({ message: 'Logout successful' });
  });
});

// Change password
app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const config = readConfig();

    const isValid = await bcrypt.compare(currentPassword, config.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    config.passwordHash = await bcrypt.hash(newPassword, 10);
    writeConfig(config);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// API Routes (Protected)

// Get all contacts
app.get('/api/contacts', requireAuth, (req, res) => {
  try {
    const contacts = readContacts();
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read contacts' });
  }
});

// Get single contact
app.get('/api/contacts/:id', requireAuth, (req, res) => {
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
app.post('/api/contacts', requireAuth, (req, res) => {
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
app.put('/api/contacts/:id', requireAuth, (req, res) => {
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
app.delete('/api/contacts/:id', requireAuth, (req, res) => {
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
app.post('/api/contacts/:id/communications', requireAuth, (req, res) => {
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

// Import contacts in bulk
app.post('/api/contacts/import', requireAuth, (req, res) => {
  try {
    const { contacts: newContacts } = req.body;

    if (!Array.isArray(newContacts) || newContacts.length === 0) {
      return res.status(400).json({ error: 'No contacts provided' });
    }

    const existingContacts = readContacts();
    let importedCount = 0;

    newContacts.forEach(contactData => {
      if (!contactData.name || !contactData.name.trim()) {
        return; // Skip contacts without names
      }

      const newContact = {
        id: Date.now().toString() + '-' + Math.random().toString(36).substring(7),
        name: contactData.name || '',
        company: contactData.company || '',
        title: contactData.title || '',
        tag: contactData.tag || 'no action',
        followUpDate: contactData.followUpDate || null,
        communications: contactData.communications || [],
        createdAt: new Date().toISOString()
      };

      existingContacts.push(newContact);
      importedCount++;
    });

    writeContacts(existingContacts);
    res.status(201).json({
      message: 'Contacts imported successfully',
      count: importedCount
    });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: 'Failed to import contacts' });
  }
});

// Get config
app.get('/api/config', requireAuth, (req, res) => {
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
app.put('/api/config', requireAuth, (req, res) => {
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

// Serve static files (login, setup pages)
app.use(express.static('public'));

// Serve appropriate page based on auth status
app.get('/', (req, res) => {
  if (isSetupNeeded()) {
    res.sendFile(path.join(__dirname, 'public', 'setup.html'));
  } else if (!req.session || !req.session.authenticated) {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Contact Outreach Manager running on http://localhost:${PORT}`);
});
