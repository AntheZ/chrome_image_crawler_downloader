document.getElementById('saveOptions').addEventListener('click', () => {
  const depth = document.getElementById('depth').value;
  const pageSize = document.getElementById('pageSize').value;
  const minSize = document.getElementById('minSize').value;
  const savePath = document.getElementById('savePath').value;
  
  chrome.storage.sync.set({ depth, pageSize, minSize, savePath }, () => {
    const status = document.createElement('p');
    status.textContent = 'Налаштування збережено';
    document.body.appendChild(status);
    setTimeout(() => status.remove(), 2000);
  });
});
