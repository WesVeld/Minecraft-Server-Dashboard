const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const ServerManager = require('./services/ServerManager');
const ConfigManager = require('./services/ConfigManager');
const MinecraftDownloader = require('./services/MinecraftDownloader');
const fs = require('fs');

// Add a debug logger
function debug(component, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${component}] ${message}`;
  
  console.log(logMessage);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
  
  // Also log to a file for persistence
  try {
    const logDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const logFile = path.join(logDir, 'app-debug.log');
    fs.appendFileSync(logFile, `${logMessage}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n`);
  } catch (err) {
    console.error('Failed to write to log file:', err);
  }
  
  return data; // For chaining
}

class MainApplication {
  constructor() {
    this.mainWindow = null;
    this.serverManager = null;
    this.configManager = null;
    this.minecraftDownloader = null;
    this.isDev = process.argv.includes('--dev');
    this.forceQuit = false;
    
    this._gpuInfo = null;
    this._lastGpuCheck = 0;
    
    debug('App', 'Application initializing');
    this.setupAppEvents();
  }
  
  setupAppEvents() {
    app.on('ready', this.onReady.bind(this));
    
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
    
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createWindow();
      }
    });
    
    app.on('before-quit', async (e) => {
      if (this.forceQuit) {
        // Allow the app to quit if forceQuit flag is set
        return;
      }
      
      if (this.serverManager && this.serverManager.hasRunningServers()) {
        e.preventDefault();
        
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          // Show confirmation dialog through renderer process
          this.mainWindow.webContents.send('confirm-exit');
        } else {
          // If window is already destroyed, use native dialog
          this.handleExitConfirmation();
        }
      }
    });
  }
  
  // Add debug logging to onReady
  async onReady() {
    debug('App', 'Application ready event triggered');
    
    this.configManager = new ConfigManager();
    debug('ConfigManager', 'ConfigManager initialized');
    
    this.minecraftDownloader = new MinecraftDownloader(this.configManager);
    debug('MinecraftDownloader', 'MinecraftDownloader initialized');
    
    this.serverManager = new ServerManager(this.configManager, this.minecraftDownloader);
    debug('ServerManager', 'ServerManager initialized');
    
    // Log the servers that were loaded
    const servers = this.serverManager.getServers();
    debug('ServerManager', `Loaded ${servers.length} servers from config`, servers);
    
    this.createWindow();
    this.setupIpcHandlers();
    
    // Check Java installation
    const javaInstalled = await this.serverManager.checkJavaInstallation();
    debug('App', `Java installation check result: ${javaInstalled}`);
    
    if (!javaInstalled) {
      dialog.showErrorBox(
        'Java Not Found', 
        'Java Runtime Environment is required to run Minecraft servers. Please install Java and restart the application.'
      );
    }
    
    // Log available methods for debugging
    debug('DEBUG', 'Checking method availability on MainApplication instance');
    debug('DEBUG', 'getServerFiles exists:', typeof this.getServerFiles === 'function');
    debug('DEBUG', 'getServerBackups exists:', typeof this.getServerBackups === 'function');
    
    // Log all methods available on this instance
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(this))
      .filter(name => typeof this[name] === 'function');
    debug('DEBUG', 'Available methods on MainApplication:', methods);
  }
  
  // Add debug logging to createWindow
  createWindow() {
    debug('App', 'Creating main window');
    
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../../public/preload.js')
      }
    });
    
    this.mainWindow.loadFile(path.join(__dirname, '../../public/index.html'));
    debug('App', 'Main window created and HTML loaded');
    
    if (this.isDev) {
      this.mainWindow.webContents.openDevTools();
      debug('App', 'DevTools opened in development mode');
    }
    
    // Intercept window close event
    this.mainWindow.on('close', (e) => {
      debug('App', 'Window close event triggered');
      
      if (this.forceQuit) {
        debug('App', 'Force quit flag is set, allowing window to close');
        return;
      }
      
      if (this.serverManager && this.serverManager.hasRunningServers()) {
        debug('App', 'Preventing window close due to running servers');
        e.preventDefault();
        this.mainWindow.webContents.send('confirm-exit');
      }
    });
  }
  
  // Replace the current setupIpcHandlers() method with this complete implementation:
  setupIpcHandlers() {
    debug('IPC', 'Setting up IPC handlers');
    
    // Store reference to this for use in callbacks
    const self = this;
    
    // Add debug to get-servers handler
    ipcMain.handle('get-servers', () => {
      const servers = this.serverManager.getServers();
      debug('IPC', `get-servers request received, returning ${servers.length} servers`, servers);
      return servers;
    });
    
    // Server operations
    ipcMain.handle('create-server', (event, config) => {
      debug('IPC', 'create-server request received', config);
      return this.serverManager.createServer(config);
    });
    ipcMain.handle('start-server', (event, serverId) => this.serverManager.startServer(serverId));
    ipcMain.handle('stop-server', (event, serverId) => this.serverManager.stopServer(serverId));
    ipcMain.handle('restart-server', (event, serverId) => this.serverManager.restartServer(serverId));
    ipcMain.handle('delete-server', (event, serverId) => this.serverManager.deleteServer(serverId));
    ipcMain.handle('send-command', (event, serverId, command) => this.serverManager.sendCommand(serverId, command));
    
    // THIS IS THE MISSING HANDLER - add it here
    ipcMain.handle('update-server-settings', (event, serverId, settings) => {
      debug('IPC', `update-server-settings request for server ${serverId}`, settings);
      return this.serverManager.updateServerSettings(serverId, settings);
    });
    
    // Add new handlers for application exit
    ipcMain.handle('exit-confirmed', async (event, shouldShutdownServers) => {
      debug('IPC', `Exit confirmed with shouldShutdownServers=${shouldShutdownServers}`);
      
      this.forceQuit = true;
      
      if (shouldShutdownServers) {
        debug('IPC', 'Shutting down all servers before exit');
        try {
          await this.shutdownAllServers();
        } catch (err) {
          debug('IPC', `Error during server shutdown: ${err.message}`);
        }
      }
      
      debug('IPC', 'Now exiting application');
      if (process.platform !== 'darwin') {
        app.quit();
      } else {
        this.mainWindow.close();
      }
    });
    
    ipcMain.handle('exit-cancelled', () => {
      // Just reset the force quit flag
      debug('IPC', 'Exit cancelled');
      this.forceQuit = false;
    });
    
    // Server versions
    ipcMain.handle('get-available-versions', () => this.minecraftDownloader.getAvailableVersions());
    ipcMain.handle('get-recommended-version', () => this.minecraftDownloader.getRecommendedVersion());
    
    // Config operations
    ipcMain.handle('get-java-path', () => this.configManager.getJavaPath());
    ipcMain.handle('set-java-path', (event, path) => this.configManager.setJavaPath(path));
    
    // File operations with debug - FIX THESE HANDLERS
    ipcMain.handle('get-server-files', (event, serverId, directory) => {
      debug('IPC', `get-server-files request for server ${serverId}, directory ${directory}`);
      return this.getServerFiles(serverId, directory);
    });
    
    ipcMain.handle('read-server-file', (event, serverId, filePath) => 
      this.readServerFile(serverId, filePath)
    );
    
    ipcMain.handle('write-server-file', (event, serverId, filePath, content) => 
      this.writeServerFile(serverId, filePath, content)
    );
    
    ipcMain.handle('delete-server-file', (event, serverId, filePath) => 
      this.deleteServerFile(serverId, filePath)
    );
    
    ipcMain.handle('delete-server-directory', (event, serverId, dirPath) => 
      this.deleteServerDirectory(serverId, dirPath)
    );
    
    ipcMain.handle('download-server-file', (event, serverId, filePath) => 
      this.downloadServerFile(serverId, filePath)
    );
    
    ipcMain.handle('upload-file-to-server', (event, serverId, directory, filePath) => 
      this.uploadFileToServer(serverId, directory, filePath)
    );
    
    // Backup-related IPC handlers - FIX THESE HANDLERS
    ipcMain.handle('get-server-backups', (event, serverId) => {
      debug('IPC', `get-server-backups request for server ${serverId}`);
      return this.getServerBackups(serverId);
    });
    ipcMain.handle('create-server-backup', (event, serverId, name) => this.createServerBackup(serverId, name));
    ipcMain.handle('restore-server-backup', (event, serverId, backupId) => this.restoreServerBackup(serverId, backupId));
    ipcMain.handle('delete-server-backup', (event, serverId, backupId) => this.deleteServerBackup(serverId, backupId));
    
    // Add this to the setupIpcHandlers method
    ipcMain.handle('get-server-stats', async (event, serverId) => {
      debug('IPC', `get-server-stats request for server ${serverId}`);
      return this.serverManager.getServerStats(serverId);
    });
    
    // Make sure events are forwarded to the renderer
    this.serverManager.on('download-progress', (serverId, progress) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('download-progress', serverId, progress);
      }
    });
    
    this.serverManager.on('server-status-change', (serverId, status) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('server-status-change', serverId, status);
      }
    });
    
    this.serverManager.on('server-output', (serverId, output) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('server-output', serverId, output);
      }
    });
  }
  
  // Server file operations
  async getServerFiles(serverId, directory) {
    const server = this.serverManager.getServerById(serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    const dirPath = path.join(server.directory, directory);
    
    // Check if directory exists and is within server directory
    if (!fs.existsSync(dirPath)) {
      throw new Error('Directory does not exist');
    }

    const relativePath = path.relative(server.directory, dirPath);
    if (relativePath.startsWith('..')) {
      throw new Error('Access denied: Path is outside server directory');
    }

    // Read directory contents
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    
    // Convert to file objects
    return Promise.all(entries.map(async entry => {
      const filePath = path.join(dirPath, entry.name);
      const stats = await fs.promises.stat(filePath);
      
      return {
        name: entry.name,
        isDirectory: entry.isDirectory(),
        size: stats.size,
        modified: stats.mtime
      };
    }));
  }

  async readServerFile(serverId, filePath) {
    const server = this.serverManager.getServerById(serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    const fullPath = path.join(server.directory, filePath);
    
    // Check if path is within server directory
    const relativePath = path.relative(server.directory, fullPath);
    if (relativePath.startsWith('..')) {
      throw new Error('Access denied: Path is outside server directory');
    }

    return fs.promises.readFile(fullPath, 'utf8');
  }

  async writeServerFile(serverId, filePath, content) {
    const server = this.serverManager.getServerById(serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    const fullPath = path.join(server.directory, filePath);
    
    // Check if path is within server directory
    const relativePath = path.relative(server.directory, fullPath);
    if (relativePath.startsWith('..')) {
      throw new Error('Access denied: Path is outside server directory');
    }

    return fs.promises.writeFile(fullPath, content, 'utf8');
  }

  async deleteServerFile(serverId, filePath) {
    const server = this.serverManager.getServerById(serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    const fullPath = path.join(server.directory, filePath);
    
    // Check if path is within server directory
    const relativePath = path.relative(server.directory, fullPath);
    if (relativePath.startsWith('..')) {
      throw new Error('Access denied: Path is outside server directory');
    }

    return fs.promises.unlink(fullPath);
  }

  async deleteServerDirectory(serverId, dirPath) {
    const server = this.serverManager.getServerById(serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    const fullPath = path.join(server.directory, dirPath);
    
    // Check if path is within server directory
    const relativePath = path.relative(server.directory, fullPath);
    if (relativePath === '' || relativePath.startsWith('..')) {
      throw new Error('Access denied: Cannot delete server root or directory outside server');
    }

    return fs.promises.rm(fullPath, { recursive: true });
  }

  async downloadServerFile(serverId, filePath) {
    const server = this.serverManager.getServerById(serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    const fullPath = path.join(server.directory, filePath);
    
    // Check if path is within server directory
    const relativePath = path.relative(server.directory, fullPath);
    if (relativePath.startsWith('..')) {
      throw new Error('Access denied: Path is outside server directory');
    }

    // Create downloads directory if it doesn't exist
    const downloadsPath = app.getPath('downloads');
    const fileName = path.basename(filePath);
    const destPath = path.join(downloadsPath, fileName);

    await fs.promises.copyFile(fullPath, destPath);
    return { success: true, path: destPath };
  }

  async uploadFileToServer(serverId, directory, filePath) {
    const server = this.serverManager.getServerById(serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    const dirPath = path.join(server.directory, directory);
    
    // Check if directory exists and is within server directory
    if (!fs.existsSync(dirPath)) {
      throw new Error('Directory does not exist');
    }

    const relativePath = path.relative(server.directory, dirPath);
    if (relativePath.startsWith('..')) {
      throw new Error('Access denied: Path is outside server directory');
    }

    const fileName = path.basename(filePath);
    const destPath = path.join(dirPath, fileName);

    await fs.promises.copyFile(filePath, destPath);
    return { success: true, path: destPath };
  }

  // Backup operations
  async getServerBackups(serverId) {
    const server = this.serverManager.getServerById(serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    // Use the backups directory from config manager
    const backupsDir = this.configManager.getBackupsDirectory();
    
    // Create server-specific backups directory if it doesn't exist
    const serverBackupsDir = path.join(backupsDir, serverId);
    if (!fs.existsSync(serverBackupsDir)) {
      return [];  // No backups yet
    }

    // Read backup metadata files
    const backupFiles = await fs.promises.readdir(serverBackupsDir);
    const backups = [];

    for (const file of backupFiles) {
      if (file.endsWith('.json')) {
        try {
          const metadataPath = path.join(serverBackupsDir, file);
          const zipFileName = file.replace('.json', '.zip');
          const zipPath = path.join(serverBackupsDir, zipFileName);
          
          // Read metadata
          const metadata = JSON.parse(await fs.promises.readFile(metadataPath, 'utf8'));
          
          // Get backup size if zip exists
          let size = 0;
          if (fs.existsSync(zipPath)) {
            const stats = await fs.promises.stat(zipPath);
            size = stats.size;
          }
          
          backups.push({
            id: metadata.id,
            name: metadata.name,
            date: metadata.date,
            size: size,
            version: metadata.version || server.version
          });
        } catch (error) {
          console.error(`Error processing backup file ${file}:`, error);
        }
      }
    }

    return backups;
  }

  async createServerBackup(serverId, name) {
    const server = this.serverManager.getServerById(serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    // Check if server is running
    if (this.serverManager.isServerRunning(serverId)) {
      throw new Error('Server must be stopped before creating a backup');
    }

    const backupsDir = this.configManager.getBackupsDirectory();
    const serverBackupsDir = path.join(backupsDir, serverId);
    
    // Create server backups directory if it doesn't exist
    if (!fs.existsSync(serverBackupsDir)) {
      fs.mkdirSync(serverBackupsDir, { recursive: true });
    }

    // Generate backup ID and prepare paths
    const backupId = `backup-${Date.now()}`;
    const zipFileName = `${backupId}.zip`;
    const metadataFileName = `${backupId}.json`;
    const zipPath = path.join(serverBackupsDir, zipFileName);
    const metadataPath = path.join(serverBackupsDir, metadataFileName);

    try {
      // Create backup zip file
      const archiver = require('archiver');
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      archive.pipe(output);
      archive.directory(server.directory, false);

      await new Promise((resolve, reject) => {
        output.on('close', resolve);
        archive.on('error', reject);
        archive.finalize();
      });

      // Get backup size
      const stats = await fs.promises.stat(zipPath);
      const size = stats.size;

      // Create metadata file
      const metadata = {
        id: backupId,
        name: name,
        date: new Date().toISOString(),
        serverId: serverId,
        serverName: server.name,
        version: server.version,
        size: size
      };

      await fs.promises.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

      return {
        id: backupId,
        name: name,
        date: metadata.date,
        size: size
      };
    } catch (error) {
      // Clean up if something goes wrong
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
      if (fs.existsSync(metadataPath)) {
        fs.unlinkSync(metadataPath);
      }
      throw error;
    }
  }

  async restoreServerBackup(serverId, backupId) {
    const server = this.serverManager.getServerById(serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    // Check if server is running
    if (this.serverManager.isServerRunning(serverId)) {
      throw new Error('Server must be stopped before restoring a backup');
    }

    const backupsDir = this.configManager.getBackupsDirectory();
    const serverBackupsDir = path.join(backupsDir, serverId);
    const zipPath = path.join(serverBackupsDir, `${backupId}.zip`);
    const metadataPath = path.join(serverBackupsDir, `${backupId}.json`);

    // Check if backup exists
    if (!fs.existsSync(zipPath) || !fs.existsSync(metadataPath)) {
      throw new Error('Backup not found');
    }

    try {
      // Clear server directory except for server.jar
      const jarFile = server.jarFile;
      const jarPath = path.join(server.directory, jarFile);
      
      // Create a temporary copy of server.jar
      const tempJarDir = path.join(this.configManager.getDownloadsDirectory(), 'temp');
      if (!fs.existsSync(tempJarDir)) {
        fs.mkdirSync(tempJarDir, { recursive: true });
      }
      const tempJarPath = path.join(tempJarDir, jarFile);
      
      await fs.promises.copyFile(jarPath, tempJarPath);

      // Delete all files in server directory
      const entries = await fs.promises.readdir(server.directory);
      for (const entry of entries) {
        const entryPath = path.join(server.directory, entry);
        await fs.promises.rm(entryPath, { recursive: true, force: true });
      }

      // Extract backup to server directory
      const extract = require('extract-zip');
      await extract(zipPath, { dir: server.directory });

      // Restore server.jar if it's missing
      const restoredJarPath = path.join(server.directory, jarFile);
      if (!fs.existsSync(restoredJarPath)) {
        await fs.promises.copyFile(tempJarPath, restoredJarPath);
      }

      // Clean up temp jar
      await fs.promises.unlink(tempJarPath);

      return { success: true };
    } catch (error) {
      throw new Error(`Failed to restore backup: ${error.message}`);
    }
  }

  async deleteServerBackup(serverId, backupId) {
    const server = this.serverManager.getServerById(serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    const backupsDir = this.configManager.getBackupsDirectory();
    const serverBackupsDir = path.join(backupsDir, serverId);
    const zipPath = path.join(serverBackupsDir, `${backupId}.zip`);
    const metadataPath = path.join(serverBackupsDir, `${backupId}.json`);

    // Delete backup files
    if (fs.existsSync(zipPath)) {
      await fs.promises.unlink(zipPath);
    }
    
    if (fs.existsSync(metadataPath)) {
      await fs.promises.unlink(metadataPath);
    }

    return { success: true };
  }

  async shutdownAllServers() {
    debug('shutdownAllServers', 'Shutting down all running servers');
    
    if (this.serverManager) {
      try {
        // First clean up any dead processes
        this.serverManager.cleanupDeadProcesses();
        
        // Get a list of all running server IDs
        const runningServerIds = [...this.serverManager.runningServers.keys()];
        debug('shutdownAllServers', `Found ${runningServerIds.length} running servers to stop`);
        
        if (runningServerIds.length === 0) {
          // No servers to stop
          return;
        }
        
        // Stop each server one by one
        for (const serverId of runningServerIds) {
          debug('shutdownAllServers', `Stopping server ${serverId}`);
          try {
            await this.serverManager.stopServer(serverId);
            debug('shutdownAllServers', `Successfully stopped server ${serverId}`);
          } catch (err) {
            debug('shutdownAllServers', `Error stopping server ${serverId}: ${err.message}`);
            
            // Force kill the process if stopping normally failed
            const process = this.serverManager.runningServers.get(serverId);
            if (process && process.kill) {
              try {
                process.kill('SIGKILL');
                this.serverManager.runningServers.delete(serverId);
                debug('shutdownAllServers', `Force killed server ${serverId}`);
                
                // Update server status
                const server = this.serverManager.servers.find(s => s.id === serverId);
                if (server) {
                  server.status = 'stopped';
                  this.serverManager.configManager.saveServers(this.serverManager.servers);
                }
              } catch (killErr) {
                debug('shutdownAllServers', `Failed to force kill server ${serverId}: ${killErr.message}`);
              }
            }
          }
        }
        
        // Make sure to cleaup all remaining resources
        this.serverManager.cleanup();
        
        debug('shutdownAllServers', 'All servers have been stopped or killed');
      } catch (error) {
        debug('shutdownAllServers', `Error during shutdown: ${error.message}`, error);
        // Ensure cleanup even if there's an error
        if (this.serverManager.cleanup) {
          this.serverManager.cleanup();
        }
      }
    }
  }
}

// Create an instance of the application
const mainApp = new MainApplication();

// Export the class definition for testing/imports
module.exports = MainApplication;