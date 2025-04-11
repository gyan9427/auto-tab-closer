console.log('Extension is running!');
const TAB_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes
const CHECK_INTERVALS_MS = 60 * 1000 // 1 minutes

let tabActivity = {};

//when a tab is activated
chrome.tabs.onActivated.addListener(({tabId})=>{
    console.log(`Tab ${tabId} activated at`, new Date().toLocaleTimeString());
    tabActivity[tabId] = Date.now();
})

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
    for (let tabId in tabActivity) {
      const timeDiff = now - tabActivity[tabId];
      console.log(`Checking tab ${tabId}, inactive for ${Math.round(timeDiff / 1000)} seconds`);
      if (timeDiff > TAB_TIMEOUT_MS) {
        console.log(`Closing tab ${tabId}`);
        chrome.tabs.remove(parseInt(tabId));
        delete tabActivity[tabId];
      }
    }
  }, CHECK_INTERVALS_MS);