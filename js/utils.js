'use strict';

const Utils = (() => {
  // Cryptographically-sound ID generation (fixes audit bug #1 and #2)
  function generateId() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const arr = new Uint32Array(2);
      crypto.getRandomValues(arr);
      return `${Date.now().toString(36)}-${arr[0].toString(36)}-${arr[1].toString(36)}`;
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  // Returns 'YYYY-MM-DD' in LOCAL time (fixes audit bug #14 — was using UTC)
  function getDateKey(date) {
    const d = date instanceof Date ? date : new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatShortDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatMonthYear(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
  }

  function formatCurrencyShort(amount) {
    return '$' + Math.round(amount).toLocaleString('en-US');
  }

  // Validation helpers — each returns { valid: bool, error: string }
  function validateAmount(value) {
    const n = parseFloat(value);
    if (isNaN(n)) return { valid: false, error: 'Please enter a valid number.' };
    if (n < 0) return { valid: false, error: 'Amount cannot be negative.' };
    if (n > 10_000_000) return { valid: false, error: 'Amount seems too large.' };
    return { valid: true, error: '' };
  }

  function validatePositiveAmount(value) {
    const r = validateAmount(value);
    if (!r.valid) return r;
    if (parseFloat(value) === 0) return { valid: false, error: 'Amount must be greater than zero.' };
    return { valid: true, error: '' };
  }

  function validateDateString(value) {
    if (!value) return { valid: false, error: 'Please select a date.' };
    const d = new Date(value + 'T00:00:00');
    if (isNaN(d.getTime())) return { valid: false, error: 'Invalid date.' };
    return { valid: true, error: '' };
  }

  function validateText(value, label = 'Field', max = 200) {
    const s = (value || '').trim();
    if (!s) return { valid: false, error: `${label} is required.` };
    if (s.length > max) return { valid: false, error: `${label} must be ${max} characters or fewer.` };
    return { valid: true, error: '' };
  }

  function validatePercent(value) {
    const n = parseFloat(value);
    if (isNaN(n)) return { valid: false, error: 'Enter a percentage between 0 and 100.' };
    if (n < 0 || n > 100) return { valid: false, error: 'Percentage must be 0–100.' };
    return { valid: true, error: '' };
  }

  // Safely escape text for innerHTML to prevent XSS (fixes audit bug #12)
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Days in a month (fixes audit bug #10)
  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  // Normalize a date to midnight local time
  function toMidnight(date) {
    const d = date instanceof Date ? new Date(date) : new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // Check if two dates are the same calendar day
  function isSameDay(a, b) {
    return getDateKey(a) === getDateKey(b);
  }

  // Clamp a number between min and max
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  // Show a temporary toast notification
  function showToast(message, type = 'info') {
    const existing = document.getElementById('lt-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'lt-toast';
    toast.className = `lt-toast lt-toast--${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('lt-toast--visible'));
    setTimeout(() => {
      toast.classList.remove('lt-toast--visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Show a field-level validation error
  function showFieldError(inputEl, message) {
    clearFieldError(inputEl);
    const err = document.createElement('div');
    err.className = 'field-error';
    err.textContent = message;
    inputEl.parentNode.insertBefore(err, inputEl.nextSibling);
    inputEl.classList.add('input--error');
  }

  function clearFieldError(inputEl) {
    const existing = inputEl.parentNode.querySelector('.field-error');
    if (existing) existing.remove();
    inputEl.classList.remove('input--error');
  }

  function clearAllFieldErrors(containerEl) {
    containerEl.querySelectorAll('.field-error').forEach(el => el.remove());
    containerEl.querySelectorAll('.input--error').forEach(el => el.classList.remove('input--error'));
  }

  return {
    generateId,
    getDateKey,
    formatDate,
    formatShortDate,
    formatMonthYear,
    formatCurrency,
    formatCurrencyShort,
    validateAmount,
    validatePositiveAmount,
    validateDateString,
    validateText,
    validatePercent,
    escapeHtml,
    daysInMonth,
    toMidnight,
    isSameDay,
    clamp,
    showToast,
    showFieldError,
    clearFieldError,
    clearAllFieldErrors,
  };
})();
