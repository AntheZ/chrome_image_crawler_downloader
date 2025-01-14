chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ depth: 0, pageSize: 1, minSize: 500 });
});

let totalScannedPages = 0;
let totalFoundImages = 0;


// Додайте логіку для обробки зображень та збереження їх у PNG

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scanPage(tabId, depth, delayTime, maxParallel = 1) {
  try {
    await delay(delayTime);
    
    totalScannedPages++;
    const settings = await chrome.storage.sync.get(['minSize']);
    const images = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: getPageImages,
      args: [settings.minSize]
    });

    if (!images || !images[0] || !images[0].result) {
      console.warn('Не вдалося отримати зображення зі сторінки');
      return;
    }

    // Зберігаємо знайдені зображення
    const existingImages = await chrome.storage.local.get(['foundImages']);
    const foundImages = new Set(existingImages.foundImages || []);
    images[0].result.forEach(img => foundImages.add(img.src));
    
    totalFoundImages = foundImages.size;
    await chrome.storage.local.set({ foundImages: Array.from(foundImages) });
    
    updatePreview(totalScannedPages, totalFoundImages);

    if (depth > 0) {
      const links = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        function: getPageLinks
      });

      if (links && links[0] && links[0].result) {
        const chunks = chunk(links[0].result, maxParallel);
        for (const linkChunk of chunks) {
          await Promise.all(linkChunk.map(async (link) => {
            try {
              const newTab = await chrome.tabs.create({ url: link, active: false });
              await scanPage(newTab.id, depth - 1, delayTime, maxParallel);
              await chrome.tabs.remove(newTab.id);
            } catch (error) {
              console.error(`Помилка при обробці посилання ${link}:`, error);
            }
          }));
        }
      }
    }
  } catch (error) {
    console.error('Помилка при скануванні сторінки:', error);
  }
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function getPageImages(minSize) {
  return Array.from(document.querySelectorAll('img')).map(img => ({
    src: img.src,
    width: img.naturalWidth,
    height: img.naturalHeight
  })).filter(img => img.width >= minSize || img.height >= minSize);
}

function isSameDomain(url, baseDomain) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname === baseDomain;
  } catch {
    return false;
  }
}

function getPageLinks() {
  const baseDomain = window.location.hostname;
  return Array.from(document.querySelectorAll('a'))
    .map(a => a.href)
    .filter(url => isSameDomain(url, baseDomain));
}

async function downloadAndConvertImage(src, basePath) {
  try {
    // Отримуємо домен з URL зображення
    const urlObj = new URL(src);
    const domain = urlObj.hostname;
    
    // Отримуємо оригінальну назву файлу
    const originalName = src.split('/').pop().split('?')[0] || 'image.png';
    
    // Створюємо шлях: saved_images/domain.com/original_name
    const savePath = `saved_images/${domain}`;
    const filename = `${savePath}/${originalName}`;
    
    await chrome.downloads.download({
      url: src, // Використовуємо оригінальний URL замість blob
      filename: filename,
      saveAs: false
    });
  } catch (error) {
    console.error(`Помилка при завантаженні зображення ${src}:`, error);
    throw error;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_SCAN') {
    // Запускаємо сканування в окремому асинхронному контексті
    (async () => {
      try {
        await scanPage(
          message.data.tabId, 
          parseInt(message.data.depth), 
          parseInt(message.data.delay)
        );
      } catch (error) {
        console.error('Помилка при скануванні:', error);
      }
    })();
  }
  
  if (message.type === 'DOWNLOAD_IMAGE') {
    (async () => {
      try {
        await downloadAndConvertImage(message.data.src, message.data.savePath);
      } catch (error) {
        console.error('Помилка при завантаженні:', error);
      }
    })();
  }
  
  // Повертаємо true для підтримки асинхронних відповідей
  return true;
});

function updatePreview(pages, images) {
  chrome.runtime.sendMessage({
    type: 'PREVIEW_UPDATED',
    data: { pages, images }
  });
}
