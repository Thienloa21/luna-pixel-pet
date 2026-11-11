(() => {
  const repository = 'Thienloa21/luna-pixel-pet';
  const api = 'https://api.github.com/repos/' + repository;
  const installed = chrome.runtime.getManifest().version;
  const check = document.getElementById('check-update');
  const status = document.getElementById('update-status');
  const available = document.getElementById('update-available');
  const download = document.getElementById('download-update');

  document.getElementById('installed-version').textContent = installed;

  function parts(version) {
    if (typeof version !== 'string' || !/^(?:0|[1-9]\d{0,4})(?:\.(?:0|[1-9]\d{0,4})){0,3}$/.test(version)) {
      throw new Error('На GitHub указан некорректный номер версии.');
    }
    const numbers = version.split('.').map(Number);
    if (numbers.some(number => number > 65535) || numbers.every(number => number === 0)) {
      throw new Error('На GitHub указан некорректный номер версии.');
    }
    return numbers;
  }

  function isNewer(candidate) {
    const next = parts(candidate);
    const current = parts(installed);
    for (let i = 0; i < 4; i++) {
      const difference = (next[i] ?? 0) - (current[i] ?? 0);
      if (difference !== 0) return difference > 0;
    }
    return false;
  }

  async function read(path, accept, signal) {
    const response = await fetch(api + path, {
      headers: {Accept: accept},
      cache: 'no-store',
      credentials: 'omit',
      signal
    });
    if (!response.ok) {
      if (response.status === 404) throw new Error('Репозиторий или файл версии недоступен на GitHub.');
      if (response.status === 403 || response.status === 429) {
        throw new Error('GitHub ограничил проверку. Попробуйте позже.');
      }
      throw new Error('GitHub вернул ошибку ' + response.status + '.');
    }
    return response.json();
  }

  check.addEventListener('click', async () => {
    check.disabled = true;
    available.hidden = true;
    download.removeAttribute('href');
    status.textContent = 'Проверяю версию на GitHub…';
    try {
      const signal = AbortSignal.timeout(12000);
      const ref = await read('/git/ref/heads/main', 'application/vnd.github+json', signal);
      const commit = ref?.object?.sha;
      if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit)) {
        throw new Error('GitHub не вернул номер коммита.');
      }
      const manifest = await read('/contents/manifest.json?ref=' + commit, 'application/vnd.github.raw+json', signal);
      const version = manifest?.version;
      if (isNewer(version)) {
        status.textContent = 'Доступна версия ' + version + '.';
        download.href = 'https://github.com/' + repository + '/archive/' + commit + '.zip';
        available.hidden = false;
      } else {
        status.textContent = 'Более новой версии на GitHub нет.';
      }
    } catch (error) {
      status.textContent = error instanceof SyntaxError || error instanceof TypeError || error.name === 'TimeoutError'
        ? 'Не удалось проверить версию. Проверьте подключение и попробуйте ещё раз.'
        : error.message;
    } finally {
      check.disabled = false;
    }
  });

  document.getElementById('reload-extension').addEventListener('click', () => chrome.runtime.reload());
})();
