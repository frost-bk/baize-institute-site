(() => {
  const menu = document.querySelector('.menu-toggle');
  const nav = document.getElementById('site-navigation');
  if (menu && nav) {
    menu.hidden = false;
    const setOpen = open => {
      menu.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
    };
    menu.addEventListener('click', () => setOpen(menu.getAttribute('aria-expanded') !== 'true'));
    menu.parentElement.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        menu.focus();
      }
    });
  }
  const scope = document.querySelector('[data-filter]');
  if (!scope) return;
  const form = scope.querySelector('[data-controls]');
  const items = [...scope.querySelectorAll('[data-entry]')].map(link => ({
    link,
    query: link.dataset.query.toLocaleLowerCase('zh-CN'),
    year: link.dataset.year,
    category: link.dataset.category
  }));
  const fields = [...form.querySelectorAll('[name]')];
  const count = scope.querySelector('[data-count]');
  const empty = scope.querySelector('[data-empty]');
  const render = () => {
    const terms = form.elements.q.value.trim().toLocaleLowerCase('zh-CN').split(/\s+/).filter(Boolean);
    const year = form.elements.year.value;
    const category = form.elements.category?.value;
    let visible = 0;
    for (const item of items) {
      const match = terms.every(term => item.query.includes(term)) &&
        (!year || item.year === year) && (!category || item.category === category);
      item.link.hidden = !match;
      if (match) visible++;
    }
    count.textContent = `${visible} 条内容`;
    empty.hidden = visible !== 0;
  };
  const restore = () => {
    const params = new URLSearchParams(location.search);
    for (const field of fields) {
      const value = params.get(field.name) || '';
      field.value = field.tagName === 'SELECT' && ![...field.options].some(option => option.value === value)
        ? '' : value.slice(0, 100);
    }
    render();
  };
  const update = () => {
    const params = new URLSearchParams(location.search);
    for (const field of fields) {
      const value = field.value.trim();
      if (value) params.set(field.name, value);
      else params.delete(field.name);
    }
    const target = location.pathname + (params.size ? '?' + params : '') + location.hash;
    if (target !== location.pathname + location.search + location.hash) history.pushState(null, '', target);
    render();
  };
  form.addEventListener('submit', event => {
    event.preventDefault();
    update();
  });
  form.addEventListener('reset', event => {
    event.preventDefault();
    for (const field of fields) field.value = '';
    update();
  });
  addEventListener('popstate', restore);
  restore();
  form.hidden = false;
})();
