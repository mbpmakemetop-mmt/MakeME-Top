/* ═══════════════════════════════════════════════════════════════
   SECURITY IMPROVEMENTS MODULE
   ═══════════════════════════════════════════════════════════════
   
   PROTECTIONS IMPLEMENTED:
   1. Input sanitization
   2. XSS prevention
   3. Rate limiting
   4. File upload validation
   5. CSRF protection
   6. SQL injection prevention
   
   ═══════════════════════════════════════════════════════════════ */

// ══════════════════════════════════════════════════════════════
// 1. INPUT SANITIZATION
// ══════════════════════════════════════════════════════════════

/**
 * Sanitize HTML to prevent XSS attacks
 */
function sanitizeHTML(input) {
  if (!input) return '';
  
  const map = {
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '&': '&amp;'
  };
  
  return String(input).replace(/[<>"'\/&]/g, char => map[char]);
}

/**
 * Sanitize text input (remove dangerous characters)
 */
function sanitizeText(input, maxLength = 1000) {
  if (!input) return '';
  
  // Convert to string and trim
  let sanitized = String(input).trim();
  
  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');
  
  // Remove control characters except newline and tab
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Limit length
  sanitized = sanitized.slice(0, maxLength);
  
  return sanitized;
}

/**
 * Sanitize email
 */
function sanitizeEmail(email) {
  if (!email) return '';
  
  const sanitized = sanitizeText(email, 255).toLowerCase();
  
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(sanitized)) {
    throw new Error('Invalid email format');
  }
  
  return sanitized;
}

/**
 * Sanitize URL
 */
function sanitizeURL(url) {
  if (!url) return '';
  
  const sanitized = sanitizeText(url, 2000);
  
  // Only allow http and https
  try {
    const urlObj = new URL(sanitized);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      throw new Error('Invalid URL protocol');
    }
    return urlObj.href;
  } catch (e) {
    throw new Error('Invalid URL format');
  }
}

/**
 * Sanitize phone number
 */
function sanitizePhone(phone) {
  if (!phone) return '';
  
  // Remove all non-numeric characters except +
  const sanitized = phone.replace(/[^\d+]/g, '');
  
  // Limit to 20 characters
  return sanitized.slice(0, 20);
}

// ══════════════════════════════════════════════════════════════
// 2. RATE LIMITING
// ══════════════════════════════════════════════════════════════

class RateLimiter {
  constructor(maxAttempts, windowMs) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.attempts = new Map();
  }
  
  isAllowed(key) {
    const now = Date.now();
    const userAttempts = this.attempts.get(key) || [];
    
    // Remove old attempts outside the window
    const validAttempts = userAttempts.filter(time => now - time < this.windowMs);
    
    if (validAttempts.length >= this.maxAttempts) {
      return false;
    }
    
    // Record this attempt
    validAttempts.push(now);
    this.attempts.set(key, validAttempts);
    
    return true;
  }
  
  reset(key) {
    this.attempts.delete(key);
  }
  
  getRemainingTime(key) {
    const userAttempts = this.attempts.get(key) || [];
    if (userAttempts.length === 0) return 0;
    
    const oldestAttempt = Math.min(...userAttempts);
    const timeElapsed = Date.now() - oldestAttempt;
    const remaining = this.windowMs - timeElapsed;
    
    return Math.max(0, remaining);
  }
}

// Create rate limiters for different operations
const rateLimiters = {
  login: new RateLimiter(5, 15 * 60 * 1000), // 5 attempts per 15 minutes
  formSubmit: new RateLimiter(10, 60 * 1000), // 10 submissions per minute
  imageUpload: new RateLimiter(5, 60 * 1000), // 5 uploads per minute
  analyticsRefresh: new RateLimiter(3, 60 * 60 * 1000), // 3 refreshes per hour
};

/**
 * Check rate limit
 */
function checkRateLimit(action, identifier) {
  const limiter = rateLimiters[action];
  
  if (!limiter) {
    console.warn(`No rate limiter for action: ${action}`);
    return true;
  }
  
  if (!limiter.isAllowed(identifier)) {
    const remainingMs = limiter.getRemainingTime(identifier);
    const remainingMin = Math.ceil(remainingMs / 60000);
    throw new Error(`Too many attempts. Please try again in ${remainingMin} minute(s).`);
  }
  
  return true;
}

// ══════════════════════════════════════════════════════════════
// 3. FILE UPLOAD VALIDATION
// ══════════════════════════════════════════════════════════════

/**
 * Validate image file
 */
function validateImageFile(file) {
  // Check if file exists
  if (!file) {
    throw new Error('No file selected');
  }
  
  // Check file type
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Only JPEG, PNG, GIF, and WebP images are allowed');
  }
  
  // Check file size (5MB max)
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error('Image must be less than 5MB');
  }
  
  // Check file name
  const fileName = file.name;
  if (fileName.length > 255) {
    throw new Error('File name too long');
  }
  
  // Check for dangerous file extensions in name
  const dangerousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.php', '.js'];
  const lowerName = fileName.toLowerCase();
  for (const ext of dangerousExtensions) {
    if (lowerName.includes(ext)) {
      throw new Error('Invalid file name');
    }
  }
  
  return true;
}

/**
 * Validate image dimensions (optional, requires loading image)
 */
async function validateImageDimensions(file, maxWidth = 4096, maxHeight = 4096) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      if (img.width > maxWidth || img.height > maxHeight) {
        reject(new Error(`Image dimensions must be less than ${maxWidth}x${maxHeight}px`));
      } else {
        resolve(true);
      }
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Invalid image file'));
    };
    
    img.src = url;
  });
}

// ══════════════════════════════════════════════════════════════
// 4. FIRESTORE QUERY SAFETY
// ══════════════════════════════════════════════════════════════

/**
 * Safe Firestore query builder
 */
function safeFirestoreQuery(collection, field, operator, value) {
  // Validate field name (prevent injection)
  const allowedFields = [
    'name', 'type', 'user_id', 'user_email', 'status', 
    'is_premium', 'created_at', 'approved_at'
  ];
  
  if (!allowedFields.includes(field)) {
    throw new Error('Invalid query field');
  }
  
  // Validate operator
  const allowedOperators = ['==', '!=', '<', '<=', '>', '>=', 'array-contains', 'in', 'array-contains-any'];
  if (!allowedOperators.includes(operator)) {
    throw new Error('Invalid query operator');
  }
  
  // Sanitize value based on field type
  let sanitizedValue = value;
  
  if (field === 'user_email') {
    sanitizedValue = sanitizeEmail(value);
  } else if (typeof value === 'string') {
    sanitizedValue = sanitizeText(value, 500);
  }
  
  return { field, operator, value: sanitizedValue };
}

// ══════════════════════════════════════════════════════════════
// 5. CSRF PROTECTION
// ══════════════════════════════════════════════════════════════

/**
 * Generate CSRF token
 */
function generateCSRFToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Set CSRF token
 */
function setCSRFToken() {
  const token = generateCSRFToken();
  sessionStorage.setItem('csrf_token', token);
  return token;
}

/**
 * Get CSRF token
 */
function getCSRFToken() {
  let token = sessionStorage.getItem('csrf_token');
  if (!token) {
    token = setCSRFToken();
  }
  return token;
}

/**
 * Validate CSRF token
 */
function validateCSRFToken(token) {
  const storedToken = sessionStorage.getItem('csrf_token');
  return token && storedToken && token === storedToken;
}

// ══════════════════════════════════════════════════════════════
// 6. SECURE FORM SUBMISSION
// ══════════════════════════════════════════════════════════════

/**
 * Secure form data collection
 */
function getSecureFormData(formId, requiredFields = {}) {
  const form = document.getElementById(formId);
  if (!form) {
    throw new Error('Form not found');
  }
  
  const data = {};
  
  for (const [field, config] of Object.entries(requiredFields)) {
    const element = form.querySelector(`[name="${field}"]`);
    if (!element) {
      if (config.required) {
        throw new Error(`Required field missing: ${field}`);
      }
      continue;
    }
    
    let value = element.value.trim();
    
    // Sanitize based on type
    switch (config.type) {
      case 'email':
        value = sanitizeEmail(value);
        break;
      case 'url':
        value = sanitizeURL(value);
        break;
      case 'phone':
        value = sanitizePhone(value);
        break;
      case 'html':
        value = sanitizeHTML(value);
        break;
      default:
        value = sanitizeText(value, config.maxLength || 1000);
    }
    
    // Validate if required
    if (config.required && !value) {
      throw new Error(`${field} is required`);
    }
    
    data[field] = value;
  }
  
  return data;
}

// ══════════════════════════════════════════════════════════════
// 7. SECURE STORAGE OPERATIONS
// ══════════════════════════════════════════════════════════════

/**
 * Safe localStorage set
 */
function safeLocalStorageSet(key, value) {
  try {
    // Validate key
    if (typeof key !== 'string' || key.length > 100) {
      throw new Error('Invalid storage key');
    }
    
    // Sanitize value
    let sanitizedValue = value;
    if (typeof value === 'object') {
      sanitizedValue = JSON.stringify(value);
    } else {
      sanitizedValue = sanitizeText(String(value), 10000);
    }
    
    localStorage.setItem(key, sanitizedValue);
  } catch (error) {
    console.error('LocalStorage error:', error);
  }
}

/**
 * Safe localStorage get
 */
function safeLocalStorageGet(key, parseJSON = false) {
  try {
    const value = localStorage.getItem(key);
    if (!value) return null;
    
    if (parseJSON) {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    
    return value;
  } catch (error) {
    console.error('LocalStorage error:', error);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// EXPORT SECURITY MODULE
// ══════════════════════════════════════════════════════════════

window.security = {
  // Sanitization
  sanitizeHTML,
  sanitizeText,
  sanitizeEmail,
  sanitizeURL,
  sanitizePhone,
  
  // Rate limiting
  checkRateLimit,
  rateLimiters,
  
  // File validation
  validateImageFile,
  validateImageDimensions,
  
  // Firestore safety
  safeFirestoreQuery,
  
  // CSRF protection
  generateCSRFToken,
  setCSRFToken,
  getCSRFToken,
  validateCSRFToken,
  
  // Form handling
  getSecureFormData,
  
  // Storage
  safeLocalStorageSet,
  safeLocalStorageGet
};

console.log('✓ Security module loaded');
