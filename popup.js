(async () => {
  const {defaults, reduced, gestures, paint, frameAt, fitCanvas, ready, characters, atlasKey, selectCharacter} = Luna;
  await ready;
  const enabled = document.getElementById('enabled');
  const roam = document.getElementById('roam');
  const size = document.getElementById('size');
  const controls = document.getElementById('controls');
  const status = document.getElementById('status');
  const character = document.getElementById('character');
  const title = document.querySelector('h1');
  const removeButton = document.getElementById('remove-character');
  const portrait = document.getElementById('portrait').getContext('2d');
  fitCanvas(portrait.canvas, portrait.canvas.clientWidth);
  const hint = 'Нажмите на питомца или перетащите его по странице.';
  const stored = await chrome.storage.local.get(['luna', 'customCharacters', 'activeCharacter']);
  let settings = stored.luna ?? {};
  let custom = stored.customCharacters ?? [];
  let active = 'luna';
  let preview = 'idle';
  let started = performance.now();
  let last = '';
  let pending = Promise.resolve();

  function render() {
    enabled.checked = settings.enabled ?? defaults.enabled;
    roam.checked = settings.roam ?? !reduced.matches;
    size.value = settings.size ?? defaults.size;
    controls.disabled = !enabled.checked;
    status.textContent = enabled.checked ? hint : 'Питомец скрыт во всех вкладках.';
  }

  function renderCharacters() {
    const library = [...characters, ...custom];
    character.replaceChildren(...library.map(item => new Option(item.name, item.id)));
    character.value = active;
    title.textContent = library.find(item => item.id === active)?.name ?? 'Луна';
    removeButton.hidden = !custom.some(item => item.id === active);
  }

  async function display(id) {
    active = await selectCharacter(id);
    preview = 'idle';
    started = performance.now();
    last = '';
    renderCharacters();
  }

  async function updateLibrary(task, errorMessage) {
    character.disabled = removeButton.disabled = true;
    try {
      await task();
    } catch (error) {
      status.textContent = errorMessage ?? error.message;
    } finally {
      renderCharacters();
      character.disabled = removeButton.disabled = false;
    }
  }

  character.addEventListener('change', () => {
    const id = character.value;
    const previous = active;
    updateLibrary(async () => {
      await display(id);
      try {
        await chrome.storage.local.set({activeCharacter: id});
      } catch (error) {
        await display(previous);
        throw error;
      }
      status.textContent = 'Выбран персонаж «' + title.textContent + '».';
    }, 'Не удалось переключить персонажа.');
  });

  removeButton.addEventListener('click', () => {
    const id = active;
    updateLibrary(async () => {
      const {customCharacters = []} = await chrome.storage.local.get('customCharacters');
      const list = customCharacters.filter(item => item.id !== id);
      await chrome.storage.local.set({customCharacters: list, activeCharacter: 'luna'});
      custom = list;
      await display('luna');
      await chrome.storage.local.remove(atlasKey(id));
      status.textContent = 'Импортированный персонаж удалён.';
    }, 'Не удалось удалить персонажа.');
  });

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

  const responses = {jump: 'Питомец прыгает!', sit: 'Питомец присел.', sleep: 'Питомец засыпает.'};
  const gestureActions = document.getElementById('gesture-actions');
  for (const [action, gesture] of Object.entries(gestures)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = action;
    button.textContent = gesture.label;
    gestureActions.append(button);
  }
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
        status.textContent = responses[action] ?? 'Питомец выполняет команду.';
      } catch {
        status.textContent = 'Откройте обычную веб-страницу или обновите вкладку.';
      }
    });
  }

  function animate(now) {
    const elapsed = now - started;
    if (elapsed > (gestures[preview]?.duration ?? (preview === 'sleep' ? 4200 : 2000))) preview = 'idle';
    const frame = frameAt(preview, reduced.matches ? 0 : elapsed);
    if (last !== preview + frame) {
      paint(portrait, preview, frame);
      last = preview + frame;
    }
    requestAnimationFrame(animate);
  }
  reduced.addEventListener('change', render);
  try {
    await display(stored.activeCharacter ?? 'luna');
  } catch {
    await display('luna');
  }
  render();
  character.disabled = false;
  enabled.disabled = false;
  requestAnimationFrame(animate);
})();
