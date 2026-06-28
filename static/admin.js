/* АВТОМИР — админ-панель */

const ORIGIN_LABELS = { CN: 'Китай', DE: 'Германия', JP: 'Япония', GB: 'Великобритания', US: 'США', OTHER: 'Другое' };

async function adminFetch(url, options) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let msg = 'Ошибка запроса';
    try { const data = await res.json(); msg = data.error || msg; } catch (e) {}
    throw new Error(msg);
  }
  return res.json();
}

function fmtDate(s) {
  if (!s) return '';
  return new Date(s.replace(' ', 'T')).toLocaleString('ru-RU');
}
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function initAdminPage() {
  // ── Tabs
  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-tabpanel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('tab-' + tab).classList.add('active');
      loadTab(tab);
    });
  });

  loadTab('stats');
}

const loadedTabs = new Set();
function loadTab(tab) {
  if (tab === 'stats') loadStats();
  if (tab === 'clients') loadClients();
  if (tab === 'listings') loadListings();
  if (tab === 'content') loadContent();
  if (tab === 'customs') loadCustoms();
  if (tab === 'archive') loadArchive();
  if (tab === 'chat') loadChatUsers();
}

/* ══════════════════════════ СТАТИСТИКА ══════════════════════════ */

async function loadStats() {
  const box = document.getElementById('statsBox');
  try {
    const s = await adminFetch('/api/admin/stats');
    const reqBrands = s.top_requested_brands.map(b => `<li>${escapeHtml(b.name)} — ${b.cnt}</li>`).join('') || '<li>Нет данных</li>';
    const favBrands = s.top_favorite_brands.map(b => `<li>${escapeHtml(b.name)} — ${b.cnt}</li>`).join('') || '<li>Нет данных</li>';
    const days = s.inquiries_by_day.map(d => `<li>${d.d}: ${d.cnt}</li>`).join('') || '<li>Нет заявок за 30 дней</li>';
    box.innerHTML = `
      <div class="admin-stat-card"><div class="admin-stat-card__num">${s.total_cars}</div><div class="admin-stat-card__label">Автомобилей в каталоге</div></div>
      <div class="admin-stat-card"><div class="admin-stat-card__num">${s.total_users}</div><div class="admin-stat-card__label">Зарегистрированных клиентов</div></div>
      <div class="admin-stat-card"><div class="admin-stat-card__num">${s.total_inquiries}</div><div class="admin-stat-card__label">Заявок всего</div></div>
      <div class="admin-stat-card"><div class="admin-stat-card__num">${s.total_favorites}</div><div class="admin-stat-card__label">Добавлений в избранное</div></div>
      <div class="admin-stat-card"><div class="admin-stat-card__num">${fmtPrice(s.avg_price)}</div><div class="admin-stat-card__label">Средняя цена авто</div></div>
      <div class="admin-stat-card admin-stat-card--wide">
        <div class="admin-stat-card__label">Топ марок по заявкам</div>
        <ul class="admin-stat-list">${reqBrands}</ul>
      </div>
      <div class="admin-stat-card admin-stat-card--wide">
        <div class="admin-stat-card__label">Топ марок по избранному</div>
        <ul class="admin-stat-list">${favBrands}</ul>
      </div>
      <div class="admin-stat-card admin-stat-card--wide">
        <div class="admin-stat-card__label">Заявки за последние 30 дней (по дням)</div>
        <ul class="admin-stat-list admin-stat-list--scroll">${days}</ul>
      </div>
    `;
  } catch (e) {
    box.innerHTML = `<p class="form-msg form-msg--err">${escapeHtml(e.message)}</p>`;
  }
}

/* ══════════════════════════ КЛИЕНТЫ ══════════════════════════ */

let clientsPage = 1;

function loadClients(page = 1) {
  clientsPage = page;
  document.getElementById('clientDetail').style.display = 'none';
  const list = document.getElementById('clientsList');
  list.innerHTML = '<div class="spinner"></div>';
  const q = document.getElementById('clientsSearch').value.trim();
  adminFetch(`/api/admin/users?page=${page}&q=${encodeURIComponent(q)}`).then(data => {
    if (!data.users.length) {
      list.innerHTML = '<p class="muted">Клиенты не найдены.</p>';
      document.getElementById('clientsPagination').innerHTML = '';
      return;
    }
    list.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Email</th><th>Имя</th><th>Телефон</th><th>Город</th>
          <th>Избранное</th><th>Заявки</th><th>Статус</th><th>Регистрация</th><th></th></tr></thead>
        <tbody>
          ${data.users.map(u => `
            <tr>
              <td>${escapeHtml(u.email)}</td>
              <td>${escapeHtml(u.name || '—')}</td>
              <td>${escapeHtml(u.phone || '—')}</td>
              <td>${escapeHtml(u.city || '—')}</td>
              <td>${u.fav_count}</td>
              <td>${u.inquiry_count}</td>
              <td>${u.is_admin ? '<span class="admin-badge admin-badge--accent">Админ</span>' : (u.is_blocked ? '<span class="admin-badge admin-badge--err">Заблокирован</span>' : '<span class="admin-badge">Активен</span>')}</td>
              <td>${fmtDate(u.created_at)}</td>
              <td><button class="btn btn--outline btn--sm" data-uid="${u.id}" data-action="detail">Подробнее</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    list.querySelectorAll('[data-action="detail"]').forEach(btn => {
      btn.addEventListener('click', () => loadClientDetail(btn.dataset.uid));
    });

    const pag = document.getElementById('clientsPagination');
    pag.innerHTML = '';
    for (let p = 1; p <= data.total_pages; p++) {
      const b = document.createElement('button');
      b.className = 'btn btn--outline btn--sm' + (p === data.page ? ' active' : '');
      b.textContent = p;
      b.addEventListener('click', () => loadClients(p));
      pag.appendChild(b);
    }
  }).catch(e => { list.innerHTML = `<p class="form-msg form-msg--err">${escapeHtml(e.message)}</p>`; });
}

async function loadClientDetail(uid) {
  const detail = document.getElementById('clientDetail');
  const body = document.getElementById('clientDetailBody');
  detail.style.display = 'block';
  body.innerHTML = '<div class="spinner"></div>';
  try {
    const data = await adminFetch(`/api/admin/users/${uid}`);
    const u = data.user;
    const favs = data.favorites.map(f => `<li>${escapeHtml(f.brand_name)} ${escapeHtml(f.model_name)} (${f.year}) — ${fmtPrice(f.price_rub)}</li>`).join('') || '<li>Нет</li>';
    const inq = data.inquiries.map(i => `<li>${fmtDate(i.created_at)} — ${i.brand_name ? escapeHtml(i.brand_name)+' '+escapeHtml(i.model_name)+' ('+i.year+')' : 'Общий запрос'} — статус: ${escapeHtml(i.status)}</li>`).join('') || '<li>Нет</li>';
    const msgs = data.messages.map(m => `<li><strong>${m.is_from_user ? 'Клиент' : 'Менеджер'}:</strong> ${escapeHtml(m.message)} <span class="muted">(${fmtDate(m.created_at)})</span></li>`).join('') || '<li>Нет</li>';
    body.innerHTML = `
      <h3 class="section-title">${escapeHtml(u.email)}</h3>
      <p>Имя: ${escapeHtml(u.name || '—')} · Телефон: ${escapeHtml(u.phone || '—')} · Город: ${escapeHtml(u.city || '—')}</p>
      <p>Регистрация: ${fmtDate(u.created_at)} · Статус: ${u.is_admin ? 'Администратор' : (u.is_blocked ? 'Заблокирован' : 'Активен')}</p>
      ${!u.is_admin ? `
        <div class="admin-detail__actions">
          <button class="btn btn--outline" id="toggleBlockBtn">${u.is_blocked ? 'Разблокировать' : 'Заблокировать'}</button>
          <button class="btn btn--outline" id="deleteUserBtn" style="border-color:var(--accent);color:var(--accent)">Удалить пользователя</button>
        </div>
      ` : ''}
      <h4 class="section-title">Избранное</h4>
      <ul class="admin-stat-list">${favs}</ul>
      <h4 class="section-title">История заявок</h4>
      <ul class="admin-stat-list">${inq}</ul>
      <h4 class="section-title">Переписка</h4>
      <ul class="admin-stat-list admin-stat-list--scroll">${msgs}</ul>
    `;
    const blockBtn = document.getElementById('toggleBlockBtn');
    if (blockBtn) blockBtn.addEventListener('click', async () => {
      await adminFetch(`/api/admin/users/${uid}/block`, { method: 'POST' });
      loadClientDetail(uid);
      loadClients(clientsPage);
    });
    const delBtn = document.getElementById('deleteUserBtn');
    if (delBtn) delBtn.addEventListener('click', async () => {
      if (!confirm('Удалить пользователя безвозвратно?')) return;
      await adminFetch(`/api/admin/users/${uid}`, { method: 'DELETE' });
      detail.style.display = 'none';
      loadClients(clientsPage);
    });
  } catch (e) {
    body.innerHTML = `<p class="form-msg form-msg--err">${escapeHtml(e.message)}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const searchBtn = document.getElementById('clientsSearchBtn');
  if (searchBtn) searchBtn.addEventListener('click', () => loadClients(1));
  const searchInput = document.getElementById('clientsSearch');
  if (searchInput) searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadClients(1); });
  const back = document.getElementById('clientDetailBack');
  if (back) back.addEventListener('click', () => { document.getElementById('clientDetail').style.display = 'none'; });
});

/* ══════════════════════════ ОБЪЯВЛЕНИЯ ══════════════════════════ */

let allBrands = [];

async function loadListings() {
  const list = document.getElementById('listingsList');
  list.innerHTML = '<div class="spinner"></div>';
  const q = document.getElementById('listingsSearch').value.trim();
  try {
    const cars = await adminFetch(`/api/admin/cars?q=${encodeURIComponent(q)}`);
    if (!cars.length) {
      list.innerHTML = '<p class="muted">Объявления не найдены.</p>';
      return;
    }
    list.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Марка</th><th>Модель</th><th>Год</th><th>Цена без растаможки</th><th>Цена на сайте</th><th>Спец.</th><th></th></tr></thead>
        <tbody>
          ${cars.map(c => `
            <tr>
              <td>${escapeHtml(c.brand_name)}</td>
              <td>${escapeHtml(c.model_name)}</td>
              <td>${c.year}</td>
              <td>${fmtPrice(c.price_base)}</td>
              <td>${fmtPrice(c.price_rub)}</td>
              <td>${c.is_special ? 'Да' : '—'}</td>
              <td>
                <button class="btn btn--outline btn--sm" data-action="edit" data-id="${c.id}">Изменить</button>
                <button class="btn btn--outline btn--sm" data-action="delete" data-id="${c.id}" style="border-color:var(--accent);color:var(--accent)">Удалить</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    list.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => openCarForm(cars.find(c => c.id == btn.dataset.id)));
    });
    list.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Удалить объявление?')) return;
        await adminFetch(`/api/admin/cars/${btn.dataset.id}`, { method: 'DELETE' });
        loadListings();
      });
    });
  } catch (e) {
    list.innerHTML = `<p class="form-msg form-msg--err">${escapeHtml(e.message)}</p>`;
  }
}

async function ensureBrandsLoaded() {
  if (!allBrands.length) {
    allBrands = await adminFetch('/api/admin/brands');
  }
  return allBrands;
}

async function fillBrandSelect(selectedBrandId) {
  const brands = await ensureBrandsLoaded();
  const sel = document.getElementById('carBrand');
  sel.innerHTML = '<option value="">— выбрать —</option>' + brands.map(b =>
    `<option value="${b.id}" ${b.id == selectedBrandId ? 'selected' : ''}>${escapeHtml(b.name)} (${ORIGIN_LABELS[b.origin] || b.origin})</option>`
  ).join('');
}

async function fillModelSelect(brandId, selectedModelId) {
  const sel = document.getElementById('carModel');
  if (!brandId) { sel.innerHTML = '<option value="">— сначала выберите марку —</option>'; return; }
  const models = await adminFetch(`/api/admin/models?brand_id=${brandId}`);
  sel.innerHTML = '<option value="">— выбрать —</option>' + models.map(m =>
    `<option value="${m.id}" ${m.id == selectedModelId ? 'selected' : ''}>${escapeHtml(m.name)}</option>`
  ).join('');
}

function updateCarPhotoPreview() {
  const preview = document.getElementById('carPhotoPreview');
  const url = document.getElementById('carPhoto').value.trim();
  if (!preview) return;
  if (url) {
    preview.src = url;
    preview.style.display = '';
  } else {
    preview.style.display = 'none';
    preview.src = '';
  }
}

async function uploadCarPhoto(file) {
  const uploadMsg = document.getElementById('carPhotoUploadMsg');
  uploadMsg.className = '';
  uploadMsg.style.display = 'block';
  uploadMsg.textContent = 'Загрузка...';
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
    if (!res.ok) {
      let msg = 'Ошибка загрузки';
      try { const data = await res.json(); msg = data.error || msg; } catch (e) {}
      throw new Error(msg);
    }
    const data = await res.json();
    document.getElementById('carPhoto').value = data.url;
    updateCarPhotoPreview();
    uploadMsg.className = 'form-msg form-msg--ok';
    uploadMsg.textContent = 'Фото загружено';
  } catch (err) {
    uploadMsg.className = 'form-msg form-msg--err';
    uploadMsg.textContent = err.message;
  }
}

async function openCarForm(car) {
  document.getElementById('listingForm').style.display = 'block';
  document.getElementById('listingFormTitle').textContent = car ? 'Редактирование объявления' : 'Новое объявление';
  document.getElementById('carFormMsg').style.display = 'none';
  document.getElementById('carPriceRubPreview').textContent = '';
  document.getElementById('carNewBrand').value = '';
  document.getElementById('carNewModel').value = '';

  await fillBrandSelect(car ? car.brand_id : '');
  if (car) {
    await fillModelSelect(car.brand_id, car.model_id);
  } else {
    document.getElementById('carModel').innerHTML = '<option value="">— сначала выберите марку —</option>';
  }

  document.getElementById('carBrand').onchange = (e) => fillModelSelect(e.target.value, null);

  document.getElementById('carId').value = car ? car.id : '';
  document.getElementById('carYear').value = car ? car.year : new Date().getFullYear();
  document.getElementById('carPriceBase').value = car ? car.price_base : '';
  document.getElementById('carMileage').value = car ? car.mileage : '';
  document.getElementById('carVolume').value = car ? car.engine_volume : '';
  document.getElementById('carHp').value = car ? car.horsepower : '';
  document.getElementById('carFuel').value = car ? car.fuel_type : 'Бензин';
  document.getElementById('carTransmission').value = car ? car.transmission : 'АКПП';
  document.getElementById('carColor').value = car ? (car.color || '') : '';
  document.getElementById('carBadge').value = car ? (car.badge || '') : '';
  document.getElementById('carPhoto').value = car ? (car.photo_main || '') : '';
  document.getElementById('carDescription').value = car ? (car.description || '') : '';
  document.getElementById('carSpecial').checked = !!(car && car.is_special);

  const photoFileInput = document.getElementById('carPhotoFile');
  if (photoFileInput) photoFileInput.value = '';
  const uploadMsg = document.getElementById('carPhotoUploadMsg');
  if (uploadMsg) uploadMsg.style.display = 'none';
  updateCarPhotoPreview();

  if (car) document.getElementById('carPriceRubPreview').textContent = `Текущая цена на сайте (с растаможкой): ${fmtPrice(car.price_rub)}`;

  document.getElementById('listingForm').scrollIntoView({ behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', () => {
  const searchBtn = document.getElementById('listingsSearchBtn');
  if (searchBtn) searchBtn.addEventListener('click', loadListings);
  const searchInput = document.getElementById('listingsSearch');
  if (searchInput) searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadListings(); });

  const addBtn = document.getElementById('listingAddBtn');
  if (addBtn) addBtn.addEventListener('click', () => openCarForm(null));

  const cancelBtn = document.getElementById('listingFormCancel');
  if (cancelBtn) cancelBtn.addEventListener('click', () => { document.getElementById('listingForm').style.display = 'none'; });

  const carPhotoInput = document.getElementById('carPhoto');
  if (carPhotoInput) carPhotoInput.addEventListener('input', updateCarPhotoPreview);

  const carPhotoFile = document.getElementById('carPhotoFile');
  if (carPhotoFile) carPhotoFile.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) uploadCarPhoto(file);
  });

  const carForm = document.getElementById('carForm');
  if (carForm) carForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('carFormMsg');
    msg.style.display = 'none';
    try {
      let brandId = document.getElementById('carBrand').value;
      const newBrandName = document.getElementById('carNewBrand').value.trim();
      if (newBrandName) {
        const origin = document.getElementById('carNewBrandOrigin').value;
        const r = await adminFetch('/api/admin/brands', { method: 'POST', body: JSON.stringify({ name: newBrandName, origin }) });
        brandId = r.id;
        allBrands = []; // сбросить кэш
      }
      if (!brandId) throw new Error('Выберите или укажите марку');

      let modelId = document.getElementById('carModel').value;
      const newModelName = document.getElementById('carNewModel').value.trim();
      if (newModelName) {
        const r = await adminFetch('/api/admin/models', { method: 'POST', body: JSON.stringify({ brand_id: brandId, name: newModelName }) });
        modelId = r.id;
      }
      if (!modelId) throw new Error('Выберите или укажите модель');

      const payload = {
        brand_id: brandId, model_id: modelId,
        year: document.getElementById('carYear').value,
        price_base: document.getElementById('carPriceBase').value,
        mileage: document.getElementById('carMileage').value,
        engine_volume: document.getElementById('carVolume').value,
        horsepower: document.getElementById('carHp').value,
        fuel_type: document.getElementById('carFuel').value,
        transmission: document.getElementById('carTransmission').value,
        color: document.getElementById('carColor').value,
        badge: document.getElementById('carBadge').value,
        photo_main: document.getElementById('carPhoto').value,
        description: document.getElementById('carDescription').value,
        is_special: document.getElementById('carSpecial').checked ? 1 : 0,
      };

      const carId = document.getElementById('carId').value;
      let result;
      if (carId) {
        result = await adminFetch(`/api/admin/cars/${carId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        result = await adminFetch('/api/admin/cars', { method: 'POST', body: JSON.stringify(payload) });
      }
      document.getElementById('carPriceRubPreview').textContent = `Цена на сайте (с растаможкой): ${fmtPrice(result.price_rub)}`;
      msg.className = 'form-msg form-msg--ok';
      msg.textContent = 'Сохранено';
      msg.style.display = 'block';
      loadListings();
    } catch (err) {
      msg.className = 'form-msg form-msg--err';
      msg.textContent = err.message;
      msg.style.display = 'block';
    }
  });
});

/* ══════════════════════════ КОНТЕНТ САЙТА ══════════════════════════ */

async function loadContent() {
  const list = document.getElementById('contentList');
  list.innerHTML = '<div class="spinner"></div>';
  try {
    const items = await adminFetch('/api/admin/content');
    list.innerHTML = items.map(it => `
      <div class="form__group">
        <label class="form__label">${escapeHtml(it.label)}</label>
        <textarea class="form__input" rows="2" data-key="${it.key}" placeholder="По умолчанию: ${escapeHtml(it.default || '')}">${escapeHtml(it.value)}</textarea>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = `<p class="form-msg form-msg--err">${escapeHtml(e.message)}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('contentSaveBtn');
  if (btn) btn.addEventListener('click', async () => {
    const msg = document.getElementById('contentMsg');
    const items = {};
    document.querySelectorAll('#contentList textarea[data-key]').forEach(t => { items[t.dataset.key] = t.value; });
    try {
      await adminFetch('/api/admin/content', { method: 'PUT', body: JSON.stringify({ items }) });
      msg.className = 'form-msg form-msg--ok';
      msg.textContent = 'Изменения сохранены';
      msg.style.display = 'block';
    } catch (e) {
      msg.className = 'form-msg form-msg--err';
      msg.textContent = e.message;
      msg.style.display = 'block';
    }
  });
});

/* ══════════════════════════ КАЛЬКУЛЯТОР РАСТАМОЖКИ ══════════════════════════ */

const ADMIN_CUSTOMS_DEFAULTS = {
  eur_rate: 100,
  base_util: 20000,
  duty_new: [[1000,0.54,2.5],[1500,0.54,3.5],[1800,0.54,5.0],[2300,0.54,7.5],[3000,0.54,7.5],[null,0.80,15.0]],
  duty_3_5: [[1000,1.5],[1500,1.7],[1800,2.5],[2300,2.7],[3000,3.0],[null,3.6]],
  duty_5plus: [[1000,3.0],[1500,3.2],[1800,3.5],[2300,4.8],[3000,5.0],[null,5.7]],
  util_electro_new: 0.17,
  util_electro_old: 0.26,
  util_ice_new_small: 4.26,
  util_ice_new_large: 5.84,
  util_ice_old_small: 12.98,
  util_ice_old_large: 18.89,
  excise_tiers: [[300,1628],[200,955],[150,583],[90,61]],
  clearance_fee: 2462,
};

const CUSTOMS_SCALAR_LABELS = {
  eur_rate: 'Курс EUR/RUB для расчёта пошлины',
  base_util: 'Базовая ставка утильсбора (₽)',
  clearance_fee: 'Таможенное оформление (₽)',
  util_electro_new: 'Коэф. утильсбора, электро, до 3 лет',
  util_electro_old: 'Коэф. утильсбора, электро, от 3 лет',
  util_ice_new_small: 'Коэф. утильсбора, ДВС ≤3000см³, до 3 лет',
  util_ice_new_large: 'Коэф. утильсбора, ДВС >3000см³, до 3 лет',
  util_ice_old_small: 'Коэф. утильсбора, ДВС ≤3000см³, от 3 лет',
  util_ice_old_large: 'Коэф. утильсбора, ДВС >3000см³, от 3 лет',
};

const CUSTOMS_TABLE_LABELS = {
  duty_new: 'Пошлина, авто до 3 лет: [объём см³ (или null=∞), % от стоимости, мин. €/см³]',
  duty_3_5: 'Пошлина, авто 3–5 лет: [объём см³ (или null=∞), €/см³]',
  duty_5plus: 'Пошлина, авто старше 5 лет: [объём см³ (или null=∞), €/см³]',
  excise_tiers: 'Акциз: [мощность л.с. свыше, ₽ за л.с.] (по убыванию)',
};

function renderCustomsForm(settings) {
  const form = document.getElementById('customsForm');
  let html = '<div class="form__row">';
  Object.keys(CUSTOMS_SCALAR_LABELS).forEach(key => {
    html += `
      <div class="form__group">
        <label class="form__label">${CUSTOMS_SCALAR_LABELS[key]}</label>
        <input type="number" step="any" class="form__input" data-key="${key}" value="${settings[key]}"/>
      </div>
    `;
  });
  html += '</div>';
  Object.keys(CUSTOMS_TABLE_LABELS).forEach(key => {
    html += `
      <div class="form__group">
        <label class="form__label">${CUSTOMS_TABLE_LABELS[key]}</label>
        <textarea class="form__input" rows="2" data-key-json="${key}">${JSON.stringify(settings[key])}</textarea>
      </div>
    `;
  });
  form.innerHTML = html;
}

async function loadCustoms() {
  const form = document.getElementById('customsForm');
  form.innerHTML = '<div class="spinner"></div>';
  try {
    const settings = await adminFetch('/api/admin/customs-settings');
    renderCustomsForm({ ...ADMIN_CUSTOMS_DEFAULTS, ...settings });
  } catch (e) {
    form.innerHTML = `<p class="form-msg form-msg--err">${escapeHtml(e.message)}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const saveBtn = document.getElementById('customsSaveBtn');
  if (saveBtn) saveBtn.addEventListener('click', async () => {
    const msg = document.getElementById('customsMsg');
    try {
      const payload = {};
      document.querySelectorAll('#customsForm input[data-key]').forEach(inp => {
        payload[inp.dataset.key] = parseFloat(inp.value);
      });
      document.querySelectorAll('#customsForm textarea[data-key-json]').forEach(ta => {
        payload[ta.dataset.keyJson] = JSON.parse(ta.value);
      });
      await adminFetch('/api/admin/customs-settings', { method: 'PUT', body: JSON.stringify(payload) });
      msg.className = 'form-msg form-msg--ok';
      msg.textContent = 'Параметры сохранены';
      msg.style.display = 'block';
    } catch (e) {
      msg.className = 'form-msg form-msg--err';
      msg.textContent = 'Ошибка: ' + e.message;
      msg.style.display = 'block';
    }
  });

  const resetBtn = document.getElementById('customsResetBtn');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    renderCustomsForm(ADMIN_CUSTOMS_DEFAULTS);
  });
});

/* ══════════════════════════ АРХИВ ══════════════════════════ */

async function loadArchive() {
  const inqBox = document.getElementById('archiveInquiries');
  const msgBox = document.getElementById('archiveMessages');
  inqBox.innerHTML = '<div class="spinner"></div>';
  msgBox.innerHTML = '';
  const q = document.getElementById('archiveSearch').value.trim();
  try {
    const data = await adminFetch(`/api/admin/archive?q=${encodeURIComponent(q)}`);
    if (!data.inquiries.length) {
      inqBox.innerHTML = '<p class="muted">Заявок не найдено.</p>';
    } else {
      inqBox.innerHTML = `
        <table class="admin-table">
          <thead><tr><th>Дата</th><th>Имя</th><th>Телефон</th><th>Авто</th><th>Сообщение</th></tr></thead>
          <tbody>
            ${data.inquiries.map(i => `
              <tr>
                <td>${fmtDate(i.created_at)}</td>
                <td>${escapeHtml(i.name)}</td>
                <td>${escapeHtml(i.phone)}</td>
                <td>${i.brand_name ? escapeHtml(i.brand_name) + ' ' + escapeHtml(i.model_name) : '—'}</td>
                <td>${escapeHtml(i.message || '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
    if (!data.messages.length) {
      msgBox.innerHTML = '<p class="muted">Сообщений не найдено.</p>';
    } else {
      msgBox.innerHTML = `
        <table class="admin-table">
          <thead><tr><th>Дата</th><th>Клиент</th><th>От кого</th><th>Сообщение</th></tr></thead>
          <tbody>
            ${data.messages.map(m => `
              <tr>
                <td>${fmtDate(m.created_at)}</td>
                <td>${escapeHtml(m.user_name || m.email)}</td>
                <td>${m.is_from_user ? 'Клиент' : 'Менеджер'}</td>
                <td>${escapeHtml(m.message)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
  } catch (e) {
    inqBox.innerHTML = `<p class="form-msg form-msg--err">${escapeHtml(e.message)}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('archiveSearchBtn');
  if (btn) btn.addEventListener('click', loadArchive);
  const input = document.getElementById('archiveSearch');
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') loadArchive(); });
});

/* ══════════════════════════ ЧАТ С КЛИЕНТАМИ ══════════════════════════ */

let chatActiveUser = null;
let chatPollTimer = null;

async function loadChatUsers() {
  const list = document.getElementById('chatUsersList');
  list.innerHTML = '<div class="spinner"></div>';
  try {
    const users = await adminFetch('/api/admin/chat/users');
    if (!users.length) {
      list.innerHTML = '<p class="muted">Нет переписок.</p>';
      return;
    }
    list.innerHTML = users.map(u => `
      <div class="admin-chat-user ${chatActiveUser == u.id ? 'active' : ''}" data-uid="${u.id}">
        <div class="admin-chat-user__name">${escapeHtml(u.name || u.email)}</div>
        <div class="admin-chat-user__meta">${fmtDate(u.last_msg)} ${u.unread ? `<span class="header__badge" style="position:static;display:inline-block">${u.unread}</span>` : ''}</div>
      </div>
    `).join('');
    list.querySelectorAll('.admin-chat-user').forEach(el => {
      el.addEventListener('click', () => openChatConversation(el.dataset.uid, users.find(u => u.id == el.dataset.uid)));
    });
  } catch (e) {
    list.innerHTML = `<p class="form-msg form-msg--err">${escapeHtml(e.message)}</p>`;
  }
}

async function openChatConversation(uid, userInfo) {
  chatActiveUser = uid;
  document.querySelectorAll('.admin-chat-user').forEach(el => el.classList.toggle('active', el.dataset.uid == uid));
  const win = document.getElementById('chatWindow');
  win.innerHTML = `
    <div class="admin-chat-title">${escapeHtml((userInfo && (userInfo.name || userInfo.email)) || ('Клиент #' + uid))}</div>
    <div class="chat-messages" id="adminChatMessages"><div class="spinner"></div></div>
    <form class="chat-form" id="adminChatForm">
      <input type="text" class="form__input" id="adminChatInput" placeholder="Ответ клиенту..." autocomplete="off"/>
      <button type="submit" class="btn btn--accent">Отправить</button>
    </form>
  `;
  await renderChatMessages(uid);
  document.getElementById('adminChatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('adminChatInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await adminFetch(`/api/admin/chat/${uid}`, { method: 'POST', body: JSON.stringify({ message: text }) });
    await renderChatMessages(uid);
    loadChatUsers();
  });

  if (chatPollTimer) clearInterval(chatPollTimer);
  chatPollTimer = setInterval(() => {
    if (chatActiveUser == uid && document.getElementById('tab-chat').classList.contains('active')) {
      renderChatMessages(uid);
    } else {
      clearInterval(chatPollTimer);
    }
  }, 10000);
}

async function renderChatMessages(uid) {
  const box = document.getElementById('adminChatMessages');
  if (!box) return;
  try {
    const messages = await adminFetch(`/api/admin/chat/${uid}`);
    box.innerHTML = messages.map(m => {
      const carInfo = m.car_brand
        ? `<div class="chat-message__car">🚗 ${escapeHtml(m.car_brand)} ${escapeHtml(m.car_model)} ${escapeHtml(m.car_year)}</div>`
        : '';
      return `
      <div class="chat-message ${m.is_from_user ? 'chat-message--user' : 'chat-message--manager'}">
        ${carInfo}
        <div class="chat-message__bubble">${escapeHtml(m.message)}</div>
        <div class="chat-message__time">${fmtDate(m.created_at)}</div>
      </div>
    `;
    }).join('') || '<p class="muted">Нет сообщений.</p>';
    box.scrollTop = box.scrollHeight;
  } catch (e) {
    box.innerHTML = `<p class="form-msg form-msg--err">${escapeHtml(e.message)}</p>`;
  }
}

if (typeof window !== 'undefined') {
  window.initAdminPage = initAdminPage;
}
