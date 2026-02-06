const POPUP_DEFAULT_SETTINGS = {
  focusTopics: []
};

function openOptionsPage() {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    const url = chrome.runtime.getURL('options.html');
    chrome.tabs.create({ url });
  }
}

function renderTopics(topics, existingTopics) {
  const container = document.getElementById('topicsContainer');
  const statusEl = document.getElementById('topicsStatus');
  const addBtn = document.getElementById('addTopics');

  container.innerHTML = '';

  if (!topics || topics.length === 0) {
    statusEl.textContent = 'No topics found on this page.';
    addBtn.disabled = true;
    return;
  }

  statusEl.textContent = 'Select topics to add to your focus list:';

  const existingSet = new Set((existingTopics || []).map((t) => t.toLowerCase()));

  topics.forEach((topic, index) => {
    const alreadyExists = existingSet.has(topic.toLowerCase());
    const wrapper = document.createElement('label');
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.fontSize = '13px';
    wrapper.style.marginBottom = '4px';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = topic;
    checkbox.style.marginRight = '6px';

    // Pre-check top few non-existing topics
    if (!alreadyExists && index < 5) {
      checkbox.checked = true;
    }

    const text = document.createElement('span');
    text.textContent = alreadyExists ? `${topic} (already in focus)` : topic;

    wrapper.appendChild(checkbox);
    wrapper.appendChild(text);
    container.appendChild(wrapper);
  });

  function updateAddButtonState() {
    const anyChecked = container.querySelector('input[type="checkbox"]:checked') !== null;
    addBtn.disabled = !anyChecked;
  }

  container.addEventListener('change', updateAddButtonState);
  updateAddButtonState();
}

function extractTopicsFromPage() {
  try {
    // Define stopwords inside the page context so this function
    // does not depend on any extension-side closures.
    const stopwords = new Set([
      'the','and','for','with','that','this','from','have','your','you','are','was','were','will','would','there','their',
      'about','into','over','under','been','than','then','them','they','our','out','one','two','three','more','less',
      'can','could','should','shall','might','must','not','but','just','like','also','very','such','when','what','which',
      'who','how','why','where'
    ]);

    const title = document.title || '';
    const bodyText = document.body ? document.body.innerText || '' : '';
    const combined = (title + ' ' + bodyText).toLowerCase();

    const tokens = combined.split(/[^a-zA-Z]+/).filter((t) => t.length >= 4 && !stopwords.has(t));

    const freq = {};
    for (const token of tokens) {
      freq[token] = (freq[token] || 0) + 1;
    }

    const entries = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([word]) => word);

    return entries;
  } catch (e) {
    return [];
  }
}

function initPopup() {
  const addBtn = document.getElementById('addTopics');
  const statusEl = document.getElementById('topicsStatus');

  document.getElementById('openOptions').addEventListener('click', openOptionsPage);

  addBtn.disabled = true;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs && tabs[0];
    if (!activeTab) {
      statusEl.textContent = 'No active tab found.';
      return;
    }

    const url = activeTab.url || '';
    if (
      url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('edge://') ||
      url.startsWith('about:') ||
      url.startsWith('devtools://')
    ) {
      statusEl.textContent = 'Cannot extract topics from this type of page.';
      return;
    }

    chrome.storage.sync.get(POPUP_DEFAULT_SETTINGS, (items) => {
      const existingTopics = items.focusTopics || [];

      chrome.scripting.executeScript(
        {
          target: { tabId: activeTab.id },
          func: extractTopicsFromPage
        },
        (results) => {
          if (chrome.runtime.lastError) {
            statusEl.textContent = 'Unable to read this page content.';
            return;
          }

          if (!results || !results.length || !Array.isArray(results[0].result)) {
            statusEl.textContent = 'No topics found on this page.';
            return;
          }

          const topics = results[0].result;
          renderTopics(topics, existingTopics);
        }
      );

      addBtn.addEventListener('click', () => {
        const container = document.getElementById('topicsContainer');
        const checkboxes = Array.from(
          container.querySelectorAll('input[type=\"checkbox\"]')
        );
        const selected = checkboxes
          .filter((cb) => cb.checked)
          .map((cb) => (cb.value || '').trim())
          .filter((t) => t.length > 0);

        if (selected.length === 0) {
          return;
        }

        const current = items.focusTopics || [];
        const currentSet = new Set(current.map((t) => t.toLowerCase()));
        const actuallyAdded = [];

        selected.forEach((topic) => {
          const lower = topic.toLowerCase();
          if (!currentSet.has(lower)) {
            currentSet.add(lower);
            actuallyAdded.push(topic);
          }
        });

        const mergedTopics = Array.from(currentSet);

        if (actuallyAdded.length === 0) {
          statusEl.textContent = 'All selected topics are already in your focus list.';
          return;
        }

        addBtn.disabled = true;
        statusEl.textContent = 'Adding topics...';

        chrome.storage.sync.set(
          {
            focusTopics: mergedTopics
          },
          () => {
            if (chrome.runtime.lastError) {
              statusEl.textContent = 'Error saving topics.';
              return;
            }

            statusEl.textContent = 'Topics added to your focus list.';
            chrome.runtime.sendMessage({
              type: 'topicsAdded',
              addedTopics: actuallyAdded
            });
          }
        );
      });
    });
  });
}

document.addEventListener('DOMContentLoaded', initPopup);
