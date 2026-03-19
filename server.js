require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
// Force deployment

// Import models
const User = require('./models/User');
const Contact = require('./models/Contact');
const TimeEntry = require('./models/TimeEntry');
const ClientName = require('./models/ClientName');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Railway's proxy (required for secure cookies behind reverse proxy)
app.set('trust proxy', 1);

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/contact-outreach-manager';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(async () => {
  console.log('Connected to MongoDB');

  // Clean up existing contacts: clear follow-up dates for "waiting for response" and "no action" tags
  try {
    const result = await Contact.updateMany(
      {
        tag: { $in: ['waiting for response', 'no action'] },
        $or: [
          { followUpDate: { $ne: null } },
          { dontSendEmail: true }
        ]
      },
      {
        $set: {
          followUpDate: null,
          dontSendEmail: false
        }
      }
    );
    if (result.modifiedCount > 0) {
      console.log(`[CLEANUP] Cleared follow-up dates for ${result.modifiedCount} contact(s) with 'waiting for response' or 'no action' tags`);
    }
  } catch (cleanupError) {
    console.error('[CLEANUP] Error cleaning up contacts:', cleanupError);
  }
})
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Middleware
app.use(bodyParser.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'contact-manager-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: MONGODB_URI,
    touchAfter: 24 * 3600 // lazy session update
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax' // Ensure cookie works with redirects
  }
}));

// CORS middleware for browser extension (time-entries and client-names APIs)
app.use('/api/time-entries', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use('/api/client-names', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

// Check if setup is needed
async function isSetupNeeded() {
  try {
    const userCount = await User.countDocuments();
    return userCount === 0;
  } catch (error) {
    console.error('Error checking setup status:', error);
    return true;
  }
}

// Authentication Routes

// Check auth status
app.get('/api/auth/status', async (req, res) => {
  const setupNeeded = await isSetupNeeded();
  res.json({
    authenticated: req.session && req.session.authenticated,
    setupNeeded: setupNeeded
  });
});

// Setup password (first-time only)
app.post('/api/auth/setup', async (req, res) => {
  try {
    const setupNeeded = await isSetupNeeded();
    if (!setupNeeded) {
      return res.status(400).json({ error: 'Setup already completed' });
    }

    const { password, username } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = new User({
      username: username || 'admin',
      password: passwordHash
    });

    await user.save();
    console.log('[Setup] User created:', user._id);

    req.session.authenticated = true;
    req.session.userId = user._id;
    console.log('[Setup] Session before save:', req.session);

    // Explicitly save session to MongoDB before responding
    req.session.save((err) => {
      if (err) {
        console.error('[Setup] Session save error:', err);
        return res.status(500).json({ error: 'Failed to save session' });
      }
      console.log('[Setup] Session saved successfully. Session ID:', req.sessionID);
      res.json({ message: 'Setup completed successfully' });
    });
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({ error: 'Failed to complete setup' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findOne();

    if (!user) {
      return res.status(400).json({ error: 'Setup required' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    req.session.authenticated = true;
    req.session.userId = user._id;

    // Explicitly save session to MongoDB before responding
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ error: 'Failed to save session' });
      }
      res.json({ message: 'Login successful' });
    });
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
    const user = await User.findById(req.session.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// API Routes (Protected)

// Get all contacts
app.get('/api/contacts', requireAuth, async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    // Transform MongoDB _id to id for frontend compatibility
    const transformedContacts = contacts.map(contact => ({
      id: contact._id.toString(),
      name: contact.name,
      company: contact.company,
      title: contact.title,
      email: contact.email,
      comments: contact.comments,
      tag: contact.tag,
      followUpDate: contact.followUpDate,
      followUpRequired: contact.followUpRequired,
      followUpNotes: contact.followUpNotes,
      communications: contact.communications,
      createdAt: contact.createdAt
    }));
    res.json(transformedContacts);
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: 'Failed to read contacts' });
  }
});

// Get single contact
app.get('/api/contacts/:id', requireAuth, async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    // Transform for frontend
    const transformedContact = {
      id: contact._id.toString(),
      name: contact.name,
      company: contact.company,
      title: contact.title,
      email: contact.email,
      comments: contact.comments,
      tag: contact.tag,
      followUpDate: contact.followUpDate,
      followUpRequired: contact.followUpRequired,
      followUpNotes: contact.followUpNotes,
      communications: contact.communications,
      createdAt: contact.createdAt
    };
    res.json(transformedContact);
  } catch (error) {
    console.error('Error fetching contact:', error);
    res.status(500).json({ error: 'Failed to read contact' });
  }
});

// Create new contact
app.post('/api/contacts', requireAuth, async (req, res) => {
  try {
    const contact = new Contact({
      name: req.body.name || '',
      company: req.body.company || '',
      title: req.body.title || '',
      email: req.body.email || '',
      comments: req.body.comments || '',
      tag: req.body.tag || 'no action',
      followUpDate: req.body.followUpDate || null,
      followUpRequired: req.body.followUpRequired || false,
      followUpNotes: req.body.followUpNotes || '',
      communications: req.body.communications || []
    });

    await contact.save();

    // Transform for frontend
    const transformedContact = {
      id: contact._id.toString(),
      name: contact.name,
      company: contact.company,
      title: contact.title,
      email: contact.email,
      comments: contact.comments,
      tag: contact.tag,
      followUpDate: contact.followUpDate,
      followUpRequired: contact.followUpRequired,
      followUpNotes: contact.followUpNotes,
      communications: contact.communications,
      createdAt: contact.createdAt
    };

    res.status(201).json(transformedContact);
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// Update contact
app.put('/api/contacts/:id', requireAuth, async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Update fields
    if (req.body.name !== undefined) contact.name = req.body.name;
    if (req.body.company !== undefined) contact.company = req.body.company;
    if (req.body.title !== undefined) contact.title = req.body.title;
    if (req.body.email !== undefined) contact.email = req.body.email;
    if (req.body.comments !== undefined) contact.comments = req.body.comments;
    if (req.body.tag !== undefined) contact.tag = req.body.tag;
    if (req.body.followUpDate !== undefined) contact.followUpDate = req.body.followUpDate;
    if (req.body.followUpRequired !== undefined) contact.followUpRequired = req.body.followUpRequired;
    if (req.body.followUpNotes !== undefined) contact.followUpNotes = req.body.followUpNotes;
    if (req.body.dontSendEmail !== undefined) contact.dontSendEmail = req.body.dontSendEmail;
    if (req.body.communications !== undefined) contact.communications = req.body.communications;

    // Clear follow-up date if tag is "waiting for response" or "no action"
    if (contact.tag === 'waiting for response' || contact.tag === 'no action') {
      contact.followUpDate = null;
      contact.dontSendEmail = false;
    }

    await contact.save();

    // Transform for frontend
    const transformedContact = {
      id: contact._id.toString(),
      name: contact.name,
      company: contact.company,
      title: contact.title,
      email: contact.email,
      comments: contact.comments,
      tag: contact.tag,
      followUpDate: contact.followUpDate,
      followUpRequired: contact.followUpRequired,
      followUpNotes: contact.followUpNotes,
      communications: contact.communications,
      createdAt: contact.createdAt
    };

    res.json(transformedContact);
  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// Delete contact
app.delete('/api/contacts/:id', requireAuth, async (req, res) => {
  try {
    const result = await Contact.findByIdAndDelete(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// Add communication to contact
app.post('/api/contacts/:id/communications', requireAuth, async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const newCommunication = {
      type: req.body.type || 'other',
      date: req.body.date || new Date().toISOString().split('T')[0],
      description: req.body.description || ''
    };

    contact.communications.unshift(newCommunication); // Add to beginning
    await contact.save();

    res.status(201).json(newCommunication);
  } catch (error) {
    console.error('Error adding communication:', error);
    res.status(500).json({ error: 'Failed to add communication' });
  }
});

// Update communication
app.put('/api/contacts/:id/communications/:commId', requireAuth, async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const commIndex = contact.communications.findIndex(c => c._id.toString() === req.params.commId);
    if (commIndex === -1) {
      return res.status(404).json({ error: 'Communication not found' });
    }

    // Update communication
    contact.communications[commIndex] = {
      ...contact.communications[commIndex].toObject(),
      type: req.body.type || contact.communications[commIndex].type,
      date: req.body.date || contact.communications[commIndex].date,
      description: req.body.description || contact.communications[commIndex].description
    };

    await contact.save();

    res.json(contact.communications[commIndex]);
  } catch (error) {
    console.error('Error updating communication:', error);
    res.status(500).json({ error: 'Failed to update communication' });
  }
});

// Delete communication
app.delete('/api/contacts/:id/communications/:commId', requireAuth, async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const commIndex = contact.communications.findIndex(c => c._id.toString() === req.params.commId);
    if (commIndex === -1) {
      return res.status(404).json({ error: 'Communication not found' });
    }

    contact.communications.splice(commIndex, 1);
    await contact.save();

    res.json({ message: 'Communication deleted successfully' });
  } catch (error) {
    console.error('Error deleting communication:', error);
    res.status(500).json({ error: 'Failed to delete communication' });
  }
});

// Import contacts in bulk
app.post('/api/contacts/import', requireAuth, async (req, res) => {
  try {
    const { contacts: newContacts } = req.body;

    if (!Array.isArray(newContacts) || newContacts.length === 0) {
      return res.status(400).json({ error: 'No contacts provided' });
    }

    let importedCount = 0;
    const contactsToInsert = [];

    newContacts.forEach(contactData => {
      if (!contactData.name || !contactData.name.trim()) {
        return; // Skip contacts without names
      }

      contactsToInsert.push({
        name: contactData.name || '',
        company: contactData.company || '',
        title: contactData.title || '',
        email: contactData.email || '',
        comments: contactData.comments || '',
        tag: contactData.tag || 'no action',
        followUpDate: contactData.followUpDate || null,
        followUpRequired: contactData.followUpRequired || false,
        followUpNotes: contactData.followUpNotes || '',
        communications: contactData.communications || []
      });
      importedCount++;
    });

    await Contact.insertMany(contactsToInsert);

    res.status(201).json({
      message: 'Contacts imported successfully',
      count: importedCount
    });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: 'Failed to import contacts' });
  }
});

// Time Entry API Routes (for browser extension)

// Get all time entries
app.get('/api/time-entries', async (req, res) => {
  try {
    const timeEntries = await TimeEntry.find().sort({ date: -1, createdAt: -1 });
    const transformed = timeEntries.map(e => ({
      id: e.entryId,
      date: e.date,
      client: e.client,
      time: e.time,
      task: e.task
    }));
    res.json(transformed);
  } catch (error) {
    console.error('Error fetching time entries:', error);
    res.status(500).json({ error: 'Failed to fetch time entries' });
  }
});

// Create time entry
app.post('/api/time-entries', async (req, res) => {
  try {
    const entry = new TimeEntry({
      entryId: req.body.id || Date.now(),
      date: req.body.date,
      client: req.body.client,
      time: req.body.time,
      task: req.body.task
    });
    await entry.save();
    res.status(201).json({
      id: entry.entryId,
      date: entry.date,
      client: entry.client,
      time: entry.time,
      task: entry.task
    });
  } catch (error) {
    console.error('Error creating time entry:', error);
    res.status(500).json({ error: 'Failed to create time entry' });
  }
});

// Update time entry
app.put('/api/time-entries/:id', async (req, res) => {
  try {
    const entry = await TimeEntry.findOne({ entryId: parseInt(req.params.id) });
    if (!entry) {
      return res.status(404).json({ error: 'Time entry not found' });
    }
    if (req.body.date !== undefined) entry.date = req.body.date;
    if (req.body.client !== undefined) entry.client = req.body.client;
    if (req.body.time !== undefined) entry.time = req.body.time;
    if (req.body.task !== undefined) entry.task = req.body.task;
    await entry.save();
    res.json({
      id: entry.entryId,
      date: entry.date,
      client: entry.client,
      time: entry.time,
      task: entry.task
    });
  } catch (error) {
    console.error('Error updating time entry:', error);
    res.status(500).json({ error: 'Failed to update time entry' });
  }
});

// Delete time entry
app.delete('/api/time-entries/:id', async (req, res) => {
  try {
    const result = await TimeEntry.findOneAndDelete({ entryId: parseInt(req.params.id) });
    if (!result) {
      return res.status(404).json({ error: 'Time entry not found' });
    }
    res.json({ message: 'Time entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting time entry:', error);
    res.status(500).json({ error: 'Failed to delete time entry' });
  }
});

// Client Names API (for browser extension autocomplete)

// Get all client names
app.get('/api/client-names', async (req, res) => {
  try {
    const clientNames = await ClientName.find().sort({ name: 1 });
    res.json(clientNames.map(c => c.name));
  } catch (error) {
    console.error('Error fetching client names:', error);
    res.status(500).json({ error: 'Failed to fetch client names' });
  }
});

// Add a new client name (if not exists)
app.post('/api/client-names', async (req, res) => {
  try {
    const name = req.body.name?.trim();
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Check if already exists (case-insensitive)
    const existing = await ClientName.findOne({
      name: { $regex: new RegExp(`^${name}$`, 'i') }
    });

    if (existing) {
      return res.json({ name: existing.name, exists: true });
    }

    const clientName = new ClientName({ name });
    await clientName.save();
    res.status(201).json({ name: clientName.name, exists: false });
  } catch (error) {
    console.error('Error saving client name:', error);
    res.status(500).json({ error: 'Failed to save client name' });
  }
});

// Get config (user settings)
app.get('/api/config', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Don't send password to frontend
    const safeConfig = {
      darkMode: user.darkMode || false,
      emailEnabled: user.email ? true : false,
      notificationEmail: user.email || '',
      smtpConfig: {
        host: user.smtpHost,
        port: user.smtpPort,
        secure: user.smtpPort === 465,
        auth: {
          user: user.smtpUser,
          pass: user.smtpPassword ? '********' : ''
        }
      }
    };
    res.json(safeConfig);
  } catch (error) {
    console.error('Error fetching config:', error);
    res.status(500).json({ error: 'Failed to read config' });
  }
});

// Update config (user settings)
app.put('/api/config', requireAuth, async (req, res) => {
  try {
    console.log('[CONFIG] Received config update request');
    console.log('[CONFIG] Email:', req.body.notificationEmail);
    console.log('[CONFIG] SMTP Host:', req.body.smtpConfig?.host);
    console.log('[CONFIG] SMTP Port:', req.body.smtpConfig?.port);
    console.log('[CONFIG] SMTP User:', req.body.smtpConfig?.auth?.user);
    console.log('[CONFIG] SMTP Pass provided:', req.body.smtpConfig?.auth?.pass ? 'Yes (length: ' + req.body.smtpConfig.auth.pass.length + ')' : 'No');
    console.log('[CONFIG] SMTP Pass is masked:', req.body.smtpConfig?.auth?.pass === '********');

    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('[CONFIG] Current user email in DB:', user.email);
    console.log('[CONFIG] Current SMTP password in DB:', user.smtpPassword ? 'Yes (length: ' + user.smtpPassword.length + ')' : 'No');

    // Update user settings
    if (req.body.darkMode !== undefined) {
      user.darkMode = req.body.darkMode;
    }

    if (req.body.notificationEmail !== undefined) {
      user.email = req.body.notificationEmail;
    }

    if (req.body.smtpConfig) {
      if (req.body.smtpConfig.host !== undefined) user.smtpHost = req.body.smtpConfig.host;
      if (req.body.smtpConfig.port !== undefined) user.smtpPort = req.body.smtpConfig.port;
      if (req.body.smtpConfig.auth) {
        if (req.body.smtpConfig.auth.user !== undefined) user.smtpUser = req.body.smtpConfig.auth.user;
        // Only update password if it's not masked
        if (req.body.smtpConfig.auth.pass !== undefined && req.body.smtpConfig.auth.pass !== '********') {
          console.log('[CONFIG] Updating SMTP password');
          user.smtpPassword = req.body.smtpConfig.auth.pass;
        } else {
          console.log('[CONFIG] NOT updating SMTP password (masked or undefined)');
        }
      }
    }

    await user.save();
    console.log('[CONFIG] User saved successfully');
    console.log('[CONFIG] After save - email:', user.email);
    console.log('[CONFIG] After save - smtpPassword exists:', !!user.smtpPassword);
    res.json({ message: 'Config updated successfully' });
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// Send email via Brevo API
async function sendEmailViaBrevoAPI(user, subject, htmlContent) {
  const emailData = {
    sender: {
      name: user.smtpFromName || 'Contact Outreach Manager',
      email: user.smtpUser // Brevo verified sender email
    },
    to: [{
      email: user.email,
      name: user.username || 'User'
    }],
    subject: subject,
    htmlContent: htmlContent
  };

  console.log('[BREVO-API] Sending email via Brevo API');
  console.log('[BREVO-API] From:', emailData.sender.email);
  console.log('[BREVO-API] To:', emailData.to[0].email);
  console.log('[BREVO-API] Subject:', subject);

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': user.smtpPassword, // API key stored in smtpPassword field
      'content-type': 'application/json'
    },
    body: JSON.stringify(emailData)
  });

  const responseData = await response.json();
  console.log('[BREVO-API] Response status:', response.status);
  console.log('[BREVO-API] Response data:', JSON.stringify(responseData));

  if (!response.ok) {
    throw new Error(`Brevo API error: ${response.status} - ${JSON.stringify(responseData)}`);
  }

  return responseData;
}

// Send follow-up reminder emails daily at 8:30 AM Eastern Time
cron.schedule('30 8 * * *', async () => {
  const now = new Date();
  const today = new Date().toISOString().split('T')[0];

  console.log('========================================');
  console.log('[CRON-EMAIL] Scheduled follow-up email check running...');
  console.log(`[CRON-EMAIL] Current time: ${now.toISOString()}`);
  console.log(`[CRON-EMAIL] Today's date (UTC): ${today}`);
  console.log('========================================');

  try {
    const contacts = await Contact.find({
      followUpDate: today,
      dontSendEmail: { $ne: true }
    });
    console.log(`[CRON-EMAIL] Found ${contacts.length} contact(s) with follow-up date today (email not disabled)`);

    if (contacts.length > 0) {
      console.log('[CRON-EMAIL] Contacts found:');
      contacts.forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.name} (Follow-up date: ${c.followUpDate})`);
      });
    }

    for (const contact of contacts) {
      try {
        const user = await User.findOne();
        if (!user) {
          console.log('[CRON-EMAIL] No user found, skipping email send');
          continue;
        }

        // Check if Brevo is configured
        if (!user.smtpUser || !user.smtpPassword) {
          console.log('[CRON-EMAIL] Email not configured - missing SMTP credentials');
          continue;
        }

        const subject = `Follow-up Reminder: ${contact.name}`;
        const htmlContent = `
          <h2>Follow-up Reminder for ${contact.name}</h2>
          <p><strong>Company:</strong> ${contact.company || 'N/A'}</p>
          <p><strong>Title:</strong> ${contact.title || 'N/A'}</p>
          <p><strong>Email:</strong> ${contact.email || 'N/A'}</p>
          <p><strong>Tag:</strong> ${contact.tag}</p>
          ${contact.followUpNotes ? `<p><strong>Follow-up Notes:</strong></p><p>${contact.followUpNotes}</p>` : ''}
          <br>
          <p>This is your scheduled follow-up reminder from Contact Outreach Manager.</p>
        `;

        await sendEmailViaBrevoAPI(user, subject, htmlContent);
        console.log(`[CRON-EMAIL] ✓ Follow-up reminder email sent for ${contact.name}`);

      } catch (emailError) {
        console.error(`[CRON-EMAIL] Failed to send email for ${contact.name}:`, emailError.message);
      }
    }

    console.log('[CRON-EMAIL] Scheduled follow-up email check completed');
  } catch (error) {
    console.error('[CRON-EMAIL] Error checking scheduled follow-up emails:', error);
  }
}, {
  timezone: 'America/New_York'
});

console.log('[CRON] Scheduled follow-up email job scheduled for 8:30 AM EST daily');

// Test email endpoint - sends a test email to verify SMTP configuration
app.post('/api/test-email', requireAuth, async (req, res) => {
  try {
    console.log('[TEST-EMAIL] Manual email test requested');

    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`[TEST-EMAIL] User email: ${user.email}`);
    console.log(`[TEST-EMAIL] SMTP Host: ${user.smtpHost}`);
    console.log(`[TEST-EMAIL] SMTP Port: ${user.smtpPort}`);
    console.log(`[TEST-EMAIL] SMTP User: ${user.smtpUser}`);

    if (!user.email || !user.smtpHost || !user.smtpUser || !user.smtpPassword) {
      return res.status(400).json({
        error: 'Email configuration incomplete. Please configure all SMTP settings in the Settings menu.'
      });
    }

    // Check if using Brevo API
    const useBrevoAPI = user.smtpHost && user.smtpHost.includes('brevo.com');

    if (useBrevoAPI) {
      console.log('[TEST-EMAIL] Using Brevo API (HTTPS)');

      const subject = 'Test Email - Contact Outreach Manager';
      const htmlContent = `
        <h2>Test Email Successful!</h2>
        <p>This is a test email from your Contact Outreach Manager application.</p>
        <p>If you're seeing this, your email configuration is working correctly.</p>
        <br>
        <p><strong>Email Configuration:</strong></p>
        <ul>
          <li>Method: Brevo API (HTTPS)</li>
          <li>Sender: ${user.smtpUser}</li>
        </ul>
        <br>
        <p>Your daily follow-up reminders will be sent to this email address at 7:30 AM EST.</p>
      `;

      await sendEmailViaBrevoAPI(user, subject, htmlContent);
      console.log('[TEST-EMAIL] ✓ Test email sent successfully via Brevo API');

      res.json({
        message: 'Test email sent successfully via Brevo API! Check your inbox.',
        recipient: user.email,
        method: 'Brevo API (HTTPS)'
      });
      return;
    }

    // Fall back to SMTP
    console.log('[TEST-EMAIL] Using SMTP');

    const transportConfig = {
      host: user.smtpHost,
      port: user.smtpPort,
      secure: user.smtpPort === 465,
      connectionTimeout: 30000, // 30 seconds
      greetingTimeout: 30000,
      socketTimeout: 30000,
      auth: {
        user: user.smtpUser,
        pass: user.smtpPassword
      }
    };

    // Add TLS settings for port 587
    if (user.smtpPort === 587) {
      transportConfig.requireTLS = true;
      transportConfig.tls = {
        ciphers: 'SSLv3',
        rejectUnauthorized: false
      };
    }

    console.log('[TEST-EMAIL] Transport config:', JSON.stringify({
      host: transportConfig.host,
      port: transportConfig.port,
      secure: transportConfig.secure,
      requireTLS: transportConfig.requireTLS
    }));

    const transporter = nodemailer.createTransport(transportConfig);

    // Verify SMTP connection
    console.log('[TEST-EMAIL] Verifying SMTP connection...');
    await transporter.verify();
    console.log('[TEST-EMAIL] SMTP connection verified');

    // Send test email
    const mailOptions = {
      from: user.smtpFromEmail || user.smtpUser,
      to: user.email,
      subject: 'Test Email - Contact Outreach Manager',
      html: `
        <h2>Test Email Successful!</h2>
        <p>This is a test email from your Contact Outreach Manager application.</p>
        <p>If you're seeing this, your email configuration is working correctly.</p>
        <br>
        <p><strong>SMTP Configuration:</strong></p>
        <ul>
          <li>Host: ${user.smtpHost}</li>
          <li>Port: ${user.smtpPort}</li>
          <li>User: ${user.smtpUser}</li>
        </ul>
        <br>
        <p>Your daily follow-up reminders will be sent to this email address at 7:30 AM EST.</p>
      `
    };

    console.log('[TEST-EMAIL] Sending test email...');
    await transporter.sendMail(mailOptions);
    console.log('[TEST-EMAIL] ✓ Test email sent successfully');

    res.json({
      message: 'Test email sent successfully! Check your inbox.',
      recipient: user.email
    });
  } catch (error) {
    console.error('[TEST-EMAIL] ✗ Failed to send test email:', error);
    res.status(500).json({
      error: 'Failed to send test email: ' + error.message
    });
  }
});

// Serve appropriate page based on auth status (MUST come before static middleware)
app.get('/', async (req, res) => {
  const setupNeeded = await isSetupNeeded();
  console.log('[Root Route] Setup needed:', setupNeeded);
  console.log('[Root Route] Session ID:', req.sessionID);
  console.log('[Root Route] Session:', req.session);
  console.log('[Root Route] Authenticated:', req.session?.authenticated);
  console.log('[Root Route] Cookies:', req.headers.cookie);

  if (setupNeeded) {
    res.sendFile(path.join(__dirname, 'public', 'setup.html'));
  } else if (!req.session || !req.session.authenticated) {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Serve static files (CSS, JS, images) - comes after root route to prevent bypassing auth
// Disable caching for development
app.use(express.static('public', {
  etag: false,
  maxAge: 0,
  setHeaders: (res, path) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  }
}));

// Start server
app.listen(PORT, () => {
  console.log(`Contact Outreach Manager running on http://localhost:${PORT}`);
});
