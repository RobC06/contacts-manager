// Background service worker for Chrome extension

// Listen for messages from popup to open side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openSidePanel') {
    chrome.sidePanel.open({ windowId: sender.tab.windowId });
  }
});

// You can add additional background tasks here if needed
