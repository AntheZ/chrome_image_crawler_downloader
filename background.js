let processedPages = 0;
let savedImages = 0;
let duplicates = 0;
let visitedUrls = new Set();
let foundImages = new Set();
let isRunning = false;
let slowPages = [];
let pendingUrls = new Set();
let slowPagesAttempts = new Map();

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrollToBottom(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if(totalHeight >= scrollHeight){
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 100);
    })
  });
}

async function getAllImages(tabId) {
  return chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const images = new Set();
      
      // Функція для додавання зображення з перевіркою розміру
      const addImageIfValid = (url, element) => {
        // Перевіряємо розмір для img елементів
        if (element instanceof HTMLImageElement) {
          if (element.naturalWidth < 100 || element.naturalHeight < 100) {
            return;
          }
        }
        
        if (url && url.startsWith('http') && !url.includes('data:image')) {
          images.add({
            url: url,
            filename: url.split('/').pop().split('?')[0]
          });
        }
      };

      // 1. Звичайні img теги
      document.querySelectorAll('img').forEach(img => {
        if (img.complete && img.naturalWidth > 0) {
          addImageIfValid(img.currentSrc || img.src, img);
        }
      });
      
      // 2. Фонові зображення
      document.querySelectorAll('*').forEach(el => {
        const style = window.getComputedStyle(el);
        const bg = style.backgroundImage;
        if (bg && bg !== 'none') {
          const url = bg.replace(/url\(['"]?(.*?)['"]?\)/g, '$1');
          addImageIfValid(url, el);
        }
      });
      
      // 3. Атрибути data-*
      const dataAttributes = ['data-src', 'data-original', 'data-lazy', 'data-srcset', 
                            'data-zoom', 'data-big', 'data-full', 'data-image'];
      
      document.querySelectorAll(`[${dataAttributes.join('], [')}]`).forEach(el => {
        dataAttributes.forEach(attr => {
          if (el.dataset[attr.replace('data-', '')]) {
            addImageIfValid(el.dataset[attr.replace('data-', '')], el);
          }
        });
      });

      // 4. Пошук в iframes
      document.querySelectorAll('iframe').forEach(iframe => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          iframeDoc.querySelectorAll('img').forEach(img => {
            if (img.complete && img.naturalWidth > 0) {
              addImageIfValid(img.currentSrc || img.src, img);
            }
          });
        } catch (e) {
          // Ігноруємо помилки доступу до cross-origin iframes
        }
      });

      // 5. Пошук в picture елементах
      document.querySelectorAll('picture source').forEach(source => {
        if (source.srcset) {
          source.srcset.split(',').forEach(src => {
            const url = src.trim().split(' ')[0];
            addImageIfValid(url, source);
          });
        }
      });

      // 6. Пошук в атрибутах style
      document.querySelectorAll('[style*="background"]').forEach(el => {
        const style = el.getAttribute('style');
        const matches = style.match(/url\(['"]?(.*?)['"]?\)/g);
        if (matches) {
          matches.forEach(match => {
            const url = match.replace(/url\(['"]?(.*?)['"]?\)/g, '$1');
            addImageIfValid(url, el);
          });
        }
      });

      // 7. Пошук в JSON-структурах на сторінці
      document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"]')
        .forEach(script => {
          try {
            const data = JSON.parse(script.textContent);
            const findUrls = (obj) => {
              if (typeof obj === 'string' && obj.match(/\.(jpg|jpeg|png|gif|webp)/i)) {
                addImageIfValid(obj, null);
              } else if (typeof obj === 'object' && obj !== null) {
                Object.values(obj).forEach(findUrls);
              }
            };
            findUrls(data);
          } catch (e) {
            // Ігноруємо помилки парсингу JSON
          }
        });

      return Array.from(images);
    }
  });
}

async function processPage(url) {
  if (!isRunning || visitedUrls.has(url)) return;
  visitedUrls.add(url);
  pendingUrls.delete(url);
  
  const tab = await chrome.tabs.create({ url, active: true });
  let isPageLoaded = false;
  
  try {
    const checkPageLoad = async () => {
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.readyState === 'complete'
      });
      return result[0].result;
    };

    for (let i = 0; i < 4; i++) {
      if (await checkPageLoad()) {
        isPageLoaded = true;
        break;
      }
      await delay(500);
    }

    if (!isPageLoaded) {
      throw new Error('Page load timeout');
    }

    await delay(1000);
    await scrollToBottom(tab.id);
    const images = await getAllImages(tab.id);
    
    const domain = new URL(url).hostname;
    
    for (const imageData of images[0].result) {
      if (!foundImages.has(imageData.url)) {
        foundImages.add(imageData.url);
        const filename = `${domain}/${imageData.filename}`;
        
        try {
          const exists = await new Promise(resolve => {
            chrome.downloads.search({
              filename: filename,
              exists: true
            }, results => {
              resolve(results.length > 0);
            });
          });
          
          if (!exists) {
            await chrome.downloads.download({
              url: imageData.url,
              filename: filename,
              saveAs: false
            });
            savedImages++;
          } else {
            duplicates++;
          }
        } catch (error) {
          console.error('Error checking file:', error);
        }
      } else {
        duplicates++;
      }
    }
    
    processedPages++;
    updateStats();

    const links = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => Array.from(document.querySelectorAll('a'))
        .map(a => a.href)
        .filter(url => url.startsWith(window.location.origin))
    });

    for (const link of links[0].result) {
      if (!visitedUrls.has(link) && !pendingUrls.has(link)) {
        pendingUrls.add(link);
      }
    }

    await chrome.tabs.remove(tab.id);

    if (isRunning) {
      const nextUrl = Array.from(pendingUrls)[0];
      if (nextUrl) {
        await processPage(nextUrl);
      } else if (slowPages.length > 0) {
        const slowUrl = slowPages.shift();
        await processPage(slowUrl);
      }
    }
  } catch (error) {
    console.error('Error or timeout processing page:', error);
    if (!slowPagesAttempts.has(url)) {
      slowPagesAttempts.set(url, 1);
      slowPages.push(url);
    } else if (slowPagesAttempts.get(url) < 3) {
      slowPagesAttempts.set(url, slowPagesAttempts.get(url) + 1);
      slowPages.push(url);
    }
    await chrome.tabs.remove(tab.id);
    
    if (isRunning) {
      const nextUrl = Array.from(pendingUrls)[0];
      if (nextUrl) {
        await processPage(nextUrl);
      }
    }
  }
}

function updateStats() {
  chrome.runtime.sendMessage({
    type: 'STATS_UPDATE',
    data: {
      pages: processedPages,
      images: savedImages,
      duplicates: duplicates
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_CRAWLING') {
    processedPages = 0;
    savedImages = 0;
    duplicates = 0;
    visitedUrls = new Set();
    foundImages = new Set();
    pendingUrls = new Set();
    slowPages = [];
    slowPagesAttempts = new Map();
    isRunning = true;
    processPage(message.url);
  } else if (message.type === 'STOP_CRAWLING') {
    isRunning = false;
    // Очищаємо всі дані
    visitedUrls = new Set();
    foundImages = new Set();
    pendingUrls = new Set();
    slowPages = [];
    slowPagesAttempts = new Map();
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  const window = await chrome.windows.create({
    url: chrome.runtime.getURL('popup.html'),
    type: 'popup',
    state: 'maximized'
  });

  // Зберігаємо поточну вкладку для подальшого використання
  chrome.storage.local.set({ currentTab: tab });
});
