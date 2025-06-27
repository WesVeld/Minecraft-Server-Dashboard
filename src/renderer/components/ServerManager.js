/**
 * ServerManager component
 * Handles server operations and console functionality
 */
class ServerManager {
  /**
   * Create a new ServerManager
   * @param {DashboardApp} app - Reference to the main application
   */
  constructor(app) {
    this.app = app;
    this.toast = app.toast;
    this.servers = [];
    this.currentServerId = null;
    this.consoleOutputs = {};
    this.blockGridInitialized = false;
    this.lastPixelsShown = 0;
    
    // Set up event subscriptions
    this.setupEventSubscriptions();
    
    // Setup console event listeners
    this.setupConsoleEventListeners();
    
    // Set up periodic status check (every 5 seconds)
    this.statusCheckInterval = setInterval(() => {
      this.checkServerStatus();
    }, 5000);
  }
  
  /**
   * Set up event subscriptions for server events
   */
  setupEventSubscriptions() {
    // Subscribe to server events with better debug logging
    this.unsubscribeConsole = window.api.onServerOutput((serverId, output) => {
      console.log(`[ServerManager] Received console output for server ${serverId}`);
      this.handleServerOutput(serverId, output);
    });
    
    // Fix the status change event handler with enhanced debugging
    this.unsubscribeStatus = window.api.onServerStatusChange((serverId, status) => {
      console.log(`[ServerManager] Received status change event: server ${serverId} -> ${status}`);
      // Update the server object in our local array
      const server = this.servers.find(s => s.id === serverId);
      if (server) {
        server.status = status;
        console.log(`[ServerManager] Updated status for ${server.name} to ${status}`);
      } else {
        console.warn(`[ServerManager] Server ${serverId} not found in local cache`);
      }
      
      // Update UI components
      this.handleServerStatusChange(serverId, status);
      
      // Force-refresh server list
      this.renderServerList();
      this.updateServerStatusIndicator();
    });
    
    this.unsubscribeDownload = window.api.onDownloadProgress((serverId, progress) => {
      console.log(`[ServerManager] Download progress: ${progress.percentage}%`);
      this.showDownloadProgressModal(serverId, progress);
    });
  }
  
  /**
   * Set up event listeners for console UI
   */
  setupConsoleEventListeners() {
    const sendCommandBtn = document.getElementById('send-command-btn');
    const commandInput = document.getElementById('command-input');
    const clearConsoleBtn = document.getElementById('clear-console-btn');
    
    if (sendCommandBtn) {
      sendCommandBtn.addEventListener('click', () => this.handleSendCommand());
    }
    
    if (commandInput) {
      commandInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.handleSendCommand();
        }
      });
    }
    
    if (clearConsoleBtn) {
      clearConsoleBtn.addEventListener('click', () => this.clearConsole());
    }
  }
  
  /**
   * Load servers from API
   */
  async loadServers() {
    try {
      const servers = await window.api.getServers();
      this.servers = servers;
      
      // Update UI
      this.renderServerList();
      this.updateServerStatusIndicator();
      
      return servers;
    } catch (error) {
      this.toast.error(`Failed to load servers: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Render the server list UI
   */
  renderServerList() {
    const serverList = document.getElementById('server-list');
    
    if (!this.servers.length) {
      serverList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-server"></i>
          <h2>No Servers Found</h2>
          <p>Create your first Minecraft server to get started</p>
        </div>
      `;
      return;
    }
    
    // Sort servers by name
    const sortedServers = [...this.servers].sort((a, b) => a.name.localeCompare(b.name));
    
    // Generate HTML for each server
    let html = '';
    sortedServers.forEach(server => {
      html += `
        <div class="server-card" data-server-id="${server.id}">
          <h3>${this.escapeHtml(server.name)}</h3>
          <div class="server-info">
            <p><span class="label">Status:</span> <span class="status-badge status-${server.status}">${this.formatStatus(server.status)}</span></p>
            <p><span class="label">Version:</span> ${this.escapeHtml(server.version)}</p>
          </div>
          <div class="server-card-actions">
            <button class="icon-btn" title="View Details" data-action="details">
              <i class="fas fa-info-circle"></i>
            </button>
            ${server.status === 'stopped' ? 
              `<button class="icon-btn" title="Start Server" data-action="start">
                <i class="fas fa-play"></i>
              </button>` : 
              `<button class="icon-btn" title="Stop Server" data-action="stop">
                <i class="fas fa-stop"></i>
              </button>
            `}
            <button class="icon-btn" title="Delete Server" data-action="delete">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      `;
    });
    
    serverList.innerHTML = html;
    
    // Add event listeners to server cards
    document.querySelectorAll('.server-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const serverId = card.dataset.serverId;
        
        // Check if a button was clicked
        if (e.target.closest('button[data-action]')) {
          const action = e.target.closest('button[data-action]').dataset.action;
          e.stopPropagation();
          
          if (action === 'start') {
            this.handleStartServer(serverId);
          } else if (action === 'stop') {
            this.handleStopServer(serverId);
          } else if (action === 'delete') {
            this.showDeleteModal(serverId);
          } else if (action === 'details') {
            this.showServerDetails(serverId);
          }
          
          return;
        }
        
        // Otherwise, show server details
        this.showServerDetails(serverId);
      });
    });
  }
  
  /**
   * Show server details view
   * @param {string} serverId - Server ID
   */
  async showServerDetails(serverId) {
    const server = this.servers.find(s => s.id === serverId);
    if (!server) return;

    this.currentServerId = serverId;
    
    // Notify other components of server change
    if (this.app.fileManager) {
      this.app.fileManager.setServerId(serverId);
    }
    
    if (this.app.backupManager) {
      this.app.backupManager.setServerId(serverId);
    }

    // Fill server details
    document.getElementById('detail-server-name').textContent = server.name;
    document.getElementById('detail-server-status').textContent = this.formatStatus(server.status);
    document.getElementById('detail-server-status').className = `status-badge status-${server.status}`;

    // Update server address
    this.updateServerAddressDisplay();

    document.getElementById('detail-version').textContent = server.version;
    document.getElementById('detail-memory').textContent = `${server.memory} MB`;
    document.getElementById('detail-gamemode').textContent = this.capitalizeFirstLetter(server.gamemode);
    document.getElementById('detail-difficulty').textContent = this.capitalizeFirstLetter(server.difficulty);
    document.getElementById('detail-created').textContent = new Date(server.created).toLocaleDateString();

    // Update action buttons
    this.updateDetailActionButtons(server.status);

    // Populate settings form
    this.populateServerSettings(server);

    // Enable/disable settings based on server status
    this.updateSettingsState(server.status);

    // Show console output or clear if no output yet
    const consoleOutput = document.getElementById('console-output');
    consoleOutput.innerHTML = this.consoleOutputs[serverId] || '';
    
    // Add a server status message to the console if it's empty
    if (!this.consoleOutputs[serverId] || this.consoleOutputs[serverId].trim() === '') {
      const statusMessage = server.status === 'running' 
        ? 'Server is running. You can enter commands below.\n'
        : 'Server is stopped. Start the server to interact with the console.\n';
      
      this.handleServerOutput(serverId, statusMessage);
    }
    
    consoleOutput.scrollTop = consoleOutput.scrollHeight;

    // Start stats updater for player count
    this.startStatsUpdater();

    // Switch to server detail view
    this.app.showSection('server-detail');
    this.app.showDetailTab(this.app.activeDetailTab);
  }
  
  /**
   * Show server deletion confirmation modal
   * @param {string} serverId - Server ID
   */
  showDeleteModal(serverId = this.currentServerId) {
    if (!serverId) return;
    
    const server = this.servers.find(s => s.id === serverId);
    if (!server) return;

    // Set current server ID for deletion
    this.currentServerId = serverId;
    
    document.getElementById('delete-server-name').textContent = server.name;
    document.getElementById('delete-confirm-modal').classList.add('show');
  }
  
  /**
   * Start a server
   * @param {string} serverId - Server ID
   */
  async startServer(serverId) {
    try {
      await window.api.startServer(serverId);
      // UI will be updated via status change event
      return true;
    } catch (error) {
      this.toast.error(`Failed to start server: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Stop a server
   * @param {string} serverId - Server ID
   */
  async stopServer(serverId) {
    try {
      await window.api.stopServer(serverId);
      // UI will be updated via status change event
      return true;
    } catch (error) {
      this.toast.error(`Failed to stop server: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Handle starting a server from UI
   * @param {string} serverId - Server ID
   */
  async handleStartServer(serverId = this.currentServerId) {
    if (!serverId) return;
    
    try {
      const server = this.servers.find(s => s.id === serverId);
      if (!server) {
        this.toast.error('Server not found');
        return;
      }
      
      await this.startServer(serverId);
      this.toast.success(`Server "${server.name}" is starting...`);
    } catch (error) {
      this.toast.error(`Failed to start server: ${error.message}`);
    }
  }
  
  /**
   * Handle stopping a server from UI
   * @param {string} serverId - Server ID
   */
  async handleStopServer(serverId = this.currentServerId) {
    if (!serverId) return;
    
    try {
      const server = this.servers.find(s => s.id === serverId);
      if (!server) {
        this.toast.error('Server not found');
        return;
      }
      
      await this.stopServer(serverId);
      this.toast.info(`Server "${server.name}" is stopping...`);
    } catch (error) {
      this.toast.error(`Failed to stop server: ${error.message}`);
    }
  }
  
  /**
   * Handle restarting a server
   * @param {string} serverId - Server ID
   */
  async handleRestartServer(serverId = this.currentServerId) {
    if (!serverId) return;

    try {
      const server = this.servers.find(s => s.id === serverId);
      if (!server) {
        this.toast.error('Server not found');
        return;
      }
      
      this.toast.info(`Restarting server "${server.name}"...`);
      await window.api.restartServer(serverId);
      this.toast.success(`Server "${server.name}" restarted successfully!`);
    } catch (error) {
      this.toast.error(`Failed to restart server: ${error.message}`);
    }
  }
  
  /**
   * Handle creating a new server
   * @param {Object} config - Server configuration
   */
  async handleCreateServer(config) {
    try {
      this.toast.info(`Creating server "${config.name}"...`);
      // Server creation process will update UI via events
      const newServer = await window.api.createServer(config);
      this.servers.push(newServer);
      this.renderServerList();
      
      this.toast.success(`Server "${config.name}" created successfully!`);
      return newServer;
    } catch (error) {
      this.toast.error(`Failed to create server: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Handle deleting a server
   */
  async handleDeleteServer() {
    if (!this.currentServerId) return;

    try {
      const server = this.servers.find(s => s.id === this.currentServerId);
      if (!server) return;
      
      await window.api.deleteServer(this.currentServerId);

      // Remove from local servers array
      this.servers = this.servers.filter(s => s.id !== this.currentServerId);

      // Clean up console output
      delete this.consoleOutputs[this.currentServerId];

      // Hide modal and go back to server list
      document.getElementById('delete-confirm-modal').classList.remove('show');
      this.app.showSection('servers');
      this.renderServerList();
      
      this.toast.success(`Server "${server.name}" deleted successfully!`);
      this.currentServerId = null;
      
      // Update server status indicator
      this.updateServerStatusIndicator();
    } catch (error) {
      this.toast.error(`Failed to delete server: ${error.message}`);
    }
  }
  
  /**
   * Handle server status change events
   * @param {string} serverId - Server ID
   * @param {string} status - New status
   */
  handleServerStatusChange(serverId, status) {
    // Update server in the servers array
    const server = this.servers.find(s => s.id === serverId);
    if (server) {
      server.status = status;
    }

    // Update server list UI
    this.renderServerList();
    this.updateServerStatusIndicator();

    // If this is the currently viewed server, update detail view
    if (this.currentServerId === serverId) {
      document.getElementById('detail-server-status').textContent = this.formatStatus(status);
      document.getElementById('detail-server-status').className = `status-badge status-${status}`;
      this.updateDetailActionButtons(status);
      this.updateSettingsState(status);
    }
  }
  
  /**
   * Handle console output events
   * @param {string} serverId - Server ID
   * @param {string} output - Console output
   */
  handleServerOutput(serverId, output) {
    // Initialize console output for this server if needed
    if (!this.consoleOutputs[serverId]) {
      this.consoleOutputs[serverId] = '';
    }

    // Add new output
    this.consoleOutputs[serverId] += output;

    // If this is the currently viewed server, update console
    if (this.currentServerId === serverId) {
      const consoleOutput = document.getElementById('console-output');
      consoleOutput.innerHTML += this.escapeHtml(output);
      consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }
  }
  
  /**
   * Handle download progress events
   * @param {string} serverId - Server ID
   * @param {Object} progress - Download progress info
   */
  handleDownloadProgress(serverId, progress) {
    this.showDownloadProgressModal(serverId, progress);
    
    if (progress.percentage >= 100) {
      // After download completes, make sure to refresh the server list
      setTimeout(() => {
        this.loadServers();
      }, 1000); // Small delay to ensure the server is saved in the config
    }
  }
  
  /**
   * Show download progress modal
   * @param {string} serverId - Server ID
   * @param {Object} progress - Download progress info
   */
  showDownloadProgressModal(serverId, progress) {
    console.log(`[ServerManager] Showing download progress modal: ${progress.percentage}%`);
    
    const modal = document.getElementById('download-progress-modal');
    const progressText = document.getElementById('download-progress-text');
    const downloadVersion = document.getElementById('download-version');
    const blockGrid = document.getElementById('grass-block-grid');
    const downloadFileSize = document.getElementById('download-file-size');
    
    // Make sure modal is visible
    if (!modal.classList.contains('show')) {
      modal.classList.add('show');
    }
    
    // Initialize the grass block grid if it doesn't exist
    if (!this.blockGridInitialized) {
      console.log('[ServerManager] Initializing block grid for pixel animation');
      blockGrid.innerHTML = ''; // Clear any existing pixels
      
      // Define the grass block's pixel colors (16x16 grid)
      const blockPattern = [
        // Top layer (grass top) - 4 rows
        'tttttttttttttttt',
        'tttttttttttttttt',
        'tttttttttttttttt',
        'tttttttttttttttt',
        // Middle layers (transition from grass to dirt) - 4 rows
        'sssssssossssssss',
        'sssssosssosssoss',
        'ssossssossssssss',
        'sssssssssssossss',
        // Bottom layers (dirt) - 8 rows
        'dddddddddddddddd',
        'dddddddddddddddd',
        'dddddddddddddddd',
        'dddddddddddddddd',
        'dddddddddddddddd',
        'dddddddddddddddd',
        'dddddddddddddddd',
        'dddddddddddddddd'
      ];
      
      // Create all pixels
      let pixelIndex = 0;
      for (let row = 0; row < blockPattern.length; row++) {
        for (let col = 0; col < blockPattern[row].length; col++) {
          const pixel = document.createElement('div');
          pixel.className = 'minecraft-pixel';
          
          // Add the appropriate color class
          switch(blockPattern[row][col]) {
            case 't': // top grass
              pixel.classList.add('grass-top');
              break;
            case 's': // sides
              pixel.classList.add('grass-side');
              break;
            case 'o': // side overlay (green bits on the dirt sides)
              pixel.classList.add('grass-side-overlay');
              break;
            case 'd': // dirt
              pixel.classList.add('dirt');
              break;
          }
          
          // Store the index for animation ordering
          pixel.dataset.index = pixelIndex++;
          blockGrid.appendChild(pixel);
        }
      }
      
      this.blockGridInitialized = true;
      this.totalPixels = pixelIndex;
      this.lastPixelsShown = 0;
      
      console.log(`[ServerManager] Block grid initialized with ${pixelIndex} pixels`);
    }
    
    // Update progress text
    progressText.textContent = `${progress.percentage}%`;
    
    // Calculate how many pixels to show based on percentage
    const pixelsToShow = Math.floor((this.totalPixels * progress.percentage) / 100);
    
    console.log(`[ServerManager] Progress: ${progress.percentage}%, showing ${pixelsToShow}/${this.totalPixels} pixels`);
    
    // Only update pixels that need to change to improve performance and reduce flickering
    if (pixelsToShow !== this.lastPixelsShown) {
      const allPixels = blockGrid.querySelectorAll('.minecraft-pixel');
      
      // Determine new pixels to show or hide
      if (pixelsToShow > this.lastPixelsShown) {
        // Add new pixels
        for (let i = this.lastPixelsShown; i < pixelsToShow && i < allPixels.length; i++) {
          const pixel = allPixels[i];
          if (pixel) {
            // Slightly stagger the animations based on position for a building effect
            const delay = Math.min((i - this.lastPixelsShown) * 5, 150); 
            setTimeout(() => {
              pixel.classList.add('show');
            }, delay);
          }
        }
      } else if (pixelsToShow < this.lastPixelsShown) {
        // Hide pixels (for when progress decreases or resets)
        for (let i = pixelsToShow; i < this.lastPixelsShown && i < allPixels.length; i++) {
          const pixel = allPixels[i];
          if (pixel) {
            pixel.classList.remove('show');
          }
        }
      }
      
      // Update last shown count
      this.lastPixelsShown = pixelsToShow;
    }
    
    // Get server info if possible
    const server = this.servers.find(s => s.id === serverId);
    if (server && server.version) {
      downloadVersion.textContent = server.version;
      
      // Set approximate file size based on version
      const versionNum = parseFloat(server.version.replace(/^1\./, ''));
      if (versionNum >= 18) {
        downloadFileSize.textContent = '130-150';
      } else if (versionNum >= 16) {
        downloadFileSize.textContent = '80-120';
      } else if (versionNum >= 13) {
        downloadFileSize.textContent = '50-80';
      } else {
        downloadFileSize.textContent = '30-50';
      }
    } else {
      downloadVersion.textContent = 'latest';
      downloadFileSize.textContent = '130-150';
    }
    
    // Only hide the modal when explicitly told to (progress === 100) and all pixels are shown
    if (progress.percentage >= 100) {
      // Wait for all pixels to be displayed before hiding
      const allPixels = blockGrid.querySelectorAll('.minecraft-pixel');
      let allShown = true;
      
      // Check if all pixels are showing
      allPixels.forEach(pixel => {
        if (!pixel.classList.contains('show')) {
          allShown = false;
        }
      });
      
      // If not all pixels shown yet, make sure they all get shown
      if (!allShown) {
        allPixels.forEach((pixel, index) => {
          const delay = Math.min(index * 5, 150);
          setTimeout(() => {
            pixel.classList.add('show');
          }, delay);
        });
        
        // Wait a bit longer before hiding to ensure animation completes
        setTimeout(() => {
          modal.classList.remove('show');
          // Reset for next time
          this.blockGridInitialized = false;
          this.lastPixelsShown = 0;
        }, this.totalPixels * 5 + 300);
      } else {
        // All pixels already shown, just add a small delay
        setTimeout(() => {
          modal.classList.remove('show');
          // Reset for next time
          this.blockGridInitialized = false;
          this.lastPixelsShown = 0;
        }, 300);
      }
    }
  }
  
  /**
   * Handle sending a command to the server
   */
  async handleSendCommand() {
    if (!this.currentServerId) return;
    
    // Get current server
    const server = this.servers.find(s => s.id === this.currentServerId);
    if (!server) return;
    
    // Check if server is running before sending command
    if (server.status !== 'running') {
      this.handleServerOutput(
        this.currentServerId, 
        `> Error: Server is not running. Cannot send command.\n`
      );
      return;
    }

    const commandInput = document.getElementById('command-input');
    const command = commandInput.value.trim();

    if (!command) return;

    try {
      await window.api.sendCommand(this.currentServerId, command);

      // Add command to console
      this.handleServerOutput(this.currentServerId, `> ${command}\n`);

      // Clear input
      commandInput.value = '';
    } catch (error) {
      this.toast.error(`Failed to send command: ${error.message}`);
      this.handleServerOutput(
        this.currentServerId, 
        `> Error: ${error.message}\n`
      );
    }
  }
  
  /**
   * Clear the console output
   */
  clearConsole() {
    if (!this.currentServerId) return;

    this.consoleOutputs[this.currentServerId] = '';
    document.getElementById('console-output').innerHTML = '';
  }
  
  /**
   * Update the server status indicator in the UI
   */
  updateServerStatusIndicator() {
    const runningServers = this.servers.filter(server => server.status === 'running');
    const count = runningServers.length;

    // Update counts
    document.getElementById('active-servers-count').textContent = count;
    document.getElementById('active-servers-dropdown-count').textContent = count;

    // Update dot
    const dotElement = document.getElementById('server-indicator-dot');
    if (count > 0) {
      dotElement.classList.remove('inactive');
      dotElement.classList.add('active');
    } else {
      dotElement.classList.remove('active');
      dotElement.classList.add('inactive');
    }

    // Update active servers list
    const activeServersList = document.getElementById('active-servers-list');

    if (count === 0) {
      activeServersList.innerHTML = '<div class="no-active-servers">No servers running</div>';
      return;
    }

    let html = '';
    runningServers.forEach(server => {
      html += `
        <div class="active-server-item" data-server-id="${server.id}">
          <div class="server-status-dot"></div>
          <div class="server-item-details">
            <div class="server-item-name">${this.escapeHtml(server.name)}</div>
            <div class="server-item-info">${server.version} - Port ${server.port}</div>
          </div>
          <div class="server-item-actions">
            <button class="stop-btn" data-action="stop" data-server-id="${server.id}">
              <i class="fas fa-stop"></i>
            </button>
          </div>
        </div>
      `;
    });

    activeServersList.innerHTML = html;

    // Add click handlers for the server items
    activeServersList.querySelectorAll('.active-server-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.closest('button')) {
          const serverId = item.getAttribute('data-server-id');
          this.showServerDetails(serverId);
        }
      });
    });

    // Add click handlers for the stop buttons
    activeServersList.querySelectorAll('[data-action="stop"]').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const serverId = button.getAttribute('data-server-id');
        this.stopServer(serverId);
      });
    });
  }
  
  /**
   * Update server address display based on streaming mode
   */
  updateServerAddressDisplay() {
    const server = this.servers.find(s => s.id === this.currentServerId);
    if (!server) return;
    
    if (this.app.streamingMode && this.app.streamingMode.isEnabled()) {
      // Mask the IP address but show the port
      document.getElementById('detail-ip-port').textContent = `xxx.xxx.xxx.xxx:${server.port}`;
    } else {
      // Show the actual IP and port
      this.getPublicIpAddress()
        .then(ip => {
          document.getElementById('detail-ip-port').textContent = `${ip}:${server.port}`;
        })
        .catch(() => {
          document.getElementById('detail-ip-port').textContent = `Unknown:${server.port}`;
        });
    }
  }
  
  /**
   * Get public IP address
   * @returns {Promise<string>} Public IP address
   */
  async getPublicIpAddress() {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch (error) {
      console.error('Error fetching public IP:', error);
      return 'Unable to get IP';
    }
  }
  
  /**
   * Update action buttons in detail view based on server status
   * @param {string} status - Server status
   */
  updateDetailActionButtons(status) {
    const startBtn = document.getElementById('detail-start-btn');
    const stopBtn = document.getElementById('detail-stop-btn');
    const restartBtn = document.getElementById('detail-restart-btn');
    const deleteBtn = document.getElementById('detail-delete-btn');
    const commandInput = document.getElementById('command-input');
    const sendCommandBtn = document.getElementById('send-command-btn');
    
    // Reset all buttons first
    startBtn.disabled = false;
    stopBtn.disabled = false;
    restartBtn.disabled = false;
    deleteBtn.disabled = false;
    
    // Enable/disable command input based on server status
    const isRunning = status === 'running';
    commandInput.disabled = !isRunning;
    sendCommandBtn.disabled = !isRunning;
    
    if (!isRunning) {
      commandInput.placeholder = "Server must be running to send commands...";
    } else {
      commandInput.placeholder = "Type a command...";
    }
    
    // Enable/disable buttons based on server status
    switch (status) {
      case 'running':
        startBtn.disabled = true;
        deleteBtn.disabled = true;
        break;
      case 'stopped':
        stopBtn.disabled = true;
        restartBtn.disabled = true;
        break;
      case 'starting':
      case 'stopping':
      case 'downloading':
        startBtn.disabled = true;
        stopBtn.disabled = true;
        restartBtn.disabled = true;
        deleteBtn.disabled = true;
        break;
      default:
        break;
    }
  }
  
  /**
   * Update settings form state based on server status
   * @param {string} status - Server status
   */
  updateSettingsState(status) {
    // Get all input elements in the settings form
    const form = document.getElementById('server-settings-form');
    const inputs = form.querySelectorAll('input, select, button[type="submit"]');
    
    const isRunning = status === 'running' || status === 'starting';
    
    // Enable/disable all inputs based on server status
    inputs.forEach(input => {
      input.disabled = isRunning;
    });
    
    // Show notification if server is running
    const warningElement = document.getElementById('settings-disabled-warning');
    if (isRunning) {
      warningElement.style.display = 'block';
    } else {
      warningElement.style.display = 'none';
    }
  }
  
  /**
   * Populate server settings form
   * @param {Object} server - Server object
   */
  populateServerSettings(server) {
    // Get form elements
    const nameInput = document.getElementById('settings-server-name');
    const portInput = document.getElementById('settings-server-port');
    const memoryInput = document.getElementById('settings-server-memory');
    const maxPlayersInput = document.getElementById('settings-max-players');
    const gamemodeSelect = document.getElementById('settings-gamemode');
    const difficultySelect = document.getElementById('settings-difficulty');
    const motdInput = document.getElementById('settings-motd');
    const pvpCheckbox = document.getElementById('settings-pvp');
    const commandBlocksCheckbox = document.getElementById('settings-command-blocks');
    const onlineModeCheckbox = document.getElementById('settings-online-mode');
    
    // Set values from server object
    nameInput.value = server.name;
    portInput.value = server.port;
    memoryInput.value = server.memory;
    maxPlayersInput.value = server.maxPlayers || 20;
    gamemodeSelect.value = server.gamemode || 'survival';
    difficultySelect.value = server.difficulty || 'normal';
    
    // Set values for properties that may not exist in older servers
    motdInput.value = server.motd || `A Minecraft Server`;
    pvpCheckbox.checked = server.pvp !== false; // Default to true
    commandBlocksCheckbox.checked = server.enableCommandBlocks === true; // Default to false
    onlineModeCheckbox.checked = server.onlineMode !== false; // Default to true
  }
  
  /**
   * Save server settings
   * @param {Object} updatedSettings - Updated server settings
   */
  async saveServerSettings(updatedSettings) {
    if (!this.currentServerId) {
      throw new Error('No server selected');
    }
    
    try {
      await window.api.updateServerSettings(this.currentServerId, updatedSettings);
      
      // Update local server object
      const server = this.servers.find(s => s.id === this.currentServerId);
      if (server) {
        Object.assign(server, updatedSettings);
        
        // Update UI components
        
        // 1. Update server detail header and info panels
        document.getElementById('detail-server-name').textContent = server.name;
        document.getElementById('detail-version').textContent = server.version;
        document.getElementById('detail-ip-port').textContent = `${server.ip || 'localhost'}:${server.port}`;
        document.getElementById('detail-memory').textContent = `${server.memory} MB`;
        document.getElementById('detail-gamemode').textContent = this.capitalizeFirstLetter(server.gamemode);
        document.getElementById('detail-difficulty').textContent = this.capitalizeFirstLetter(server.difficulty);
        
        // 2. Refresh the server list to show updated info
        this.renderServerList();
        
        // 3. Update the server address display based on streaming mode
        this.updateServerAddressDisplay();
      }
      
      this.toast.success('Server settings saved successfully!');
      return true;
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.toast.error(`Failed to save settings: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Set up exit confirmation for running servers
   */
  setupExitConfirmation() {
    // Exit confirmation modal handlers
    document.getElementById('cancel-exit-btn').addEventListener('click', () => {
      document.getElementById('exit-confirm-modal').classList.remove('show');
      window.api.cancelExit();
    });

    document.getElementById('exit-without-stopping-btn').addEventListener('click', () => {
      document.getElementById('exit-confirm-modal').classList.remove('show');
      window.api.confirmExit(false); // Don't shutdown servers
    });

    document.getElementById('stop-and-exit-btn').addEventListener('click', async () => {
      // Show loading state
      const btn = document.getElementById('stop-and-exit-btn');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Stopping Servers...';
      btn.disabled = true;
      
      // Confirm exit with server shutdown
      try {
        await window.api.confirmExit(true); // Shutdown all servers
      } catch (error) {
        console.error('Failed to shutdown servers:', error);
        // The app will still exit, so no need to restore the button
      }
    });

    // Listen for exit confirmation requests
    this.unsubscribeExitConfirm = window.api.onConfirmExit(() => {
      this.showExitConfirmation();
    });
  }
  
  /**
   * Show exit confirmation modal
   */
  showExitConfirmation() {
    const runningServers = this.servers.filter(server => server.status === 'running');
    const runningServersCount = runningServers.length;

    const modal = document.getElementById('exit-confirm-modal');
    const modalBody = modal.querySelector('.modal-body');

    // Update message based on number of running servers
    if (runningServersCount === 1) {
      modalBody.innerHTML = `
        <p>There is 1 Minecraft server currently running:</p>
        <p><strong>${runningServers[0].name}</strong></p>
        <p class="warning">Closing the application will leave this server running in the background.</p>
        
        <div class="form-actions">
          <button id="cancel-exit-btn" class="secondary-btn">Cancel</button>
          <button id="exit-without-stopping-btn" class="danger-btn">Exit Without Stopping</button>
          <button id="stop-and-exit-btn" class="primary-btn">Stop Server & Exit</button>
        </div>
      `;
    } else {
      modalBody.innerHTML = `
        <p>There are ${runningServersCount} Minecraft servers currently running:</p>
        <ul class="server-list">
          ${runningServers.map(server => `<li>${this.escapeHtml(server.name)}</li>`).join('')}
        </ul>
        <p class="warning">Closing the application will leave these servers running in the background.</p>
        
        <div class="form-actions">
          <button id="cancel-exit-btn" class="secondary-btn">Cancel</button>
          <button id="exit-without-stopping-btn" class="danger-btn">Exit Without Stopping</button>
          <button id="stop-and-exit-btn" class="primary-btn">Stop All Servers & Exit</button>
        </div>
      `;
    }

    // Re-attach event handlers since we replaced the HTML
    document.getElementById('cancel-exit-btn').addEventListener('click', () => {
      modal.classList.remove('show');
      window.api.cancelExit();
    });

    document.getElementById('exit-without-stopping-btn').addEventListener('click', () => {
      modal.classList.remove('show');
      window.api.confirmExit(false);
    });

    document.getElementById('stop-and-exit-btn').addEventListener('click', async () => {
      const stopBtn = document.getElementById('stop-and-exit-btn');
      stopBtn.disabled = true;
      stopBtn.textContent = 'Stopping Servers...';
      document.getElementById('exit-without-stopping-btn').disabled = true;
      document.getElementById('cancel-exit-btn').disabled = true;

      setTimeout(() => {
        window.api.confirmExit(true);
      }, 500);
    });

    // Show the modal
    modal.classList.add('show');
  }
  
  /**
   * Load Minecraft version options
   */
  async setupVersions() {
    try {
      const select = document.getElementById('server-version');
      select.innerHTML = '<option value="" disabled selected>Loading versions...</option>';

      const versions = await window.api.getAvailableVersions();
      const recommended = await window.api.getRecommendedVersion();

      select.innerHTML = '';

      versions.forEach(version => {
        const option = document.createElement('option');
        option.value = version.id;
        option.textContent = `${version.id} (${version.type})`;

        if (recommended && version.id === recommended.id) {
          option.textContent += ' - Recommended';
          option.selected = true;
        }

        select.appendChild(option);
      });
    } catch (error) {
      console.error('Failed to load Minecraft versions:', error);
      document.getElementById('server-version').innerHTML = '<option value="" disabled selected>Failed to load versions</option>';
    }
  }
  
  /**
   * Get server by ID
   * @param {string} serverId - Server ID
   * @returns {Object|null} Server object or null if not found
   */
  getServerById(serverId) {
    return this.servers.find(server => server.id === serverId) || null;
  }
  
  /**
   * Clean up event subscriptions
   */
  cleanup() {
    // Clean up existing subscriptions
    if (this.unsubscribeConsole) this.unsubscribeConsole();
    if (this.unsubscribeStatus) this.unsubscribeStatus();
    if (this.unsubscribeDownload) this.unsubscribeDownload();
    if (this.unsubscribeExitConfirm) this.unsubscribeExitConfirm();
    
    // Clear the status check interval
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
    }
    
    // Stop stats updater
    this.stopStatsUpdater();
  }
  
  /**
   * Update server stats display
   * @param {string} serverId - Server ID
   */
  async updateServerStats(serverId = this.currentServerId) {
    if (!serverId) return;
    
    try {
      const stats = await window.api.getServerStats(serverId);
      
      // Update player count
      const playersElement = document.getElementById('detail-players');
      if (playersElement) {
        playersElement.textContent = `${stats.playersOnline}/${stats.playersMax}`;
        
        // Add visual indicator if players are online
        if (stats.playersOnline > 0) {
          playersElement.classList.add('has-players');
        } else {
          playersElement.classList.remove('has-players');
        }
      }
    } catch (error) {
      console.error(`Error updating server stats: ${error.message}`);
    }
  }
  
  /**
   * Start periodic stats update
   */
  startStatsUpdater() {
    // Clear existing interval if any
    this.stopStatsUpdater();
    
    // Update stats every 30 seconds
    this.statsInterval = setInterval(() => {
      if (this.currentServerId && document.getElementById('server-detail-section').classList.contains('active')) {
        this.updateServerStats();
      }
    }, 3000); // 30 seconds
    
    // Update immediately
    this.updateServerStats();
  }
  
  /**
   * Stop periodic stats update
   */
  stopStatsUpdater() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }
  
  /**
   * Format status for display
   * @param {string} status - Server status
   * @returns {string} Formatted status
   */
  formatStatus(status) {
    switch (status) {
      case 'running': return 'Running';
      case 'stopped': return 'Stopped';
      case 'starting': return 'Starting';
      case 'stopping': return 'Stopping';
      case 'downloading': return 'Downloading';
      default: return status;
    }
  }
  
  /**
   * Capitalize first letter of a string
   * @param {string} string - String to capitalize
   * @returns {string} Capitalized string
   */
  capitalizeFirstLetter(string) {
    if (!string) return '';
    return string.charAt(0).toUpperCase() + string.slice(1);
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

export default ServerManager;