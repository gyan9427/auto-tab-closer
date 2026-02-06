document.getElementById('openOptions').addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    // fallback: open options.html directly
    const url = chrome.runtime.getURL('options.html');
    chrome.tabs.create({ url });
  }
});
