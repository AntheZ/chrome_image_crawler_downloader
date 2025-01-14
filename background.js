chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ depth: 0, pageSize: 1, minSize: 500 });
});

// Додайте логіку для обробки зображень та збереження їх у PNG

async function scanPage(tabId, depth) {
  const images = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    function: getPageImages
  });

  const uniqueImages = new Set(images[0].result.map(img => img.src));
  uniqueImages.forEach(src => {
    downloadAndConvertImage(src);
  });

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

function getPageImages() {
  return Array.from(document.querySelectorAll('img')).map(img => ({
    src: img.src,
    width: img.naturalWidth,
    height: img.naturalHeight
  })).filter(img => img.width >= 500 || img.height >= 500);
}

function getPageLinks() {
  return Array.from(document.querySelectorAll('a')).map(a => a.href);
}

async function downloadAndConvertImage(src) {
  const response = await fetch(src);
  const blob = await response.blob();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    canvas.toBlob(async function(newBlob) {
      const url = URL.createObjectURL(newBlob);
      chrome.downloads.download({
        url: url,
        filename: `images/${src.split('/').pop().split('?')[0]}.png`
      });
    }, 'image/png');
  };
}
