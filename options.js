const DEFAULT_SETTINGS = {
  focusTopics: [],
  maxInactiveMs: 15 * 60 * 1000,
  relevanceThreshold: 0.2
};

function loadOptions() {
  const focusEl = document.getElementById('focusTopics');
  const minutesEl = document.getElementById('maxInactiveMinutes');
  const thresholdEl = document.getElementById('relevanceThreshold');

  chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
    const focusTopics = items.focusTopics || [];
    focusEl.value = focusTopics.join('\n');

    const mins = Math.round((items.maxInactiveMs || DEFAULT_SETTINGS.maxInactiveMs) / (60 * 1000));
    minutesEl.value = String(mins);

    thresholdEl.value = String(
      typeof items.relevanceThreshold === 'number'
        ? items.relevanceThreshold
        : DEFAULT_SETTINGS.relevanceThreshold
    );
  });
}

function saveOptions() {
  const focusEl = document.getElementById('focusTopics');
  const minutesEl = document.getElementById('maxInactiveMinutes');
  const thresholdEl = document.getElementById('relevanceThreshold');
  const statusEl = document.getElementById('status');
  const saveBtn = document.getElementById('save');

  const topicsRaw = focusEl.value || '';
  const focusTopics = topicsRaw
    .split('\n')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  let mins = parseInt(minutesEl.value, 10);
  if (!Number.isFinite(mins) || mins <= 0) {
    mins = 15;
  }
  const maxInactiveMs = mins * 60 * 1000;

  let threshold = parseFloat(thresholdEl.value);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    threshold = DEFAULT_SETTINGS.relevanceThreshold;
  }

  saveBtn.disabled = true;
  statusEl.textContent = 'Saving...';

  chrome.storage.sync.set(
    {
      focusTopics,
      maxInactiveMs,
      relevanceThreshold: threshold
    },
    () => {
      saveBtn.disabled = false;
      if (chrome.runtime.lastError) {
        statusEl.textContent = 'Error saving settings.';
        statusEl.style.color = '#d93025';
      } else {
        statusEl.textContent = 'Settings saved.';
        statusEl.style.color = '#188038';
        setTimeout(() => {
          statusEl.textContent = '';
        }, 2000);
      }
    }
  );
}

document.addEventListener('DOMContentLoaded', () => {
  loadOptions();
  document.getElementById('save').addEventListener('click', saveOptions);
});

