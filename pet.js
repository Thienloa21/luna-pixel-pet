(() => {
  const size = 48;
  const cell = 192;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const defaults = {enabled: true, size: 2, roam: !reduced.matches};
  const binary = atob(lunaAtlas);
  const pixels = new Uint8Array(binary.length);
  for (let i = 0; i < pixels.length; i++) pixels[i] = binary.charCodeAt(i);
  delete globalThis.lunaAtlas;
  let atlas;
  const ready = createImageBitmap(new Blob([pixels], {type: 'image/png'})).then(bitmap => { atlas = bitmap; });

  function frameAt(pose, elapsed) {
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
    ctx.drawImage(atlas, frame % 8 * cell, Math.floor(frame / 8) * cell, cell, cell, 0, 0, side, side);
    ctx.restore();
  }

  globalThis.Luna = {size, defaults, reduced, ready, frameAt, fitCanvas, paint};
})();
