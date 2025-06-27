/**
 * SettingsManager component
 * Handles application settings and preferences
 */
class SettingsManager {
  /**
   * Create a new SettingsManager
   * @param {DashboardApp} app - Reference to the main application
   */
  constructor(app) {
    this.app = app;
    this.toast = app.toast;
    
    // Default settings
    this.defaultSettings = {
      autoStartServers: false,
      checkForUpdates: true,
      showAdvancedOptions: false,
      confirmDeletion: true,
      // Add more default settings as needed
    };
    
    // Initialize settings from localStorage
    this.initFromStorage();
    
    // Setup event listeners for settings UI
    this.setupEventListeners();
  }
  
  /**
   * Initialize settings from localStorage
   */
  initFromStorage() {
    // Load all settings from localStorage or use defaults
    this.settings = {};
    
    Object.keys(this.defaultSettings).forEach(key => {
      const storedValue = localStorage.getItem(`setting_${key}`);
      
      // If setting exists in localStorage, parse it based on its type
      if (storedValue !== null) {
        // Convert string values to appropriate types
        if (storedValue === 'true' || storedValue === 'false') {
          this.settings[key] = storedValue === 'true';
        } else if (!isNaN(Number(storedValue))) {
          this.settings[key] = Number(storedValue);
        } else {
          this.settings[key] = storedValue;
        }
      } else {
        // Use default value if not found in localStorage
        this.settings[key] = this.defaultSettings[key];
      }
    });
    
    // Update UI to reflect current settings
    this.updateSettingsUI();
  }
  
  /**
   * Set up event listeners for settings UI
   */
  setupEventListeners() {
    // Get all setting inputs when the settings section is shown
    const settingsLink = document.getElementById('settings-link');
    if (settingsLink) {
      settingsLink.addEventListener('click', () => {
        this.updateSettingsUI();
      });
    }
    
    // Listen for changes on settings form elements
    const settingsForm = document.getElementById('app-settings-form');
    if (settingsForm) {
      settingsForm.addEventListener('change', (e) => {
        const target = e.target;
        if (target.name && target.name.startsWith('setting_')) {
          const settingKey = target.name.replace('setting_', '');
          this.updateSetting(settingKey, this.getValueFromInput(target));
        }
      });
      
      settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.toast.success('Settings saved successfully');
      });
    }
    
    // Add event listener for reset settings button
    const resetSettingsBtn = document.getElementById('reset-settings-btn');
    if (resetSettingsBtn) {
      resetSettingsBtn.addEventListener('click', () => {
        this.resetSettings();
      });
    }
  }
  
  /**
   * Update the settings UI to match current settings
   */
  updateSettingsUI() {
    Object.keys(this.settings).forEach(key => {
      const input = document.querySelector(`[name="setting_${key}"]`);
      if (input) {
        this.setInputValue(input, this.settings[key]);
      }
    });
  }
  
  /**
   * Update a setting value
   * @param {string} key - Setting key
   * @param {any} value - Setting value
   */
  updateSetting(key, value) {
    // Only update if key exists in default settings
    if (Object.keys(this.defaultSettings).includes(key)) {
      // Update in-memory settings
      this.settings[key] = value;
      
      // Save to localStorage
      localStorage.setItem(`setting_${key}`, value.toString());
      
      // Apply setting if needed
      this.applySetting(key, value);
    }
  }
  
  /**
   * Apply runtime changes for certain settings
   * @param {string} key - Setting key
   * @param {any} value - Setting value
   */
  applySetting(key, value) {
    // Apply specific settings that need immediate effect
    switch (key) {
      case 'showAdvancedOptions':
        this.toggleAdvancedOptions(value);
        break;
      // Add more cases for other settings as needed
    }
  }
  
  /**
   * Reset all settings to defaults
   */
  resetSettings() {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      // Reset each setting to default
      Object.keys(this.defaultSettings).forEach(key => {
        this.updateSetting(key, this.defaultSettings[key]);
      });
      
      // Update UI
      this.updateSettingsUI();
      
      this.toast.info('All settings have been reset to defaults');
    }
  }
  
  /**
   * Get a setting value
   * @param {string} key - Setting key
   * @param {any} defaultValue - Default value if setting not found
   * @returns {any} Setting value
   */
  getSetting(key, defaultValue = null) {
    if (this.settings.hasOwnProperty(key)) {
      return this.settings[key];
    }
    
    return defaultValue !== null ? defaultValue : this.defaultSettings[key];
  }
  
  /**
   * Toggle visibility of advanced options
   * @param {boolean} show - Whether to show advanced options
   */
  toggleAdvancedOptions(show) {
    const advancedOptions = document.querySelectorAll('.advanced-option');
    advancedOptions.forEach(element => {
      element.style.display = show ? 'block' : 'none';
    });
  }
  
  /**
   * Helper method to get value from input based on type
   * @param {HTMLElement} input - Input element
   * @returns {any} Input value with appropriate type
   */
  getValueFromInput(input) {
    if (input.type === 'checkbox') {
      return input.checked;
    } else if (input.type === 'number') {
      return Number(input.value);
    } else {
      return input.value;
    }
  }
  
  /**
   * Helper method to set input value based on type
   * @param {HTMLElement} input - Input element
   * @param {any} value - Value to set
   */
  setInputValue(input, value) {
    if (input.type === 'checkbox') {
      input.checked = value;
    } else {
      input.value = value;
    }
  }
}

export default SettingsManager;