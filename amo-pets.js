(() => {
  const cats = new Set(['bengal', 'british', 'kitten', 'scottish', 'mainecoon']);
  const treated = new WeakSet();

  function findCat(width, height) {
    let saved = [];
    try {
      const pets = JSON.parse(localStorage.getItem('tzpets:v3'));
      if (Array.isArray(pets)) saved = pets;
    } catch {
      // The widget can run with storage disabled.
    }
    for (const element of document.body.children) {
      const shadow = element.shadowRoot;
      const style = shadow?.querySelector('style')?.textContent;
      if (!style?.includes('.pet.held') || !style.includes('.ball') || !style.includes('.bub')) continue;
      const pets = [...shadow.querySelectorAll('div.pet[title]')];
      for (const [index, pet] of pets.entries()) {
        const record = saved[index];
        const known = record?.name === pet.title ? cats.has(record.sp)
          : pet.title === 'Рыжик' || saved.some(item => item?.name === pet.title && cats.has(item.sp));
        if (!known || treated.has(pet) || pet.classList.contains('held') || !pet.querySelector('canvas')) continue;
        const bounds = pet.getBoundingClientRect();
        if (bounds.width && bounds.height && bounds.left >= 0 && bounds.right <= width &&
            bounds.top >= 0 && bounds.bottom <= height) {
          return {pet, x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height * .68};
        }
      }
    }
    return null;
  }

  function hide(pet, reduced, delay) {
    treated.add(pet);
    return pet.animate([
      {opacity: 1, visibility: 'visible', offset: 0},
      {opacity: 0, visibility: 'visible', offset: .08},
      {opacity: 0, visibility: 'hidden', offset: .081},
      {opacity: 0, visibility: 'hidden', offset: .91},
      {opacity: 0, visibility: 'visible', offset: .92},
      {opacity: 1, visibility: 'visible', offset: 1}
    ], {delay, duration: reduced ? 2600 : 3300});
  }

  globalThis.LunaAmoPets = {findCat, hide};
})();
