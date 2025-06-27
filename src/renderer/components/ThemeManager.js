/**
 * ThemeManager component
 * Handles application theme management
 */
class ThemeManager {
  /**
   * Create a new ThemeManager
   * @param {DashboardApp} app - Reference to the main application
   */
  constructor(app) {
    this.app = app;
    this.toast = app.toast;
    this.resourceGraph = null;
    
    this.availableThemes = {
      default: {
        name: 'Default',
        description: 'Light theme with Minecraft-inspired colors',
        icon: 'fa-sun',
        notificationType: 'success'
      },
      dark: {
        name: 'Dark',
        description: 'Dark theme for night mode',
        icon: 'fa-moon',
        notificationType: 'info'
      },
      Osun: {
        name: 'Osun',
        description: 'Vibrant orange and purple accents',
        icon: 'fa-fire',
        notificationType: 'success'
      },
      Vervain: {
        name: 'Vervain',
        description: 'Purple-focused dark color scheme',
        icon: 'fa-magic',
        notificationType: 'success'
      }
    };
    
    // Initialize from saved preferences
    this.initFromStorage();
    this.setupEventListeners();
  }
  
  /**
   * Initialize theme from localStorage
   */
  initFromStorage() {
    const savedTheme = localStorage.getItem('theme') || 'default';
    this.setTheme(savedTheme, false); // Don't show notification on initial load
    this.updateThemeSelector(savedTheme);
  }
  
  /**
   * Set up event listeners for theme selector
   */
  setupEventListeners() {
    document.querySelectorAll('.theme-option').forEach(option => {
      option.addEventListener('click', () => {
        const theme = option.dataset.theme;
        this.setTheme(theme);
        this.updateThemeSelector(theme);
      });
    });
  }
  
  /**
   * Set the application theme
   * @param {string} theme - Theme name: 'default', 'dark', etc.
   * @param {boolean} showNotification - Whether to show a toast notification
   */
  setTheme(theme, showNotification = true) {
    // Get all available theme classes
    const themeClasses = Object.keys(this.availableThemes).map(t => `theme-${t}`);
    
    // Remove any existing theme classes
    document.body.classList.remove(...themeClasses);
    
    // Add the new theme class if it's not default
    if (theme !== 'default') {
      document.body.classList.add(`theme-${theme}`);
    }
    
    // Save the theme preference
    localStorage.setItem('theme', theme);
    
    // Show a toast notification with appropriate styling
    if (showNotification) {
      const themeInfo = this.availableThemes[theme] || {
        name: this.capitalizeFirstLetter(theme),
        notificationType: 'success'
      };
      
      this.toast[themeInfo.notificationType](`${themeInfo.name} theme applied`);
    }
    
    // Force-refresh any charts or components that need re-rendering with new theme
    this.refreshComponents();
  }
  
  /**
   * Update the theme selector UI to reflect the current theme
   * @param {string} currentTheme - Current theme name
   */
  updateThemeSelector(currentTheme) {
    // Remove active class from all theme options
    document.querySelectorAll('.theme-option').forEach(option => {
      option.classList.remove('active');
    });
    
    // Add active class to the current theme option
    const activeOption = document.querySelector(`.theme-option[data-theme="${currentTheme}"]`);
    if (activeOption) {
      activeOption.classList.add('active');
    }
  }
  
  /**
   * Refresh components that need updating when theme changes
   */
  refreshComponents() {
    // Reference the resource graph from the app if available
    if (this.app.resourceGraph) {
      this.app.updateResourceGraph(true);
    }
  }
  
  /**
   * Register a component that needs to be refreshed on theme changes
   * @param {string} name - Component name
   * @param {Object} component - Component reference
   */
  registerComponent(name, component) {
    this[name] = component;
  }
  
  /**
   * Get current theme
   * @returns {string} Current theme name
   */
  getCurrentTheme() {
    return localStorage.getItem('theme') || 'default';
  }
  
  /**
   * Check if dark mode is active (including dark themes)
   * @returns {boolean} True if a dark theme is active
   */
  isDarkMode() {
    const currentTheme = this.getCurrentTheme();
    return ['dark', 'Vervain'].includes(currentTheme);
  }
  
  /**
   * Helper method to capitalize the first letter of a string
   * @param {string} text - The string to capitalize
   * @returns {string} The capitalized string
   */
  capitalizeFirstLetter(text) {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
}

export default ThemeManager;