// Global variables
let contacts = [];
let currentSort = { field: null, direction: 'asc' };

// DOM elements
const contactsTableBody = document.getElementById('contactsTableBody');
const searchInput = document.getElementById('searchInput');
const addContactBtn = document.getElementById('addContactBtn');
const settingsBtn = document.getElementById('settingsBtn');
const contactModal = document.getElementById('contactModal');
const settingsModal = document.getElementById('settingsModal');
const contactForm = document.getElementById('contactForm');
const settingsForm = document.getElementById('settingsForm');
const emptyState = document.getElementById('emptyState');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  loadContacts();
  setupEventListeners();
});

// Check authentication status
async function checkAuth() {
  try {
    const response = await fetch('/api/auth/status');
    const data = await response.json();

    if (!data.authenticated) {
      window.location.href = '/';
    }
  } catch (error) {
    console.error('Auth check failed:', error);
    window.location.href = '/';
  }
}

// Logout
async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  } catch (error) {
    console.error('Logout failed:', error);
    alert('Failed to logout');
  }
}

// Load contacts from API
async function loadContacts() {
  try {
    const response = await fetch('/api/contacts');
    contacts = await response.json();
    renderContacts();
  } catch (error) {
    console.error('Failed to load contacts:', error);
    alert('Failed to load contacts. Please refresh the page.');
  }
}

// Render contacts table
function renderContacts(filteredContacts = null) {
  const contactsToRender = filteredContacts || contacts;

  if (contactsToRender.length === 0) {
    contactsTableBody.innerHTML = '';
    emptyState.style.display = 'block';
    document.querySelector('.table-container').style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  document.querySelector('.table-container').style.display = 'block';

  contactsTableBody.innerHTML = contactsToRender.map(contact => {
    const lastContactDate = getLastContactDate(contact);
    const tagClass = contact.tag.replace(/\s+/g, '-');

    return `
      <tr data-id="${contact.id}">
        <td><strong>${escapeHtml(contact.name)}</strong></td>
        <td>${escapeHtml(contact.company) || '-'}</td>
        <td>${escapeHtml(contact.title) || '-'}</td>
        <td>${lastContactDate || '-'}</td>
        <td><span class="tag ${tagClass}">${contact.tag}</span></td>
        <td>${contact.followUpDate || '-'}</td>
        <td>
          <button class="action-btn view-btn" onclick="viewContact('${contact.id}')">View</button>
          <button class="action-btn delete-btn" onclick="deleteContact('${contact.id}', event)">Delete</button>
        </td>
      </tr>
    `;
  }).join('');

  // Add click listeners to rows (except action buttons)
  document.querySelectorAll('#contactsTableBody tr').forEach(row => {
    row.addEventListener('click', (e) => {
      if (!e.target.classList.contains('action-btn')) {
        const contactId = row.dataset.id;
        viewContact(contactId);
      }
    });
  });
}

// Get last contact date from communications
function getLastContactDate(contact) {
  if (!contact.communications || contact.communications.length === 0) {
    return null;
  }
  const sortedComms = [...contact.communications].sort((a, b) =>
    new Date(b.date) - new Date(a.date)
  );
  return sortedComms[0].date;
}

// Search and filter
function filterContacts(searchTerm) {
  const term = searchTerm.toLowerCase();
  const filtered = contacts.filter(contact => {
    return (
      contact.name.toLowerCase().includes(term) ||
      (contact.company && contact.company.toLowerCase().includes(term)) ||
      (contact.title && contact.title.toLowerCase().includes(term)) ||
      contact.tag.toLowerCase().includes(term)
    );
  });
  renderContacts(filtered);
}

// Sort contacts
function sortContacts(field) {
  // Toggle direction if same field
  if (currentSort.field === field) {
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.field = field;
    currentSort.direction = 'asc';
  }

  // Sort the contacts array
  contacts.sort((a, b) => {
    let aVal, bVal;

    if (field === 'lastContact') {
      aVal = getLastContactDate(a) || '0000-00-00';
      bVal = getLastContactDate(b) || '0000-00-00';
    } else if (field === 'followUpDate') {
      aVal = a.followUpDate || '9999-99-99';
      bVal = b.followUpDate || '9999-99-99';
    } else {
      aVal = (a[field] || '').toLowerCase();
      bVal = (b[field] || '').toLowerCase();
    }

    if (aVal < bVal) return currentSort.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return currentSort.direction === 'asc' ? 1 : -1;
    return 0;
  });

  // Update sort indicators
  document.querySelectorAll('th').forEach(th => {
    th.classList.remove('sorted-asc', 'sorted-desc');
  });

  const sortedTh = document.querySelector(`th[data-sort="${field}"]`);
  if (sortedTh) {
    sortedTh.classList.add(`sorted-${currentSort.direction}`);
  }

  renderContacts();
}

// View contact details
function viewContact(contactId) {
  window.location.href = `contact.html?id=${contactId}`;
}

// Delete contact
async function deleteContact(contactId, event) {
  event.stopPropagation();

  if (!confirm('Are you sure you want to delete this contact?')) {
    return;
  }

  try {
    const response = await fetch(`/api/contacts/${contactId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      contacts = contacts.filter(c => c.id !== contactId);
      renderContacts();
    } else {
      alert('Failed to delete contact');
    }
  } catch (error) {
    console.error('Failed to delete contact:', error);
    alert('Failed to delete contact');
  }
}

// Open add contact modal
function openAddContactModal() {
  document.getElementById('modalTitle').textContent = 'Add New Contact';
  contactForm.reset();
  document.getElementById('contactTag').value = 'no action';
  contactModal.style.display = 'block';
}

// Save contact (add or edit)
async function saveContact(event) {
  event.preventDefault();

  const contactData = {
    name: document.getElementById('contactName').value,
    company: document.getElementById('contactCompany').value,
    title: document.getElementById('contactTitle').value,
    tag: document.getElementById('contactTag').value,
    followUpDate: document.getElementById('contactFollowUpDate').value || null,
    communications: []
  };

  try {
    const response = await fetch('/api/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(contactData)
    });

    if (response.ok) {
      const newContact = await response.json();
      contacts.push(newContact);
      renderContacts();
      contactModal.style.display = 'none';
      contactForm.reset();
    } else {
      alert('Failed to save contact');
    }
  } catch (error) {
    console.error('Failed to save contact:', error);
    alert('Failed to save contact');
  }
}

// Load settings
async function loadSettings() {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();

    document.getElementById('emailEnabled').checked = config.emailEnabled;
    document.getElementById('notificationEmail').value = config.notificationEmail;
    document.getElementById('smtpHost').value = config.smtpConfig.host;
    document.getElementById('smtpPort').value = config.smtpConfig.port;
    document.getElementById('smtpUser').value = config.smtpConfig.auth.user;
    document.getElementById('smtpPass').value = config.smtpConfig.auth.pass;
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// Save settings
async function saveSettings(event) {
  event.preventDefault();

  const configData = {
    emailEnabled: document.getElementById('emailEnabled').checked,
    notificationEmail: document.getElementById('notificationEmail').value,
    smtpConfig: {
      host: document.getElementById('smtpHost').value,
      port: parseInt(document.getElementById('smtpPort').value) || 587,
      secure: false,
      auth: {
        user: document.getElementById('smtpUser').value,
        pass: document.getElementById('smtpPass').value
      }
    }
  };

  try {
    const response = await fetch('/api/config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(configData)
    });

    if (response.ok) {
      alert('Settings saved successfully!');
      settingsModal.style.display = 'none';
    } else {
      alert('Failed to save settings');
    }
  } catch (error) {
    console.error('Failed to save settings:', error);
    alert('Failed to save settings');
  }
}

// Setup event listeners
function setupEventListeners() {
  // Search
  searchInput.addEventListener('input', (e) => {
    filterContacts(e.target.value);
  });

  // Add contact button
  addContactBtn.addEventListener('click', openAddContactModal);

  // Import contacts button
  document.getElementById('importContactsBtn').addEventListener('click', () => {
    window.location.href = 'import.html';
  });

  // Settings button
  settingsBtn.addEventListener('click', () => {
    loadSettings();
    settingsModal.style.display = 'block';
  });

  // Logout button
  document.getElementById('logoutBtn').addEventListener('click', logout);

  // Contact form submit
  contactForm.addEventListener('submit', saveContact);

  // Settings form submit
  settingsForm.addEventListener('submit', saveSettings);

  // Modal close buttons
  document.querySelectorAll('.close').forEach(closeBtn => {
    closeBtn.addEventListener('click', function() {
      this.closest('.modal').style.display = 'none';
    });
  });

  // Cancel buttons
  document.getElementById('cancelBtn').addEventListener('click', () => {
    contactModal.style.display = 'none';
  });

  document.getElementById('cancelSettingsBtn').addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });

  // Close modal when clicking outside
  window.addEventListener('click', (event) => {
    if (event.target === contactModal) {
      contactModal.style.display = 'none';
    }
    if (event.target === settingsModal) {
      settingsModal.style.display = 'none';
    }
  });

  // Sort table headers
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      sortContacts(th.dataset.sort);
    });
  });
}

// Utility function to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
