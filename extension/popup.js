// State
let entries = [];
let editingId = null;
let showAllEntries = false;

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
  dateInput.value = new Date().toISOString().split('T')[0];
  clientInput.value = '';
  timeInput.value = '';
  taskInput.value = '';
  submitBtn.textContent = 'Add Entry';
  cancelBtn.style.display = 'none';
}

// Group entries by date, then by client within each date
function groupByDateAndClient(entriesToGroup) {
  const grouped = {};
  entriesToGroup.forEach(entry => {
    if (!grouped[entry.date]) grouped[entry.date] = {};
    if (!grouped[entry.date][entry.client]) grouped[entry.date][entry.client] = [];
    grouped[entry.date][entry.client].push(entry);
  });
  return grouped;
}

// Update client autocomplete list
function updateClientList() {
  const clientList = document.getElementById('client-list');
  const uniqueClients = [...new Set(entries.map(e => e.client))].sort();
  clientList.innerHTML = uniqueClients.map(c => `<option value="${escapeHtml(c)}">`).join('');
}

// Render function
function render() {
  const todayString = new Date().toISOString().split('T')[0];
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

  // Update client autocomplete
  updateClientList();

  // Render entries
  if (displayEntries.length === 0) {
    entriesList.innerHTML = `<div class="empty-state">No entries for ${showAllEntries ? 'any date' : 'today'}</div>`;
    return;
  }

  const grouped = groupByDateAndClient(displayEntries);
  const dates = Object.keys(grouped).sort().reverse();
  let html = '';

  dates.forEach(date => {
    // Show date heading in All Entries view
    if (showAllEntries) {
      html += `<div class="date-heading">${escapeHtml(date)}</div>`;
    }

    const clients = grouped[date];
    Object.keys(clients).forEach(client => {
      const clientEntries = clients[client];
      const clientTotal = clientEntries.reduce((sum, e) => sum + parseFloat(e.time || 0), 0);

      html += `<div class="client-group">`;
      html += `<div class="client-group-header">`;
      html += `<span class="client-group-name">${escapeHtml(client)}</span>`;
      html += `<span class="client-group-hours">${clientTotal.toFixed(2)}h</span>`;
      html += `</div>`;

      clientEntries.forEach(entry => {
        html += `<div class="task-item" data-id="${entry.id}">`;
        html += `<div class="task-row">`;
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

// Event delegation for entry edit/delete buttons
entriesList.addEventListener('click', (e) => {
  const btn = e.target;
  const taskItem = btn.closest('.task-item');
  if (!taskItem) return;

  const id = parseInt(taskItem.dataset.id);
  const entry = entries.find(e => e.id === id);
  if (!entry) return;

  if (btn.classList.contains('edit-btn')) {
    handleEdit(entry);
  } else if (btn.classList.contains('delete-btn')) {
    deleteEntry(id);
  }
});

// Initialize
dateInput.value = new Date().toISOString().split('T')[0];
fetchEntries();
