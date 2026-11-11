(() => {
  const gravity = 1280;
  const maxRise = 208;
  const maxSpeed = 335;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const excluded = 'html, body, luna-pet, button, a, label, input, textarea, select, dialog, [role="dialog"], [aria-modal="true"]';
  const structural = 'article, aside, section, figure, blockquote, img, video, canvas, iframe, table, [role="region"]';

  function topAt(x, y, host) {
    return document.elementsFromPoint(x, y).find(hit => hit !== host);
  }

  function* elementsAt(x, y, host) {
    let element = topAt(x, y, host);
    for (let depth = 0; element && depth < 5; depth++, element = element.parentElement) {
      if (!element.matches(excluded)) yield element;
    }
  }

  function visibleAt(element, x, y, host) {
    const first = topAt(x, y, host);
    return !!first && (first === element || element.contains(first));
  }

  function surface(element, view) {
    if (!element.isConnected) return null;
    const {left, right, top, width, height} = element.getBoundingClientRect();
    const min = Math.max(view.minX, left + view.edge);
    const max = Math.min(view.maxX, right - view.edge);
    if (width < 70 || height < 32 || max - min < 12 || top < view.ceiling || top > view.floor - 20) return null;
    return {element, min, max, left, y: top};
  }

  function isPlatform(element) {
    const css = getComputedStyle(element);
    const background = css.backgroundColor;
    const painted = css.backgroundImage !== 'none' || (background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent')
      || parseFloat(css.borderTopWidth) > 0 || css.boxShadow !== 'none';
    return css.visibility === 'visible' && Number(css.opacity) >= 0.1 && (painted || element.matches(structural));
  }

  function scan(x, y, view, down = 300) {
    const elements = new Set();
    const left = Math.max(1, x - 360);
    const right = Math.min(view.width - 2, x + 360);
    const top = Math.max(1, view.ceiling, y - maxRise);
    const bottom = Math.min(view.floor - 4, y + down);
    if (left > right || top > bottom) return [];
    const cols = Math.max(1, Math.ceil((right - left) / 102));
    const rows = Math.max(1, Math.ceil((bottom - top) / 65));
    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col <= cols; col++) {
        const sx = left + (right - left) * col / cols;
        const sy = top + (bottom - top) * row / rows;
        for (const element of elementsAt(sx, sy, view.host)) elements.add(element);
      }
    }

    const result = [];
    for (const element of elements) {
      const edge = surface(element, view);
      if (edge && edge.y >= top && edge.y <= bottom && isPlatform(element)) result.push(edge);
    }
    return result;
  }

  function trajectory(x, y, tx, ty, ceiling) {
    const rise = Math.min(maxRise, y - ceiling);
    const height = Math.min(rise, Math.max(57, y - ty + 24));
    if (height < 9 || y - height >= ty) return null;
    const vy = -Math.sqrt(2 * gravity * height);
    const seconds = (-vy + Math.sqrt(vy * vy + 2 * gravity * (ty - y))) / gravity;
    const vx = (tx - x) / seconds;
    return Math.abs(vx) <= maxSpeed ? {vx, vy} : null;
  }

  function plan(x, y, view, support, facing) {
    const options = [];
    for (const edge of scan(x, y, view)) {
      if (edge.element === support) continue;
      const inset = Math.min(20, (edge.max - edge.min) / 3);
      const nearest = clamp(x + facing * 45, edge.min + inset, edge.max - inset);
      for (const tx of new Set([nearest, (edge.min + edge.max) / 2])) {
        if (Math.abs(edge.y - y) < 22 && Math.abs(tx - x) < 55) continue;
        if (Math.abs(edge.y - y) < 9 && tx >= edge.min && x >= edge.min && x <= edge.max) continue;
        const motion = trajectory(x, y, tx, edge.y, view.ceiling);
        if (!motion || !visibleAt(edge.element, tx, edge.y + 3, view.host)) continue;
        options.push({...motion, element: edge.element, tx,
          score: Math.abs(tx - x) + Math.abs(edge.y - y) * .53 + (edge.y > y ? 35 : 0)});
      }
    }
    options.sort((a, b) => a.score - b.score);
    return options[0];
  }

  function crossing(edge, fromX, fromY, x, y, view) {
    if (!edge || y <= fromY || edge.y < fromY || edge.y > y) return null;
    const contactX = fromX + (x - fromX) * (edge.y - fromY) / (y - fromY);
    if (contactX < edge.min || contactX > edge.max || !visibleAt(edge.element, contactX, edge.y + 3, view.host)) return null;
    return {edge, x: contactX};
  }

  function firstCrossing(fromX, fromY, x, y, view) {
    if (y <= fromY) return null;
    const steps = Math.ceil(Math.hypot(x - fromX, y - fromY) / 12);
    const seen = new Set();
    let first = null;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const sx = fromX + (x - fromX) * t;
      const sy = fromY + (y - fromY) * t;
      for (const element of elementsAt(sx, Math.min(view.floor, sy + 3), view.host)) {
        if (seen.has(element)) continue;
        seen.add(element);
        const edge = surface(element, view);
        if (!edge || (first && edge.y >= first.edge.y)) continue;
        const contact = crossing(edge, fromX, fromY, x, y, view);
        if (contact && isPlatform(element)) first = contact;
      }
    }
    return first;
  }

  globalThis.LunaPlatforms = {gravity, surface, visibleAt, trajectory, plan, crossing, firstCrossing};
})();
