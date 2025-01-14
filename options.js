document.getElementById('saveOptions').addEventListener('click', () => {
  const depth = document.getElementById('depth').value;
  const pageSize = document.getElementById('pageSize').value;
  const minSize = document.getElementById('minSize').value;
  chrome.storage.sync.set({ depth, pageSize, minSize });
});
