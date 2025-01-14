// Завантаження збережених налаштувань при відкритті popup
document.addEventListener('DOMContentLoaded', async () => {
  const settings = await chrome.storage.sync.get(['depth', 'pageSize', 'minSize', 'savePath']);
  document.getElementById('depth').value = settings.depth || 0;
  document.getElementById('pageSize').value = settings.pageSize || 10;
  document.getElementById('minSize').value = settings.minSize || 500;
  document.getElementById('savePath').value = settings.savePath || 'saved_images';
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
    
    // Скидаємо прогрес-бар
    document.getElementById('progress').style.width = '0%';
    document.getElementById('status').textContent = 'Сканування...';
    
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    await chrome.runtime.sendMessage({
      type: 'START_SCAN',
      data: {
        tabId: tabs[0].id,
        depth: settings.depth,
        delay: settings.pageSize * 1000
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
      
      // Замість прямого виклику функції відправляємо повідомлення в background
      await chrome.runtime.sendMessage({
        type: 'DOWNLOAD_IMAGE',
        data: {
          src: images.foundImages[i],
          savePath: settings.savePath
        }
      });
    }
    
    status.textContent = 'Збереження завершено';
    document.getElementById('openFolder').disabled = false;
  } catch (error) {
    document.getElementById('status').textContent = `Помилка: ${error.message}`;
  }
});

document.getElementById('browsePath').addEventListener('click', () => {
  const savePath = document.getElementById('savePath');
  
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    position: absolute;
    top: ${savePath.offsetTop + savePath.offsetHeight}px;
    left: ${savePath.offsetLeft}px;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    padding: 10px;
    z-index: 1000;
  `;
  
  dialog.innerHTML = `
    <p style="margin: 0 0 10px 0;">Зображення будуть збережені в:</p>
    <code>downloads/saved_images/[domain]/[original_name]</code>
    <p style="margin: 10px 0 0 0; font-size: 12px; color: #666;">
      Ви можете переглянути збережені зображення у вашій папці завантажень Chrome
    </p>
  `;
  
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

// Додати після обробника saveImages
document.getElementById('openFolder').addEventListener('click', async () => {
  try {
    await chrome.runtime.sendMessage({
      type: 'OPEN_IMAGES_FOLDER'
    });
  } catch (error) {
    document.getElementById('status').textContent = `Помилка: ${error.message}`;
  }
});
