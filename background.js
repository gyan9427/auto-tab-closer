console.log('Auto Tab Closer (AI-enhanced) service worker running updated');

// Base inactivity timeout (also used as default in settings)
const TAB_TIMEOUT_MS = 1 * 20 * 1000; // 15 minutes
const CHECK_INTERVALS_MS = 10 * 1000; // 1 minute

// In-memory tracking of last-active timestamps per tab
let tabActivity = {};

// ---- Settings storage ------------------------------------------------------

const DEFAULT_SETTINGS = {
  // Keywords/phrases that describe the user's current focus
  focusTopics: [],
  // Time before a tab is eligible for AI-based closing
  maxInactiveMs: TAB_TIMEOUT_MS,
  // Score in [0,1]; below this, tabs are considered off-topic and can be closed
  relevanceThreshold: 0.2
};

let cachedSettings = { ...DEFAULT_SETTINGS };

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
      cachedSettings = {
        ...DEFAULT_SETTINGS,
        ...items
      };
      resolve(cachedSettings);
    });
  });
}

// Keep cachedSettings in sync if options change
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') return;
  let updated = false;
  Object.keys(changes).forEach((key) => {
    if (key in DEFAULT_SETTINGS) {
      cachedSettings[key] = changes[key].newValue;
      updated = true;
    }
  });
  if (updated) {
    console.log('Settings updated:', cachedSettings);
  }
});

// Load initial settings at startup
loadSettings();

// ---- Tab activity tracking -------------------------------------------------

// When a tab is activated
chrome.tabs.onActivated.addListener(({ tabId }) => {
  console.log(`[1] Tab ${tabId} ACTIVATED at`, new Date().toLocaleTimeString());
  tabActivity[tabId] = Date.now();
  logTabStatus();
});

// When a tab is updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.status === 'complete') {
    console.log(`[2] Tab ${tabId} UPDATED and ACTIVE at`, new Date().toLocaleTimeString());
    tabActivity[tabId] = Date.now();
    logTabStatus();
  }
});

// When a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log(`[3] Tab ${tabId} REMOVED/CLOSED`);
  delete tabActivity[tabId];
  logTabStatus();
});

// ---- Helper function to display tab status --------------------------------

function logTabStatus() {
  chrome.tabs.query({}, (allTabs) => {
    const activeTabs = allTabs.filter(t => t.active);
    const inactiveTabs = allTabs.filter(t => !t.active);
    
    console.log('═════════════════════════════════════════════════════');
    console.log(`📊 TAB STATUS REPORT (${new Date().toLocaleTimeString()})`);
    console.log(`✓ ACTIVE TABS (${activeTabs.length}):`);
    activeTabs.forEach(tab => {
      const lastActive = tabActivity[tab.id] ? Math.round((Date.now() - tabActivity[tab.id]) / 1000) : 'N/A';
      console.log(`  └─ [ID: ${tab.id}] "${tab.title}" | Inactive for: ${lastActive}s`);
    });
    
    console.log(`✗ INACTIVE TABS (${inactiveTabs.length}):`);
    inactiveTabs.forEach(tab => {
      const lastActive = tabActivity[tab.id] ? Math.round((Date.now() - tabActivity[tab.id]) / 1000) : 'N/A';
      console.log(`  └─ [ID: ${tab.id}] "${tab.title}" | Inactive for: ${lastActive}s`);
    });
    console.log('═════════════════════════════════════════════════════');
  });
}

// ---- Content extraction helper --------------------------------------------

/**
 * Safely extract lightweight content from a tab.
 * Returns an object with title, url, and a truncated text snippet.
 */
function getTabContent(tabId) {
  return new Promise((resolve) => {
    // First, ensure the tab still exists and is not a restricted URL.
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        console.warn('Could not get tab info for content extraction', tabId, chrome.runtime.lastError);
        return resolve(null);
      }

      const url = tab.url || '';
      // Skip Chrome internal pages and similar restricted schemes
      if (
        url.startsWith('chrome://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('edge://') ||
        url.startsWith('about:') ||
        url.startsWith('devtools://')
      ) {
        console.log('Skipping content extraction for restricted URL', url);
        return resolve(null);
      }

      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: () => {
            try {
              const title = document.title || '';
              const url = document.location ? document.location.href : '';
              const bodyText = document.body ? document.body.innerText || '' : '';
              const maxLen = 8000;
              const snippet = bodyText.length > maxLen ? bodyText.slice(0, maxLen) : bodyText;
              return { title, url, text: snippet };
            } catch (e) {
              return { title: document.title || '', url: '', text: '' };
            }
          }
        },
        (results) => {
          if (chrome.runtime.lastError || !results || !results.length) {
            console.warn('Content script execution failed for tab', tabId, chrome.runtime.lastError);
            return resolve(null);
          }
          const result = results[0].result;
          resolve(result || null);
        }
      );
    });
  });
}

// ---- Local heuristic relevance model --------------------------------------

/**
 * Compute a simple relevance score in [0,1] between tab content and focus topics.
 * More matches of focus topic keywords in title/body -> higher score.
 */
function getRelevanceScore(tabContent, settings) {
  console.log('[5] Computing relevance score for tab content with settings', settings);
  console.log('[5.1] Tab content title:', tabContent && tabContent.title);
  const { focusTopics, relevanceThreshold } = settings || cachedSettings;

  if (!tabContent || !tabContent.text) {
    console.log('[5.2] ⚠️ No readable content for this tab');
    return {
      score: 0,
      reason: 'No readable content'
    };
  }

  if (!focusTopics || focusTopics.length === 0) {
    console.log('[5.3] ⚠️ No focus topics configured; treating as relevant');
    return {
      score: 1,
      reason: 'No focus topics configured; treating as relevant'
    };
  }

  const text = (tabContent.title + ' ' + tabContent.text).toLowerCase();

  // Clean topics and drop empties
  const topics = focusTopics
    .map((t) => (t || '').trim().toLowerCase())
    .filter((t) => t.length > 0);

  if (topics.length === 0) {
    return {
      score: 1,
      reason: 'No valid (non-empty) focus topics configured; treating as relevant'
    };
  }

  let matchedTopics = 0;
  const matchedDetails = [];

  topics.forEach((topic) => {
    if (text.indexOf(topic) !== -1) {
      matchedTopics += 1;
      matchedDetails.push(topic);
    }
  });

  if (matchedTopics === 0) {
    console.log('[5.4] No focus topics found in tab content');
    return {
      score: 0,
      reason: 'No focus topics found in tab content'
    };
  }

  // If ALL topics are present at least once, give maximum score
  let score;
  if (matchedTopics === topics.length) {
    score = 1;
  } else {
    // Otherwise, score is fraction of topics that appear
    score = matchedTopics / topics.length;
  }

  console.log(
    `[5.5] Relevance computed: score=${score.toFixed(
      2
    )}, topics matched=(${matchedDetails.join(', ')}), totalTopics=${topics.length}, threshold=${
      relevanceThreshold
    }`
  );

  return {
    score,
    reason: `Matched topics: (${matchedDetails.join(
      ', '
    )}), total topics=${topics.length}, threshold=${relevanceThreshold}`
  };
}

// ---- Inactivity + relevance-based auto-close loop -------------------------

async function processInactiveTabs() {
  console.log('\n[4] 🔄 PROCESS INACTIVE TABS CYCLE STARTED at', new Date().toLocaleTimeString());
  const now = Date.now();
  // Ensure we have up-to-date settings (lightweight call due to DEFAULT_SETTINGS)
  const settings = await loadSettings();
  console.log('[4.1] Settings loaded:', settings);

  // Query and display all current tabs
  const allTabs = await new Promise((resolve) => {
    chrome.tabs.query({}, resolve);
  });
  const activeTabs = allTabs.filter(t => t.active);
  const inactiveTabs = allTabs.filter(t => !t.active);
  
  console.log(`[4.2] 📋 CURRENT TAB DISTRIBUTION:`);
  console.log(`     └─ ACTIVE TABS: ${activeTabs.length}`);
  activeTabs.forEach(tab => {
    console.log(`        └─ [ID: ${tab.id}] "${tab.title}"`);
  });
  console.log(`     └─ INACTIVE TABS: ${inactiveTabs.length}`);
  inactiveTabs.forEach(tab => {
    const lastActive = tabActivity[tab.id] ? Math.round((now - tabActivity[tab.id]) / 1000) : 'N/A';
    console.log(`        └─ [ID: ${tab.id}] "${tab.title}" | Inactive: ${lastActive}s`);
  });

  let tabIndex = 0;
  for (const tabIdStr in tabActivity) {
    tabIndex++;
    const tabId = parseInt(tabIdStr, 10);
    const lastActive = tabActivity[tabIdStr];
    const timeDiff = now - lastActive;
    const timeInactiveSeconds = Math.round(timeDiff / 1000);

    console.log(`\n[4.3.${tabIndex}] 🔍 CHECKING TAB ID: ${tabId}`);
    console.log(`     └─ Inactive for: ${timeInactiveSeconds}s | Max allowed: ${Math.round(settings.maxInactiveMs / 1000)}s`);

    if (timeDiff < settings.maxInactiveMs) {
      console.log(`     └─ ✅ Still within inactivity threshold, SKIPPING`);
      continue;
    }

    console.log(`     └─ ⚠️  Exceeds inactivity threshold, ANALYZING FURTHER`);

    // Ensure tab still exists and is not active
    const tab = await new Promise((resolve) => {
      chrome.tabs.get(tabId, (t) => {
        if (chrome.runtime.lastError || !t) {
          return resolve(null);
        }
        resolve(t);
      });
    });

    if (!tab) {
      console.log(`     └─ ❌ Tab no longer exists; CLEANING UP`);
      delete tabActivity[tabIdStr];
      continue;
    }

    if (tab.active) {
      // Do not auto-close currently focused tabs
      console.log(`     └─ 🟢 Tab is CURRENTLY ACTIVE; RESETTING timer and SKIPPING`);
      tabActivity[tabIdStr] = Date.now();
      continue;
    }

    console.log(`     └─ Tab title: "${tab.title}"`);
    console.log(`     └─ Tab URL: "${tab.url}"`);

    // Extract content and compute relevance
    console.log(`[4.3.${tabIndex}.A] 📄 Extracting tab content...`);
    const content = await getTabContent(tabId);
    if (!content) {
      console.log(`[4.3.${tabIndex}.A] ❌ Could not extract content; SKIPPING tab`);
      continue;
    }
    console.log(`[4.3.${tabIndex}.A] ✅ Content extracted successfully`);

    console.log(`[4.3.${tabIndex}.B] 📊 Computing relevance score...`);
    const relevance = getRelevanceScore(content, settings);
    console.log(`[4.3.${tabIndex}.B] Result: Score=${relevance.score.toFixed(2)} | Threshold=${settings.relevanceThreshold} | Reason: ${relevance.reason}`);

    if (relevance.score < settings.relevanceThreshold) {
      console.log(`[4.3.${tabIndex}.C] 🚨 DECISION: Score (${relevance.score.toFixed(2)}) < Threshold (${settings.relevanceThreshold}) → CLOSING TAB`);
      chrome.tabs.remove(tabId, () => {
        if (chrome.runtime.lastError) {
          console.warn(`     └─ ❌ Failed to close tab:`, chrome.runtime.lastError);
        } else {
          console.log(`     └─ ✅ Tab closed successfully`);
        }
      });
      delete tabActivity[tabIdStr];
    } else {
      console.log(`[4.3.${tabIndex}.C] ✅ DECISION: Score (${relevance.score.toFixed(2)}) >= Threshold (${settings.relevanceThreshold}) → KEEPING TAB (RELEVANT)`);
    }
  }

  console.log('\n[4.4] 🔄 PROCESS CYCLE COMPLETED\n');
}

// Periodically check for inactive + off-topic tabs
setInterval(() => {
  processInactiveTabs().catch((err) => {
    console.error('Error while processing inactive tabs', err);
  });
}, CHECK_INTERVALS_MS);