window.APP_CONFIG = window.APP_CONFIG || {};
window.APP_CONFIG.apiBaseUrl = (window.APP_CONFIG.apiBaseUrl || '').replace(/\/$/, '');
window.apiUrl = function apiUrl(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${window.APP_CONFIG.apiBaseUrl}${normalized}`;
};
