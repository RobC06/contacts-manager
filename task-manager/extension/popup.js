const taskManager = new TaskManager();
let draggedElement = null;
let sortByClient = false;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  const isLoggedIn = await taskManager.init();

  if (isLoggedIn) {
    showMainContainer();
    await loadTasks();
  } else {
    showAuthContainer();
  }

  setupEventListeners();
});

function setupEventListeners() {
  // Auth
  document.getElementById('show-register').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
    document.getElementById('auth-error').textContent = '';
  });

  document.getElementById('show-login').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('auth-error').textContent = '';
  });

  document.getElementById('login-btn').addEventListener('click', handleLogin);
  document.getElementById('register-btn').addEventListener('click', handleRegister);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  // Tasks
  document.getElementById('add-task-btn').addEventListener('click', handleAddTask);
  document.getElementById('task-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleAddTask();
  });

  document.getElementById('sort-by-client').addEventListener('change', (e) => {
    sortByClient = e.target.checked;
    renderTasks();
  });

  // Open sidepanel - must call directly from popup for user gesture to work
  document.getElementById('open-sidepanel-btn').addEventListener('click', async () => {
    try {
      const currentWindow = await chrome.windows.getCurrent();
      await chrome.sidePanel.open({ windowId: currentWindow.id });
    } catch (err) {
      console.error('Error opening side panel:', err);
    }
  });
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('auth-error');

  if (!email || !password) {
    errorEl.textContent = 'Please enter email and password';
    return;
  }

  const result = await taskManager.login(email, password);

  if (result.success) {
    showMainContainer();
    await loadTasks();
  } else {
    errorEl.textContent = result.error;
  }
}

async function handleRegister() {
  const name = document.getElementById('register-name').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  const errorEl = document.getElementById('auth-error');

  if (!name || !email || !password) {
    errorEl.textContent = 'Please fill in all fields';
    return;
  }

  const result = await taskManager.register(name, email, password);

  if (result.success) {
    showMainContainer();
    await loadTasks();
  } else {
    errorEl.textContent = result.error;
  }
}

async function handleLogout() {
  await taskManager.logout();
  showAuthContainer();
}

function showAuthContainer() {
  document.getElementById('auth-container').style.display = 'block';
  document.getElementById('main-container').style.display = 'none';
}

function showMainContainer() {
  document.getElementById('auth-container').style.display = 'none';
  document.getElementById('main-container').style.display = 'block';
}

async function loadTasks() {
  await taskManager.fetchTasks();
  updateClientList();
  renderTasks();
}

function updateClientList() {
  const datalist = document.getElementById('client-list');
  datalist.innerHTML = '';

  taskManager.getClients().forEach(client => {
    const option = document.createElement('option');
    option.value = client;
    datalist.appendChild(option);
  });
}

async function handleAddTask() {
  const clientInput = document.getElementById('client-input');
  const taskInput = document.getElementById('task-input');

  const client = clientInput.value.trim();
  const task = taskInput.value.trim();

  if (!task) return;

  try {
    await taskManager.addTask(client, task);
    clientInput.value = '';
    taskInput.value = '';
    updateClientList();
    renderTasks();
  } catch (error) {
    console.error('Error adding task:', error);
  }
}

function renderTasks() {
  const container = document.getElementById('tasks-container');
  container.innerHTML = '';

  if (taskManager.tasks.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No tasks yet</p><small>Add your first task above</small></div>';
    return;
  }

  if (sortByClient) {
    renderTasksByClient(container);
  } else {
    renderTasksList(container);
  }
}

function renderTasksByClient(container) {
  const grouped = taskManager.getTasksByClient();
  const sortedClients = Object.keys(grouped).sort();

  // Move "No Client" to the end
  const noClientIndex = sortedClients.indexOf('No Client');
  if (noClientIndex > -1) {
    sortedClients.splice(noClientIndex, 1);
    sortedClients.push('No Client');
  }

  sortedClients.forEach(client => {
    const clientGroup = document.createElement('div');
    clientGroup.className = 'client-group';

    const clientHeader = document.createElement('div');
    clientHeader.className = 'client-header';
    clientHeader.textContent = client;
    clientGroup.appendChild(clientHeader);

    grouped[client].forEach(task => {
      clientGroup.appendChild(createTaskElement(task));
    });

    container.appendChild(clientGroup);
  });
}

function renderTasksList(container) {
  taskManager.tasks.forEach(task => {
    container.appendChild(createTaskElement(task));
  });
}

function createTaskElement(task) {
  const taskEl = document.createElement('div');
  taskEl.className = 'task-item';
  taskEl.draggable = true;
  taskEl.dataset.taskId = task._id;

  taskEl.innerHTML = `
    <span class="drag-handle">&#9776;</span>
    <div class="task-content">
      ${sortByClient ? '' : `<div class="task-client">${task.client}</div>`}
      <div class="task-text">${task.task}</div>
      <input type="text" class="task-edit-input" value="${task.task}" />
    </div>
    <div class="task-actions">
      <button class="edit-btn">Edt</button>
      <button class="delete-btn">Del</button>
    </div>
  `;

  setupTaskListeners(taskEl, task);
  setupDragAndDrop(taskEl);

  return taskEl;
}

function setupTaskListeners(taskEl, task) {
  const editBtn = taskEl.querySelector('.edit-btn');
  const deleteBtn = taskEl.querySelector('.delete-btn');
  const taskText = taskEl.querySelector('.task-text');
  const editInput = taskEl.querySelector('.task-edit-input');

  editBtn.addEventListener('click', () => {
    taskText.classList.add('editing');
    editInput.classList.add('active');
    editInput.focus();
    editBtn.textContent = 'Save';
    editBtn.className = 'save-btn';
  });

  editBtn.addEventListener('click', async function() {
    if (this.textContent === 'Save') {
      const newTask = editInput.value.trim();
      if (newTask) {
        try {
          await taskManager.updateTask(task._id, { task: newTask });
          taskText.textContent = newTask;
          taskText.classList.remove('editing');
          editInput.classList.remove('active');
          this.textContent = 'Edt';
          this.className = 'edit-btn';
        } catch (error) {
          console.error('Error updating task:', error);
        }
      }
    }
  });

  editInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      editBtn.click();
    }
  });

  deleteBtn.addEventListener('click', async () => {
    if (confirm('Delete this task?')) {
      try {
        await taskManager.deleteTask(task._id);
        renderTasks();
      } catch (error) {
        console.error('Error deleting task:', error);
      }
    }
  });
}

function setupDragAndDrop(taskEl) {
  taskEl.addEventListener('dragstart', (e) => {
    draggedElement = taskEl;
    taskEl.classList.add('dragging');
  });

  taskEl.addEventListener('dragend', (e) => {
    taskEl.classList.remove('dragging');
    draggedElement = null;
    saveNewOrder();
  });

  taskEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    const afterElement = getDragAfterElement(taskEl.parentElement, e.clientY);
    if (afterElement == null) {
      taskEl.parentElement.appendChild(draggedElement);
    } else {
      taskEl.parentElement.insertBefore(draggedElement, afterElement);
    }
  });
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.task-item:not(.dragging)')];

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;

    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function saveNewOrder() {
  const taskElements = document.querySelectorAll('.task-item');
  const taskIds = Array.from(taskElements).map(el => el.dataset.taskId);

  try {
    await taskManager.reorderTasks(taskIds);
  } catch (error) {
    console.error('Error saving order:', error);
  }
}
