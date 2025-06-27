/**
 * Toast notification component
 * Provides a reusable interface for showing toast notifications in the application
 */
class Toast {
  /**
   * Create a new Toast component
   */
  constructor() {
    this.container = null;
    this.toasts = [];
    this.initContainer();
  }

  /**
   * Initialize the toast container if it doesn't exist
   */
  initContainer() {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    this.container = container;
  }

  /**
   * Show a toast notification
   * @param {string} message - The message to display
   * @param {string} type - Type of toast: 'success', 'error', 'warning', 'info'
   * @param {number} duration - How long to show the toast (in ms)
   * @returns {HTMLElement} The toast element
   */
  show(message, type = 'info', duration = 5000) {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Get appropriate icon based on toast type
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    if (type === 'warning') icon = 'fa-exclamation-triangle';
    
    // Create toast content
    toast.innerHTML = `
      <div class="toast-icon"><i class="fas ${icon}"></i></div>
      <div class="toast-content">
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close"><i class="fas fa-times"></i></button>
    `;
    
    // Add to container and track
    this.container.appendChild(toast);
    this.toasts.push(toast);
    
    // Add close button functionality
    toast.querySelector('.toast-close').addEventListener('click', () => {
      this.dismiss(toast);
    });
    
    // Auto remove after duration
    setTimeout(() => {
      if (this.toasts.includes(toast)) {
        this.dismiss(toast);
      }
    }, duration);
    
    // Log to console as well
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    return toast;
  }
  
  /**
   * Dismiss a toast notification
   * @param {HTMLElement} toast - The toast element to dismiss
   */
  dismiss(toast) {
    toast.classList.add('toast-hiding');
    
    // Remove after animation completes
    setTimeout(() => {
      if (toast.parentNode === this.container) {
        this.container.removeChild(toast);
      }
      this.toasts = this.toasts.filter(t => t !== toast);
    }, 300); // Match the CSS animation duration
  }
  
  /**
   * Show a success toast notification
   * @param {string} message - The message to display
   * @param {number} duration - How long to show the toast (in ms)
   * @returns {HTMLElement} The toast element
   */
  success(message, duration = 5000) {
    return this.show(message, 'success', duration);
  }
  
  /**
   * Show an error toast notification
   * @param {string} message - The message to display
   * @param {number} duration - How long to show the toast (in ms)
   * @returns {HTMLElement} The toast element
   */
  error(message, duration = 5000) {
    console.error(`[ERROR] ${message}`);
    
    // Add additional debugging for IPC errors
    if (message.includes('Error invoking remote method')) {
      console.error('IPC Error Details:', {
        message,
        timestamp: new Date().toISOString()
      });
      
      // Extract method name for better debugging
      const methodMatch = message.match(/remote method '([^']+)'/);
      if (methodMatch && methodMatch[1]) {
        console.error(`IPC Method that failed: ${methodMatch[1]}`);
        console.trace(`Stack trace for failed IPC call to ${methodMatch[1]}`);
      }
    }
    
    return this.show(message, 'error', duration);
  }
  
  /**
   * Show a warning toast notification
   * @param {string} message - The message to display
   * @param {number} duration - How long to show the toast (in ms)
   * @returns {HTMLElement} The toast element
   */
  warning(message, duration = 5000) {
    return this.show(message, 'warning', duration);
  }
  
  /**
   * Show an info toast notification
   * @param {string} message - The message to display
   * @param {number} duration - How long to show the toast (in ms)
   * @returns {HTMLElement} The toast element
   */
  info(message, duration = 5000) {
    return this.show(message, 'info', duration);
  }
  
  /**
   * Clear all toast notifications
   */
  clearAll() {
    this.toasts.forEach(toast => {
      this.dismiss(toast);
    });
  }
}

export default Toast;