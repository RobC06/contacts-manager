// Global variables
let contact = null;
let contactId = null;

// Toast notification function
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ'
  };

  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  // Auto-dismiss after duration
  const duration = type === 'error' ? 5000 : 3000;
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, duration);
}

// DOM elements
const contactForm = document.getElementById('contactForm');
const communicationModal = document.getElementById('communicationModal');
const communicationForm = document.getElementById('communicationForm');
const addCommunicationBtn = document.getElementById('addCommunicationBtn');
const deleteContactBtn = document.getElementById('deleteContactBtn');
const communicationsContainer = document.getElementById('communicationsContainer');
const noCommunications = document.getElementById('noCommunications');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Get contact ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  contactId = urlParams.get('id');

  if (!contactId) {
    window.location.href = 'index.html';
    return;
  }

  checkAuth();
  loadContact();
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
  }
}

// Load contact data
async function loadContact() {
  try {
    const response = await fetch(`/api/contacts/${contactId}`);
    if (!response.ok) {
      throw new Error('Contact not found');
    }

    contact = await response.json();
    populateContactForm();
    renderCommunications();
  } catch (error) {
    console.error('Failed to load contact:', error);
    showToast('Failed to load contact', 'error');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1000);
  }
}

// Populate form with contact data
function populateContactForm() {
  document.getElementById('contactNameTitle').textContent = contact.name;
  document.getElementById('contactName').value = contact.name;
  document.getElementById('contactCompany').value = contact.company || '';
  document.getElementById('contactTitle').value = contact.title || '';
  document.getElementById('contactEmail').value = contact.email || '';
  document.getElementById('contactComments').value = contact.comments || '';
  document.getElementById('contactTag').value = contact.tag;
  document.getElementById('contactFollowUpDate').value = contact.followUpDate || '';
  document.getElementById('contactFollowUpRequired').checked = contact.followUpRequired || false;
  document.getElementById('contactFollowUpNotes').value = contact.followUpNotes || '';

  // Set last contact date
  const lastContactDate = getLastContactDate();
  document.getElementById('lastContactDate').value = lastContactDate || 'No communications yet';
}

// Get last contact date
function getLastContactDate() {
  if (!contact.communications || contact.communications.length === 0) {
    return null;
  }
  const sortedComms = [...contact.communications].sort((a, b) =>
    new Date(b.date) - new Date(a.date)
  );
  return sortedComms[0].date;
}

// Render communications
function renderCommunications() {
  if (!contact.communications || contact.communications.length === 0) {
    communicationsContainer.innerHTML = '';
    noCommunications.style.display = 'block';
    return;
  }

  noCommunications.style.display = 'none';

  // Sort communications by date (newest first)
  const sortedComms = [...contact.communications].sort((a, b) =>
    new Date(b.date) - new Date(a.date)
  );

  communicationsContainer.innerHTML = sortedComms.map(comm => {
    // Default to 'other' if type is missing (for old communications)
    const type = comm.type || 'other';

    return `
    <div class="communication-item">
      <div class="communication-header">
        <div class="communication-meta">
          <span class="communication-type type-${escapeHtml(type)}">${escapeHtml(type)}</span>
          <span class="communication-date">${formatDate(comm.date)}</span>
        </div>
      </div>
      <div class="communication-description">
        ${escapeHtml(comm.description)}
      </div>
    </div>
    `;
  }).join('');
}

// Save contact changes
async function saveContact(event) {
  event.preventDefault();

  const updatedContact = {
    ...contact,
    name: document.getElementById('contactName').value,
    company: document.getElementById('contactCompany').value,
    title: document.getElementById('contactTitle').value,
    email: document.getElementById('contactEmail').value,
    comments: document.getElementById('contactComments').value,
    tag: document.getElementById('contactTag').value,
    followUpDate: document.getElementById('contactFollowUpDate').value || null,
    followUpRequired: document.getElementById('contactFollowUpRequired').checked,
    followUpNotes: document.getElementById('contactFollowUpNotes').value
  };

  try {
    const response = await fetch(`/api/contacts/${contactId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatedContact)
    });

    if (response.ok) {
      contact = await response.json();
      document.getElementById('contactNameTitle').textContent = contact.name;
      showToast('Contact updated successfully', 'success');
    } else {
      showToast('Failed to update contact', 'error');
    }
  } catch (error) {
    console.error('Failed to update contact:', error);
    showToast('Failed to update contact', 'error');
  }
}

// Add communication
async function addCommunication(event) {
  event.preventDefault();

  const communicationData = {
    type: document.getElementById('commType').value,
    date: document.getElementById('commDate').value,
    description: document.getElementById('commDescription').value
  };

  try {
    const response = await fetch(`/api/contacts/${contactId}/communications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(communicationData)
    });

    if (response.ok) {
      const newCommunication = await response.json();
      contact.communications = contact.communications || [];
      contact.communications.unshift(newCommunication);

      renderCommunications();

      // Update last contact date
      const lastContactDate = getLastContactDate();
      document.getElementById('lastContactDate').value = lastContactDate || 'No communications yet';

      communicationModal.style.display = 'none';
      communicationForm.reset();

      // Set default date to today
      document.getElementById('commDate').value = new Date().toISOString().split('T')[0];

      showToast('Communication added successfully', 'success');
    } else {
      showToast('Failed to add communication', 'error');
    }
  } catch (error) {
    console.error('Failed to add communication:', error);
    showToast('Failed to add communication', 'error');
  }
}

// Delete contact
async function deleteContactHandler() {
  if (!confirm(`Are you sure you want to delete ${contact.name}? This action cannot be undone.`)) {
    return;
  }

  try {
    const response = await fetch(`/api/contacts/${contactId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      showToast('Contact deleted successfully', 'success');
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 500);
    } else {
      showToast('Failed to delete contact', 'error');
    }
  } catch (error) {
    console.error('Failed to delete contact:', error);
    showToast('Failed to delete contact', 'error');
  }
}

// Setup event listeners
function setupEventListeners() {
  // Contact form submit
  contactForm.addEventListener('submit', saveContact);

  // Add communication button
  addCommunicationBtn.addEventListener('click', () => {
    communicationForm.reset();
    // Set default date to today
    document.getElementById('commDate').value = new Date().toISOString().split('T')[0];
    communicationModal.style.display = 'block';
  });

  // Communication form submit
  communicationForm.addEventListener('submit', addCommunication);

  // Delete contact button
  deleteContactBtn.addEventListener('click', deleteContactHandler);

  // Logout button
  document.getElementById('logoutBtn').addEventListener('click', logout);

  // Modal close button
  document.querySelectorAll('.close').forEach(closeBtn => {
    closeBtn.addEventListener('click', function() {
      this.closest('.modal').style.display = 'none';
    });
  });

  // Cancel button
  document.getElementById('cancelCommBtn').addEventListener('click', () => {
    communicationModal.style.display = 'none';
  });

  // Close modal when clicking outside
  window.addEventListener('click', (event) => {
    if (event.target === communicationModal) {
      communicationModal.style.display = 'none';
    }
  });
}

// Utility functions
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}
