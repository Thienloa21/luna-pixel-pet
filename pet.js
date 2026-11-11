(() => {
  const size = 48;
  const cell = 192;
  const layout = {cell, columns: 8, rows: 3, frames: 20};
  const characters = [{id: 'luna', name: 'Луна'}, {id: 'gothic', name: 'Нокс'}];
  const atlasKey = id => 'character:' + id;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const defaults = {enabled: true, size: 2, roam: !reduced.matches};
  // Each step holds an atlas frame with an offset, angle and scale around the feet.
  const gestures = Object.assign(Object.create(null), {
    dance: {label: 'Танцуй', step: 145, poses: [
      [8], [0, -8, -2, -.10], [11, -11, 0, -.08], [2, -6, -4],
      [8], [4, 8, -2, .10], [10, 11, 0, .08], [6, 6, -4],
      [8], [11, -7, -3, -.12], [10, 7, -3, .12], [8]
    ]},
    bow: {label: 'Поклонись', step: 145, poses: [
      [8], [10, 0, 0, .12, 1, .96], [12, 0, 0, .23, 1, .86],
      [12, 0, 0, .28, 1, .80], [12, 0, 0, .28, 1, .80],
      [12, 0, 0, .15, 1, .90], [10, 0, 0, .08], [8]
    ]},
    cheer: {label: 'Порадуйся', step: 125, poses: [
      [8], [12], [13, 0, -9, -.05, .95, .94], [14, 0, -17, 0, .94, .94],
      [13, 0, -8, .05, .95, .94], [15], [13, 0, -8, -.07, .95, .94],
      [14, 0, -14, .05, .94, .94], [15], [11], [8]
    ]},
    spin: {label: 'Покружись', step: 100, poses: [
      [8], [0, 0, 0, -.08, .68], [2, 0, -3, -.08, .28],
      [4, 0, -4, .02, -.65], [6, 0, -4, .08, -1],
      [0, 0, -3, .08, -.50], [2, 0, -2, 0, .24],
      [4, 0, 0, -.05, .68], [11], [8]
    ]},
    curtsy: {label: 'Реверанс', step: 145, poses: [
      [8], [4, 6], [10, 9, 0, .04], [12, 9, 0, .08, 1, .94],
      [12, 9, 0, .10, 1, .88], [12, 9, 0, .10, 1, .88],
      [12, 5, 0, .06, 1, .95], [10, 3], [8]
    ]},
    levitate: {label: 'Левитируй', step: 140, effect: 'orbit', poses: [
      [8], [12], [16, 0, -12], [17, 0, -20], [18, 0, -27],
      [18, 0, -32], [19, 0, -30], [19, 0, -27], [18, 0, -30],
      [17, 0, -28], [16, 0, -19], [16, 0, -10], [15], [8]
    ]},
    moonlight: {label: 'Лунная магия', step: 125, effect: 'burst', poses: [
      [8], [9], [10], [10, -2, 0, -.04], [11], [11, -3, 0, -.04],
      [11, -2], [11], [10], [10], [8]
    ]}
  });
  for (const gesture of Object.values(gestures)) gesture.duration = gesture.step * gesture.poses.length;
  function decode(encoded) {
    const binary = atob(encoded);
    const pixels = new Uint8Array(binary.length);
    for (let i = 0; i < pixels.length; i++) pixels[i] = binary.charCodeAt(i);
    return createImageBitmap(new Blob([pixels], {type: 'image/png'}));
  }
  const moon = decode(lunaAtlas);
  delete globalThis.lunaAtlas;
  let atlas;
  let active = 'luna';
  let revision = 0;
  const ready = moon.then(bitmap => { atlas = bitmap; });

  async function selectCharacter(id = 'luna') {
    const request = ++revision;
    await ready;
    if (id === active) return active;
    let next;
    if (id === 'luna') {
      next = await moon;
    } else {
      const key = atlasKey(id);
      const encoded = id === 'gothic'
        ? await chrome.runtime.sendMessage({type: 'luna-builtin-gothic-atlas'})
        : (await chrome.storage.local.get(key))[key];
      if (!encoded) throw new Error('Спрайты персонажа недоступны.');
      next = await decode(encoded);
    }
    if (request !== revision) {
      if (id !== 'luna') next.close();
      return active;
    }
    if (active !== 'luna') atlas.close();
    atlas = next;
    active = id;
    return active;
  }

  function frameAt(pose, elapsed) {
    const gesture = gestures[pose];
    if (gesture) return Math.min(gesture.poses.length - 1, Math.floor(elapsed / gesture.step));
    switch (pose) {
      case 'walk': return Math.floor(elapsed / 105) % 8;
      case 'wave': return [8, 10, 11, 10, 11, 10, 8][Math.min(6, Math.floor(elapsed / 135))];
      case 'cast': return elapsed < 135 ? 10 : 11;
      case 'idle': return elapsed % 3300 >= 3140 ? 9 : 8;
      case 'sit': return elapsed % 3000 >= 2840 ? 17 : 16;
      case 'sleep': return 18 + (Math.floor(elapsed / 720) % 2);
      case 'crouch': return 12;
      case 'jump': return elapsed < 105 ? 13 : 14;
      case 'held': return 14;
      case 'land': return 15;
      default: return 8;
    }
  }

  function fitCanvas(canvas, cssPixels) {
    const side = Math.min(cell, Math.max(1, Math.round(cssPixels * devicePixelRatio)));
    if (canvas.width === side && canvas.height === side) return false;
    canvas.width = canvas.height = side;
    return true;
  }

  function paintMagic(ctx, side, effect, step, length) {
    if (step < 2 || step >= length - 1) return;
    const orbit = effect === 'orbit';
    const phase = (step - 2) / (length - 3);
    ctx.save();
    ctx.scale(side / cell, side / cell);
    ctx.globalAlpha = Math.min(1, phase * 5 + .4, (1 - phase) * 3);
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3 + step * (orbit ? .44 : .17);
      const radius = orbit ? 59 : 9 + phase * 27;
      const x = (orbit ? 99 : 149) + Math.cos(angle) * radius;
      const y = (orbit ? 112 - step : 95) + Math.sin(angle) * radius * (orbit ? .35 : 1);
      const arm = (i + step) % 3 === 0 ? 5 : 3;
      ctx.fillStyle = i % 2 ? '#fff1fc' : '#c2a7ff';
      ctx.fillRect(Math.round(x) - arm, Math.round(y), arm * 2 + 1, 1);
      ctx.fillRect(Math.round(x), Math.round(y) - arm, 1, arm * 2 + 1);
    }
    ctx.restore();
  }

  function paint(ctx, pose, frame, facing = 1) {
    const side = ctx.canvas.width;
    ctx.clearRect(0, 0, side, side);
    ctx.save();
    ctx.imageSmoothingEnabled = side !== cell;
    ctx.imageSmoothingQuality = 'high';
    if (facing < 0) {
      ctx.translate(side, 0);
      ctx.scale(-1, 1);
    }
    const gesture = gestures[pose];
    const step = frame;
    if (gesture) {
      ctx.save();
      const [sprite, x = 0, y = 0, angle = 0, sx = 1, sy = 1] = gesture.poses[frame];
      const pivot = side * 184 / cell;
      ctx.translate(side / 2 + x * side / cell, pivot + y * side / cell);
      ctx.rotate(angle);
      ctx.scale(sx, sy);
      ctx.translate(-side / 2, -pivot);
      frame = sprite;
    }
    ctx.drawImage(atlas, frame % layout.columns * cell, Math.floor(frame / layout.columns) * cell, cell, cell, 0, 0, side, side);
    if (gesture) ctx.restore();
    if (gesture?.effect) paintMagic(ctx, side, gesture.effect, step, gesture.poses.length);
    ctx.restore();
  }

  globalThis.Luna = {size, layout, characters, atlasKey, defaults, reduced, gestures, ready, selectCharacter, frameAt, fitCanvas, paint};
})();
