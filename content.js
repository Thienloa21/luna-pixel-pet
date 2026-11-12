(() => {
  const {size, defaults, reduced, frameAt, fitCanvas, paint, ready, selectCharacter,
    reactions = {}, reactionFor = () => undefined, ledgeDrop = 0} = Luna;
  const {gravity, surface, visibleAt, trajectory, plan, crossing, firstCrossing} = LunaPlatforms;
  const host = document.createElement('luna-pet');
  for (const [property, value] of Object.entries({
    all: 'initial', position: 'fixed', inset: '0', display: 'block',
    'pointer-events': 'none', 'z-index': '2147483647', direction: 'ltr',
    'writing-mode': 'horizontal-tb'
  })) host.style.setProperty(property, value, 'important');

  const root = host.attachShadow({mode: 'closed'});
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    .pet, .shadow, .effect { position: absolute; left: 0; top: 0; }
    .pet {
      all: unset; display: block; position: absolute; left: 0; top: 0;
      box-sizing: border-box; pointer-events: auto; cursor: grab;
      touch-action: none; user-select: none; -webkit-tap-highlight-color: transparent;
    }
    .pet:active { cursor: grabbing; }
    .pet:focus-visible { outline: 2px solid #8c62c5; outline-offset: 2px; border-radius: 12px; }
    canvas { display: block; width: 100%; height: 100%; pointer-events: none; }
    .shadow { background: #23172c; border-radius: 50%; transform-origin: left center; }
    .effect {
      color: #ff91c1; font: bold 18px/1 monospace; text-shadow: 1px 1px #52304c, -1px -1px #52304c;
      white-space: nowrap;
    }
    .effect[data-sleep] { color: #ded0ff; font-size: 14px; }
    .effect[hidden] { display: none; }
  `);
  root.adoptedStyleSheets = [sheet];

  const shadow = document.createElement('div');
  shadow.className = 'shadow';
  shadow.setAttribute('aria-hidden', 'true');
  const effect = document.createElement('span');
  effect.className = 'effect';
  effect.hidden = true;
  effect.setAttribute('aria-hidden', 'true');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pet';
  button.setAttribute('aria-label', 'Питомец. Нажмите, чтобы поздороваться');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  button.append(canvas);
  root.append(shadow, button, effect);

  const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
  const random = (min, max) => min + Math.random() * (max - min);
  const walkingTime = () => random(5500, 9500);
  const sittingTime = () => random(5500, 9000);
  const sleepingTime = () => random(12000, 20000);
  const throwDrag = 1.2;
  let settings = {...defaults};
  let width, height, scale, x, y;
  let facing = 1;
  let pose = 'idle';
  let elapsed = 0;
  let end = 1500;
  let previousTime;
  let raf = 0;
  let vx = 0, vy = 0;
  let freeFlight = false;
  let support, supportEdge, landing, landingEdge, takeoff, afterLanding;
  let supportCheckedAt = -Infinity;
  let pointer;
  let paintedPose, paintedFrame, paintedFacing;
  let position;

  const floor = () => height - 9;
  const ceiling = () => 46 * scale;
  const boundX = value => clamp(value, size * scale / 2, width - size * scale / 2);
  const boundY = value => clamp(value, ceiling(), floor());
  const view = () => ({host, width, floor: floor(), ceiling: ceiling(),
    minX: boundX(0), maxX: boundX(width), edge: 9 * scale});

  function resize() {
    width = host.clientWidth;
    height = host.clientHeight;
    if (!width || !height) return;
    const maxScale = Math.min(width / size, (height - 9) / size);
    scale = Math.min(settings.size + 1, Math.max(0, maxScale));
    const pixels = size * scale;
    button.style.width = button.style.height = pixels + 'px';
    if (fitCanvas(canvas, pixels)) paintedFrame = undefined;
    x = boundX(x ?? width * 0.8);
    y = y === undefined ? floor() : boundY(y);
    if (!support && pose !== 'held' && pose !== 'jump') y = floor();
    supportCheckedAt = -Infinity;
    if (scale > 0) draw();
  }

  function play(next, duration = Infinity) {
    pose = next;
    elapsed = 0;
    end = duration;
    effect.hidden = true;
  }

  function walk(direction) {
    facing = direction;
    play('walk', walkingTime());
  }

  function prepareJump(next) {
    if (Math.abs(next.tx - x) > 1) facing = Math.sign(next.tx - x);
    takeoff = next;
    play('crouch', 105);
  }

  function platformJump() {
    const next = plan(x, y, view(), support?.element, facing);
    if (!next) return false;
    prepareJump(next);
    return true;
  }

  function jump() {
    if (pose === 'jump' || pose === 'held' || pose === 'crouch') return;
    if (platformJump()) return;
    const forward = boundX(x + facing * 73);
    const backward = boundX(x - facing * 73);
    const destination = Math.abs(forward - x) > 20 ? forward : backward;
    const tx = supportEdge ? clamp(destination, supportEdge.min, supportEdge.max) : destination;
    const next = trajectory(x, y, tx, y, ceiling());
    if (next) prepareJump({...next, tx, element: support?.element});
    else play('wave', 950);
  }

  function beginFlight(motion, edge, thrown = false) {
    support = supportEdge = undefined;
    freeFlight = thrown;
    landing = edge?.element;
    landingEdge = edge;
    ({vx, vy} = motion);
    play('jump');
  }

  function launch() {
    const {element, tx} = takeoff;
    takeoff = undefined;
    const limits = view();
    const edge = element && surface(element, limits);
    const destination = edge ? clamp(tx, edge.min, edge.max) : boundX(tx);
    const motion = trajectory(x, y, destination, edge?.y ?? floor(), limits.ceiling);
    if (motion && (!element || (edge && visibleAt(element, destination, edge.y + 3, host)))) {
      beginFlight(motion, edge);
    } else {
      finishLanding();
    }
  }

  function drop(motion = {vx: 0, vy: 0}) {
    if (Math.abs(motion.vx) > 30) facing = Math.sign(motion.vx);
    beginFlight(motion, undefined, true);
  }

  function followSupport(now) {
    if (!support || now - supportCheckedAt < 90) return;
    supportCheckedAt = now;
    const next = surface(support.element, view());
    const nextX = next && clamp(next.left + support.offset, next.min, next.max);
    if (!next || !visibleAt(next.element, nextX, next.y + 3, host)) {
      drop();
      return;
    }
    x = nextX;
    y = next.y;
    supportEdge = next;
  }

  function land(edge) {
    landing = landingEdge = undefined;
    support = edge ? {element: edge.element, offset: x - edge.left} : undefined;
    supportEdge = edge;
    supportCheckedAt = -Infinity;
    y = edge?.y ?? floor();
    play('land', 125);
  }

  function finishLanding() {
    const {next = 'sit', duration = sittingTime()} = afterLanding ?? {};
    afterLanding = undefined;
    play(next, duration);
  }

  function rest(next, duration) {
    if (pose === 'held') return false;
    if (pose === 'jump' || pose === 'crouch' || pose === 'land') afterLanding = {next, duration};
    else play(next, duration);
    return true;
  }

  function react(next) {
    const reaction = reactionFor(next);
    return Boolean(reaction && rest(next, reaction.duration));
  }

  function greet() {
    if (!react('joy')) rest('wave', 1050);
  }

  function choose() {
    if (!settings.roam) return play('idle');
    const roll = Math.random();
    if (roll >= 0.68 && roll < 0.91 && reactionFor('joy')) {
      const candidates = supportEdge && Math.random() < 0.35 ? ['ledge'] :
        Object.keys(reactions).filter(id => id !== 'joy' && (id !== 'ledge' || supportEdge));
      if (react(candidates[Math.floor(Math.random() * candidates.length)])) return;
    }
    if (roll < 0.68 && platformJump()) return;
    if (supportEdge && roll < 0.35) {
      const exits = [supportEdge.min - 30 * scale, supportEdge.max + 30 * scale];
      const tx = exits.filter(exit => boundX(exit) === exit).sort((a, b) => Math.abs(a - x) - Math.abs(b - x))[0];
      const motion = tx === undefined ? null : trajectory(x, y, tx, floor(), ceiling());
      if (motion) return prepareJump({...motion, tx});
    }
    if (roll < 0.60) {
      const direction = x < width / 2 ? 1 : -1;
      walk(direction);
    } else if (roll < 0.79) {
      jump();
    } else if (roll < 0.89) {
      play('wave', 950);
    } else {
      play('sleep', sleepingTime());
    }
  }

  function draw() {
    const frame = frameAt(pose, elapsed);
    if (pose !== paintedPose || frame !== paintedFrame || facing !== paintedFacing) {
      paint(ctx, pose, frame, facing);
      paintedPose = pose;
      paintedFrame = frame;
      paintedFacing = facing;
    }

    const projectedEdge = pose === 'jump' && landingEdge && x >= landingEdge.min && x <= landingEdge.max && y <= landingEdge.y
      ? landingEdge : undefined;
    const ground = (supportEdge ?? projectedEdge)?.y ?? floor();
    const perched = pose === 'ledge' && Boolean(supportEdge) && Boolean(reactionFor(pose));
    const offset = perched ? ledgeDrop * size * scale : 0;
    const nextPosition = [Math.round(x), Math.round(y), scale, ground, perched].join('/');
    if (nextPosition !== position) {
      position = nextPosition;
      button.style.transform = `translate(${Math.round(x - size * scale / 2)}px, ${Math.round(y - 46 * scale + offset)}px)`;
      const elevation = Math.max(0, ground - y);
      const shade = 1 - Math.min(elevation / 200, 0.65);
      const w = 23 * scale * shade;
      shadow.style.width = w + 'px';
      shadow.style.height = 5 * scale + 'px';
      shadow.style.opacity = String(perched ? 0 : shade * 0.24);
      shadow.style.transform = `translate(${Math.round(x - w / 2)}px, ${Math.round(ground - 2)}px)`;
    }
    const sleeping = pose === 'sleep';
    const showEffect = sleeping || (pose === 'wave' && elapsed < 780);
    if (effect.hidden === showEffect) effect.hidden = !showEffect;
    if (showEffect) {
      const text = sleeping ? ['z', 'z z', 'z z Z'][Math.floor(elapsed / 380) % 3] : '♥';
      if (effect.textContent !== text) effect.textContent = text;
      effect.toggleAttribute('data-sleep', sleeping);
      const rise = reduced.matches ? 0 : sleeping ? 0 : Math.floor(elapsed / 38);
      effect.style.transform = `translate(${Math.round(clamp(x + 12 * scale, 0, width - 42))}px, ${Math.max(2, Math.round(y - 43 * scale - rise))}px)`;
    }
  }

  function stepWalk(seconds) {
    const min = supportEdge?.min ?? boundX(0);
    const max = supportEdge?.max ?? boundX(width);
    if (elapsed >= end || max - min < 20) {
      play('sit', sittingTime());
      return;
    }
    x = clamp(x + seconds * 66 * facing, min, max);
    if (x === min) facing = 1;
    else if (x === max) facing = -1;
    if (support) support.offset = x - supportEdge.left;
  }

  function stepFlight(seconds) {
    const fromX = x;
    const fromY = y;
    const rawY = y + vy * seconds + gravity * seconds * seconds / 2;
    y = Math.max(ceiling(), rawY);
    vy = rawY < ceiling() ? 0 : vy + gravity * seconds;
    const damping = Math.exp(-throwDrag * seconds);
    const rawX = x + vx * (freeFlight ? (1 - damping) / throwDrag : seconds);
    x = boundX(rawX);
    if (freeFlight) vx = x === rawX ? vx * damping : 0;
    if (vy <= 0) return;

    const limits = view();
    landingEdge = landing && surface(landing, limits);
    const hit = freeFlight
      ? firstCrossing(fromX, fromY, x, y, limits)
      : crossing(landingEdge, fromX, fromY, x, y, limits);
    if (hit) {
      x = hit.x;
      land(hit.edge);
    } else if (y >= floor()) {
      land();
    }
  }

  function tick(now) {
    const delta = Math.min(35, now - (previousTime ?? now));
    const seconds = delta / 1000;
    previousTime = now;
    elapsed += delta;
    followSupport(now);

    if (pose === 'walk') {
      stepWalk(seconds);
    } else if (pose === 'jump') {
      stepFlight(seconds);
    } else if (elapsed >= end) {
      if (pose === 'crouch') launch();
      else if (pose === 'land') finishLanding();
      else choose();
    }

    if (scale > 0) draw();
    raf = requestAnimationFrame(tick);
  }

  function sample(event) {
    return {x: event.clientX, y: event.clientY, time: event.timeStamp};
  }

  function remember(event) {
    const next = sample(event);
    const samples = pointer.samples;
    const last = samples.at(-1);
    if (next.x === last.x && next.y === last.y) return;
    samples.push(next);
    while (samples.length > 2 && (next.time - samples[0].time > 90 || samples.length > 20)) samples.shift();
  }

  function releaseVelocity(event) {
    if (event.type !== 'pointerup') return {vx: 0, vy: 0};
    const samples = pointer.samples;
    const first = samples[0];
    const last = samples.at(-1);
    const heldStill = event.timeStamp - last.time;
    const strength = 780 * (1 - clamp((heldStill - 25) / 95, 0, 1)) / Math.max(last.time - first.time, 16);
    const vx = clamp((last.x - first.x) * strength, -1050, 1050);
    let vy = clamp((last.y - first.y) * strength, -670, 640);
    if (y >= floor() - 2 && Math.abs(vx) > 90) vy = Math.min(vy, -Math.min(270, Math.abs(vx) * 0.37));
    return {vx, vy};
  }

  button.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    pointer = {id: event.pointerId, startX: event.clientX, startY: event.clientY,
      offsetX: event.clientX - x, offsetY: event.clientY - y, dragged: false, samples: [sample(event)]};
    button.setPointerCapture(event.pointerId);
  });

  button.addEventListener('pointermove', event => {
    if (pointer?.id !== event.pointerId) return;
    for (const point of event.getCoalescedEvents?.() ?? []) remember(point);
    remember(event);
    if (!pointer.dragged) {
      if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < 5) return;
      pointer.dragged = true;
      support = supportEdge = landing = landingEdge = afterLanding = undefined;
      play('held');
    }
    x = boundX(event.clientX - pointer.offsetX);
    y = boundY(event.clientY - pointer.offsetY);
    draw();
  });

  function release(event) {
    if (pointer?.id !== event.pointerId) return;
    const {dragged} = pointer;
    if (dragged && event.type === 'pointerup') {
      remember(event);
      x = boundX(event.clientX - pointer.offsetX);
      y = boundY(event.clientY - pointer.offsetY);
    }
    const motion = dragged ? releaseVelocity(event) : null;
    pointer = undefined;
    if (dragged) {
      drop(motion);
    } else if (event.type === 'pointerup') {
      greet();
    }
  }

  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(name, release);
  }
  button.addEventListener('click', event => {
    if (event.detail === 0) greet();
  });

  function invalidateSupport() {
    supportCheckedAt = -Infinity;
  }

  function sync() {
    if (settings.enabled && !host.isConnected) {
      document.documentElement.append(host);
      support = supportEdge = landing = landingEdge = afterLanding = undefined;
      pose = 'idle';
      resize();
      if (settings.roam) walk(-1);
      else play('idle');
      previousTime = undefined;
      raf = requestAnimationFrame(tick);
      window.addEventListener('resize', resize);
      window.addEventListener('scroll', invalidateSupport, {capture: true, passive: true});
    } else if (!settings.enabled && host.isConnected) {
      host.remove();
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', invalidateSupport, true);
      pointer = undefined;
    }
  }

  function update(changes) {
    const oldRoam = settings.roam;
    settings = {...settings, ...changes};
    sync();
    if (!host.isConnected) return;
    resize();
    if (oldRoam !== settings.roam && pose !== 'held' && pose !== 'jump') {
      play('idle', settings.roam ? 600 : Infinity);
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (!settings.enabled || !host.isConnected || pointer?.dragged || message?.type !== 'luna-action') return;
    if (message.action === 'jump') jump();
    else if (message.action === 'sit') rest('sit', 12000);
    else if (message.action === 'sleep') rest('sleep', 22000);
    else if (!react(message.action)) return;
    respond(true);
  });

  (async () => {
    await ready;
    let requested;
    async function showCharacter(id = 'luna') {
      requested = id;
      try {
        await selectCharacter(id);
      } catch {
        if (requested === id) await selectCharacter('luna');
      }
      if (requested === id) {
        paintedFrame = undefined;
        if (Object.prototype.hasOwnProperty.call(reactions, pose) && !reactionFor(pose)) play('idle', settings.roam ? 600 : Infinity);
        if (afterLanding && Object.prototype.hasOwnProperty.call(reactions, afterLanding.next) && !reactionFor(afterLanding.next)) afterLanding = undefined;
      }
    }
    const stored = await chrome.storage.local.get(['luna', 'activeCharacter']);
    let overrides = stored.luna;
    update(overrides);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.activeCharacter) showCharacter(changes.activeCharacter.newValue);
      if (changes.luna) {
        overrides = changes.luna.newValue;
        update({...defaults, roam: !reduced.matches, ...overrides});
      }
    });
    showCharacter(stored.activeCharacter);
    reduced.addEventListener('change', () => {
      if (overrides?.roam === undefined) update({roam: !reduced.matches});
    });
  })();
})();
