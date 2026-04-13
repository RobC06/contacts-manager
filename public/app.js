// Global variables
let contacts = [];
let currentSort = { field: null, direction: 'asc' };
let visibleContacts = [];   // tracks what's currently rendered (for export)
let quickLogContactId = null;

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
  loadDarkMode();
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

// Load contacts from API
async function loadContacts() {
  try {
    const response = await fetch('/api/contacts');
    contacts = await response.json();

    // Restore saved state if it exists
    const savedState = localStorage.getItem('contactListState');
    if (savedState) {
      // Clear state immediately so a parse error doesn't cause an infinite loop
      localStorage.removeItem('contactListState');
      const state = JSON.parse(savedState);

      // Restore search term (always set, even if empty)
      searchInput.value = state.searchTerm || '';

      // Restore tag filters (handles all cases including empty array)
      if (Array.isArray(state.selectedTags)) {
        document.querySelectorAll('.tag-filter').forEach(checkbox => {
          checkbox.checked = state.selectedTags.includes(checkbox.value);
        });
      }

      // Restore sort directly — without calling sortContacts() to avoid
      // triggering extra full-table renders before the filter is applied
      if (state.sortField) {
        currentSort.field = state.sortField;
        currentSort.direction = state.sortDirection || 'asc';

        contacts.sort((a, b) => {
          let aVal, bVal;
          if (state.sortField === 'lastContact') {
            aVal = getLastContactDate(a) || '0000-00-00';
            bVal = getLastContactDate(b) || '0000-00-00';
          } else if (state.sortField === 'followUpDate') {
            aVal = a.followUpDate || '9999-99-99';
            bVal = b.followUpDate || '9999-99-99';
          } else {
            aVal = (a[state.sortField] || '').toLowerCase();
            bVal = (b[state.sortField] || '').toLowerCase();
          }
          if (aVal < bVal) return currentSort.direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return currentSort.direction === 'asc' ? 1 : -1;
          return 0;
        });

        document.querySelectorAll('th').forEach(th => th.classList.remove('sorted-asc', 'sorted-desc'));
        const sortedTh = document.querySelector(`th[data-sort="${state.sortField}"]`);
        if (sortedTh) sortedTh.classList.add(`sorted-${currentSort.direction}`);
      }

      // Apply filters and render exactly once
      filterContacts(searchInput.value);
    } else {
      updateTagCounts();
      renderContacts();
    }
  } catch (error) {
    console.error('Failed to load contacts:', error);
    showToast('Failed to load contacts', 'error');
  }
}

// Render contacts table
function renderContacts(filteredContacts = null) {
  const contactsToRender = filteredContacts || contacts;
  visibleContacts = contactsToRender; // track for CSV export

  if (contactsToRender.length === 0) {
    contactsTableBody.innerHTML = '';
    emptyState.style.display = 'block';
    document.querySelector('.table-container').style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  document.querySelector('.table-container').style.display = 'block';

  // Today's date in YYYY-MM-DD (local time) for overdue check
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  contactsTableBody.innerHTML = contactsToRender.map(contact => {
    const lastContactDate = getLastContactDate(contact);
    const tagClass = contact.tag.replace(/\s+/g, '-');
    const isOverdue = contact.tag === 'follow up' && contact.followUpDate && contact.followUpDate < today;

    const truncatedNotes = contact.followUpNotes
      ? (contact.followUpNotes.length > 50
          ? escapeHtml(contact.followUpNotes.substring(0, 50)) + '...'
          : escapeHtml(contact.followUpNotes))
      : '-';

    // Get most recent communication (excluding monday.com imports)
    let contactNotes = '-';
    if (contact.communications && contact.communications.length > 0) {
      // Filter out monday.com imports
      const filteredComms = contact.communications.filter(comm => {
        const desc = (comm.description || '').toLowerCase();
        return !desc.includes('monday.com');
      });

      if (filteredComms.length > 0) {
        const sortedComms = [...filteredComms].sort((a, b) =>
          new Date(b.date) - new Date(a.date)
        );
        const mostRecent = sortedComms[0];
        const commType = (mostRecent.type || 'other').charAt(0).toUpperCase() + (mostRecent.type || 'other').slice(1);
        const commDesc = mostRecent.description || '';
        const truncatedDesc = commDesc.length > 50 ? commDesc.substring(0, 50) + '...' : commDesc;
        contactNotes = `${commType}-- ${truncatedDesc}`;
      }
    }

    return `
      <tr data-id="${contact.id}"${isOverdue ? ' class="overdue-row"' : ''}>
        <td><input type="checkbox" class="contact-checkbox" data-id="${contact.id}"></td>
        <td><strong>${escapeHtml(contact.name)}</strong></td>
        <td>${escapeHtml(contact.company) || '-'}</td>
        <td>${escapeHtml(contact.title) || '-'}</td>
        <td>${lastContactDate || '-'}</td>
        <td title="${escapeHtml(contactNotes)}">${escapeHtml(contactNotes)}</td>
        <td><span class="tag ${tagClass}">${contact.tag}</span></td>
        <td class="${isOverdue ? 'overdue-date' : ''}">${contact.followUpDate || '-'}</td>
        <td title="${escapeHtml(contact.followUpNotes || '')}">${truncatedNotes}</td>
        <td><button class="quick-log-btn" data-id="${contact.id}" data-name="${escapeHtml(contact.name)}" title="Log communication">+</button></td>
      </tr>
    `;
  }).join('');

  // Add click listeners to rows (except checkboxes and quick-log buttons)
  document.querySelectorAll('#contactsTableBody tr').forEach(row => {
    row.addEventListener('click', (e) => {
      if (!e.target.classList.contains('contact-checkbox') && !e.target.classList.contains('quick-log-btn')) {
        const contactId = row.dataset.id;
        viewContact(contactId);
      }
    });
  });

  // Add event listeners to checkboxes
  document.querySelectorAll('.contact-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', updateDeleteButtonVisibility);
  });

  // Add event listeners to quick-log buttons
  document.querySelectorAll('.quick-log-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openQuickLog(btn.dataset.id, btn.dataset.name);
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
function filterContacts(searchTerm = '') {
  const term = searchTerm.toLowerCase();

  // Get selected tag filters
  const selectedTags = Array.from(document.querySelectorAll('.tag-filter:checked'))
    .map(checkbox => checkbox.value);

  const filtered = contacts.filter(contact => {
    // Check search term match
    const matchesSearch = !term || (
      contact.name.toLowerCase().includes(term) ||
      (contact.company && contact.company.toLowerCase().includes(term)) ||
      (contact.title && contact.title.toLowerCase().includes(term)) ||
      contact.tag.toLowerCase().includes(term)
    );

    // Check tag filter match
    const matchesTagFilter = selectedTags.length === 0 || selectedTags.includes(contact.tag);

    return matchesSearch && matchesTagFilter;
  });

  // Show toast if search term provided but no results
  if (term && filtered.length === 0 && contacts.length > 0) {
    showToast('No contacts found', 'info');
  }

  updateTagCounts();
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

  filterContacts(searchInput.value);
}

// View contact details
function viewContact(contactId) {
  // Save current state before navigating
  const state = {
    searchTerm: searchInput.value,
    selectedTags: Array.from(document.querySelectorAll('.tag-filter:checked')).map(cb => cb.value),
    sortField: currentSort.field,
    sortDirection: currentSort.direction
  };
  localStorage.setItem('contactListState', JSON.stringify(state));

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
      showToast('Contact deleted successfully', 'success');
    } else {
      showToast('Failed to delete contact', 'error');
    }
  } catch (error) {
    console.error('Failed to delete contact:', error);
    showToast('Failed to delete contact', 'error');
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
    email: document.getElementById('contactEmail').value,
    comments: document.getElementById('contactComments').value,
    tag: document.getElementById('contactTag').value,
    followUpDate: document.getElementById('contactFollowUpDate').value || null,
    followUpRequired: document.getElementById('contactFollowUpRequired').checked,
    followUpNotes: document.getElementById('contactFollowUpNotes').value,
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
      showToast('Contact added successfully', 'success');
    } else {
      showToast('Failed to save contact', 'error');
    }
  } catch (error) {
    console.error('Failed to save contact:', error);
    showToast('Failed to save contact', 'error');
  }
}

// Load settings
// Load and apply dark mode
async function loadDarkMode() {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();

    if (config.darkMode) {
      document.body.classList.add('dark-mode');
    }
  } catch (error) {
    console.error('Failed to load dark mode:', error);
  }
}

async function loadSettings() {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();

    document.getElementById('darkModeToggle').checked = config.darkMode || false;
    document.getElementById('emailEnabled').checked = config.emailEnabled;
    document.getElementById('notificationEmail').value = config.notificationEmail;
    document.getElementById('smtpHost').value = config.smtpConfig.host;
    document.getElementById('smtpPort').value = config.smtpConfig.port;
    document.getElementById('smtpUser').value = config.smtpConfig.auth.user;

    // Don't populate password field - leave it empty
    // If password exists in DB, show placeholder
    const passField = document.getElementById('smtpPass');
    passField.value = '';
    if (config.smtpConfig.auth.pass && config.smtpConfig.auth.pass !== '') {
      passField.placeholder = '(password saved - leave blank to keep current)';
    } else {
      passField.placeholder = 'Enter SMTP password';
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// Save settings
async function saveSettings(event) {
  event.preventDefault();

  const darkMode = document.getElementById('darkModeToggle').checked;
  const smtpPassValue = document.getElementById('smtpPass').value;

  const configData = {
    darkMode: darkMode,
    emailEnabled: document.getElementById('emailEnabled').checked,
    notificationEmail: document.getElementById('notificationEmail').value,
    smtpConfig: {
      host: document.getElementById('smtpHost').value,
      port: parseInt(document.getElementById('smtpPort').value) || 587,
      secure: false,
      auth: {
        user: document.getElementById('smtpUser').value,
        // Only include password if user entered something
        pass: smtpPassValue || '********'
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
      // Apply dark mode immediately
      if (darkMode) {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
      }

      // Update password field placeholder if password was entered
      const passField = document.getElementById('smtpPass');
      if (smtpPassValue && smtpPassValue !== '') {
        passField.value = '';
        passField.placeholder = '✓ Password saved - leave blank to keep current';
      }

      // Don't close modal - let user test email immediately
      showToast('Settings saved successfully - you can now test email', 'success');
    } else {
      showToast('Failed to save settings', 'error');
    }
  } catch (error) {
    console.error('Failed to save settings:', error);
    showToast('Failed to save settings', 'error');
  }
}

// Send test email
async function sendTestEmail() {
  const button = document.getElementById('testEmailBtn');
  const originalText = button.textContent;

  try {
    // Disable button and show loading state
    button.disabled = true;
    button.textContent = 'Sending...';

    const response = await fetch('/api/test-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (response.ok) {
      showToast('Test email sent! Check your inbox.', 'success');
    } else {
      showToast(data.error || 'Failed to send test email', 'error');
    }
  } catch (error) {
    console.error('Failed to send test email:', error);
    showToast('Failed to send test email', 'error');
  } finally {
    // Re-enable button
    button.disabled = false;
    button.textContent = originalText;
  }
}

// Setup event listeners
function setupEventListeners() {
  // Search
  searchInput.addEventListener('input', (e) => {
    filterContacts(e.target.value);
  });

  // Tag filter checkboxes
  document.querySelectorAll('.tag-filter').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      filterContacts(searchInput.value);
    });
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

  // Select all checkbox
  document.getElementById('selectAllCheckbox').addEventListener('change', handleSelectAll);

  // Delete selected button
  document.getElementById('deleteSelectedBtn').addEventListener('click', deleteSelectedContacts);

  // Bulk tag update button
  document.getElementById('bulkTagBtn').addEventListener('click', bulkUpdateTag);

  // Export contacts button
  document.getElementById('exportContactsBtn').addEventListener('click', exportContacts);

  // Quick log form submit and cancel
  document.getElementById('quickLogForm').addEventListener('submit', submitQuickLog);
  document.getElementById('cancelQuickLogBtn').addEventListener('click', () => {
    document.getElementById('quickLogModal').style.display = 'none';
  });

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

  // Test email button
  document.getElementById('testEmailBtn').addEventListener('click', sendTestEmail);

  // Removed click-outside-to-close to prevent accidental data loss
  // Users must click the X button or Cancel button to close modals

  // Sort table headers
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      sortContacts(th.dataset.sort);
    });
  });
}

// Update delete button visibility based on selections
function updateDeleteButtonVisibility() {
  const selectedCheckboxes = document.querySelectorAll('.contact-checkbox:checked');
  const deleteBtn = document.getElementById('deleteSelectedBtn');
  const bulkTagSelect = document.getElementById('bulkTagSelect');
  const bulkTagBtn = document.getElementById('bulkTagBtn');
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');

  const hasSelection = selectedCheckboxes.length > 0;
  deleteBtn.style.display = hasSelection ? 'inline-block' : 'none';
  bulkTagSelect.style.display = hasSelection ? 'inline-block' : 'none';
  bulkTagBtn.style.display = hasSelection ? 'inline-block' : 'none';
  if (!hasSelection) bulkTagSelect.value = '';

  // Update select all checkbox state
  const allCheckboxes = document.querySelectorAll('.contact-checkbox');
  if (allCheckboxes.length > 0 && selectedCheckboxes.length === allCheckboxes.length) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.indeterminate = false;
  } else if (selectedCheckboxes.length > 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = true;
  } else {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  }
}

// Handle select all checkbox
function handleSelectAll(event) {
  const isChecked = event.target.checked;
  document.querySelectorAll('.contact-checkbox').forEach(checkbox => {
    checkbox.checked = isChecked;
  });
  updateDeleteButtonVisibility();
}

// Delete selected contacts
async function deleteSelectedContacts() {
  const selectedCheckboxes = document.querySelectorAll('.contact-checkbox:checked');
  const selectedIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.id);

  if (selectedIds.length === 0) return;

  const confirmMessage = `Are you sure you want to delete ${selectedIds.length} contact${selectedIds.length > 1 ? 's' : ''}?`;
  if (!confirm(confirmMessage)) {
    return;
  }

  try {
    // Delete all selected contacts
    const deletePromises = selectedIds.map(id =>
      fetch(`/api/contacts/${id}`, { method: 'DELETE' })
    );

    await Promise.all(deletePromises);

    // Remove deleted contacts from the array
    contacts = contacts.filter(c => !selectedIds.includes(c.id));

    // Reset select all checkbox
    document.getElementById('selectAllCheckbox').checked = false;
    document.getElementById('selectAllCheckbox').indeterminate = false;

    filterContacts(searchInput.value);
    showToast(`${selectedIds.length} contact${selectedIds.length > 1 ? 's' : ''} deleted successfully`, 'success');
  } catch (error) {
    console.error('Failed to delete contacts:', error);
    showToast('Failed to delete some contacts', 'error');
  }
}

// Update tag count badges on the filter checkboxes
function updateTagCounts() {
  const term = searchInput.value.toLowerCase();
  const counts = { 'follow up': 0, 'waiting for response': 0, 'no action': 0 };

  contacts.forEach(contact => {
    const matchesSearch = !term || (
      contact.name.toLowerCase().includes(term) ||
      (contact.company && contact.company.toLowerCase().includes(term)) ||
      (contact.title && contact.title.toLowerCase().includes(term)) ||
      contact.tag.toLowerCase().includes(term)
    );
    if (matchesSearch && counts.hasOwnProperty(contact.tag)) {
      counts[contact.tag]++;
    }
  });

  const fuEl = document.getElementById('countFollowUp');
  const wEl  = document.getElementById('countWaiting');
  const naEl = document.getElementById('countNoAction');
  if (fuEl) fuEl.textContent = counts['follow up'];
  if (wEl)  wEl.textContent  = counts['waiting for response'];
  if (naEl) naEl.textContent = counts['no action'];
}

// Export visible contacts to CSV
function exportContacts() {
  if (visibleContacts.length === 0) {
    showToast('No contacts to export', 'info');
    return;
  }

  const headers = ['Name', 'Company', 'Title', 'Email', 'Tag', 'Follow-up Date', 'Follow-up Notes', 'Date of Last Contact', 'Comments'];
  const rows = visibleContacts.map(c => [
    c.name || '',
    c.company || '',
    c.title || '',
    c.email || '',
    c.tag || '',
    c.followUpDate || '',
    c.followUpNotes || '',
    getLastContactDate(c) || '',
    c.comments || ''
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `contacts-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${visibleContacts.length} contact${visibleContacts.length !== 1 ? 's' : ''}`, 'success');
}

// Bulk-update tag for all selected contacts
async function bulkUpdateTag() {
  const select = document.getElementById('bulkTagSelect');
  const newTag = select.value;
  if (!newTag) {
    showToast('Select a tag to apply', 'info');
    return;
  }

  const selectedIds = Array.from(document.querySelectorAll('.contact-checkbox:checked')).map(cb => cb.dataset.id);
  if (selectedIds.length === 0) return;

  try {
    await Promise.all(selectedIds.map(id => {
      const contact = contacts.find(c => c.id === id);
      if (!contact) return Promise.resolve();
      return fetch(`/api/contacts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...contact, tag: newTag })
      });
    }));

    selectedIds.forEach(id => {
      const contact = contacts.find(c => c.id === id);
      if (contact) contact.tag = newTag;
    });

    select.value = '';
    document.getElementById('selectAllCheckbox').checked = false;
    document.getElementById('selectAllCheckbox').indeterminate = false;
    filterContacts(searchInput.value);
    showToast(`Updated tag for ${selectedIds.length} contact${selectedIds.length !== 1 ? 's' : ''}`, 'success');
  } catch (error) {
    console.error('Failed to bulk update tags:', error);
    showToast('Failed to update some tags', 'error');
  }
}

// Open the quick-log modal for a contact
function openQuickLog(contactId, contactName) {
  quickLogContactId = contactId;
  document.getElementById('quickLogContactName').textContent = contactName;
  document.getElementById('quickLogForm').reset();
  const d = new Date();
  document.getElementById('quickLogDate').value =
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  document.getElementById('quickLogModal').style.display = 'block';
}

// Submit quick-log communication
async function submitQuickLog(event) {
  event.preventDefault();
  const commData = {
    type: document.getElementById('quickLogType').value,
    date: document.getElementById('quickLogDate').value,
    description: document.getElementById('quickLogDesc').value
  };

  try {
    const response = await fetch(`/api/contacts/${quickLogContactId}/communications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(commData)
    });

    if (response.ok) {
      const newComm = await response.json();
      const contact = contacts.find(c => c.id === quickLogContactId);
      if (contact) {
        contact.communications = contact.communications || [];
        contact.communications.push(newComm);
      }
      document.getElementById('quickLogModal').style.display = 'none';
      filterContacts(searchInput.value);
      showToast('Communication logged successfully', 'success');
    } else {
      showToast('Failed to log communication', 'error');
    }
  } catch (error) {
    console.error('Failed to log communication:', error);
    showToast('Failed to log communication', 'error');
  }
}

// Utility function to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Column resizing functionality
function initColumnResizing() {
  const table = document.getElementById('contactsTable');
  const headers = table.querySelectorAll('th');

  headers.forEach((header, index) => {
    // Skip the last column (Actions) and checkbox column
    if (index === 0 || index === headers.length - 1) return;

    // Create resizer element
    const resizer = document.createElement('div');
    resizer.className = 'resizer';
    header.appendChild(resizer);

    let startX, startWidth;

    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent sorting when resizing

      startX = e.pageX;
      startWidth = header.offsetWidth;

      resizer.classList.add('resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (e) => {
        const width = startWidth + (e.pageX - startX);
        if (width >= 80) { // Minimum column width
          header.style.width = width + 'px';
          header.style.minWidth = width + 'px';
        }
      };

      const onMouseUp = () => {
        resizer.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  });
}

// Initialize column resizing after the table is rendered
document.addEventListener('DOMContentLoaded', () => {
  initColumnResizing();
});
