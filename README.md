## Auto Tab Closer

Auto Tab Closer is a simple Chrome extension that **automatically closes inactive tabs after 15 minutes**.  
It runs in the background and periodically checks when each tab was last active, closing any that have been idle for too long.

### How it works

- **Background service worker**:  
  The extension uses `background.js` as a Manifest V3 service worker.
- **Activity tracking**:  
  - Listens to `chrome.tabs.onActivated` to record when a tab becomes active.  
  - Listens to `chrome.tabs.onUpdated` to refresh the last-active timestamp when an active tab finishes loading.  
  - Removes entries from its internal map when a tab is closed (`chrome.tabs.onRemoved`).
- **Auto-closing logic**:  
  - Every minute (`CHECK_INTERVALS_MS = 60 * 1000`), a timer iterates over tracked tabs.  
  - If a tab has been inactive longer than `TAB_TIMEOUT_MS` (15 minutes), it calls `chrome.tabs.remove` to close that tab.

### Requirements & Permissions

- **Manifest version**: 3  
- **Permissions**:  
  - `tabs` – required to read tab info and programmatically close tabs.

### Installation (Developer Mode)

1. **Download or clone** this repository to your machine.  
2. Open Chrome and go to `chrome://extensions/`.  
3. Toggle **Developer mode** on (top-right corner).  
4. Click **"Load unpacked"**.  
5. Select the `auto-tab-closer` folder (the one containing `manifest.json`).  
6. The extension should now appear in your extensions list.

### Usage

- Once loaded, the extension **works automatically** in the background.  
- Keep using Chrome as usual:
  - When you switch tabs, the extension updates the "last active" time for the new tab.  
  - If a tab remains inactive for more than 15 minutes, it will be closed automatically.
- You can view debug logs via:
  1. `chrome://extensions/`  
  2. Find **Auto Tab Closer** → click **"Service worker"** link under "Inspect views" to open the console.  
  3. Watch log messages like activation, updates, and closing decisions.

### Customizing the timeout (optional)

If you want a different inactivity timeout:

1. Open `background.js`.  
2. Find the `TAB_TIMEOUT_MS` constant.  
3. Change the value, for example:

```javascript
// 30 minutes
const TAB_TIMEOUT_MS = 30 * 60 * 1000;
```

4. Go back to `chrome://extensions/`, click the **refresh** (reload) icon on Auto Tab Closer to apply changes.

### Known limitations / notes

- The extension only tracks tabs **after it has been installed and activated**.  
- Very recently created tabs may not be closed until they have been activated or fully loaded.  
- There is currently no options UI; configuration (like timeout) must be changed directly in `background.js`.
