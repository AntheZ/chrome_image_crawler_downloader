let totalScannedPages = 0;
let totalFoundImages = 0;

document.getElementById('saveImages').addEventListener('click', () => {
  chrome.tabs.query({active: true, currentWindow: true}, tabs => {
    chrome.storage.sync.get(['depth', 'pageSize', 'minSize'], settings => {
      scanPage(tabs[0].id, settings.depth);
    });
  });
});

document.getElementById('startSaving').addEventListener('click', () => {
  // Тут можна додати логіку для збереження зображень
  console.log('Збереження зображень розпочато...');
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
