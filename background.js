
// Service Worker for Chrome Extension
let imageDataStore = new Map();

// Create context menu when extension starts
chrome.runtime.onStartup.addListener(createContextMenu);
chrome.runtime.onInstalled.addListener(createContextMenu);

function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "send-to-brightness-tool",
      title: "Send to Brightness Tool",
      contexts: ["image"]
    });
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "send-to-brightness-tool" && info.srcUrl) {
    try {
      console.log('Context menu clicked, fetching image:', info.srcUrl);
      
      // Fetch the image data
      const response = await fetch(info.srcUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      
      const blob = await response.blob();
      
      // Convert to base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      
      // Store image data with a unique key
      const imageKey = Date.now().toString();
      imageDataStore.set(imageKey, {
        base64: base64,
        sourceTabId: tab.id,
        timestamp: Date.now()
      });
      
      // Clean up old entries (older than 1 hour)
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      for (const [key, value] of imageDataStore.entries()) {
        if (value.timestamp < oneHourAgo) {
          imageDataStore.delete(key);
        }
      }
      
      // Open tool page
      const toolUrl = chrome.runtime.getURL(`tool.html?imageKey=${imageKey}&fromTab=${tab.id}`);
      chrome.tabs.create({ url: toolUrl });
      
    } catch (error) {
      console.error('Error processing image:', error);
    }
  }
});

// Handle messages from tool page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ready' && message.imageKey) {
    console.log('Tool page ready, sending image data');
    const imageData = imageDataStore.get(message.imageKey);
    
    if (imageData) {
      sendResponse({
        success: true,
        base64: imageData.base64,
        sourceTabId: imageData.sourceTabId
      });
      // Clean up after sending
      imageDataStore.delete(message.imageKey);
    } else {
      sendResponse({
        success: false,
        error: 'Image data not found or expired'
      });
    }
  }
  
  if (message.type === 'focusTab' && message.tabId) {
    chrome.tabs.update(message.tabId, { active: true }).catch(console.error);
    sendResponse({ success: true });
  }
  
  return true; // Keep message channel open for async response
});
