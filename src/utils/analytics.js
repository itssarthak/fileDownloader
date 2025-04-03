// Google Analytics Event Tracking Utility

// Initialize Google Analytics
export const initGA = (measurementId) => {
  if (typeof window.gtag === 'undefined') {
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', measurementId);
  }
};

// Track page views
export const trackPageView = (path) => {
  if (typeof window.gtag !== 'undefined') {
    window.gtag('event', 'page_view', {
      page_path: path,
      page_title: document.title,
      page_location: window.location.href,
    });
  }
};

// Track file upload events
export const trackFileUpload = (fileType, fileSize, success) => {
  if (typeof window.gtag !== 'undefined') {
    window.gtag('event', 'file_upload', {
      file_type: fileType,
      file_size: fileSize,
      success: success,
      timestamp: new Date().toISOString(),
    });
  }
};

// Track URL extraction events
export const trackUrlExtraction = (totalUrls, uniqueUrls) => {
  if (typeof window.gtag !== 'undefined') {
    window.gtag('event', 'url_extraction', {
      total_urls: totalUrls,
      unique_urls: uniqueUrls,
      timestamp: new Date().toISOString(),
    });
  }
};

// Track download events
export const trackDownload = (url, success, fileSize, downloadTime) => {
  if (typeof window.gtag !== 'undefined') {
    window.gtag('event', 'file_download', {
      url: url,
      success: success,
      file_size: fileSize,
      download_time: downloadTime,
      timestamp: new Date().toISOString(),
    });
  }
};

// Track batch download events
export const trackBatchDownload = (totalFiles, successCount, errorCount, useZip, totalTime) => {
  if (typeof window.gtag !== 'undefined') {
    window.gtag('event', 'batch_download', {
      total_files: totalFiles,
      success_count: successCount,
      error_count: errorCount,
      use_zip: useZip,
      total_time: totalTime,
      timestamp: new Date().toISOString(),
    });
  }
};

// Track error events
export const trackError = (errorType, errorMessage, context) => {
  if (typeof window.gtag !== 'undefined') {
    window.gtag('event', 'error', {
      error_type: errorType,
      error_message: errorMessage,
      context: context,
      timestamp: new Date().toISOString(),
    });
  }
};

// Track user interaction events
export const trackUserInteraction = (action, category, label) => {
  if (typeof window.gtag !== 'undefined') {
    window.gtag('event', 'user_interaction', {
      action: action,
      category: category,
      label: label,
      timestamp: new Date().toISOString(),
    });
  }
}; 