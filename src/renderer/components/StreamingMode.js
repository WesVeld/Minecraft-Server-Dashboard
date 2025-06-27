/**
 * StreamingMode component
 * Handles privacy settings for streaming/recording the application
 */
class StreamingMode {
  /**
   * Create a new StreamingMode component
   * @param {DashboardApp} app - Reference to the main application
   */
  constructor(app) {
    this.app = app;
    this.toast = app.toast;
    this.enabled = false;
    this.sensitiveElements = [
      '.server-ip', 
      '.ip-address', 
      '.connection-string',
      '.user-token',
      '.api-key',
      '.server-password'
    ];
    
    // Don't initialize from storage immediately
    // Wait until ServerManager is available
    this.setupEventListeners();
  }
  
  /**
   * Initialize the component from localStorage
   * Call this after ServerManager is initialized
   */
  initFromStorage() {
    const enabled = localStorage.getItem('streamingMode') === 'true';
    this.setEnabled(enabled, false); // Don't show notification on initial load
    
    // Set the toggle switch state
    const toggle = document.getElementById('streaming-mode-toggle');
    if (toggle) {
      toggle.checked = enabled;
    }
  }
  
  /**
   * Set up event listeners for the streaming mode toggle
   */
  setupEventListeners() {
    const toggle = document.getElementById('streaming-mode-toggle');
    if (toggle) {
      toggle.addEventListener('change', (e) => {
        this.setEnabled(e.target.checked);
        
        // Save preference to local storage
        localStorage.setItem('streamingMode', e.target.checked);
      });
    }
  }
  
  /**
   * Enable or disable streaming mode
   * @param {boolean} enabled - Whether streaming mode should be enabled
   * @param {boolean} showNotification - Whether to show a notification about the change
   */
  setEnabled(enabled, showNotification = true) {
    if (enabled) {
      document.body.classList.add('streaming-mode');
      this.enabled = true;
      
      if (showNotification) {
        this.toast.info('Streaming mode enabled - sensitive data is now hidden');
      }
      
      // Mask all existing sensitive elements
      this.maskSensitiveElements();
      
      // Update displayed server information with masked IP if server manager exists
      if (this.app.serverManager) {
        this.app.serverManager.updateServerAddressDisplay();
      }
    } else {
      document.body.classList.remove('streaming-mode');
      this.enabled = false;
      
      if (showNotification) {
        this.toast.info('Streaming mode disabled');
      }
      
      // Unmask all elements
      this.unmaskSensitiveElements();
      
      // Update displayed server information with actual IP if server manager exists
      if (this.app.serverManager) {
        this.app.serverManager.updateServerAddressDisplay();
      }
    }
  }
  
  /**
   * Check if streaming mode is enabled
   * @returns {boolean} True if streaming mode is enabled
   */
  isEnabled() {
    return this.enabled;
  }
  
  /**
   * Mask all sensitive elements on the page
   */
  maskSensitiveElements() {
    this.sensitiveElements.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        // Save original content if not already saved
        if (!element.dataset.originalContent) {
          element.dataset.originalContent = element.textContent;
        }
        
        // Determine how to mask based on content
        if (element.textContent.includes('@')) { // Email
          element.textContent = 'user@example.com';
        } else if (element.textContent.includes('.')) { // IP or domain
          element.textContent = 'xxx.xxx.xxx.xxx';
        } else if (/^\d+$/.test(element.textContent.trim())) { // Numbers only
          element.textContent = 'xxxx-xxxx-xxxx';
        } else {
          element.textContent = '********';
        }
        
        element.classList.add('masked');
      });
    });
    
    // Special handling for server address display
    this.maskServerAddressDisplay();
  }
  
  /**
   * Unmask all sensitive elements on the page
   */
  unmaskSensitiveElements() {
    this.sensitiveElements.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (element.dataset.originalContent) {
          element.textContent = element.dataset.originalContent;
          element.classList.remove('masked');
        }
      });
    });
    
    // Special handling for server address display
    this.unmaskServerAddressDisplay();
  }
  
  /**
   * Mask the server address display with the current server port
   */
  maskServerAddressDisplay() {
    const addressElement = document.getElementById('detail-ip-port');
    if (!addressElement) return;
    
    // Extract the port number if present
    const portMatch = addressElement.textContent.match(/:(\d+)$/);
    const port = portMatch ? portMatch[1] : '';
    
    // Save the original content
    if (!addressElement.dataset.originalContent) {
      addressElement.dataset.originalContent = addressElement.textContent;
    }
    
    // Update with masked address but real port
    addressElement.textContent = port ? `xxx.xxx.xxx.xxx:${port}` : 'xxx.xxx.xxx.xxx';
    addressElement.classList.add('masked');
  }
  
  /**
   * Unmask the server address display
   */
  unmaskServerAddressDisplay() {
    const addressElement = document.getElementById('detail-ip-port');
    if (!addressElement || !addressElement.dataset.originalContent) return;
    
    addressElement.textContent = addressElement.dataset.originalContent;
    addressElement.classList.remove('masked');
  }
  
  /**
   * Mask a specific text value, useful for dynamic content
   * @param {string} value - The value to mask
   * @param {string} type - Type of data (ip, email, token, password)
   * @returns {string} Masked value
   */
  maskValue(value, type = 'generic') {
    if (!this.enabled) return value;
    
    switch (type.toLowerCase()) {
      case 'ip':
        // Keep port if present
        const portMatch = value.match(/:(\d+)$/);
        const port = portMatch ? `:${portMatch[1]}` : '';
        return `xxx.xxx.xxx.xxx${port}`;
      
      case 'email':
        return 'user@example.com';
      
      case 'token':
      case 'password':
        return '********';
      
      case 'generic':
      default:
        if (value.includes('@')) return 'user@example.com';
        if (value.includes('.')) return 'xxx.xxx.xxx.xxx';
        return '********';
    }
  }
  
  /**
   * Clean up event listeners and subscriptions
   */
  cleanup() {
    // Nothing to clean up currently
  }
}

export default StreamingMode;