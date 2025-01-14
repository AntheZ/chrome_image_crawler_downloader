// Завантаження збережених налаштувань при відкритті popup
document.addEventListener('DOMContentLoaded', async () => {
  const settings = await chrome.storage.sync.get(['depth', 'pageSize', 'minSize', 'savePath']);
  document.getElementById('depth').value = settings.depth || 0;
  document.getElementById('pageSize').value = settings.pageSize || 1;
  document.getElementById('minSize').value = settings.minSize || 500;
  document.getElementById('savePath').value = settings.savePath || 'downloads/images';
});

// Обробник збереження налаштувань
document.getElementById('saveOptions').addEventListener('click', () => {
  const depth = document.getElementById('depth').value;
  const pageSize = document.getElementById('pageSize').value;
  const minSize = document.getElementById('minSize').value;
  const savePath = document.getElementById('savePath').value;
  
  chrome.storage.sync.set({ depth, pageSize, minSize, savePath }, () => {
    const status = document.getElementById('status');
    status.textContent = 'Налаштування збережено';
    setTimeout(() => {
      status.textContent = 'Готовий до роботи';
    }, 2000);
  });
});

// Обробник початку сканування
document.getElementById('startScanning').addEventListener('click', async () => {
  try {
    const settings = await chrome.storage.sync.get(['depth', 'pageSize', 'minSize', 'savePath']);
    
    if (!settings.depth || !settings.pageSize || !settings.minSize || !settings.savePath) {
      document.getElementById('status').textContent = 'Помилка: Не всі налаштування задані';
      return;
    }

    // Очищаємо попередні результати
    await chrome.storage.local.remove(['foundImages']);
    totalScannedPages = 0;
    totalFoundImages = 0;
    
    // Скидаємо прогрес-бар
    document.getElementById('progress').style.width = '0%';
    document.getElementById('status').textContent = 'Сканування...';
    
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    await chrome.runtime.sendMessage({
      type: 'START_SCAN',
      data: {
        tabId: tabs[0].id,
        depth: settings.depth
      }
    });
    
    document.getElementById('status').textContent = 'Сканування завершено';
  } catch (error) {
    document.getElementById('status').textContent = `Помилка: ${error.message}`;
  }
});

// Обробник збереження зображень
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

document.getElementById('browsePath').addEventListener('click', () => {
  const savePath = document.getElementById('savePath');
  const currentPath = savePath.value;
  
  // Створюємо діалог вибору
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    position: absolute;
    top: ${savePath.offsetTop + savePath.offsetHeight}px;
    left: ${savePath.offsetLeft}px;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    z-index: 1000;
  `;
  
  const paths = [
    'downloads/images',
    'downloads/pictures',
    'downloads/photos',
    'downloads/web_images'
  ];
  
  paths.forEach(path => {
    const option = document.createElement('div');
    option.style.cssText = `
      padding: 8px 15px;
      cursor: pointer;
      hover: background-color: #f5f5f5;
    `;
    option.textContent = path;
    option.onclick = () => {
      savePath.value = path;
      dialog.remove();
    };
    dialog.appendChild(option);
  });
  
  document.body.appendChild(dialog);
  
  // Закриваємо діалог при кліку поза ним
  document.addEventListener('click', function closeDialog(e) {
    if (!dialog.contains(e.target) && e.target !== document.getElementById('browsePath')) {
      dialog.remove();
      document.removeEventListener('click', closeDialog);
    }
  });
});

// Додаємо обробник повідомлень
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PREVIEW_UPDATED') {
    document.getElementById('pagesScanned').textContent = `Відкрито сторінок: ${message.data.pages}`;
    document.getElementById('imagesFound').textContent = `Знайдено зображень: ${message.data.images}`;
  }
});
