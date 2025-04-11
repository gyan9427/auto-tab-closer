const TAB_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes
const CHECK_INTERVALS_MS = 60 * 1000 // 1 minutes

let tabActivity = {};

// Set a default timeout for user inactivity
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if(request.type === "setTimeout"){
        userTimeout = request.timeout * 60 * 1000; // convert to milliseconds
        console.log(`User timeout set to ${userTimeout} ms`);
    }
});

//when a tab is activated
chrome.tabs.onActivated.addListener(({ tabId }) => {
    chrome.tabs.get(tabId, (tab) => {
      if (!tab || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
        console.warn("Skipping tab with unsupported URL:", tab.url);
        return;
      }
  
      chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
      });
  
      tabActivity[tabId] = Date.now();
    });
  });

//when a tab is updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab)=>{
    if(tab.active && changeInfo.status === 'complete'){
        console.log(`Tab ${tabId} updated and active at`, new Date().toLocaleTimeString());
        tabActivity[tabId] = Date.now();
    }
});

//when a tab is closed
chrome.tabs.onRemoved.addListener((tabId)=>{
    delete tabActivity[tabId];
})

// Every minute, check for inactive tabs
setInterval(() => {
    const now = Date.now();
    for (const tabId in tabActivity) {
      if (now - tabActivity[tabId] > userTimeout) {
        chrome.tabs.remove(parseInt(tabId), () => {
          if (chrome.runtime.lastError) {
            console.warn("Error closing tab:", chrome.runtime.lastError.message);
          }
        });
        delete tabActivity[tabId];
      }
    }
  }, 60000);