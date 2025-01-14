chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ 
    depth: 0, 
    pageSize: 1, 
    minSize: 500,
    savePath: 'saved_images'
  });
});

let totalScannedPages = 0;
let totalFoundImages = 0;
let visitedUrls = new Set();


// Додайте логіку для обробки зображень та збереження їх у PNG

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scanPage(tabId, depth, delayTime, maxParallel = 1) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (visitedUrls.has(tab.url)) {
      return;
    }
    visitedUrls.add(tab.url);
    
    await delay(delayTime * 1000);
    totalScannedPages++;
    
    const images = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: getPageImages,
      args: [minSize]
    });

    const existingImages = await chrome.storage.local.get(['foundImages']);
    const foundImages = new Set(existingImages.foundImages || []);
    const duplicates = new Set();

    images[0].result.forEach(img => {
      if (foundImages.has(img)) {
        duplicates.add(img);
      } else {
        foundImages.add(img);
      }
    });

    totalFoundImages = foundImages.size;
    await chrome.storage.local.set({ foundImages: Array.from(foundImages) });
    updatePreview(totalScannedPages, totalFoundImages, duplicates.size);

    const links = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      function: getPageLinks
    });

    const existingLinks = new Set();
    links[0].result.forEach(link => {
      existingLinks.add(link);
    });

    const totalLinks = existingLinks.size;
    updatePreview(totalScannedPages, totalFoundImages, duplicates.size, totalLinks);

    // Продовжуємо сканування якщо глибина > 0
    if (depth > 0) {
      const newLinks = links[0].result.filter(link => !visitedUrls.has(link));
      const chunks = chunk(newLinks, maxParallel);
      
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
  const imgSources = Array.from(document.querySelectorAll('img')).filter(img => {
    return img.naturalWidth >= minSize && img.naturalHeight >= minSize;
  }).map(img => img.src);

  const backgroundImages = Array.from(document.querySelectorAll('*')).reduce((acc, element) => {
    const style = window.getComputedStyle(element);
    const backgroundImage = style.backgroundImage;
    if (backgroundImage && backgroundImage !== 'none') {
      const url = backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/);
      if (url) acc.push(url[1]);
    }
    return acc;
  }, []).filter(url => {
    const img = new Image();
    img.src = url;
    return img.naturalWidth >= minSize && img.naturalHeight >= minSize;
  });
  
  // Збираємо всі зображення з атрибуту srcset
  const srcsetImages = Array.from(document.querySelectorAll('img[srcset]')).reduce((acc, img) => {
    const srcset = img.srcset;
    const urls = srcset.match(/([^\s,]+)/g);
    if (urls) acc.push(...urls.filter(url => !url.includes(' ')));
    return acc;
  }, []);
  
  // Збираємо всі зображення з picture елементів
  const pictureImages = Array.from(document.querySelectorAll('picture source')).reduce((acc, source) => {
    if (source.srcset) {
      const urls = source.srcset.match(/([^\s,]+)/g);
      if (urls) acc.push(...urls.filter(url => !url.includes(' ')));
    }
    return acc;
  }, []);
  
  // Збираємо зображення, які з'являються при hover
  const hoverImages = Array.from(document.querySelectorAll('*')).reduce((acc, element) => {
    const hoverStyle = window.getComputedStyle(element, ':hover');
    const hoverBackgroundImage = hoverStyle.backgroundImage;
    if (hoverBackgroundImage && hoverBackgroundImage !== 'none') {
      const url = hoverBackgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/);
      if (url) acc.push(url[1]);
    }
    return acc;
  }, []);
  
  // Об'єднуємо всі знайдені URL та видаляємо дублікати
  return [...new Set([...imgSources, ...backgroundImages, ...srcsetImages, ...pictureImages, ...hoverImages])];
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
  const links = new Set();
  
  // Отримуємо всі посилання зі сторінки
  document.querySelectorAll('a').forEach(a => {
    try {
      const url = new URL(a.href);
      // Перевіряємо, що посилання веде на той самий домен
      if (url.hostname === baseDomain && 
          // Виключаєємо якорі та поточну сторінку
          url.pathname !== window.location.pathname && 
          !url.hash && 
          // Перевіряємо розширення файлу
          !/\.(jpg|jpeg|png|gif|pdf|doc|docx)$/i.test(url.pathname)) {
        links.add(a.href);
      }
    } catch (e) {
      // Ігноруємо невалідні URL
    }
  });
  
  return Array.from(links);
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
    (async () => {
      try {
        totalScannedPages = 0;
        totalFoundImages = 0;
        visitedUrls = new Set();
        
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

function updatePreview(pages, images, duplicates = 0, links = 0) {
  chrome.runtime.sendMessage({
    type: 'PREVIEW_UPDATED',
    data: { pages, images, duplicates, links }
  });
}
