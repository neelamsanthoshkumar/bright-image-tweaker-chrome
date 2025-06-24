
// Service Worker for Chrome Extension
let imageDataStore = new Map();
let toolTabId = null; // Track the existing tool tab

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
      
      // Check if tool tab exists and is still valid
      let shouldCreateNewTab = true;
      
      if (toolTabId) {
        try {
          const existingTab = await chrome.tabs.get(toolTabId);
          if (existingTab && existingTab.url && existingTab.url.includes('tool.html')) {
            console.log('Tool tab exists, sending new image data to it');
            // Tool tab exists, send new image data to it
            await chrome.tabs.sendMessage(toolTabId, {
              type: 'loadNewImage',
              imageKey: imageKey,
              sourceTabId: tab.id
            });
            // Focus the existing tool tab
            await chrome.tabs.update(toolTabId, { active: true });
            shouldCreateNewTab = false;
            console.log('Reused existing tool tab');
          }
        } catch (error) {
          console.log('Tool tab no longer exists, will create new one:', error);
          // Tool tab doesn't exist anymore, reset the ID
          toolTabId = null;
        }
      }
      
      if (shouldCreateNewTab) {
        console.log('Creating new tool tab');
        // Open new tool page
        const toolUrl = chrome.runtime.getURL(`tool.html?imageKey=${imageKey}&fromTab=${tab.id}`);
        const newTab = await chrome.tabs.create({ url: toolUrl });
        toolTabId = newTab.id;
        console.log('Created new tool tab with ID:', toolTabId);
      }
      
    } catch (error) {
      console.error('Error processing image:', error);
    }
  }
});

// Handle messages from tool page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ready' && message.imageKey) {
    console.log('Tool page ready, sending image data for key:', message.imageKey);
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
  
  // Handle tab closing to reset toolTabId
  if (message.type === 'toolTabClosed') {
    toolTabId = null;
    sendResponse({ success: true });
  }
  
  return true; // Keep message channel open for async response
});

// Listen for tab removal to reset toolTabId if the tool tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === toolTabId) {
    console.log('Tool tab was closed, resetting toolTabId');
    toolTabId = null;
  }
});
