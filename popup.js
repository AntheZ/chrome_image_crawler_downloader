let totalScannedPages = 0;
let totalFoundImages = 0;

document.getElementById('startScanning').addEventListener('click', async () => {
  try {
    const settings = await chrome.storage.sync.get(['depth', 'pageSize', 'minSize', 'savePath']);
    
    // Перевіряємо наявність всіх необхідних налаштувань
    if (!settings.depth || !settings.pageSize || !settings.minSize || !settings.savePath) {
      document.getElementById('status').textContent = 'Помилка: Не всі налаштування задані';
      return;
    }

    // Очищаємо попередні результати
    await chrome.storage.local.remove(['foundImages']);
    totalScannedPages = 0;
    totalFoundImages = 0;
    
    document.getElementById('status').textContent = 'Сканування...';
    
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    await scanPage(tabs[0].id, settings.depth);
    
    document.getElementById('status').textContent = 'Сканування завершено';
  } catch (error) {
    document.getElementById('status').textContent = `Помилка: ${error.message}`;
  }
});

document.getElementById('saveImages').addEventListener('click', async () => {
  try {
    const settings = await chrome.storage.sync.get(['savePath']);
    const images = await chrome.storage.local.get(['foundImages']);
    
    if (!images.foundImages || images.foundImages.length === 0) {
      document.getElementById('status').textContent = 'Немає зображень для збереження';
      return;
    }

    const progress = document.getElementById('progress');
    const status = document.getElementById('status');
    
    for (let i = 0; i < images.foundImages.length; i++) {
      status.textContent = `Збереження ${i + 1} з ${images.foundImages.length}`;
      progress.style.width = `${((i + 1) / images.foundImages.length) * 100}%`;
      await downloadAndConvertImage(images.foundImages[i], settings.savePath);
    }
    
    status.textContent = 'Збереження завершено';
  } catch (error) {
    document.getElementById('status').textContent = `Помилка: ${error.message}`;
  }
});

function updatePreview(pages, images) {
  document.getElementById('pagesScanned').textContent = `Відкрито сторінок: ${pages}`;
  document.getElementById('imagesFound').textContent = `Знайдено зображень: ${images}`;
}

async function scanPage(tabId, depth) {
  totalScannedPages++;
  const images = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    function: getPageImages
  });

  const uniqueImages = new Set(images[0].result.map(img => img.src));
  totalFoundImages += uniqueImages.size;
  updatePreview(totalScannedPages, totalFoundImages);

  if (depth > 0) {
    const links = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      function: getPageLinks
    });

    for (let link of links[0].result) {
      if (depth > 0) {
        const newTab = await chrome.tabs.create({ url: link, active: false });
        await scanPage(newTab.id, depth - 1);
        chrome.tabs.remove(newTab.id);
      }
    }
  }
}
