let currentTab;

chrome.storage.local.get(['currentTab'], function(result) {
  currentTab = result.currentTab;
});

document.getElementById('startCrawling').addEventListener('click', async () => {
  if (currentTab) {
    document.getElementById('startCrawling').disabled = true;
    document.getElementById('stopCrawling').disabled = false;
    await chrome.runtime.sendMessage({
      type: 'START_CRAWLING',
      url: currentTab.url
    });
  }
});

document.getElementById('stopCrawling').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'STOP_CRAWLING' });
  document.getElementById('startCrawling').disabled = false;
  document.getElementById('stopCrawling').disabled = true;
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATS_UPDATE') {
    document.getElementById('pagesScanned').textContent = `Оброблено сторінок: ${message.data.pages}`;
    document.getElementById('imagesFound').textContent = `Збережено зображень: ${message.data.images}`;
    document.getElementById('duplicatesFound').textContent = `Пропущено дублів: ${message.data.duplicates}`;
  }
});
