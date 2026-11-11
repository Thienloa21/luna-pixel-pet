(() => {
  const limit = 4 * 1024 * 1024;
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const {cell, columns, rows, frames} = Luna.layout;

  async function readAtlas(file) {
    if (file.size > limit) throw new Error('Выберите PNG размером до 4 МБ.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length < 33 || !signature.every((byte, i) => bytes[i] === byte)) {
      throw new Error('Выберите файл PNG.');
    }
    const header = new DataView(bytes.buffer);
    if (header.getUint32(8) !== 13 || header.getUint32(12) !== 0x49484452 ||
        header.getUint32(16) !== columns * cell || header.getUint32(20) !== rows * cell) {
      throw new Error('Нужен PNG 1536 × 576 пикселей. Скачайте шаблон Луны.');
    }
    const png = new Blob([bytes], {type: 'image/png'});
    const bitmap = await createImageBitmap(png).catch(() => {
      throw new Error('Не удалось открыть PNG. Попробуйте экспортировать его заново.');
    });
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d', {willReadFrequently: true});
      ctx.drawImage(bitmap, 0, 0);
      for (let frame = 0; frame < columns * rows; frame++) {
        const {data} = ctx.getImageData(frame % columns * cell, Math.floor(frame / columns) * cell, cell, cell);
        let visible = 0;
        for (let alpha = 3; alpha < data.length; alpha += 4) {
          if (data[alpha] > 16) visible++;
        }
        if (frame >= frames) {
          if (visible) throw new Error('Оставьте четыре последние ячейки в третьем ряду пустыми.');
        } else {
          if (visible < 24) throw new Error(`Ячейка ${frame + 1} пуста. Нужны все 20 кадров по шаблону.`);
          if (visible > cell * cell * 0.95) throw new Error(`У кадра ${frame + 1} должен быть прозрачный фон.`);
        }
      }
    } finally {
      bitmap.close();
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = () => reject(new Error('Не удалось прочитать PNG.'));
      reader.readAsDataURL(png);
    });
  }

  const form = document.getElementById('import-character');
  const nameInput = document.getElementById('character-name');
  const fileInput = document.getElementById('character-file');
  const button = document.getElementById('import-button');
  const status = document.getElementById('import-status');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    const name = nameInput.value.trim();
    const file = fileInput.files[0];
    if (!name || !file) {
      status.textContent = 'Укажите имя и выберите PNG.';
      return;
    }
    nameInput.disabled = fileInput.disabled = button.disabled = true;
    status.textContent = 'Проверяю спрайт-лист…';
    try {
      const png = await readAtlas(file);
      const id = crypto.randomUUID();
      try {
        const {customCharacters = []} = await chrome.storage.local.get('customCharacters');
        await chrome.storage.local.set({
          customCharacters: [...customCharacters, {id, name}],
          activeCharacter: id,
          [Luna.atlasKey(id)]: png
        });
      } catch {
        throw new Error('Не удалось сохранить персонажа. Попробуйте удалить ненужный импорт или уменьшить размер PNG.');
      }
      form.reset();
      status.textContent = 'Персонаж «' + name + '» добавлен и выбран. Эту вкладку можно закрыть.';
    } catch (error) {
      status.textContent = error.message;
    } finally {
      nameInput.disabled = fileInput.disabled = button.disabled = false;
    }
  });
  button.disabled = false;
})();
