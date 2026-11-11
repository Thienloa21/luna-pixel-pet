chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.type !== 'luna-builtin-gothic-atlas') return;
  fetch(chrome.runtime.getURL('assets/gothic-character-sprites.png'))
    .then(response => {
      if (!response.ok) throw new Error('Could not read bundled sprite sheet');
      return response.arrayBuffer();
    })
    .then(buffer => {
      const bytes = new Uint8Array(buffer);
      const chunks = [];
      for (let offset = 0; offset < bytes.length; offset += 8192) {
        chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
      }
      sendResponse(btoa(chunks.join('')));
    })
    .catch(() => sendResponse(null));
  return true;
});
