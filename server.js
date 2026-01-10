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

// Import models
const User = require('./models/User');
const Contact = require('./models/Contact');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/contact-outreach-manager';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
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
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

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

    req.session.authenticated = true;
    req.session.userId = user._id;

    // Explicitly save session to MongoDB before responding
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ error: 'Failed to save session' });
      }
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
    if (req.body.communications !== undefined) contact.communications = req.body.communications;

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

// Get config (user settings)
app.get('/api/config', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Don't send password to frontend
    const safeConfig = {
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
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user settings
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
          user.smtpPassword = req.body.smtpConfig.auth.pass;
        }
      }
    }

    await user.save();
    res.json({ message: 'Config updated successfully' });
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// Email notification function
async function sendFollowUpNotification(contact) {
  try {
    const user = await User.findOne();
    if (!user || !user.email || !user.smtpHost) {
      console.log('Email notifications disabled or not configured');
      return;
    }

    const transporter = nodemailer.createTransport({
      host: user.smtpHost,
      port: user.smtpPort,
      secure: user.smtpPort === 465,
      auth: {
        user: user.smtpUser,
        pass: user.smtpPassword
      }
    });

    const mailOptions = {
      from: user.smtpFromEmail || user.smtpUser,
      to: user.email,
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

// Check for follow-ups daily at 7:30 AM Eastern Time
cron.schedule('30 7 * * *', async () => {
  console.log('Checking for follow-ups...');
  const today = new Date().toISOString().split('T')[0];

  try {
    const contacts = await Contact.find({ followUpDate: today });
    for (const contact of contacts) {
      await sendFollowUpNotification(contact);
    }
  } catch (error) {
    console.error('Error checking follow-ups:', error);
  }
}, {
  timezone: 'America/New_York'
});

// Serve appropriate page based on auth status (MUST come before static middleware)
app.get('/', async (req, res) => {
  const setupNeeded = await isSetupNeeded();
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
