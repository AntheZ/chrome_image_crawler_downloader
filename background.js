chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ depth: 0, pageSize: 1, minSize: 500 });
});

let totalScannedPages = 0;
let totalFoundImages = 0;


// Додайте логіку для обробки зображень та збереження їх у PNG

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scanPage(tabId, depth, maxParallel = 1) {
  try {
    // Додаємо затримку перед скануванням кожної сторінки
    await delay(10000); // 10 секунд затримки
    
    totalScannedPages++;
    const images = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      function: getPageImages
    });

    const uniqueImages = new Set(images[0].result.map(img => img.src));
    totalFoundImages += uniqueImages.size;
    
    // Зберігаємо знайдені зображення
    const existingImages = await chrome.storage.local.get(['foundImages']);
    const foundImages = existingImages.foundImages || [];
    foundImages.push(...Array.from(uniqueImages));
    await chrome.storage.local.set({ foundImages });
    
    updatePreview(totalScannedPages, totalFoundImages);

    if (depth > 0) {
      const links = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        function: getPageLinks
      });

      const chunks = chunk(links[0].result, maxParallel);
      for (const linkChunk of chunks) {
        await Promise.all(linkChunk.map(async (link) => {
          try {
            const newTab = await chrome.tabs.create({ url: link, active: false });
            await scanPage(newTab.id, depth - 1, maxParallel);
            await chrome.tabs.remove(newTab.id);
          } catch (error) {
            console.error(`Помилка при обробці посилання ${link}:`, error);
          }
        }));
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

function getPageImages() {
  return Array.from(document.querySelectorAll('img')).map(img => ({
    src: img.src,
    width: img.naturalWidth,
    height: img.naturalHeight
  })).filter(img => img.width >= 500 || img.height >= 500);
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

async function downloadAndConvertImage(src, savePath) {
  try {
    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(`HTTP помилка! статус: ${response.status}`);
    }
    const blob = await response.blob();
    
    const filename = `${savePath}/${Date.now()}.png`;
    await chrome.downloads.download({
      url: URL.createObjectURL(blob),
      filename: filename,
      saveAs: false
    });
  } catch (error) {
    console.error(`Помилка при завантаженні зображення ${src}:`, error);
    throw error;
  }
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'START_SCAN') {
    await scanPage(message.data.tabId, message.data.depth);
  }
  if (message.type === 'UPDATE_PREVIEW') {
    chrome.runtime.sendMessage({
      type: 'PREVIEW_UPDATED',
      data: {
        pages: totalScannedPages,
        images: totalFoundImages
      }
    });
  }
});

function updatePreview(pages, images) {
  chrome.runtime.sendMessage({
    type: 'PREVIEW_UPDATED',
    data: { pages, images }
  });
}
