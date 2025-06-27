// Import components
import Toast from './components/Toast.js';
import FileManager from './components/FileManager.js';
import StreamingMode from './components/StreamingMode.js';
import ThemeManager from './components/ThemeManager.js';
import BackupManager from './components/BackupManager.js';
import ServerManager from './components/ServerManager.js';
import SettingsManager from './components/SettingsManager.js';

// Debug helper
function debug(component, message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${component}] ${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));
  return data; // For chaining
}

class DashboardApp {
  constructor() {
    debug('DashboardApp', 'Initializing application');
    
    // Initialize Toast component FIRST before using it anywhere
    this.toast = new Toast();
    
    // Initialize variables needed by other components
    this.activeDetailTab = 'console';
    
    // Create components in the correct order to avoid dependency issues
    // First components that have no dependencies on other components
    this.themeManager = new ThemeManager(this);
    
    // Create server manager before streaming mode since streaming mode depends on it
    this.serverManager = new ServerManager(this);
    
    // Add this property to expose servers to other components
    this.servers = this.serverManager.servers;
    
    // Now create components that may depend on server manager
    this.streamingMode = new StreamingMode(this);
    
    // Now that all required components exist, initialize streaming mode
    this.streamingMode.initFromStorage();
    
    // Create other components
    this.fileManager = new FileManager(this);
    this.backupManager = new BackupManager(this);
    this.settingsManager = new SettingsManager(this);
    
    // Initial setup
    debug('DashboardApp', 'Registering event listeners');
    this.registerEventListeners();
    
    debug('DashboardApp', 'Loading servers');
    this.loadServers();
    
    debug('DashboardApp', 'Setting up navigation menu');
    this.setupNavigationMenu();
    
    debug('DashboardApp', 'Setting up exit confirmation');
    this.serverManager.setupExitConfirmation();
  }
  
  registerEventListeners() {
    // Server list - create server button
    document.getElementById('create-server-fab').addEventListener('click', () => this.showCreateServerModal());

    // Create server modal
    document.getElementById('close-modal-btn').addEventListener('click', () => this.hideModal('create-server-modal'));
    document.getElementById('cancel-create-server-btn').addEventListener('click', () => this.hideModal('create-server-modal'));
    document.getElementById('create-server-form').addEventListener('submit', (e) => this.handleCreateServer(e));

    // Delete confirmation modal
    document.getElementById('close-delete-modal-btn').addEventListener('click', () => this.hideModal('delete-confirm-modal'));
    document.getElementById('cancel-delete-btn').addEventListener('click', () => this.hideModal('delete-confirm-modal'));
    document.getElementById('confirm-delete-btn').addEventListener('click', () => this.serverManager.handleDeleteServer());

    // Server detail section
    document.getElementById('back-to-servers-btn').addEventListener('click', () => this.showSection('servers'));
    document.getElementById('detail-start-btn').addEventListener('click', () => this.serverManager.handleStartServer());
    document.getElementById('detail-stop-btn').addEventListener('click', () => this.serverManager.handleStopServer());
    document.getElementById('detail-restart-btn').addEventListener('click', () => this.serverManager.handleRestartServer());
    document.getElementById('detail-delete-btn').addEventListener('click', () => this.serverManager.showDeleteModal());

    // Add tab navigation listeners
    document.getElementById('server-console-tab').addEventListener('click', () => this.showDetailTab('console'));
    document.getElementById('server-settings-tab').addEventListener('click', () => this.showDetailTab('settings'));
    document.getElementById('server-backups-tab').addEventListener('click', () => this.showDetailTab('backups'));

    // Add settings form submit handler
    document.getElementById('server-settings-form').addEventListener('submit', (e) => this.handleSaveSettings(e));
  }

  setupNavigationMenu() {
    const navLinks = document.querySelectorAll('.nav-menu a');
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const section = link.getAttribute('data-section');
        this.showSection(section);

        // Update active state
        navLinks.forEach(l => l.parentElement.classList.remove('active'));
        link.parentElement.classList.add('active');
      });
    });
  }

  async loadServers() {
    try {
      await this.serverManager.loadServers();
      // Update the servers reference after loading
      this.servers = this.serverManager.servers;
    } catch (error) {
      debug('loadServers', `Error loading servers: ${error.message}`, error);
      this.toast.error(`Failed to load servers: ${error.message}`);
    }
  }

  showCreateServerModal() {
    document.getElementById('create-server-modal').classList.add('show');
    
    // Ensure versions are loaded in the dropdown
    this.serverManager.setupVersions();
  }

  hideModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
  }

  showSection(section) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(el => {
      el.classList.remove('active');
    });

    // Show selected section
    const sectionId = `${section}-section`;
    document.getElementById(sectionId).classList.add('active');

    // Update the active navigation item
    document.querySelectorAll('.nav-menu li').forEach(el => {
      el.classList.remove('active');
    });
    const navItem = document.querySelector(`.nav-menu li a[data-section="${section}"]`);
    if (navItem) {
      navItem.parentElement.classList.add('active');
    }

    // Show/hide floating action button based on the section
    const fab = document.getElementById('create-server-fab');
    if (fab) {
      fab.style.display = section === 'servers' ? 'flex' : 'none';
    }
  }

  async handleCreateServer(e) {
    e.preventDefault();

    const config = {
      name: document.getElementById('server-name').value,
      version: document.getElementById('server-version').value,
      port: parseInt(document.getElementById('server-port').value, 10),
      memory: parseInt(document.getElementById('server-memory').value, 10),
      gamemode: document.getElementById('server-gamemode').value,
      difficulty: document.getElementById('server-difficulty').value,
      maxPlayers: parseInt(document.getElementById('server-maxplayers').value, 10)
    };

    try {
      console.log(`[DashboardApp] Creating server "${config.name}" with version ${config.version}`);
      
      // First hide the creation modal
      this.hideModal('create-server-modal');
      
      // Initialize the progress modal BEFORE starting server creation
      // This ensures the UI is ready to receive progress updates
      this.serverManager.showDownloadProgressModal(null, { percentage: 0 });
      
      // Then initiate server creation (which will trigger progress updates)
      this.toast.info(`Creating server "${config.name}"...`);
      const newServer = await window.api.createServer(config);
      
      // Reset form
      document.getElementById('create-server-form').reset();
      
      // The download progress modal will be closed automatically when it hits 100%
      this.toast.success(`Server "${config.name}" created successfully!`);
      
      // IMPORTANT: Refresh the server list to show the new server
      await this.loadServers();
      this.serverManager.renderServerList();
    } catch (error) {
      // Hide the download progress modal if there's an error
      document.getElementById('download-progress-modal').classList.remove('show');
      this.toast.error(`Failed to create server: ${error.message}`);
    }
  }

  async handleSaveSettings(e) {
    e.preventDefault();
    
    // Get form values
    const updatedSettings = {
      name: document.getElementById('settings-server-name').value,
      port: parseInt(document.getElementById('settings-server-port').value, 10),
      memory: parseInt(document.getElementById('settings-server-memory').value, 10),
      maxPlayers: parseInt(document.getElementById('settings-max-players').value, 10),
      gamemode: document.getElementById('settings-gamemode').value,
      difficulty: document.getElementById('settings-difficulty').value,
      motd: document.getElementById('settings-motd').value,
      pvp: document.getElementById('settings-pvp').checked,
      enableCommandBlocks: document.getElementById('settings-command-blocks').checked,
      onlineMode: document.getElementById('settings-online-mode').checked
    };
    
    try {
      await this.serverManager.saveServerSettings(updatedSettings);
    } catch (error) {
      this.toast.error(`Failed to save settings: ${error.message}`);
    }
  }
  
  showDetailTab(tabName) {
    // Save current tab
    this.activeDetailTab = tabName;
    
    // Hide all tab content
    document.querySelectorAll('.detail-tab-content').forEach(tab => {
      tab.classList.remove('active');
    });
    
    // Show selected tab content
    document.getElementById(`${tabName}-tab-content`).classList.add('active');
    
    // Update tab selection state
    document.querySelectorAll('.detail-tab').forEach(tab => {
      tab.classList.remove('active');
    });
    document.getElementById(`server-${tabName}-tab`).classList.add('active');
    
    // Load files if switching to files tab
    if (tabName === 'files' && this.serverManager.currentServerId) {
      this.fileManager.loadDirectoryContents('.');
    }
    
    // Load backups if switching to backups tab
    if (tabName === 'backups' && this.serverManager.currentServerId) {
      this.backupManager.loadBackups();
    }
  }

  /**
   * Clean up event subscriptions
   */
  cleanup() {
    // Clean up components
    if (this.serverManager) this.serverManager.cleanup();
    if (this.fileManager) this.fileManager.cleanup();
    if (this.backupManager) this.backupManager.cleanup();
    if (this.themeManager) this.themeManager.cleanup();
    if (this.streamingMode) this.streamingMode.cleanup();
    // No cleanup needed for SettingsManager
  }

  // Add a basic showError method for compatibility
  showError(title, error) {
    this.toast.error(`${title}: ${error.message || error}`);
    console.error(title, error);
  }
}

// Initialize the app once the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  debug('Main', 'DOM content loaded, initializing application');
  
  try {
    window.app = new DashboardApp();
    debug('Main', 'Application initialized');
  } catch (error) {
    debug('Main', `Error initializing application: ${error.message}`, error);
    console.error('Failed to initialize application:', error);
  }
});

// Add an error event listener to catch any uncaught errors
window.addEventListener('error', (event) => {
  debug('Error', `Uncaught error: ${event.error.message}`, {
    message: event.error.message,
    stack: event.error.stack,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  });
});

// Also log any unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  debug('Error', `Unhandled promise rejection: ${event.reason}`, event.reason);
});