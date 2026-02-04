// API Configuration - YOU WILL UPDATE THIS AFTER DEPLOYING TO RAILWAY
const API_URL = 'https://your-app-name.railway.app/api';

// Shared utility functions
class TaskManager {
  constructor() {
    this.token = null;
    this.tasks = [];
    this.clients = new Set();
  }

  async init() {
    // Check if user is logged in
    const result = await chrome.storage.local.get(['authToken']);
    if (result.authToken) {
      this.token = result.authToken;
      return true;
    }
    return false;
  }

  async login(email, password) {
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      this.token = data.token;
      await chrome.storage.local.set({ authToken: data.token });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async register(name, email, password) {
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Registration failed');
      }

      this.token = data.token;
      await chrome.storage.local.set({ authToken: data.token });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async logout() {
    this.token = null;
    await chrome.storage.local.remove(['authToken']);
  }

  async fetchTasks() {
    try {
      const response = await fetch(`${API_URL}/tasks`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch tasks');
      }

      this.tasks = await response.json();
      this.updateClients();
      return this.tasks;
    } catch (error) {
      console.error('Error fetching tasks:', error);
      return [];
    }
  }

  async addTask(client, task) {
    try {
      const response = await fetch(`${API_URL}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ client: client || 'No Client', task })
      });

      if (!response.ok) {
        throw new Error('Failed to add task');
      }

      const newTask = await response.json();
      this.tasks.push(newTask);
      this.updateClients();
      return newTask;
    } catch (error) {
      console.error('Error adding task:', error);
      throw error;
    }
  }

  async updateTask(taskId, updates) {
    try {
      const response = await fetch(`${API_URL}/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        throw new Error('Failed to update task');
      }

      const updatedTask = await response.json();
      const index = this.tasks.findIndex(t => t._id === taskId);
      if (index !== -1) {
        this.tasks[index] = updatedTask;
      }
      this.updateClients();
      return updatedTask;
    } catch (error) {
      console.error('Error updating task:', error);
      throw error;
    }
  }

  async deleteTask(taskId) {
    try {
      const response = await fetch(`${API_URL}/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to delete task');
      }

      this.tasks = this.tasks.filter(t => t._id !== taskId);
      this.updateClients();
    } catch (error) {
      console.error('Error deleting task:', error);
      throw error;
    }
  }

  async reorderTasks(taskIds) {
    try {
      const response = await fetch(`${API_URL}/tasks/reorder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ taskIds })
      });

      if (!response.ok) {
        throw new Error('Failed to reorder tasks');
      }

      await this.fetchTasks();
    } catch (error) {
      console.error('Error reordering tasks:', error);
      throw error;
    }
  }

  updateClients() {
    this.clients = new Set(this.tasks.map(t => t.client).filter(Boolean));
  }

  getClients() {
    return Array.from(this.clients).sort();
  }

  getTasksByClient() {
    const grouped = {};
    this.tasks.forEach(task => {
      const client = task.client || 'No Client';
      if (!grouped[client]) {
        grouped[client] = [];
      }
      grouped[client].push(task);
    });
    return grouped;
  }
}
