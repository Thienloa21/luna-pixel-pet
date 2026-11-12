(async () => {
  const {defaults, reduced, paint, frameAt, fitCanvas, ready, characters, atlasKey, selectCharacter,
    reactions, reactionsReady, reactionFor, transitionBetween, animationSample} = Luna;
  await Promise.all([ready, reactionsReady]);
  const enabled = document.getElementById('enabled');
  const roam = document.getElementById('roam');
  const size = document.getElementById('size');
  const controls = document.getElementById('controls');
  const status = document.getElementById('status');
  const character = document.getElementById('character');
  const reactionControls = document.getElementById('reaction-controls');
  const reaction = document.getElementById('reaction');
  reaction.replaceChildren(...Object.entries(reactions).map(([id, {label}]) => new Option(label, id)));
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
  let previewEnd = Infinity;
  let transition;
  let afterPreviewLanding;
  let command = 0;
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
    reactionControls.hidden = !reactionFor('joy');
  }

  async function display(id) {
    active = await selectCharacter(id);
    command++;
    afterPreviewLanding = undefined;
    showPose('idle', Infinity, performance.now(), true);
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
  function showPose(next, duration, now, immediate = false) {
    const from = animationSample(transition, preview, now - started).pose;
    transition = immediate ? undefined : transitionBetween(from, next);
    preview = next;
    started = now;
    previewEnd = duration + (transition?.duration ?? 0);
  }

  async function perform(action) {
    const request = ++command;
    const reaction = reactionFor(action);
    const now = performance.now();
    const duration = reaction?.duration ?? (action === 'sleep' ? 4200 : 2000);
    const inFlight = preview === 'crouch' || preview === 'jump' || preview === 'land';
    if (action === 'jump') {
      if (!inFlight) showPose('crouch', 105, now);
    } else if (inFlight) {
      afterPreviewLanding = {pose: action, duration};
    } else {
      showPose(action, duration, now);
    }
    try {
      await pending;
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      const accepted = await chrome.tabs.sendMessage(tab.id, {type: 'luna-action', action});
      if (request !== command) return;
      status.textContent = accepted
        ? responses[action] ?? 'Луна: ' + reaction.label.toLowerCase() + '.'
        : 'Питомец пока не может выполнить эту команду.';
    } catch {
      if (request === command) status.textContent = 'Откройте обычную веб-страницу или обновите вкладку.';
    }
  }
  for (const button of document.querySelectorAll('[data-action]')) {
    button.addEventListener('click', () => perform(button.dataset.action));
  }
  document.getElementById('play-reaction').addEventListener('click', () => perform(reaction.value));

  function animate(now) {
    if (now - started >= previewEnd) {
      if (preview === 'crouch') showPose('jump', 410, now, true);
      else if (preview === 'jump') showPose('land', 125, now, true);
      else {
        const {pose, duration} = afterPreviewLanding ?? {pose: 'idle', duration: Infinity};
        afterPreviewLanding = undefined;
        showPose(pose, duration, now);
      }
    }
    const visual = animationSample(transition, preview, now - started);
    const frame = frameAt(visual.pose, reduced.matches ? 0 : visual.elapsed);
    const flight = preview === 'jump' && !reduced.matches ? Math.min(1, visual.elapsed / 410) : 0;
    const height = Math.round(16 * 4 * flight * (1 - flight));
    const key = [visual.pose, frame, height].join('/');
    if (last !== key) {
      paint(portrait, visual.pose, frame);
      portrait.canvas.style.transform = height ? 'translateY(-' + height + 'px)' : '';
      last = key;
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
