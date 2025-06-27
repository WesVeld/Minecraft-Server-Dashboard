/**
 * FileManager component
 * Handles file operations for Minecraft server files
 */
class FileManager {
  /**
   * Create a new FileManager
   * @param {DashboardApp} dashboardApp - Reference to the main application
   */
  constructor(dashboardApp) {
    const debug = (message, data = null) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [FileManager] ${message}`);
      if (data) console.log(JSON.stringify(data, null, 2));
      return data; // For chaining
    };

    debug('Initializing FileManager');
    
    this.app = dashboardApp;
    this.toast = dashboardApp.toast;
    this.currentServerId = null;
    this.currentDir = '.';
    this.currentPath = [];
    this.selectedFile = null;
    this.fileContent = null;
    this.isEditing = false;
    
    // Protected file extensions that should not be edited/deleted
    this.protectedExtensions = [
      '.jar', '.exe', '.dll', '.so', '.dylib',
      '.bat', '.sh', '.cmd', '.app', '.bin'
    ];
    
    // Essential files that shouldn't be deleted
    this.essentialFiles = [
      'server.properties', 'eula.txt', 'server.jar',
      'spigot.jar', 'paper.jar', 'forge.jar', 'fabric.jar'
    ];
    
    debug('Registering event listeners');
    this.registerEventListeners();
  }
  
  /**
   * Set up event listeners for the file manager UI
   */
  registerEventListeners() {
    // Tab navigation
    document.getElementById('server-files-tab').addEventListener('click', () => {
      this.app.showDetailTab('files');
      if (this.currentServerId) {
        this.loadDirectoryContents(this.currentDir);
      }
    });
    
    // File navigation
    document.getElementById('refresh-files-btn').addEventListener('click', () => {
      this.loadDirectoryContents(this.currentDir);
    });
    
    document.getElementById('file-breadcrumbs').addEventListener('click', (e) => {
      const breadcrumbItem = e.target.closest('.breadcrumb-item');
      if (breadcrumbItem && !breadcrumbItem.classList.contains('active')) {
        const index = parseInt(breadcrumbItem.dataset.index);
        this.navigateToPathIndex(index);
      }
    });
    
    // File viewer/editor
    document.getElementById('close-viewer-btn').addEventListener('click', () => {
      this.closeFileViewer();
    });
    
    document.getElementById('save-file-btn').addEventListener('click', () => {
      this.saveCurrentFile();
    });
    
    document.getElementById('download-binary-btn').addEventListener('click', () => {
      if (this.selectedFile) {
        this.downloadFile(this.selectedFile);
      }
    });
    
    // File upload
    document.getElementById('upload-file-btn').addEventListener('click', () => {
      document.getElementById('file-upload-input').click();
    });
    
    document.getElementById('file-upload-input').addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.uploadFiles(e.target.files);
      }
    });
    
    // Setup drag and drop
    const filesContainer = document.querySelector('.files-container');
    
    filesContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      filesContainer.classList.add('upload-drop-zone', 'dragging');
    });
    
    filesContainer.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      filesContainer.classList.remove('dragging');
    });
    
    filesContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      filesContainer.classList.remove('dragging');
      
      if (e.dataTransfer.files.length > 0 && this.currentServerId) {
        this.uploadFiles(e.dataTransfer.files);
      }
    });
  }
  
  /**
   * Set the current server ID and reset the file manager state
   * @param {string} serverId - The server ID
   */
  setServerId(serverId) {
    this.currentServerId = serverId;
    this.currentDir = '.';
    this.currentPath = [];
    this.selectedFile = null;
    this.fileContent = null;
    this.closeFileViewer();
    this.updateBreadcrumbs();
  }
  
  /**
   * Load directory contents from the server
   * @param {string} dir - Directory to load
   */
  async loadDirectoryContents(dir) {
    if (!this.currentServerId) return;
    
    try {
      const filesList = document.getElementById('files-list');
      filesList.innerHTML = `
        <div class="file-loading">
          <i class="fas fa-circle-notch fa-spin"></i> Loading files...
        </div>
      `;
      
      console.log(`[FileManager] Loading files for server ${this.currentServerId}, directory: ${dir}`);
      const files = await window.api.getServerFiles(this.currentServerId, dir);
      console.log(`[FileManager] Successfully loaded ${files.length} files`);
      
      this.currentDir = dir;
      this.updateBreadcrumbs();
      this.renderFilesList(files);
    } catch (error) {
      console.error(`[FileManager] Error loading files:`, error);
      console.trace(`[FileManager] Stack trace for file loading error`);
      
      this.toast.error(`Failed to load files: ${error.message}`);
      const filesList = document.getElementById('files-list');
      filesList.innerHTML = `
        <div class="empty-directory">
          <i class="fas fa-exclamation-circle"></i>
          <p>Error loading files</p>
          <p class="help-text">${error.message || 'Unknown error'}</p>
        </div>
      `;
    }
  }
  
  /**
   * Render the files list in the UI
   * @param {Array} files - List of file objects
   */
  renderFilesList(files) {
    const filesList = document.getElementById('files-list');
    
    if (!files.length) {
      filesList.innerHTML = `
        <div class="empty-directory">
          <i class="fas fa-folder-open"></i>
          <p>This directory is empty</p>
        </div>
      `;
      return;
    }
    
    // Sort files: directories first, then alphabetical
    files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    
    // Add parent directory if not in root
    let html = '';
    if (this.currentPath.length > 0) {
      html += `
        <div class="file-item" data-type="directory" data-name="..">
          <div class="file-column file-name">
            <span class="file-icon"><i class="fas fa-level-up-alt"></i></span>
            <span class="file-label">..</span>
          </div>
          <div class="file-column file-size"></div>
          <div class="file-column file-modified"></div>
          <div class="file-column file-actions"></div>
        </div>
      `;
    }
    
    // Add files and directories
    files.forEach(file => {
      const isProtected = this.isProtectedFile(file.name);
      const isEssential = this.isEssentialFile(file.name);
      const iconClass = this.getFileIconClass(file);
      
      html += `
        <div class="file-item" data-type="${file.isDirectory ? 'directory' : 'file'}" data-name="${this.escapeHtml(file.name)}">
          <div class="file-column file-name">
            <span class="file-icon">
              <i class="${iconClass}"></i>
            </span>
            <span class="file-label">${this.escapeHtml(file.name)}</span>
            ${isProtected ? '<span class="file-badge protected">Protected</span>' : ''}
          </div>
          <div class="file-column file-size">${file.isDirectory ? '--' : this.formatFileSize(file.size)}</div>
          <div class="file-column file-modified">${this.formatDate(file.modified)}</div>
          <div class="file-column file-actions">
            <div class="file-item-actions">
              ${!file.isDirectory ? `
                <button class="file-action-btn edit ${isProtected ? 'disabled' : ''}" title="${isProtected ? 'Protected file' : 'Edit'}" ${isProtected ? 'disabled' : ''}>
                  <i class="fas fa-edit"></i>
                </button>
                <button class="file-action-btn download" title="Download">
                  <i class="fas fa-download"></i>
                </button>
              ` : ''}
              <button class="file-action-btn delete ${isEssential ? 'disabled' : ''}" title="${isEssential ? 'Essential file' : 'Delete'}" ${isEssential ? 'disabled' : ''}>
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    });
    
    filesList.innerHTML = html;
    
    // Add event listeners to file items
    filesList.querySelectorAll('.file-item').forEach(item => {
      const type = item.dataset.type;
      const name = item.dataset.name;
      
      // Click on file/directory
      item.addEventListener('click', (e) => {
        // Ignore clicks on action buttons
        if (e.target.closest('.file-action-btn')) return;
        
        if (name === '..') {
          this.navigateUp();
        } else if (type === 'directory') {
          this.navigateToDirectory(name);
        } else {
          this.selectFile(name);
        }
      });
      
      // Action buttons
      if (type === 'file') {
        const editBtn = item.querySelector('.file-action-btn.edit');
        const downloadBtn = item.querySelector('.file-action-btn.download');
        const deleteBtn = item.querySelector('.file-action-btn.delete');
        
        if (editBtn && !editBtn.disabled) {
          editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openFileEditor(name);
          });
        }
        
        if (downloadBtn) {
          downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.downloadFile(name);
          });
        }
        
        if (deleteBtn && !deleteBtn.disabled) {
          deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.confirmDeleteFile(name);
          });
        }
      } else if (type === 'directory' && name !== '..') {
        const deleteBtn = item.querySelector('.file-action-btn.delete');
        
        if (deleteBtn && !deleteBtn.disabled) {
          deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.confirmDeleteDirectory(name);
          });
        }
      }
    });
  }
  
  /**
   * Navigate to a directory
   * @param {string} dirName - Directory name
   */
  navigateToDirectory(dirName) {
    const newPath = this.currentPath.concat(dirName);
    this.currentPath = newPath;
    this.loadDirectoryContents(this.getPathString(newPath));
  }
  
  /**
   * Navigate one level up
   */
  navigateUp() {
    if (this.currentPath.length > 0) {
      this.currentPath.pop();
      this.loadDirectoryContents(this.getPathString(this.currentPath));
    }
  }
  
  /**
   * Navigate to a specific path index
   * @param {number} index - Index in the path array
   */
  navigateToPathIndex(index) {
    if (index < 0) {
      this.currentPath = [];
    } else {
      this.currentPath = this.currentPath.slice(0, index + 1);
    }
    this.loadDirectoryContents(this.getPathString(this.currentPath));
  }
  
  /**
   * Update breadcrumbs navigation in the UI
   */
  updateBreadcrumbs() {
    const breadcrumbsEl = document.getElementById('file-breadcrumbs');
    let html = `<li class="breadcrumb-item${this.currentPath.length === 0 ? ' active' : ''}" data-index="-1"><i class="fas fa-home"></i> Root</li>`;
    
    this.currentPath.forEach((dir, index) => {
      const isLast = index === this.currentPath.length - 1;
      html += `<li class="breadcrumb-item${isLast ? ' active' : ''}" data-index="${index}">${this.escapeHtml(dir)}</li>`;
    });
    
    breadcrumbsEl.innerHTML = html;
  }
  
  /**
   * Convert a path array to a path string
   * @param {Array} path - Path array
   * @returns {string} Path string
   */
  getPathString(path) {
    if (path.length === 0) return '.';
    return path.join('/');
  }
  
  /**
   * Select a file in the list
   * @param {string} fileName - File name
   */
  selectFile(fileName) {
    // Remove selected class from all items
    document.querySelectorAll('.file-item').forEach(item => {
      item.classList.remove('selected');
    });
    
    // Add selected class to the clicked item
    const fileItem = document.querySelector(`.file-item[data-type="file"][data-name="${fileName}"]`);
    if (fileItem) {
      fileItem.classList.add('selected');
    }
    
    this.selectedFile = fileName;
    
    // For binary files, just show a message
    if (this.isBinaryFile(fileName)) {
      this.showBinaryFileMessage(fileName);
    } else {
      this.openFileEditor(fileName);
    }
  }
  
  /**
   * Show binary file message and hide editor
   * @param {string} fileName - File name
   */
  showBinaryFileMessage(fileName) {
    const fileContentViewer = document.querySelector('.file-content-viewer');
    const fileEditor = document.getElementById('file-editor-container');
    const binaryFileMessage = document.getElementById('binary-file-message');
    const viewerFilename = document.getElementById('viewer-filename');
    const saveBtn = document.getElementById('save-file-btn');
    
    fileContentViewer.classList.add('active');
    fileEditor.style.display = 'none';
    binaryFileMessage.style.display = 'flex';
    
    viewerFilename.textContent = fileName;
    saveBtn.disabled = true;
    
    // Adjust the layout
    document.querySelector('.files-list-container').style.width = '40%';
  }
  
  /**
   * Open file editor for a text file
   * @param {string} fileName - File name
   */
  async openFileEditor(fileName) {
    try {
      const filePath = this.getPathString([...this.currentPath, fileName]);
      const content = await window.api.readServerFile(this.currentServerId, filePath);
      
      const fileContentViewer = document.querySelector('.file-content-viewer');
      const fileEditor = document.getElementById('file-editor-container');
      const binaryFileMessage = document.getElementById('binary-file-message');
      const viewerFilename = document.getElementById('viewer-filename');
      const editor = document.getElementById('file-editor');
      const saveBtn = document.getElementById('save-file-btn');
      
      fileContentViewer.classList.add('active');
      fileEditor.style.display = 'block';
      binaryFileMessage.style.display = 'none';
      
      viewerFilename.textContent = fileName;
      editor.value = content;
      
      this.isEditing = true;
      this.fileContent = content;
      
      // Disable save button if file is protected
      saveBtn.disabled = this.isProtectedFile(fileName);
      
      // Adjust the layout
      document.querySelector('.files-list-container').style.width = '40%';
    } catch (error) {
      this.toast.error(`Failed to open file: ${error.message}`);
    }
  }
  
  /**
   * Close the file viewer/editor
   */
  closeFileViewer() {
    const fileContentViewer = document.querySelector('.file-content-viewer');
    fileContentViewer.classList.remove('active');
    
    // Restore layout
    document.querySelector('.files-list-container').style.width = '100%';
    
    // Clear selection
    document.querySelectorAll('.file-item').forEach(item => {
      item.classList.remove('selected');
    });
    
    this.selectedFile = null;
    this.fileContent = null;
    this.isEditing = false;
  }
  
  /**
   * Save the current file being edited
   */
  async saveCurrentFile() {
    if (!this.selectedFile || !this.isEditing) return;
    
    try {
      const editor = document.getElementById('file-editor');
      const newContent = editor.value;
      
      const filePath = this.getPathString([...this.currentPath, this.selectedFile]);
      await window.api.writeServerFile(this.currentServerId, filePath, newContent);
      
      // Update cached content
      this.fileContent = newContent;
      
      this.toast.success(`File "${this.selectedFile}" saved successfully`);
    } catch (error) {
      this.toast.error(`Failed to save file: ${error.message || error}`);
    }
  }
  
  /**
   * Download a file
   * @param {string} fileName - File name to download
   */
  async downloadFile(fileName) {
    try {
      const filePath = this.getPathString([...this.currentPath, fileName]);
      await window.api.downloadServerFile(this.currentServerId, filePath);
      this.toast.success(`File "${fileName}" downloaded successfully!`);
    } catch (error) {
      this.toast.error(`Failed to download file: ${error.message}`);
    }
  }
  
  /**
   * Upload files to the current directory
   * @param {FileList} files - Files to upload
   */
  async uploadFiles(files) {
    try {
      this.toast.info(`Uploading ${files.length} file(s)...`);
      
      const currentDir = this.getPathString(this.currentPath);
      let successCount = 0;
      
      for (const file of files) {
        try {
          await window.api.uploadFileToServer(this.currentServerId, currentDir, file.path);
          successCount++;
        } catch (error) {
          this.toast.error(`Error uploading "${file.name}": ${error.message}`);
        }
      }
      
      // Refresh file list
      this.loadDirectoryContents(currentDir);
      
      if (successCount > 0) {
        this.toast.success(`Successfully uploaded ${successCount} file(s)`);
      }
    } catch (error) {
      this.toast.error(`File upload failed: ${error.message}`);
    }
  }
  
  /**
   * Show confirmation dialog for file deletion
   * @param {string} fileName - File name to delete
   */
  confirmDeleteFile(fileName) {
    const confirmDelete = confirm(`Are you sure you want to delete the file "${fileName}"?`);
    if (confirmDelete) {
      this.deleteFile(fileName);
    }
  }
  
  /**
   * Show confirmation dialog for directory deletion
   * @param {string} dirName - Directory name to delete
   */
  confirmDeleteDirectory(dirName) {
    const confirmDelete = confirm(
      `Are you sure you want to delete the directory "${dirName}" and all its contents?\n\nThis action cannot be undone.`
    );
    if (confirmDelete) {
      this.deleteDirectory(dirName);
    }
  }
  
  /**
   * Delete a file
   * @param {string} fileName - File name to delete
   */
  async deleteFile(fileName) {
    try {
      const filePath = this.getPathString([...this.currentPath, fileName]);
      await window.api.deleteServerFile(this.currentServerId, filePath);
      
      // Close the viewer if the current file is deleted
      if (this.selectedFile === fileName) {
        this.closeFileViewer();
      }
      
      // Refresh the file list
      this.loadDirectoryContents(this.getPathString(this.currentPath));
      
      this.toast.success(`File "${fileName}" deleted successfully!`);
    } catch (error) {
      this.toast.error(`Failed to delete file: ${error.message}`);
    }
  }
  
  /**
   * Delete a directory
   * @param {string} dirName - Directory name to delete
   */
  async deleteDirectory(dirName) {
    try {
      const dirPath = this.getPathString([...this.currentPath, dirName]);
      await window.api.deleteServerDirectory(this.currentServerId, dirPath);
      
      // Refresh the file list
      this.loadDirectoryContents(this.getPathString(this.currentPath));
      
      this.toast.success(`Directory "${dirName}" deleted successfully!`);
    } catch (error) {
      this.toast.error(`Failed to delete directory: ${error.message}`);
    }
  }
  
  /**
   * Check if a file is protected (shouldn't be edited)
   * @param {string} fileName - File name
   * @returns {boolean} True if the file is protected
   */
  isProtectedFile(fileName) {
    // Check extension
    const ext = this.getFileExtension(fileName).toLowerCase();
    if (this.protectedExtensions.includes(ext)) {
      return true;
    }
    
    // Check if it's a log file (can be viewed but not edited)
    if (ext === '.log' || ext === '.gz' || fileName.includes('.log.')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Check if a file is essential (shouldn't be deleted)
   * @param {string} fileName - File name
   * @returns {boolean} True if the file is essential
   */
  isEssentialFile(fileName) {
    return this.essentialFiles.some(name => 
      fileName.toLowerCase() === name.toLowerCase() ||
      fileName.toLowerCase().endsWith('.jar')
    );
  }
  
  /**
   * Check if a file is likely a binary file
   * @param {string} fileName - File name
   * @returns {boolean} True if the file is likely binary
   */
  isBinaryFile(fileName) {
    const ext = this.getFileExtension(fileName).toLowerCase();
    const binaryExtensions = [
      '.jar', '.exe', '.bin', '.dll', '.so', '.dylib',
      '.class', '.dat', '.db', '.sqlite', '.mca',
      '.png', '.jpg', '.jpeg', '.gif', '.bmp',
      '.zip', '.gz', '.tar', '.rar', '.7z',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx',
      '.ppt', '.pptx', '.mp3', '.mp4', '.avi', '.mov'
    ];
    
    return binaryExtensions.includes(ext);
  }
  
  /**
   * Get file icon class based on file type
   * @param {Object} file - File object
   * @returns {string} Font Awesome icon class
   */
  getFileIconClass(file) {
    if (file.isDirectory) return 'fas fa-folder';
    
    const ext = this.getFileExtension(file.name).toLowerCase();
    
    // World data directories/files
    if (file.name.toLowerCase() === 'world' || 
        file.name.toLowerCase().includes('_nether') || 
        file.name.toLowerCase().includes('_the_end')) {
      return 'fas fa-globe';
    }
    
    // Executable files
    if (['.jar', '.exe', '.bat', '.sh', '.cmd'].includes(ext)) {
      return 'fas fa-cogs';
    }
    
    // Config files
    if (['.properties', '.json', '.yml', '.yaml', '.xml', '.conf', '.cfg'].includes(ext)) {
      return 'fas fa-wrench';
    }
    
    // Log files
    if (ext === '.log' || file.name.includes('.log.')) {
      return 'fas fa-clipboard-list';
    }
    
    // Text files
    if (['.txt', '.md', '.text'].includes(ext)) {
      return 'fas fa-file-alt';
    }
    
    // Minecraft related files
    if (['.mca', '.dat', '.nbt'].includes(ext) || 
        file.name.toLowerCase() === 'eula.txt' || 
        file.name.toLowerCase() === 'ops.json' || 
        file.name.toLowerCase() === 'whitelist.json') {
      return 'fas fa-cube';
    }
    
    // Images
    if (['.png', '.jpg', '.jpeg', '.gif', '.bmp'].includes(ext)) {
      return 'fas fa-image';
    }
    
    // Archives
    if (['.zip', '.gz', '.tar', '.rar', '.7z'].includes(ext)) {
      return 'fas fa-file-archive';
    }
    
    // Default
    return 'fas fa-file';
  }
  
  /**
   * Get file extension from a filename
   * @param {string} fileName - File name
   * @returns {string} File extension including the dot
   */
  getFileExtension(fileName) {
    const dotIndex = fileName.lastIndexOf('.');
    if (dotIndex === -1) return '';
    return fileName.substring(dotIndex);
  }
  
  /**
   * Format file size in readable format
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Format date to readable format
   * @param {string|Date} date - Date to format
   * @returns {string} Formatted date
   */
  formatDate(date) {
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';
      
      return d.toLocaleDateString() + ' ' + 
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
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

export default FileManager;