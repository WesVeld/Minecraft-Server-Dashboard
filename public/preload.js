const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  // Server operations
  getServers: () => ipcRenderer.invoke('get-servers'),
  createServer: (config) => ipcRenderer.invoke('create-server', config),
  startServer: (serverId) => ipcRenderer.invoke('start-server', serverId),
  stopServer: (serverId) => ipcRenderer.invoke('stop-server', serverId),
  restartServer: (serverId) => ipcRenderer.invoke('restart-server', serverId),
  deleteServer: (serverId) => ipcRenderer.invoke('delete-server', serverId),
  sendCommand: (serverId, command) => ipcRenderer.invoke('send-command', serverId, command),
  updateServerSettings: (serverId, settings) => ipcRenderer.invoke('update-server-settings', serverId, settings),
  
  // Version information
  getAvailableVersions: () => ipcRenderer.invoke('get-available-versions'),
  getRecommendedVersion: () => ipcRenderer.invoke('get-recommended-version'),
  
  // Configuration
  getJavaPath: () => ipcRenderer.invoke('get-java-path'),
  setJavaPath: (path) => ipcRenderer.invoke('set-java-path', path),
  
  // Application exit handlers
  confirmExit: (shouldShutdownServers) => ipcRenderer.invoke('exit-confirmed', shouldShutdownServers),
  cancelExit: () => ipcRenderer.invoke('exit-cancelled'),
  
  // Event listeners
  onServerOutput: (callback) => {
    // Using a properly named listener function that can be removed later
    const listener = (event, serverId, output) => callback(serverId, output);
    ipcRenderer.on('server-output', listener);
    return () => ipcRenderer.removeListener('server-output', listener);
  },
  
  onServerStatusChange: (callback) => {
    // Using a properly named listener function that can be removed later
    const listener = (event, serverId, status) => {
      console.log(`[preload] Received status change for ${serverId}: ${status}`);
      callback(serverId, status);
    };
    ipcRenderer.on('server-status-change', listener);
    return () => ipcRenderer.removeListener('server-status-change', listener);
  },
  
  onDownloadProgress: (callback) => {
    // Using a properly named listener function that can be removed later
    const listener = (event, serverId, progress) => callback(serverId, progress);
    ipcRenderer.on('download-progress', listener);
    return () => ipcRenderer.removeListener('download-progress', listener);
  },
  
  onConfirmExit: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('confirm-exit', listener);
    return () => ipcRenderer.removeListener('confirm-exit', listener);
  },
  
  // Server file operations
  getServerFiles: (serverId, directory) => ipcRenderer.invoke('get-server-files', serverId, directory),
  readServerFile: (serverId, filePath) => ipcRenderer.invoke('read-server-file', serverId, filePath),
  writeServerFile: (serverId, filePath, content) => ipcRenderer.invoke('write-server-file', serverId, filePath, content),
  deleteServerFile: (serverId, filePath) => ipcRenderer.invoke('delete-server-file', serverId, filePath),
  deleteServerDirectory: (serverId, dirPath) => ipcRenderer.invoke('delete-server-directory', serverId, dirPath),
  downloadServerFile: (serverId, filePath) => ipcRenderer.invoke('download-server-file', serverId, filePath),
  uploadFileToServer: (serverId, directory, filePath) => ipcRenderer.invoke('upload-file-to-server', serverId, directory, filePath),
  
  // Backup operations
  getServerBackups: (serverId) => ipcRenderer.invoke('get-server-backups', serverId),
  createServerBackup: (serverId, name) => ipcRenderer.invoke('create-server-backup', serverId, name),
  restoreServerBackup: (serverId, backupId) => ipcRenderer.invoke('restore-server-backup', serverId, backupId),
  deleteServerBackup: (serverId, backupId) => ipcRenderer.invoke('delete-server-backup', serverId, backupId),
  
  // Server stats
  getServerStats: (serverId) => ipcRenderer.invoke('get-server-stats', serverId),
});