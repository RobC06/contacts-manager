// State
let entries = [];
let editingId = null;
let showAllEntries = false;
let selectedIds = new Set();
let savedClientNames = []; // Persistent client names from database

// DOM Elements
const dateInput = document.getElementById('date-input');
const clientInput = document.getElementById('client-input');
const timeInput = document.getElementById('time-input');
const taskInput = document.getElementById('task-input');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');
const toggleBtn = document.getElementById('toggle-btn');
const expandBtn = document.getElementById('expand-btn');
const closeBtn = document.getElementById('close-btn');
const entriesList = document.getElementById('entries-list');
const entriesLabel = document.getElementById('entries-label');
const headerStats = document.getElementById('header-stats');

// Status elements
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

// Selection elements
const selectionToolbar = document.getElementById('selection-toolbar');
const selectAllCheckbox = document.getElementById('select-all-checkbox');
const selectedCount = document.getElementById('selected-count');
const deleteSelectedBtn = document.getElementById('delete-selected-btn');

function setStatus(type, message) {
  statusDot.className = '';
  if (type === 'connected') {
    statusDot.classList.add('connected');
  } else if (type === 'error') {
    statusDot.classList.add('error');
  } else if (type === 'saving') {
    statusDot.classList.add('saving');
  }
  statusText.textContent = message;
}

// Utility: get today's date in Eastern time (YYYY-MM-DD)
function getTodayEastern() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

// Utility: escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// API Functions
async function fetchEntries() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/time-entries`);
    if (response.ok) {
      entries = await response.json();
      setStatus('connected', `Connected — ${entries.length} entries`);
    } else {
      setStatus('error', 'Server error — data may not be saved');
    }
  } catch (error) {
    console.error('Failed to fetch entries:', error);
    setStatus('error', 'Cannot reach server — check config.js URL');
  }
  render();
}

async function fetchClientNames() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/client-names`);
    if (response.ok) {
      savedClientNames = await response.json();
    }
  } catch (error) {
    console.error('Failed to fetch client names:', error);
  }
}

async function saveClientName(name) {
  if (!name || !name.trim()) return;
  try {
    await fetch(`${API_BASE_URL}/api/client-names`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() })
    });
    // Refresh the list
    await fetchClientNames();
  } catch (error) {
    console.error('Failed to save client name:', error);
  }
}

async function createEntry(entry) {
  setStatus('saving', 'Saving...');
  try {
    const response = await fetch(`${API_BASE_URL}/api/time-entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });
    if (response.ok) {
      const newEntry = await response.json();
      entries.unshift(newEntry);
      // Save the client name for future autocomplete
      saveClientName(entry.client);
      setStatus('connected', 'Saved');
    } else {
      setStatus('error', 'Failed to save — server error');
    }
  } catch (error) {
    console.error('Failed to create entry:', error);
    setStatus('error', 'Failed to save — cannot reach server');
  }
  render();
}

async function updateEntry(id, data) {
  setStatus('saving', 'Saving...');
  try {
    const response = await fetch(`${API_BASE_URL}/api/time-entries/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (response.ok) {
      const updated = await response.json();
      entries = entries.map(e => e.id === id ? updated : e);
      setStatus('connected', 'Updated');
    } else {
      setStatus('error', 'Failed to update — server error');
    }
  } catch (error) {
    console.error('Failed to update entry:', error);
    setStatus('error', 'Failed to update — cannot reach server');
  }
  render();
}

async function deleteEntry(id) {
  setStatus('saving', 'Deleting...');
  try {
    const response = await fetch(`${API_BASE_URL}/api/time-entries/${id}`, {
      method: 'DELETE'
    });
    if (response.ok) {
      entries = entries.filter(e => e.id !== id);
      selectedIds.delete(id);
      setStatus('connected', 'Deleted');
    } else {
      setStatus('error', 'Failed to delete — server error');
    }
  } catch (error) {
    console.error('Failed to delete entry:', error);
    setStatus('error', 'Failed to delete — cannot reach server');
  }
  render();
}

async function deleteSelectedEntries() {
  if (selectedIds.size === 0) return;

  const idsToDelete = [...selectedIds];
  const total = idsToDelete.length;
  let deleted = 0;
  let failed = 0;

  setStatus('saving', `Deleting ${total} entries...`);

  for (const id of idsToDelete) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/time-entries/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        entries = entries.filter(e => e.id !== id);
        selectedIds.delete(id);
        deleted++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error('Failed to delete entry:', id, error);
      failed++;
    }
  }

  if (failed === 0) {
    setStatus('connected', `Deleted ${deleted} entries`);
  } else {
    setStatus('error', `Deleted ${deleted}, failed ${failed}`);
  }

  render();
}

function updateSelectionUI() {
  const displayEntries = showAllEntries ? entries : entries.filter(e => e.date === getTodayEastern());
  const allIds = displayEntries.map(e => e.id);
  const selectedInView = allIds.filter(id => selectedIds.has(id)).length;

  selectedCount.textContent = `${selectedIds.size} selected`;
  deleteSelectedBtn.disabled = selectedIds.size === 0;
  selectAllCheckbox.checked = allIds.length > 0 && selectedInView === allIds.length;
  selectAllCheckbox.indeterminate = selectedInView > 0 && selectedInView < allIds.length;
}

function toggleSelectAll() {
  const displayEntries = showAllEntries ? entries : entries.filter(e => e.date === getTodayEastern());
  const allIds = displayEntries.map(e => e.id);
  const allSelected = allIds.every(id => selectedIds.has(id));

  if (allSelected) {
    // Deselect all
    allIds.forEach(id => selectedIds.delete(id));
  } else {
    // Select all
    allIds.forEach(id => selectedIds.add(id));
  }

  render();
}

function toggleEntrySelection(id) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }
  updateSelectionUI();
  // Update just the checkbox without full re-render
  const checkbox = document.querySelector(`.entry-checkbox[data-id="${id}"]`);
  if (checkbox) checkbox.checked = selectedIds.has(id);
}

// Event Handlers
function handleSubmit() {
  const data = {
    date: dateInput.value,
    client: clientInput.value,
    time: timeInput.value,
    task: taskInput.value
  };

  if (!data.client || !data.time || !data.task) return;

  if (editingId !== null) {
    updateEntry(editingId, data);
    editingId = null;
  } else {
    createEntry({ ...data, id: Date.now() });
  }

  resetForm();
}

function handleEdit(entry) {
  dateInput.value = entry.date;
  clientInput.value = entry.client;
  timeInput.value = entry.time;
  taskInput.value = entry.task;
  editingId = entry.id;

  submitBtn.textContent = 'Update';
  cancelBtn.style.display = 'block';
}

function cancelEdit() {
  editingId = null;
  resetForm();
}

function resetForm() {
  dateInput.value = getTodayEastern();
  clientInput.value = '';
  timeInput.value = '';
  taskInput.value = '';
  submitBtn.textContent = 'Add Entry';
  cancelBtn.style.display = 'none';
}

// Group entries by date, then by client within each date
// Normalizes client names so "Acme", "acme", "ACME " all group together
function groupByDateAndClient(entriesToGroup) {
  const grouped = {};
  entriesToGroup.forEach(entry => {
    const dateKey = entry.date;
    const clientKey = entry.client.trim().toLowerCase();
    if (!grouped[dateKey]) grouped[dateKey] = {};
    if (!grouped[dateKey][clientKey]) {
      grouped[dateKey][clientKey] = { displayName: entry.client.trim(), entries: [] };
    }
    grouped[dateKey][clientKey].entries.push(entry);
  });
  return grouped;
}

// Client autocomplete
const clientSuggestions = document.getElementById('client-suggestions');

function getUniqueClients() {
  const seen = {};
  // Include saved client names from database
  savedClientNames.forEach(name => {
    const key = name.trim().toLowerCase();
    if (!seen[key]) seen[key] = name.trim();
  });
  // Also include any from current entries (in case not yet saved)
  entries.forEach(e => {
    const key = e.client.trim().toLowerCase();
    if (!seen[key]) seen[key] = e.client.trim();
  });
  return Object.values(seen).sort();
}

function showSuggestions() {
  const typed = clientInput.value.trim().toLowerCase();
  if (!typed) {
    clientSuggestions.style.display = 'none';
    return;
  }
  const matches = getUniqueClients().filter(c => c.toLowerCase().includes(typed));
  if (matches.length === 0 || (matches.length === 1 && matches[0].toLowerCase() === typed)) {
    clientSuggestions.style.display = 'none';
    return;
  }
  clientSuggestions.innerHTML = matches.map(c =>
    `<div class="suggestion-item">${escapeHtml(c)}</div>`
  ).join('');
  clientSuggestions.style.display = 'block';
}

function hideSuggestions() {
  setTimeout(() => { clientSuggestions.style.display = 'none'; }, 150);
}

clientInput.addEventListener('input', showSuggestions);
clientInput.addEventListener('focus', showSuggestions);
clientInput.addEventListener('blur', hideSuggestions);
clientSuggestions.addEventListener('click', (e) => {
  if (e.target.classList.contains('suggestion-item')) {
    clientInput.value = e.target.textContent;
    clientSuggestions.style.display = 'none';
    timeInput.focus();
  }
});

// Render function
function render() {
  const todayString = getTodayEastern();
  const todayEntries = entries.filter(e => e.date === todayString);
  const todayTotal = todayEntries.reduce((sum, e) => sum + parseFloat(e.time || 0), 0);
  const allEntriesTotal = entries.reduce((sum, e) => sum + parseFloat(e.time || 0), 0);

  const displayEntries = showAllEntries ? entries : todayEntries;

  // Update header stats
  let statsText = `Today: ${todayTotal.toFixed(2)}h`;
  if (showAllEntries) {
    statsText += ` \u2022 Total: ${allEntriesTotal.toFixed(2)}h`;
  }
  headerStats.textContent = statsText;

  // Update entries label
  entriesLabel.textContent = showAllEntries ? 'All Entries' : "Today's Entries";

  // Update toggle button
  toggleBtn.textContent = showAllEntries ? 'Show Today' : 'View All';

  // Show/hide selection toolbar
  selectionToolbar.style.display = showAllEntries ? 'flex' : 'none';
  if (showAllEntries) {
    updateSelectionUI();
  } else {
    // Clear selections when switching to Today view
    selectedIds.clear();
  }

  // Render entries
  if (displayEntries.length === 0) {
    entriesList.innerHTML = `<div class="empty-state">No entries for ${showAllEntries ? 'any date' : 'today'}</div>`;
    return;
  }

  const grouped = groupByDateAndClient(displayEntries);
  const dates = Object.keys(grouped).sort().reverse();
  let html = '';

  dates.forEach(date => {
    const clients = grouped[date];

    // Calculate daily total for date heading
    let dayTotal = 0;
    Object.keys(clients).forEach(clientKey => {
      clients[clientKey].entries.forEach(e => {
        dayTotal += parseFloat(e.time || 0);
      });
    });

    // Wrap in date-section for alternating shading (View All mode only)
    if (showAllEntries) {
      html += `<div class="date-section">`;
      html += `<div class="date-heading"><span>${escapeHtml(date)}</span><span class="date-total">${dayTotal.toFixed(2)}h</span></div>`;
    }

    Object.keys(clients).forEach(clientKey => {
      const { displayName, entries: clientEntries } = clients[clientKey];
      const clientTotal = clientEntries.reduce((sum, e) => sum + parseFloat(e.time || 0), 0);

      html += `<div class="client-group">`;
      html += `<div class="client-group-header">`;
      html += `<span class="client-group-name">${escapeHtml(displayName)}</span>`;
      html += `<span class="client-group-hours">${clientTotal.toFixed(2)}h</span>`;
      html += `</div>`;

      clientEntries.forEach(entry => {
        const isChecked = selectedIds.has(entry.id) ? 'checked' : '';
        html += `<div class="task-item" data-id="${entry.id}">`;
        html += `<div class="task-row${showAllEntries ? ' task-row-selectable' : ''}">`;
        if (showAllEntries) {
          html += `<input type="checkbox" class="entry-checkbox" data-id="${entry.id}" ${isChecked}>`;
        }
        html += `<span class="task-text">${escapeHtml(entry.task)}</span>`;
        html += `<div class="task-right">`;
        html += `<span class="task-hours">${escapeHtml(entry.time)}h</span>`;
        html += `<button class="edit-btn">Edit</button>`;
        html += `<button class="delete-btn">Delete</button>`;
        html += `</div>`;
        html += `</div>`;
        html += `</div>`;
      });

      html += `</div>`;
    });

    // Close date-section wrapper
    if (showAllEntries) {
      html += `</div>`;
    }
  });

  entriesList.innerHTML = html;
}

// Event Listeners
submitBtn.addEventListener('click', handleSubmit);
cancelBtn.addEventListener('click', cancelEdit);

toggleBtn.addEventListener('click', () => {
  showAllEntries = !showAllEntries;
  render();
});

expandBtn.addEventListener('click', () => {
  // Open popup as full page in new tab
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
  } else {
    window.open(window.location.href, '_blank');
  }
});

closeBtn.addEventListener('click', () => {
  window.close();
});

taskInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleSubmit();
});

// Event delegation for entry edit/delete buttons and checkboxes
entriesList.addEventListener('click', (e) => {
  const target = e.target;
  const taskItem = target.closest('.task-item');
  if (!taskItem) return;

  const id = parseInt(taskItem.dataset.id);
  const entry = entries.find(e => e.id === id);
  if (!entry) return;

  if (target.classList.contains('entry-checkbox')) {
    toggleEntrySelection(id);
  } else if (target.classList.contains('edit-btn')) {
    handleEdit(entry);
  } else if (target.classList.contains('delete-btn')) {
    deleteEntry(id);
  }
});

// Selection toolbar event listeners
selectAllCheckbox.addEventListener('change', toggleSelectAll);

deleteSelectedBtn.addEventListener('click', () => {
  if (selectedIds.size === 0) return;
  if (confirm(`Are you sure you want to delete ${selectedIds.size} entries?`)) {
    deleteSelectedEntries();
  }
});

// Initialize
dateInput.value = getTodayEastern();
fetchClientNames(); // Load saved client names for autocomplete
fetchEntries();
