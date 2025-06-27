const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const util = require('minecraft-server-util');

// Add debug function
function debug(method, message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [ServerManager] [${method}] ${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));
  return data; // For chaining
}

class ServerManager extends EventEmitter {
  constructor(configManager, minecraftDownloader) {
    super();
    debug('constructor', 'Initializing ServerManager');
    
    this.configManager = configManager;
    this.minecraftDownloader = minecraftDownloader;
    this.runningServers = new Map();
    
    // Get stored servers from config
    this.servers = this.configManager.getServers();
    debug('constructor', `Loaded ${this.servers.length} servers from config`, this.servers);
    
    // Check server directories exist
    this._validateServerDirectories();
    
    // Clean up any potentially dead processes
    this.cleanupDeadProcesses();
    
    // Set up periodic cleanup (every 30 seconds)
    this.cleanupInterval = setInterval(() => {
      this.cleanupDeadProcesses();
    }, 30000);
  }
  
  // Add this method to validate server directories
  _validateServerDirectories() {
    debug('_validateServerDirectories', 'Validating server directories');
    
    const validServers = [];
    
    for (const server of this.servers) {
      if (!fs.existsSync(server.directory)) {
        debug('_validateServerDirectories', `Server directory not found: ${server.directory}`, server);
        continue;
      }
      
      const jarPath = path.join(server.directory, server.jarFile);
      if (!fs.existsSync(jarPath)) {
        debug('_validateServerDirectories', `Server JAR not found: ${jarPath}`, server);
        continue;
      }
      
      debug('_validateServerDirectories', `Server validated: ${server.name}`, server);
      validServers.push(server);
    }
    
    if (validServers.length !== this.servers.length) {
      debug('_validateServerDirectories', `Removed ${this.servers.length - validServers.length} invalid servers`);
      this.servers = validServers;
      this.configManager.saveServers(this.servers);
    }
  }
  
  getServers() {
    debug('getServers', `Returning ${this.servers.length} servers`);
    return this.servers;
  }
  
  async createServer(config) {
    debug('createServer', `Creating new server: ${JSON.stringify(config)}`);
    
    // Generate a unique ID for the server
    const id = uuidv4();
    
    // Create a directory for the server
    const serversDir = this.configManager.getServersDirectory();
    const serverDir = path.join(serversDir, id);
    
    if (!fs.existsSync(serverDir)) {
      fs.mkdirSync(serverDir, { recursive: true });
    }
    
    debug('createServer', `Created server directory: ${serverDir}`);

    // Download the server jar
    debug('createServer', `Downloading server jar for version ${config.version}`);
    
    try {
      const jarFile = await this.minecraftDownloader.downloadServer(
        config.version, 
        serverDir,
        (progress) => {
          // Send progress updates to UI
          debug('createServer', `Download progress: ${progress.percentage}%`);
          this.emit('download-progress', id, progress);
        }
      );
      
      debug('createServer', `Server jar downloaded to ${jarFile}`);

      // Create server object
      const server = {
        id,
        name: config.name,
        version: config.version,
        directory: serverDir,
        jarFile: path.basename(jarFile),
        port: config.port || 25565,
        memory: config.memory || 1024,
        gamemode: config.gamemode || 'survival',
        difficulty: config.difficulty || 'normal',
        maxPlayers: config.maxPlayers || 20,
        status: 'stopped',
        created: new Date().toISOString()
      };

      debug('createServer', `Server object created: ${JSON.stringify(server)}`);

      // Change these lines
      // await this.createServerProperties(server);
      // await this.createEulaFile(server);
      
      // To these direct method calls:
      this._generateServerProperties(serverDir, {
        port: server.port,
        gamemode: server.gamemode,
        difficulty: server.difficulty,
        maxPlayers: server.maxPlayers,
        motd: `${server.name} - Minecraft Server`
      });
      
      this._acceptEula(serverDir);

      // Add to servers array and save
      this.servers.push(server);
      this.configManager.saveServers(this.servers);

      // Emit an event to inform UI of new server
      this.emit('server-created', server);
      
      return server;
    } catch (error) {
      debug('createServer', `Error creating server: ${error.message}`, error);
      throw error;
    }
  }
  
  async startServer(serverId) {
    debug('startServer', `Starting server ${serverId}`);
    
    const server = this.servers.find(s => s.id === serverId);
    if (!server) {
      debug('startServer', `Server with ID ${serverId} not found`);
      throw new Error(`Server with ID ${serverId} not found`);
    }
    
    // Check if process exists and is actually running
    if (this.runningServers.has(serverId)) {
      const process = this.runningServers.get(serverId);
      
      // Check if process is actually alive
      try {
        // process.kill(0) just tests if we can send a signal to the process
        if (process.pid && process.kill(0)) {
          debug('startServer', `Server ${server.name} is already running with PID ${process.pid}`);
          throw new Error(`Server ${server.name} is already running`);
        } else {
          // Process is dead but wasn't removed from the map
          debug('startServer', `Removing dead process reference for ${server.name}`);
          this.runningServers.delete(serverId);
        }
      } catch (e) {
        // If kill() throws, the process doesn't exist anymore
        debug('startServer', `Process for server ${server.name} is invalid, cleaning up references`);
        this.runningServers.delete(serverId);
      }
    }
  
    // Reset server status to stopped if it's in an inconsistent state
    if (server.status !== 'stopped' && !this.runningServers.has(serverId)) {
      debug('startServer', `Server ${server.name} has inconsistent status ${server.status}, resetting to stopped`);
      server.status = 'stopped';
      this.configManager.saveServers(this.servers);
      this.emit('server-status-change', serverId, 'stopped');
    }
    
    const javaPath = await this.configManager.getJavaPath();
    debug('startServer', `Using Java path: ${javaPath}`);
    
    const serverJar = path.join(server.directory, server.jarFile);
    
    // Verify server jar exists
    if (!fs.existsSync(serverJar)) {
      debug('startServer', `Server JAR file not found: ${serverJar}`);
      throw new Error(`Server JAR file not found: ${serverJar}`);
    }
    
    // Build Java command
    const javaArgs = [
      `-Xmx${server.memory}M`,
      `-Xms${Math.min(server.memory, 1024)}M`,
      '-jar',
      server.jarFile,
      'nogui'
    ];
    
    // Start the process
    const process = spawn(javaPath, javaArgs, {
      cwd: server.directory,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Store the process
    this.runningServers.set(serverId, process);
    
    // Update server status
    server.status = 'starting';
    server.lastStarted = new Date().toISOString();
    this.configManager.saveServers(this.servers);
    this.emit('server-status-change', serverId, 'starting');
    
    // Handle process output
    process.stdout.on('data', (data) => {
      const output = data.toString();
      this.emit('server-output', serverId, output);
      
      // Check for server ready message
      if (output.includes('Done') && output.includes('For help, type "help"')) {
        server.status = 'running';
        this.configManager.saveServers(this.servers);
        this.emit('server-status-change', serverId, 'running');
      }
    });
    
    process.stderr.on('data', (data) => {
      this.emit('server-output', serverId, data.toString());
    });
    
    // Handle process exit
    process.on('close', (code) => {
      this.runningServers.delete(serverId);
      server.status = 'stopped';
      this.configManager.saveServers(this.servers);
      this.emit('server-status-change', serverId, 'stopped');
      this.emit('server-output', serverId, `Server process exited with code ${code}`);
    });
    
    return server;
  }
  
  async stopServer(serverId) {
    const server = this.servers.find(s => s.id === serverId);
    if (!server) {
      throw new Error(`Server with ID ${serverId} not found`);
    }
    
    const process = this.runningServers.get(serverId);
    if (!process) {
      throw new Error(`Server ${server.name} is not running`);
    }
    
    // Update status
    server.status = 'stopping';
    this.configManager.saveServers(this.servers);
    this.emit('server-status-change', serverId, 'stopping');
    
    // Send stop command
    process.stdin.write('stop\n');
    
    // Wait for process to exit with timeout
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // If server hasn't stopped after 30 seconds, force kill
        if (this.runningServers.has(serverId)) {
          process.kill('SIGKILL');
          this.runningServers.delete(serverId);
          server.status = 'stopped';
          this.configManager.saveServers(this.servers);
          this.emit('server-status-change', serverId, 'stopped');
          this.emit('server-output', serverId, 'Server forcefully terminated after timeout');
        }
        resolve(server);
      }, 30000);
      
      process.on('close', () => {
        clearTimeout(timeout);
        resolve(server);
      });
    });
  }
  
  async restartServer(serverId) {
    const server = this.servers.find(s => s.id === serverId);
    if (!server) {
      throw new Error(`Server with ID ${serverId} not found`);
    }
    
    // Stop server if running
    if (this.runningServers.has(serverId)) {
      await this.stopServer(serverId);
    }
    
    // Start server again
    return this.startServer(serverId);
  }
  
  async deleteServer(serverId) {
    const serverIndex = this.servers.findIndex(s => s.id === serverId);
    if (serverIndex === -1) {
      throw new Error(`Server with ID ${serverId} not found`);
    }
    
    // Stop server if running
    if (this.runningServers.has(serverId)) {
      await this.stopServer(serverId);
    }
    
    const server = this.servers[serverIndex];
    
    // Delete server directory
    try {
      fs.rmSync(server.directory, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to delete server directory: ${error.message}`);
    }
    
    // Remove from servers list
    this.servers.splice(serverIndex, 1);
    this.configManager.saveServers(this.servers);
    
    return { id: serverId, deleted: true };
  }
  
  sendCommand(serverId, command) {
    const server = this.servers.find(s => s.id === serverId);
    if (!server) {
      throw new Error(`Server with ID ${serverId} not found`);
    }
    
    const process = this.runningServers.get(serverId);
    if (!process) {
      throw new Error(`Server ${server.name} is not running`);
    }
    
    // Check if stdin is writable
    if (process.stdin && process.stdin.writable) {
      process.stdin.write(`${command}\n`);
      return true;
    } else {
      throw new Error(`Cannot send command - server process is not accepting input`);
    }
  }
  
  async shutdownAllServers() {
    const promises = [];
    for (const serverId of this.runningServers.keys()) {
      promises.push(this.stopServer(serverId));
    }
    
    await Promise.allSettled(promises);
  }
  
  async checkJavaInstallation() {
    return new Promise((resolve) => {
      exec('java -version', (error) => {
        if (error) {
          this.configManager.setJavaPath(null);
          resolve(false);
        } else {
          // Java is available in PATH
          this.configManager.setJavaPath('java');
          resolve(true);
        }
      });
    });
  }
  
  _generateServerProperties(serverDir, config) {
    const properties = [
      'enable-jmx-monitoring=false',
      `gamemode=${config.gamemode || 'survival'}`,
      `difficulty=${config.difficulty || 'normal'}`,
      `motd=${config.motd || 'A Minecraft Server'}`,
      'query.port=' + (config.port || 25565),
      'pvp=true',
      'generate-structures=true',
      'max-chained-neighbor-updates=1000000',
      'max-tick-time=60000',
      'use-native-transport=true',
      'enable-query=false',
      'enable-rcon=false',
      'require-resource-pack=false',
      'resource-pack-prompt=',
      'server-port=' + (config.port || 25565),
      'enable-status=true',
      'resource-pack=',
      'entity-broadcast-range-percentage=100',
      'simulation-distance=10',
      'player-idle-timeout=0',
      'force-gamemode=false',
      'rate-limit=0',
      'hardcore=false',
      'white-list=false',
      'broadcast-console-to-ops=true',
      'spawn-npcs=true',
      'spawn-animals=true',
      'function-permission-level=2',
      'initial-enabled-packs=vanilla',
      'level-type=minecraft\\:normal',
      'text-filtering-config=',
      'spawn-monsters=true',
      'enforce-whitelist=false',
      'spawn-protection=16',
      'resource-pack-sha1=',
      'max-world-size=29999984',
      'max-players=' + (config.maxPlayers || 20),
      'network-compression-threshold=256',
      'online-mode=true',
      'enable-command-block=false',
      'view-distance=10',
      'server-ip=',
      'allow-nether=true',
      'sync-chunk-writes=true',
      'op-permission-level=4',
      'prevent-proxy-connections=false',
      'hide-online-players=false',
      'log-ips=true',
      'use-native-transport=true',
      'allow-flight=false',
      'initial-disabled-packs=',
      'level-name=world',
      'level-seed=',
      'broadcast-rcon-to-ops=true',
      'allow-cheats=false'
    ];
    
    fs.writeFileSync(
      path.join(serverDir, 'server.properties'),
      properties.join('\n')
    );
  }
  
  _acceptEula(serverDir) {
    fs.writeFileSync(
      path.join(serverDir, 'eula.txt'),
      '#By changing the setting below to TRUE you are indicating your agreement to our EULA (https://account.mojang.com/documents/minecraft_eula).\n' +
      '#' + new Date().toISOString() + '\n' +
      'eula=true'
    );
  }
  
  _sanitizeFolderName(name) {
    // Remove illegal characters and trim
    let sanitized = name.replace(/[\\/:*?"<>|]/g, '').trim();
    
    // Replace spaces with hyphens
    sanitized = sanitized.replace(/\s+/g, '-');
    
    // Ensure we have at least something valid
    if (!sanitized) {
      sanitized = 'minecraft-server';
    }
    
    return sanitized;
  }

  getServerById(serverId) {
    return this.servers.find(s => s.id === serverId);
  }

  getServerProcess(serverId) {
    return this.runningServers.get(serverId);
  }

  isServerRunning(serverId) {
    return this.runningServers.has(serverId);
  }

  async queryServerStatus(serverId) {
    debug('queryServerStatus', `Querying server status for ${serverId}`);
    
    const server = this.servers.find(s => s.id === serverId);
    if (!server) {
      throw new Error(`Server with ID ${serverId} not found`);
    }
    
    // Default stats in case query fails
    const defaultStats = {
      online: false,
      players: {
        online: 0,
        max: server.maxPlayers || 20,
      },
      version: server.version,
      motd: server.motd || `A Minecraft Server`,
    };
    
    // If server is not running, return default stats
    if (server.status !== 'running') {
      debug('queryServerStatus', `Server ${serverId} is not running, returning default stats`);
      return defaultStats;
    }
    
    try {
      // Query the server with a short timeout
      const options = {
        timeout: 5000, // 5 seconds
      };
      
      debug('queryServerStatus', `Attempting to query server at localhost:${server.port}`);
      const result = await util.status('localhost', server.port, options);
      
      debug('queryServerStatus', `Successfully queried server ${serverId}`, result);
      
      return {
        online: true,
        players: {
          online: result.players.online,
          max: result.players.max,
        },
        version: result.version.name,
        motd: result.motd.clean,
      };
    } catch (error) {
      debug('queryServerStatus', `Error querying server ${serverId}: ${error.message}`);
      
      // If query fails but process is running, server might still be starting
      if (this.runningServers.has(serverId)) {
        return {
          ...defaultStats,
          online: true,
          statusMessage: 'Server is starting or not responding to queries',
        };
      }
      
      return defaultStats;
    }
  }

  async getServerStats(serverId) {
    debug('getServerStats', `Getting stats for server ${serverId}`);
    
    const server = this.servers.find(s => s.id === serverId);
    if (!server) {
      throw new Error(`Server with ID ${serverId} not found`);
    }
    
    // Calculate uptime in seconds
    let uptime = 0;
    if (server.lastStarted) {
      const startTime = new Date(server.lastStarted);
      uptime = Math.floor((new Date() - startTime) / 1000);
    }
    
    // Get query status
    const queryStatus = await this.queryServerStatus(serverId);
    
    // Return combined stats
    return {
      uptime,
      status: server.status,
      version: server.version,
      port: server.port,
      memory: server.memory,
      gamemode: server.gamemode,
      difficulty: server.difficulty,
      maxPlayers: server.maxPlayers || 20,
      playersOnline: queryStatus.players.online,
      playersMax: queryStatus.players.max,
      online: queryStatus.online,
      motd: queryStatus.motd,
    };
  }

  hasRunningServers() {
    return this.runningServers.size > 0;
  }

  async updateServerSettings(serverId, settings) {
    const serverIndex = this.servers.findIndex(s => s.id === serverId);
    if (serverIndex === -1) {
      throw new Error(`Server with ID ${serverId} not found`);
    }

    const server = this.servers[serverIndex];
    
    // Check if server is running
    if (this.runningServers.has(serverId)) {
      throw new Error('Cannot update settings while server is running');
    }
    
    try {
      // Check if name has changed and update directory if needed
      if (settings.name !== server.name) {
        const oldDirectory = server.directory;
        const parentDir = path.dirname(oldDirectory);
        const newFolderName = this._sanitizeFolderName(settings.name);
        let newDirectory = path.join(parentDir, newFolderName);
        
        // Check if new directory already exists
        if (fs.existsSync(newDirectory) && oldDirectory !== newDirectory) {
          let counter = 1;
          let tempFolderName = `${newFolderName}-${counter}`;
          let tempDirectory = path.join(parentDir, tempFolderName);
          
          // Find an available directory name
          while (fs.existsSync(tempDirectory)) {
            counter++;
            tempFolderName = `${newFolderName}-${counter}`;
            tempDirectory = path.join(parentDir, tempFolderName);
          }
          
          newDirectory = tempDirectory;
        }
        
        // Rename the directory if it's different
        if (oldDirectory !== newDirectory) {
          fs.renameSync(oldDirectory, newDirectory);
          server.directory = newDirectory;
        }
      }
      
      // Update server.properties file
      const serverPropertiesPath = path.join(server.directory, 'server.properties');
      await this._updateServerProperties(serverPropertiesPath, {
        'server-port': settings.port,
        'motd': settings.motd || 'A Minecraft Server',
        'gamemode': settings.gamemode || 'survival',
        'difficulty': settings.difficulty || 'normal',
        'pvp': settings.pvp !== false ? 'true' : 'false',
        'enable-command-block': settings.enableCommandBlocks === true ? 'true' : 'false',
        'online-mode': settings.onlineMode !== false ? 'true' : 'false',
        'max-players': settings.maxPlayers || 20
      });
      
      // Update server object
      const updatedServer = {
        ...server,
        name: settings.name,
        port: settings.port,
        memory: settings.memory,
        gamemode: settings.gamemode,
        difficulty: settings.difficulty,
        maxPlayers: settings.maxPlayers,
        motd: settings.motd,
        pvp: settings.pvp,
        enableCommandBlocks: settings.enableCommandBlocks,
        onlineMode: settings.onlineMode
      };
      
      // Save to servers list
      this.servers[serverIndex] = updatedServer;
      this.configManager.saveServers(this.servers);
      
      return updatedServer;
    } catch (error) {
      console.error('Error updating server settings:', error);
      throw new Error(`Failed to update server settings: ${error.message}`);
    }
  }

  async _updateServerProperties(propertiesPath, properties) {
    // Read existing properties file
    let fileContent = '';
    try {
      if (fs.existsSync(propertiesPath)) {
        fileContent = fs.readFileSync(propertiesPath, 'utf8');
      }
    } catch (error) {
      console.error('Error reading server.properties:', error);
      // Continue with empty content if file doesn't exist
    }
    
    // Parse the properties file
    const lines = fileContent.split('\n');
    const currentProps = {};
    
    lines.forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      
      const separatorPos = line.indexOf('=');
      if (separatorPos !== -1) {
        const key = line.substring(0, separatorPos);
        const value = line.substring(separatorPos + 1);
        currentProps[key] = value;
      }
    });
    
    // Update with new properties
    const updatedProps = { ...currentProps, ...properties };
    
    // Convert back to file format
    let updatedContent = '#Minecraft server properties\n';
    updatedContent += `#${new Date().toISOString()}\n`;
    
    Object.entries(updatedProps).forEach(([key, value]) => {
      updatedContent += `${key}=${value}\n`;
    });
    
    // Write back to file
    fs.writeFileSync(propertiesPath, updatedContent);
    
    return true;
  }

  async createServerProperties(server) {
    debug('createServerProperties', `Creating server.properties for ${server.name}`);
    
    const serverDir = server.directory;
    
    // Create a configuration object from server settings
    const config = {
      port: server.port,
      gamemode: server.gamemode,
      difficulty: server.difficulty,
      maxPlayers: server.maxPlayers,
      motd: server.motd || `${server.name} - Minecraft Server`
    };
    
    // Generate the properties file
    this._generateServerProperties(serverDir, config);
    
    return true;
  }

  async createEulaFile(server) {
    debug('createEulaFile', `Creating eula.txt for ${server.name}`);
    
    const serverDir = server.directory;
    
    // Accept the EULA
    this._acceptEula(serverDir);
    
    return true;
  }

  // Add this method for cleanup of zombie processes
  cleanupDeadProcesses() {
    debug('cleanupDeadProcesses', 'Cleaning up potentially dead server processes');
    
    for (const [serverId, process] of this.runningServers.entries()) {
      try {
        // Try to send a 0 signal which doesn't kill the process
        // but checks if it exists
        if (!process.pid || !process.kill(0)) {
          debug('cleanupDeadProcesses', `Process for server ${serverId} appears to be dead, removing reference`);
          this.runningServers.delete(serverId);
          
          // Update server status
          const server = this.servers.find(s => s.id === serverId);
          if (server && server.status !== 'stopped') {
            server.status = 'stopped';
            this.configManager.saveServers(this.servers);
            this.emit('server-status-change', serverId, 'stopped');
          }
        }
      } catch (error) {
        // Process doesn't exist, remove from map
        debug('cleanupDeadProcesses', `Error checking process for server ${serverId}, removing reference: ${error.message}`);
        this.runningServers.delete(serverId);
        
        // Update server status
        const server = this.servers.find(s => s.id === serverId);
        if (server && server.status !== 'stopped') {
          server.status = 'stopped';
          this.configManager.saveServers(this.servers);
          this.emit('server-status-change', serverId, 'stopped');
        }
      }
    }
 }

  // Add this method if it doesn't exist already
  cleanup() {
    debug('cleanup', 'Cleaning up ServerManager resources');
    
    // Clear the cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Any other cleanup tasks can go here
  }
}

module.exports = ServerManager;