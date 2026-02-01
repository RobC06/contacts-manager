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
    }
  } catch (error) {
    console.error('Failed to fetch entries:', error);
  }
  render();
}

async function createEntry(entry) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/time-entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });
    if (response.ok) {
      const newEntry = await response.json();
      entries.unshift(newEntry);
    }
  } catch (error) {
    console.error('Failed to create entry:', error);
  }
  render();
}

async function updateEntry(id, data) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/time-entries/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (response.ok) {
      const updated = await response.json();
      entries = entries.map(e => e.id === id ? updated : e);
    }
  } catch (error) {
    console.error('Failed to update entry:', error);
  }
  render();
}

async function deleteEntry(id) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/time-entries/${id}`, {
      method: 'DELETE'
    });
    if (response.ok) {
      entries = entries.filter(e => e.id !== id);
    }
  } catch (error) {
    console.error('Failed to delete entry:', error);
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

  // Render entries
  if (displayEntries.length === 0) {
    entriesList.innerHTML = `<div class="empty-state">No entries for ${showAllEntries ? 'any date' : 'today'}</div>`;
  } else {
    entriesList.innerHTML = displayEntries.map(entry => `
      <div class="entry-card" data-id="${entry.id}">
        <div class="entry-header">
          <span class="entry-date">${escapeHtml(entry.date)}</span>
          <span class="entry-time">${escapeHtml(entry.time)}h</span>
        </div>
        <div class="entry-client">${escapeHtml(entry.client)}</div>
        <div class="entry-task">${escapeHtml(entry.task)}</div>
        <div class="entry-actions">
          <button class="edit-btn">Edit</button>
          <button class="delete-btn">Delete</button>
        </div>
      </div>
    `).join('');
  }
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
  const card = btn.closest('.entry-card');
  if (!card) return;

  const id = parseInt(card.dataset.id);
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
