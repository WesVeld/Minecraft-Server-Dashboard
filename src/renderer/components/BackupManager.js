/**
 * BackupManager component
 * Handles backup operations for Minecraft servers
 */
class BackupManager {
  /**
   * Create a new BackupManager
   * @param {DashboardApp} app - Reference to the main application
   */
  constructor(app) {
    this.app = app;
    this.toast = app.toast;
    this.currentServerId = null;
    
    // Create required modal elements
    this.createBackupModal = null;
    this.restoreBackupModal = null;
    this.deleteBackupModal = null;
    
    // Initialize modals and event listeners
    this.setupModals();
    this.setupEventListeners();
  }
  
  /**
   * Create modal elements and add them to the DOM
   */
  setupModals() {
    // Create backup modal
    this.createBackupModal = document.createElement('div');
    this.createBackupModal.id = 'create-backup-modal';
    this.createBackupModal.className = 'modal';
    this.createBackupModal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>Create Backup</h2>
          <button id="close-backup-modal-btn" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <div id="backup-warning-container"></div>
          <form id="create-backup-form">
            <div class="form-group">
              <label for="backup-name-input">Backup Name</label>
              <input type="text" id="backup-name-input" placeholder="My Server Backup" required>
            </div>
            <div class="form-actions">
              <button type="button" id="cancel-backup-btn" class="secondary-btn">Cancel</button>
              <button type="submit" class="primary-btn">Create Backup</button>
            </div>
          </form>
        </div>
      </div>
    `;
    
    // Restore backup modal
    this.restoreBackupModal = document.createElement('div');
    this.restoreBackupModal.id = 'restore-backup-modal';
    this.restoreBackupModal.className = 'modal';
    this.restoreBackupModal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>Restore Backup</h2>
          <button id="close-restore-modal-btn" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <p>Are you sure you want to restore this backup?</p>
          <div class="backup-name-display"></div>
          <div class="restore-warning">
            This will overwrite all current server data with the backup content.
          </div>
          <div class="form-actions">
            <button id="cancel-restore-btn" class="secondary-btn">Cancel</button>
            <button id="confirm-restore-btn" class="primary-btn">Restore Backup</button>
          </div>
        </div>
      </div>
    `;
    
    // Delete backup modal
    this.deleteBackupModal = document.createElement('div');
    this.deleteBackupModal.id = 'delete-backup-modal';
    this.deleteBackupModal.className = 'modal';
    this.deleteBackupModal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>Delete Backup</h2>
          <button id="close-delete-backup-modal-btn" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <p>Are you sure you want to delete this backup?</p>
          <div class="backup-name-display"></div>
          <div class="warning">
            This action cannot be undone.
          </div>
          <div class="form-actions">
            <button id="cancel-delete-backup-btn" class="secondary-btn">Cancel</button>
            <button id="confirm-delete-backup-btn" class="danger-btn">Delete Backup</button>
          </div>
        </div>
      </div>
    `;
    
    // Append modals to body
    document.body.appendChild(this.createBackupModal);
    document.body.appendChild(this.restoreBackupModal);
    document.body.appendChild(this.deleteBackupModal);
  }
  
  /**
   * Set up event listeners for backup operations
   */
  setupEventListeners() {
    // Create backup modal events
    document.getElementById('close-backup-modal-btn').addEventListener('click', () => {
      this.hideModal('create-backup-modal');
    });
    
    document.getElementById('cancel-backup-btn').addEventListener('click', () => {
      this.hideModal('create-backup-modal');
    });
    
    document.getElementById('create-backup-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleCreateBackup();
    });
    
    // Restore backup modal events
    document.getElementById('close-restore-modal-btn').addEventListener('click', () => {
      this.hideModal('restore-backup-modal');
    });
    
    document.getElementById('cancel-restore-btn').addEventListener('click', () => {
      this.hideModal('restore-backup-modal');
    });
    
    // Delete backup modal events
    document.getElementById('close-delete-backup-modal-btn').addEventListener('click', () => {
      this.hideModal('delete-backup-modal');
    });
    
    document.getElementById('cancel-delete-backup-btn').addEventListener('click', () => {
      this.hideModal('delete-backup-modal');
    });
    
    // Set up the create backup button in the app
    const createBackupBtn = document.getElementById('create-backup-btn');
    if (createBackupBtn) {
      createBackupBtn.addEventListener('click', () => {
        this.showCreateBackupModal();
      });
    }
  }
  
  /**
   * Set the current server ID
   * @param {string} serverId - The server ID
   */
  setServerId(serverId) {
    this.currentServerId = serverId;
  }
  
  /**
   * Load and display backups for the current server
   */
  async loadBackups() {
    if (!this.currentServerId) return;
    
    try {
      const backupsList = document.getElementById('backups-list');
      backupsList.innerHTML = '<div class="backup-loading"><i class="fas fa-circle-notch fa-spin"></i> Loading backups...</div>';
      
      console.log(`[BackupManager] Loading backups for server ${this.currentServerId}`);
      console.log(`[BackupManager] window.api.getServerBackups exists:`, typeof window.api.getServerBackups === 'function');
      
      const backups = await window.api.getServerBackups(this.currentServerId);
      console.log(`[BackupManager] Successfully loaded ${backups.length} backups`);
      
      if (backups.length === 0) {
        backupsList.innerHTML = `
          <div class="no-backups-message">
            <i class="fas fa-archive"></i>
            <p>No backups yet</p>
            <p>Create a backup to protect your server data</p>
          </div>
        `;
        return;
      }
      
      // Sort backups by date (newest first)
      backups.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      let html = '';
      backups.forEach(backup => {
        html += `
          <div class="backup-item" data-backup-id="${backup.id}" data-backup-name="${this.escapeHtml(backup.name)}">
            <div class="backup-name">
              <i class="fas fa-archive"></i>
              ${this.escapeHtml(backup.name)}
            </div>
            <div class="backup-date">${new Date(backup.date).toLocaleString()}</div>
            <div class="backup-size">${this.formatFileSize(backup.size)}</div>
            <div class="backup-item-actions">
              <button class="backup-action-btn restore" title="Restore Backup" data-action="restore">
                <i class="fas fa-undo-alt"></i>
              </button>
              <button class="backup-action-btn delete" title="Delete Backup" data-action="delete">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        `;
      });
      
      backupsList.innerHTML = html;
      
      // Add event listeners to backup action buttons
      document.querySelectorAll('.backup-action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          
          const backupItem = e.target.closest('.backup-item');
          const backupId = backupItem.dataset.backupId;
          const backupName = backupItem.dataset.backupName;
          const action = e.target.closest('.backup-action-btn').dataset.action;
          
          if (action === 'restore') {
            this.showRestoreBackupModal(backupId, backupName);
          } else if (action === 'delete') {
            this.showDeleteBackupModal(backupId, backupName);
          }
        });
      });
      
    } catch (error) {
      console.error(`[BackupManager] Error loading backups:`, error);
      console.trace(`[BackupManager] Stack trace for backup loading error`);
      
      this.toast.error(`Failed to load backups: ${error.message}`);
      
      document.getElementById('backups-list').innerHTML = `
        <div class="no-backups-message">
          <i class="fas fa-exclamation-circle"></i>
          <p>Error loading backups</p>
          <p>${error.message}</p>
        </div>
      `;
    }
  }
  
  /**
   * Show modal to create a new backup
   */
  showCreateBackupModal() {
    const server = this.app.servers.find(s => s.id === this.currentServerId);
    if (!server) return;
    
    // Check if server is running and warn user
    const isRunning = server.status === 'running' || server.status === 'starting';
    
    // Update warning message
    const warningContainer = document.getElementById('backup-warning-container');
    if (isRunning) {
      warningContainer.innerHTML = `
        <div class="warning">
          Server is currently running. The server will be stopped temporarily to create a backup and then restarted.
        </div>
      `;
    } else {
      warningContainer.innerHTML = '';
    }
    
    // Set default name (server name + date)
    const dateStr = new Date().toLocaleDateString().replace(/\//g, '-');
    document.getElementById('backup-name-input').value = `${server.name} - ${dateStr}`;
    
    // Show the modal
    this.createBackupModal.classList.add('show');
  }
  
  /**
   * Show modal to confirm restore of a backup
   * @param {string} backupId - ID of the backup to restore
   * @param {string} backupName - Name of the backup to display
   */
  showRestoreBackupModal(backupId, backupName) {
    // Display backup name
    this.restoreBackupModal.querySelector('.backup-name-display').textContent = backupName;
    
    // Set up the restore function
    document.getElementById('confirm-restore-btn').onclick = () => this.handleRestoreBackup(backupId);
    
    // Show the modal
    this.restoreBackupModal.classList.add('show');
  }
  
  /**
   * Show modal to confirm deletion of a backup
   * @param {string} backupId - ID of the backup to delete
   * @param {string} backupName - Name of the backup to display
   */
  showDeleteBackupModal(backupId, backupName) {
    // Display backup name
    this.deleteBackupModal.querySelector('.backup-name-display').textContent = backupName;
    
    // Set up the delete function
    document.getElementById('confirm-delete-backup-btn').onclick = () => this.handleDeleteBackup(backupId);
    
    // Show the modal
    this.deleteBackupModal.classList.add('show');
  }
  
  /**
   * Hide a modal by ID
   * @param {string} modalId - ID of the modal to hide
   */
  hideModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
  }
  
  /**
   * Handle creating a new backup
   */
  async handleCreateBackup() {
    const backupName = document.getElementById('backup-name-input').value.trim();
    if (!backupName) return;
    
    try {
      this.hideModal('create-backup-modal');
      
      // Show loading state
      document.getElementById('backups-list').innerHTML = '<div class="backup-loading"><i class="fas fa-circle-notch fa-spin"></i> Creating backup...</div>';
      
      const server = this.app.servers.find(s => s.id === this.currentServerId);
      const wasRunning = server && (server.status === 'running' || server.status === 'starting');
      
      // If server is running, stop it first
      if (wasRunning) {
        this.toast.info('Stopping server to create backup...');
        await window.api.stopServer(this.currentServerId);
        // Wait a moment for the server to fully stop
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Create the backup
      await window.api.createServerBackup(this.currentServerId, backupName);
      
      // Restart server if it was running before
      if (wasRunning) {
        this.toast.info('Starting server again...');
        await window.api.startServer(this.currentServerId);
      }
      
      // Reload the backups list
      this.loadBackups();
      this.toast.success('Backup created successfully!');
    } catch (error) {
      this.toast.error(`Failed to create backup: ${error.message}`);
      this.loadBackups();
    }
  }
  
  /**
   * Handle restoring a backup
   * @param {string} backupId - ID of the backup to restore
   */
  async handleRestoreBackup(backupId) {
    try {
      this.hideModal('restore-backup-modal');
      
      // Show loading state
      document.getElementById('backups-list').innerHTML = '<div class="backup-loading"><i class="fas fa-circle-notch fa-spin"></i> Restoring backup...</div>';
      
      const server = this.app.servers.find(s => s.id === this.currentServerId);
      const wasRunning = server && (server.status === 'running' || server.status === 'starting');
      
      // Stop server if running
      if (wasRunning) {
        this.toast.info('Stopping server to restore backup...');
        await window.api.stopServer(this.currentServerId);
        // Wait a moment for server to fully stop
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Restore the backup
      await window.api.restoreServerBackup(this.currentServerId, backupId);
      
      // Restart server if it was running
      if (wasRunning) {
        this.toast.info('Starting server again...');
        await window.api.startServer(this.currentServerId);
      }
      
      // Reload the backups list
      this.loadBackups();
      this.toast.success('Backup restored successfully!');
    } catch (error) {
      this.toast.error(`Failed to restore backup: ${error.message}`);
      this.loadBackups();
    }
  }
  
  /**
   * Handle deleting a backup
   * @param {string} backupId - ID of the backup to delete
   */
  async handleDeleteBackup(backupId) {
    try {
      this.hideModal('delete-backup-modal');
      
      // Delete the backup
      await window.api.deleteServerBackup(this.currentServerId, backupId);
      
      // Reload the backups list
      this.loadBackups();
      this.toast.success('Backup deleted successfully!');
    } catch (error) {
      this.toast.error(`Failed to delete backup: ${error.message}`);
      this.loadBackups();
    }
  }
  
  /**
   * Format file size in readable format
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Escape HTML special characters
   * @param {string} text - Text to escape
   * @returns {string} Escaped HTML
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

export default BackupManager;