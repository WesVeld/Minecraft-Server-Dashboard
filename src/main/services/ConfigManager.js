const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

// Add debug function
function debug(method, message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [ConfigManager] [${method}] ${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));
  return data; // For chaining
}

class ConfigManager {
  constructor() {
    debug('constructor', 'Initializing ConfigManager');
    
    this.store = new Store({
      name: 'minecraft-server-dashboard-config'
    });
    
    debug('constructor', `Config file path: ${this.store.path}`);
    
    // Create necessary directories
    this.initDirectories();
    
    // Log initial config state
    debug('constructor', 'Current store content', this.store.store);
  }
  
  initDirectories() {
    const serversDir = this.getServersDirectory();
    const downloadsDir = this.getDownloadsDirectory();
    const backupsDir = this.getBackupsDirectory();
    
    debug('initDirectories', `Servers directory: ${serversDir}`);
    debug('initDirectories', `Downloads directory: ${downloadsDir}`);
    debug('initDirectories', `Backups directory: ${backupsDir}`);
    
    if (!fs.existsSync(serversDir)) {
      debug('initDirectories', `Creating servers directory: ${serversDir}`);
      fs.mkdirSync(serversDir, { recursive: true });
    }
    
    if (!fs.existsSync(downloadsDir)) {
      debug('initDirectories', `Creating downloads directory: ${downloadsDir}`);
      fs.mkdirSync(downloadsDir, { recursive: true });
    }
    
    if (!fs.existsSync(backupsDir)) {
      debug('initDirectories', `Creating backups directory: ${backupsDir}`);
      fs.mkdirSync(backupsDir, { recursive: true });
    }
  }
  
  getJavaPath() {
    const path = this.store.get('javaPath', 'java');
    debug('getJavaPath', `Retrieved Java path: ${path}`);
    return path;
  }
  
  setJavaPath(path) {
    debug('setJavaPath', `Setting Java path to: ${path}`);
    this.store.set('javaPath', path);
    return path;
  }
  
  getServers() {
    const servers = this.store.get('servers', []);
    debug('getServers', `Retrieved ${servers.length} servers`, servers);
    return servers;
  }
  
  saveServers(servers) {
    debug('saveServers', `Saving ${servers.length} servers`, servers);
    this.store.set('servers', servers);
    return servers;
  }
  
  getServersDirectory() {
    // Use the project directory instead of app.getPath('userData')
    const dir = path.join(path.dirname(path.dirname(path.dirname(__dirname))), 'Servers');
    debug('getServersDirectory', `Servers directory: ${dir}`);
    return dir;
  }
  
  getDownloadsDirectory() {
    // Use the project directory for downloads too
    const dir = path.join(path.dirname(path.dirname(path.dirname(__dirname))), 'Downloads');
    debug('getDownloadsDirectory', `Downloads directory: ${dir}`);
    return dir;
  }
  
  getBackupsDirectory() {
    const dir = path.join(path.dirname(path.dirname(path.dirname(__dirname))), 'Backups');
    debug('getBackupsDirectory', `Backups directory: ${dir}`);
    return dir;
  }
}

module.exports = ConfigManager;