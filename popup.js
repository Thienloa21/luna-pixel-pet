(async () => {
  const {defaults, reduced, paint, frameAt, fitCanvas, ready} = Luna;
  await ready;
  const enabled = document.getElementById('enabled');
  const roam = document.getElementById('roam');
  const size = document.getElementById('size');
  const controls = document.getElementById('controls');
  const status = document.getElementById('status');
  const portrait = document.getElementById('portrait').getContext('2d');
  fitCanvas(portrait.canvas, portrait.canvas.clientWidth);
  const hint = 'Нажмите на Луну или перетащите её по странице.';
  let settings = (await chrome.storage.local.get('luna')).luna ?? {};
  let preview = 'idle';
  let started = performance.now();
  let last = '';
  let pending = Promise.resolve();

  function render() {
    enabled.checked = settings.enabled ?? defaults.enabled;
    roam.checked = settings.roam ?? !reduced.matches;
    size.value = settings.size ?? defaults.size;
    controls.disabled = !enabled.checked;
    status.textContent = enabled.checked ? hint : 'Луна скрыта во всех вкладках.';
  }

  function save(change) {
    settings = {...settings, ...change};
    render();
    const snapshot = settings;
    pending = pending.catch(() => {}).then(() => chrome.storage.local.set({luna: snapshot}));
    pending.catch(() => { status.textContent = 'Не удалось сохранить настройку.'; });
  }

  enabled.addEventListener('change', () => save({enabled: enabled.checked}));
  roam.addEventListener('change', () => save({roam: roam.checked}));
  size.addEventListener('change', () => save({size: Number(size.value)}));

  const responses = {jump: 'Луна прыгает!', sit: 'Луна присела.', sleep: 'Луна засыпает.'};
  for (const button of document.querySelectorAll('[data-action]')) {
    button.addEventListener('click', async () => {
      const {action} = button.dataset;
      preview = action;
      started = performance.now();
      try {
        await pending;
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        const accepted = await chrome.tabs.sendMessage(tab.id, {type: 'luna-action', action});
        if (!accepted) throw new Error('No active pet');
        status.textContent = responses[action];
      } catch {
        status.textContent = 'Откройте обычную веб-страницу или обновите вкладку.';
      }
    });
  }

  function animate(now) {
    const elapsed = now - started;
    if (elapsed > (preview === 'sleep' ? 4200 : 2000)) preview = 'idle';
    const frame = frameAt(preview, reduced.matches ? 0 : elapsed);
    if (last !== preview + frame) {
      paint(portrait, preview, frame);
      last = preview + frame;
    }
    requestAnimationFrame(animate);
  }
  reduced.addEventListener('change', render);
  render();
  enabled.disabled = false;
  requestAnimationFrame(animate);
})();
