(() => {
  const size = 48;
  const cell = 192;
  const layout = {cell, columns: 8, rows: 3, frames: 20};
  const characters = [{id: 'luna', name: 'Луна'}];
  const atlasKey = id => 'character:' + id;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const defaults = {enabled: true, size: 2, roam: !reduced.matches};
  function decode(encoded, type = 'image/png') {
    const binary = atob(encoded);
    const pixels = new Uint8Array(binary.length);
    for (let i = 0; i < pixels.length; i++) pixels[i] = binary.charCodeAt(i);
    return createImageBitmap(new Blob([pixels], {type}));
  }
  const moon = decode(lunaAtlas);
  delete globalThis.lunaAtlas;
  const extras = globalThis.LunaReactions;
  const reactionData = globalThis.lunaReactionAtlas;
  delete globalThis.LunaReactions;
  delete globalThis.lunaReactionAtlas;
  const reactions = extras?.reactions ?? {};
  let reactionAtlas;
  const reactionsReady = reactionData
    ? decode(reactionData, 'image/webp').then(bitmap => { reactionAtlas = bitmap; }).catch(() => {})
    : Promise.resolve();
  let atlas;
  let active = 'luna';
  let revision = 0;
  const ready = moon.then(bitmap => { atlas = bitmap; });

  function reactionFor(pose) {
    return active === 'luna' && reactionAtlas && Object.prototype.hasOwnProperty.call(reactions, pose) ? reactions[pose] : undefined;
  }

  async function selectCharacter(id = 'luna') {
    const request = ++revision;
    await ready;
    if (id === active) return active;
    let next;
    if (id === 'luna') {
      next = await moon;
    } else {
      const key = atlasKey(id);
      const encoded = (await chrome.storage.local.get(key))[key];
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
    const reaction = reactionFor(pose);
    if (reaction) {
      if (reduced.matches) return reaction.still;
      const time = Math.min(elapsed, reaction.duration - 1) % reaction.cycle;
      return reaction.frames.find(({until}) => time < until).frame;
    }
    switch (pose) {
      case 'walk': return Math.floor(elapsed / 105) % 8;
      case 'wave': return [8, 10, 11, 10, 11, 10, 8][Math.min(6, Math.floor(elapsed / 135))];
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

  const seated = new Set(['sit', 'sleep', 'curious', 'ledge', 'tea', 'read', 'play',
    'snack', 'rain', 'snow', 'sun', 'box', 'blanket', 'cat']);
  const bent = new Set(['crouch', 'land']);
  const airborne = new Set(['jump', 'held', 'land']);
  const emptyTransition = {keys: [], duration: 0};

  // Reuse solid, grounded keyframes. The sprite never fades or doubles, and
  // jumping, falling and landing always use the pose dictated by the physics.
  function transitionBetween(from, to) {
    if (reduced.matches || from === to || airborne.has(to) || from === 'jump' || from === 'held') return emptyTransition;
    const fromSeat = seated.has(from);
    const toSeat = seated.has(to);
    const keys = [];
    let duration = 0;
    function add(pose, ms, holdFrom = false) {
      if ((pose === from && !holdFrom) || pose === to || keys.at(-1)?.pose === pose) return;
      keys.push({pose, until: duration += ms});
    }
    const neutralSeat = reactionFor(from) && reactionFor(to) ? 'curious' : 'sit';
    if (fromSeat && toSeat && (from === 'ledge' || to === 'ledge')) {
      // Move the neutral frame to the perch first so the ledge graphic
      // itself appears already aligned with the page block.
      add(to === 'curious' ? 'sit' : 'curious', 160, true);
    } else if (fromSeat && toSeat) {
      add(neutralSeat, 120);
    } else if (toSeat) {
      if (from === 'walk') add('idle', 65);
      if (!bent.has(from)) add('crouch', 100);
      add(neutralSeat, to === 'ledge' ? 160 : 100);
    } else if (fromSeat) {
      if (from !== 'sit') add('sit', 85);
      add('crouch', 100);
      if (!bent.has(to)) add('idle', 80);
    } else if (from === 'walk' || (to !== 'crouch' && from !== 'idle')) {
      add('idle', 80);
    }
    return {keys, duration};
  }

  function animationSample(transition, pose, elapsed) {
    const key = !reduced.matches && transition?.keys.find(({until}) => elapsed < until);
    if (key) return {pose: key.pose, elapsed: 0};
    return {pose, elapsed: Math.max(0, elapsed - (transition?.duration ?? 0))};
  }

  function fitCanvas(canvas, cssPixels) {
    const side = Math.min(cell, Math.max(1, Math.round(cssPixels * devicePixelRatio)));
    if (canvas.width === side && canvas.height === side) return false;
    canvas.width = canvas.height = side;
    return true;
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
    const reaction = reactionFor(pose);
    const pixels = reaction ? extras.cell : cell;
    const columns = reaction ? extras.columns : layout.columns;
    ctx.drawImage(reaction ? reactionAtlas : atlas, frame % columns * pixels, Math.floor(frame / columns) * pixels,
      pixels, pixels, 0, 0, side, side);
    ctx.restore();
  }

  globalThis.Luna = {size, layout, characters, atlasKey, defaults, reduced, ready, selectCharacter, frameAt, fitCanvas, paint,
    reactions, reactionsReady, reactionFor, transitionBetween, animationSample, ledgeDrop: extras?.ledgeDrop ?? 0};
})();
