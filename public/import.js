// Global variables
let selectedFile = null;
let parsedContacts = [];

// DOM elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const removeFileBtn = document.getElementById('removeFileBtn');
const previewSection = document.getElementById('previewSection');
const previewTable = document.getElementById('previewTable');
const totalCount = document.getElementById('totalCount');
const cancelImportBtn = document.getElementById('cancelImportBtn');
const confirmImportBtn = document.getElementById('confirmImportBtn');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const resultSection = document.getElementById('resultSection');
const successResult = document.getElementById('successResult');
const errorResult = document.getElementById('errorResult');
const successCount = document.getElementById('successCount');
const errorMessage = document.getElementById('errorMessage');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  setupEventListeners();
});

// Check authentication
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

// Setup event listeners
function setupEventListeners() {
  // Logout button
  document.getElementById('logoutBtn').addEventListener('click', logout);

  // Browse button
  browseBtn.addEventListener('click', () => fileInput.click());

  // File input change
  fileInput.addEventListener('change', handleFileSelect);

  // Drag and drop
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  });

  // Remove file
  removeFileBtn.addEventListener('click', resetUpload);

  // Cancel import
  cancelImportBtn.addEventListener('click', resetUpload);

  // Confirm import
  confirmImportBtn.addEventListener('click', importContacts);
}

// Handle file selection
function handleFileSelect(e) {
  const files = e.target.files;
  if (files.length > 0) {
    handleFile(files[0]);
  }
}

// Handle file
function handleFile(file) {
  const validExtensions = ['.csv', '.xlsx', '.xls'];
  const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

  if (!validExtensions.includes(fileExtension)) {
    alert('Invalid file format. Please upload a CSV or Excel file.');
    return;
  }

  selectedFile = file;

  // Show file info
  fileName.textContent = file.name;
  fileSize.textContent = formatFileSize(file.size);
  fileInfo.style.display = 'flex';
  uploadArea.style.display = 'none';

  // Parse file
  parseFile(file);
}

// Parse file
function parseFile(file) {
  const reader = new FileReader();

  reader.onload = function(e) {
    const content = e.target.result;
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (fileExtension === '.csv') {
      parseCSV(content);
    } else {
      // For Excel files, we'll convert to CSV first using a simple approach
      alert('Excel file detected. Please convert to CSV first or ensure the file is tab/comma delimited.');
      // In a real implementation, you'd use a library like SheetJS (xlsx) to parse Excel
      // For now, we'll keep it simple and ask users to convert to CSV
      resetUpload();
    }
  };

  reader.readAsText(file);
}

// Parse CSV
function parseCSV(content) {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    alert('CSV file is empty or has no data rows.');
    resetUpload();
    return;
  }

  // Parse headers
  const headers = parseCSVLine(lines[0]);
  console.log('Headers found:', headers);
  console.log('First header:', headers[0], 'Length:', headers[0].length, 'Trimmed:', headers[0].trim());
  const headerMap = detectColumns(headers);
  console.log('Header map:', headerMap);

  if (headerMap.name === undefined) {
    alert('Could not find a Name column. Please ensure your CSV has a Name or Contact Name column.');
    resetUpload();
    return;
  }

  // Parse data rows
  parsedContacts = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0 || !values[headerMap.name]?.trim()) continue;

    const contact = {
      name: values[headerMap.name]?.trim() || '',
      company: values[headerMap.company]?.trim() || '',
      title: values[headerMap.title]?.trim() || '',
      email: values[headerMap.email]?.trim() || '',
      comments: values[headerMap.comments]?.trim() || '',
      tag: normalizeTag(values[headerMap.tag]?.trim() || ''),
      followUpDate: parseDate(values[headerMap.followUpDate]?.trim() || ''),
      followUpRequired: parseBoolean(values[headerMap.followUpRequired]?.trim() || ''),
      followUpNotes: values[headerMap.followUpNotes]?.trim() || '',
      communications: []
    };

    // If there's a Last Contact date, add it as a communication entry
    if (headerMap.lastContact !== undefined && values[headerMap.lastContact]?.trim()) {
      const lastContactDate = parseDate(values[headerMap.lastContact].trim());
      if (lastContactDate) {
        contact.communications.push({
          date: lastContactDate,
          description: 'Imported from Monday.com'
        });
      }
    }

    parsedContacts.push(contact);
  }

  if (parsedContacts.length === 0) {
    alert('No valid contacts found in the CSV file.');
    resetUpload();
    return;
  }

  // Show preview
  showPreview();
}

// Parse CSV line (handles quotes and commas within fields)
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

// Detect columns from headers
function detectColumns(headers) {
  const map = {};

  // Name variations (removed 'contact' as it's too broad and matches 'Last Contact')
  const nameVariations = ['name', 'contact name', 'full name', 'person'];
  // Company variations
  const companyVariations = ['company', 'company name', 'organization', 'org', 'business'];
  // Title variations
  const titleVariations = ['title', 'job title', 'position', 'role'];
  // Email variations
  const emailVariations = ['email', 'e-mail', 'email address', 'contact email'];
  // Comments variations
  const commentsVariations = ['comments', 'comment', 'notes', 'note', 'description'];
  // Tag variations
  const tagVariations = ['tag', 'status', 'stage', 'state'];
  // Date variations
  const dateVariations = ['follow-up date', 'follow up date', 'followup date', 'next contact', 'date'];
  // Last contact variations
  const lastContactVariations = ['last contact', 'last contacted', 'date of last contact', 'most recent contact'];
  // Follow-up required variations
  const followUpRequiredVariations = ['follow-up?', 'follow up?', 'followup?', 'needs follow up', 'follow up required'];
  // Follow-up notes variations
  const followUpNotesVariations = ['follow-up notes', 'follow up notes', 'followup notes', 'next steps'];

  headers.forEach((header, index) => {
    const headerLower = header.toLowerCase().trim();

    // Debug logging for Last Contact detection
    if (headerLower.includes('last') || headerLower.includes('contact')) {
      console.log(`Checking header[${index}]: "${header}" -> "${headerLower}"`);
    }

    // Special handling for name column - match "contact" but not "last contact"
    if (map.name === undefined) {
      if (headerLower === 'name' || headerLower === 'contact' || headerLower === 'contact name' || headerLower === 'full name' || headerLower === 'person') {
        map.name = index;
      }
    }

    if (map.company === undefined && companyVariations.some(v => headerLower.includes(v))) {
      map.company = index;
    } else if (map.title === undefined && titleVariations.some(v => headerLower.includes(v))) {
      map.title = index;
    } else if (map.email === undefined && emailVariations.some(v => headerLower.includes(v))) {
      map.email = index;
    } else if (map.comments === undefined && commentsVariations.some(v => headerLower.includes(v))) {
      map.comments = index;
    } else if (map.tag === undefined && tagVariations.some(v => headerLower.includes(v))) {
      map.tag = index;
    } else if (map.lastContact === undefined && lastContactVariations.some(v => headerLower.includes(v))) {
      console.log(`✓ Matched Last Contact at index ${index}: "${headerLower}"`);
      map.lastContact = index;
    } else if (map.followUpDate === undefined && dateVariations.some(v => headerLower.includes(v))) {
      map.followUpDate = index;
    } else if (map.followUpRequired === undefined && followUpRequiredVariations.some(v => headerLower.includes(v) || headerLower === v)) {
      map.followUpRequired = index;
    } else if (map.followUpNotes === undefined && followUpNotesVariations.some(v => headerLower.includes(v))) {
      map.followUpNotes = index;
    }
  });

  return map;
}

// Normalize tag values
function normalizeTag(tag) {
  const tagLower = tag.toLowerCase();

  if (tagLower.includes('follow') || tagLower.includes('action')) {
    return 'follow up';
  } else if (tagLower.includes('wait') || tagLower.includes('pending') || tagLower.includes('response')) {
    return 'waiting for response';
  } else if (tagLower.includes('done') || tagLower.includes('complete') || tagLower.includes('no action')) {
    return 'no action';
  }

  // Default
  return 'no action';
}

// Parse date (handles various formats)
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Try parsing as ISO date (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Try parsing other common formats
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  return null;
}

// Parse boolean (handles various formats)
function parseBoolean(value) {
  if (!value) return false;

  const valueLower = value.toLowerCase().trim();

  // Check for truthy values
  if (['yes', 'y', 'true', '1', 'x', 'checked'].includes(valueLower)) {
    return true;
  }

  return false;
}

// Show preview
function showPreview() {
  totalCount.textContent = parsedContacts.length;

  // Show first 5 contacts
  const preview = parsedContacts.slice(0, 5);

  let tableHTML = `
    <table class="preview-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Company</th>
          <th>Title</th>
          <th>Tag</th>
          <th>Follow-up Date</th>
        </tr>
      </thead>
      <tbody>
  `;

  preview.forEach(contact => {
    tableHTML += `
      <tr>
        <td>${escapeHtml(contact.name)}</td>
        <td>${escapeHtml(contact.company) || '-'}</td>
        <td>${escapeHtml(contact.title) || '-'}</td>
        <td><span class="tag ${contact.tag.replace(/\s+/g, '-')}">${contact.tag}</span></td>
        <td>${contact.followUpDate || '-'}</td>
      </tr>
    `;
  });

  tableHTML += `
      </tbody>
    </table>
  `;

  previewTable.innerHTML = tableHTML;
  previewSection.style.display = 'block';
}

// Import contacts
async function importContacts() {
  if (parsedContacts.length === 0) return;

  // Hide preview, show progress
  previewSection.style.display = 'none';
  progressSection.style.display = 'block';

  try {
    const response = await fetch('/api/contacts/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ contacts: parsedContacts })
    });

    if (!response.ok) {
      throw new Error('Import failed');
    }

    const result = await response.json();

    // Update progress to 100%
    progressFill.style.width = '100%';
    progressText.textContent = 'Import complete!';

    // Show success
    setTimeout(() => {
      progressSection.style.display = 'none';
      resultSection.style.display = 'block';
      successResult.style.display = 'block';
      successCount.textContent = result.count || parsedContacts.length;
    }, 500);

  } catch (error) {
    console.error('Import error:', error);

    // Show error
    progressSection.style.display = 'none';
    resultSection.style.display = 'block';
    errorResult.style.display = 'block';
    errorMessage.textContent = 'Failed to import contacts. Please try again.';
  }
}

// Reset upload
function resetUpload() {
  selectedFile = null;
  parsedContacts = [];
  fileInput.value = '';
  fileInfo.style.display = 'none';
  uploadArea.style.display = 'flex';
  previewSection.style.display = 'none';
  progressSection.style.display = 'none';
  resultSection.style.display = 'none';
}

// Format file size
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
