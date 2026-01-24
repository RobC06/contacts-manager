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

  communicationsContainer.innerHTML = sortedComms.map((comm, index) => {
    // Default to 'other' if type is missing (for old communications)
    const type = comm.type || 'other';
    const commId = comm._id || index;

    return `
    <div class="communication-item" data-comm-id="${commId}">
      <div class="communication-header">
        <div class="communication-meta">
          <input type="checkbox" class="comm-checkbox" data-comm-id="${commId}">
          <span class="communication-type type-${escapeHtml(type)}">${escapeHtml(type)}</span>
          <span class="communication-date">${formatDate(comm.date)}</span>
        </div>
        <div class="communication-actions">
          <button class="btn-icon edit-comm-btn" data-comm-id="${commId}" title="Edit">✏️</button>
          <button class="btn-icon delete-comm-btn" data-comm-id="${commId}" title="Delete">🗑️</button>
        </div>
      </div>
      <div class="communication-description">
        ${escapeHtml(comm.description)}
      </div>
    </div>
    `;
  }).join('');

  // Show selection bar if there are communications
  const selectionBar = document.getElementById('communicationSelectionBar');
  if (sortedComms.length > 0) {
    selectionBar.style.display = 'block';
  } else {
    selectionBar.style.display = 'none';
  }

  // Add event listeners for checkboxes and buttons
  document.querySelectorAll('.comm-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', updateDeleteCommButtonVisibility);
  });

  document.querySelectorAll('.edit-comm-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      editCommunication(btn.dataset.commId);
    });
  });

  document.querySelectorAll('.delete-comm-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCommunication(btn.dataset.commId);
    });
  });
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

// Add or update communication
async function addCommunication(event) {
  event.preventDefault();

  const communicationData = {
    type: document.getElementById('commType').value,
    date: document.getElementById('commDate').value,
    description: document.getElementById('commDescription').value
  };

  const editingCommId = communicationForm.dataset.editingCommId;

  try {
    let response;

    if (editingCommId) {
      // Update existing communication
      response = await fetch(`/api/contacts/${contactId}/communications/${editingCommId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(communicationData)
      });

      if (response.ok) {
        const updatedCommunication = await response.json();
        // Update in local array
        const index = contact.communications.findIndex((c, i) => (c._id || i) === editingCommId);
        if (index > -1) {
          contact.communications[index] = updatedCommunication;
        }

        showToast('Communication updated successfully', 'success');
      } else {
        showToast('Failed to update communication', 'error');
      }
    } else {
      // Add new communication
      response = await fetch(`/api/contacts/${contactId}/communications`, {
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

        showToast('Communication added successfully', 'success');
      } else {
        showToast('Failed to add communication', 'error');
      }
    }

    if (response.ok) {
      renderCommunications();

      // Update last contact date
      const lastContactDate = getLastContactDate();
      document.getElementById('lastContactDate').value = lastContactDate || 'No communications yet';

      communicationModal.style.display = 'none';
      communicationForm.reset();
      delete communicationForm.dataset.editingCommId;

      // Reset modal title and button
      document.querySelector('#communicationModal h2').textContent = 'Add Communication';
      const submitBtn = communicationForm.querySelector('button[type="submit"]');
      submitBtn.textContent = 'Add Communication';

      // Set default date to today
      document.getElementById('commDate').value = new Date().toISOString().split('T')[0];
    }
  } catch (error) {
    console.error('Failed to save communication:', error);
    showToast('Failed to save communication', 'error');
  }
}

// Edit communication
function editCommunication(commId) {
  const comm = contact.communications.find((c, i) => (c._id || i) === commId);
  if (!comm) return;

  // Populate modal with existing data
  document.getElementById('commType').value = comm.type || 'other';
  document.getElementById('commDate').value = comm.date;
  document.getElementById('commDescription').value = comm.description;

  // Change modal title and button
  document.querySelector('#communicationModal h2').textContent = 'Edit Communication';
  const submitBtn = communicationForm.querySelector('button[type="submit"]');
  submitBtn.textContent = 'Update Communication';

  // Store commId for update
  communicationForm.dataset.editingCommId = commId;

  // Show modal
  communicationModal.style.display = 'block';
}

// Delete single communication
async function deleteCommunication(commId) {
  if (!confirm('Are you sure you want to delete this communication?')) {
    return;
  }

  try {
    const response = await fetch(`/api/contacts/${contactId}/communications/${commId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      // Remove from local array
      const index = contact.communications.findIndex((c, i) => (c._id || i) === commId);
      if (index > -1) {
        contact.communications.splice(index, 1);
      }

      renderCommunications();

      // Update last contact date
      const lastContactDate = getLastContactDate();
      document.getElementById('lastContactDate').value = lastContactDate || 'No communications yet';

      showToast('Communication deleted successfully', 'success');
    } else {
      showToast('Failed to delete communication', 'error');
    }
  } catch (error) {
    console.error('Failed to delete communication:', error);
    showToast('Failed to delete communication', 'error');
  }
}

// Update delete button visibility
function updateDeleteCommButtonVisibility() {
  const selectedCheckboxes = document.querySelectorAll('.comm-checkbox:checked');
  const deleteBtn = document.getElementById('deleteSelectedCommsBtn');

  if (selectedCheckboxes.length > 0) {
    deleteBtn.style.display = 'inline-block';
  } else {
    deleteBtn.style.display = 'none';
  }
}

// Handle select all communications
function handleSelectAllComms(e) {
  const isChecked = e.target.checked;
  document.querySelectorAll('.comm-checkbox').forEach(checkbox => {
    checkbox.checked = isChecked;
  });
  updateDeleteCommButtonVisibility();
}

// Delete selected communications
async function deleteSelectedCommunications() {
  const selectedCheckboxes = document.querySelectorAll('.comm-checkbox:checked');
  const commIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.commId);

  if (commIds.length === 0) return;

  if (!confirm(`Are you sure you want to delete ${commIds.length} communication(s)?`)) {
    return;
  }

  try {
    // Delete each communication
    for (const commId of commIds) {
      await fetch(`/api/contacts/${contactId}/communications/${commId}`, {
        method: 'DELETE'
      });

      // Remove from local array
      const index = contact.communications.findIndex((c, i) => (c._id || i) === commId);
      if (index > -1) {
        contact.communications.splice(index, 1);
      }
    }

    renderCommunications();

    // Update last contact date
    const lastContactDate = getLastContactDate();
    document.getElementById('lastContactDate').value = lastContactDate || 'No communications yet';

    // Uncheck select all
    document.getElementById('selectAllCommsCheckbox').checked = false;

    showToast(`${commIds.length} communication(s) deleted successfully`, 'success');
  } catch (error) {
    console.error('Failed to delete communications:', error);
    showToast('Failed to delete some communications', 'error');
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
    delete communicationForm.dataset.editingCommId;
    // Reset modal title and button
    document.querySelector('#communicationModal h2').textContent = 'Add Communication';
    const submitBtn = communicationForm.querySelector('button[type="submit"]');
    submitBtn.textContent = 'Add Communication';
    // Set default date to today
    document.getElementById('commDate').value = new Date().toISOString().split('T')[0];
    communicationModal.style.display = 'block';
  });

  // Communication form submit
  communicationForm.addEventListener('submit', addCommunication);

  // Select all communications checkbox
  document.getElementById('selectAllCommsCheckbox').addEventListener('change', handleSelectAllComms);

  // Delete selected communications button
  document.getElementById('deleteSelectedCommsBtn').addEventListener('click', deleteSelectedCommunications);

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
