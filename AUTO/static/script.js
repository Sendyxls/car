'use strict';

// ═══════════════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════════════

const fmtPrice = n => Number(n).toLocaleString('ru-RU') + ' ₽';

const COUNTRY_CURRENCY = { CN: 'CNY', KR: 'KRW', JP: 'JPY', DE: 'EUR', US: 'USD' };
const COUNTRY_NAMES    = { CN: 'Китай', KR: 'Корея', JP: 'Япония', DE: 'Германия', US: 'США' };

function getUrlParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    page:      parseInt(p.get('page')   || '1'),
    brand:     p.get('brand')  || '',
    model:     p.get('model')  || '',
    year_from: p.get('year_from') || '',
    price_to:  p.get('price_to')  || '',
    fuel:      p.get('fuel')   || '',
    origin:    p.get('origin') || '',
  };
}

function setUrlParams(params) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) p.set(k, v); });
  const str = p.toString();
  history.pushState({}, '', str ? '?' + str : window.location.pathname);
}

// ═══════════════════════════════════════════════════════
//  API
// ═══════════════════════════════════════════════════════

async function apiFetch(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) {
    let err;
    try { err = await r.json(); } catch (_) { err = {}; }
    const e = new Error(err.error || ('HTTP ' + r.status));
    e.data = err;
    throw e;
  }
  return r.json();
}

async function loadBrands() {
  return apiFetch('/api/brands');
}

async function loadModels(brandName) {
  const brands = await apiFetch('/api/brands');
  const brand  = brands.find(b => b.name === brandName);
  if (!brand) return [];
  return apiFetch('/api/models?brand_id=' + brand.id);
}

async function loadCars(params) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, v); });
  return apiFetch('/api/cars?' + q.toString());
}

async function loadCar(id) {
  return apiFetch('/api/car/' + id);
}

async function postInquiry(data) {
  const r = await fetch('/api/inquiry', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  });
  return r.json();
}

// ═══════════════════════════════════════════════════════
//  RENDER CAR CARD
// ═══════════════════════════════════════════════════════

function renderCard(car) {
  const vol = car.engine_volume > 0
    ? (car.engine_volume / 1000).toFixed(1) + 'л'
    : '—';
  const favActive = isFavoriteCached(car.id, car.is_favorite);
  return `
    <div class="car-card" data-car-id="${car.id}">
      <div class="car-card__img-wrap">
        <img class="car-card__img" src="${car.photo_main}" alt="${car.brand_name} ${car.model_name}" loading="lazy"/>
        ${car.badge ? `<span class="car-card__badge">${car.badge}</span>` : ''}
        <button class="favorite-btn${favActive ? ' active' : ''}" onclick="toggleFavorite(event, ${car.id})" aria-label="В избранное">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
      </div>
      <div class="car-card__body">
        <div class="car-card__title">${car.brand_name} ${car.model_name} ${car.year}</div>
        <div class="car-card__price">${fmtPrice(car.price_rub)}</div>
        <div class="car-card__specs">
          <span class="car-card__spec">⛽ ${car.fuel_type}${vol !== '—' ? ', ' + vol : ''}</span>
          <span class="car-card__spec">📍 ${Number(car.mileage).toLocaleString('ru-RU')} км</span>
          <span class="car-card__spec">⚙️ ${car.transmission}</span>
          <span class="car-card__spec">📅 ${car.year} г.</span>
          <span class="car-card__spec">🏎️ ${car.horsepower} л.с.</span>
        </div>
        <div class="car-card__actions">
          <a href="/car/${car.id}" class="btn btn--outline">Подробнее</a>
          <button class="btn btn--outline btn--icon" onclick='openCustomsForCar(${car.id})' title="Информация о растаможке">🛃</button>
        </div>
        <div class="car-card__actions">
          <button class="btn btn--accent" onclick='openManagerModal(${JSON.stringify({id:car.id,brand_name:car.brand_name,model_name:car.model_name,year:car.year}).replace(/'/g,"&#39;")})'>Связаться с менеджером</button>
        </div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════
//  PAGINATION
// ═══════════════════════════════════════════════════════

function renderPagination(currentPage, totalPages, onPageChange) {
  const el = document.getElementById('pagination');
  if (!el || totalPages <= 1) { if (el) el.innerHTML = ''; return; }

  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('…');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('…');
    pages.push(totalPages);
  }

  const btn = (label, page, disabled, active) =>
    `<button class="pagination__btn${active ? ' active' : ''}" ${disabled ? 'disabled' : ''}
      onclick="${typeof page === 'number' ? `(${onPageChange.toString()})(${page})` : ''}"
    >${label}</button>`;

  el.innerHTML =
    btn('« Назад', currentPage - 1, currentPage === 1, false) +
    pages.map(p =>
      p === '…'
        ? `<span class="pagination__ellipsis">…</span>`
        : btn(p, p, false, p === currentPage)
    ).join('') +
    btn('Вперёд »', currentPage + 1, currentPage === totalPages, false);
}

// ═══════════════════════════════════════════════════════
//  INDEX PAGE
// ═══════════════════════════════════════════════════════

async function initIndexPage() {
  await initFilter();
  const params = getUrlParams();
  syncFilterUI(params);
  await fetchAndRenderCatalog(params);
  await initSlider();
}

async function initFilter() {
  const brandSel = document.getElementById('filterBrand');
  if (!brandSel) return;

  try {
    const brands = await loadBrands();
    let separatorAdded = false;
    brands.forEach(b => {
      if (!separatorAdded && b.origin !== 'CN' && brands.some(x => x.origin === 'CN')) {
        const sep = document.createElement('option');
        sep.disabled = true;
        sep.textContent = '──────────';
        brandSel.appendChild(sep);
        separatorAdded = true;
      }
      const opt = document.createElement('option');
      opt.value = b.name;
      opt.textContent = b.origin === 'CN' ? '🇨🇳 ' + b.name : b.name;
      brandSel.appendChild(opt);
    });
  } catch (_) {}

  brandSel.addEventListener('change', async () => {
    const modelSel = document.getElementById('filterModel');
    modelSel.innerHTML = '<option value="">Все модели</option>';
    if (brandSel.value) {
      try {
        const models = await loadModels(brandSel.value);
        models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.name; opt.textContent = m.name;
          modelSel.appendChild(opt);
        });
      } catch (_) {}
    }
    applyFilter();
  });

  document.getElementById('filterBtn')?.addEventListener('click', applyFilter);
  document.getElementById('filterReset')?.addEventListener('click', resetFilter);
  document.getElementById('filterModel')?.addEventListener('change', applyFilter);
  document.getElementById('filterYear')?.addEventListener('change', applyFilter);
  document.getElementById('filterPrice')?.addEventListener('change', applyFilter);
  document.getElementById('filterFuel')?.addEventListener('change', applyFilter);
  document.getElementById('filterChinaOnly')?.addEventListener('change', applyFilter);
}

function getFilterParams() {
  return {
    page:      1,
    brand:     document.getElementById('filterBrand')?.value  || '',
    model:     document.getElementById('filterModel')?.value  || '',
    year_from: document.getElementById('filterYear')?.value   || '',
    price_to:  document.getElementById('filterPrice')?.value  || '',
    fuel:      document.getElementById('filterFuel')?.value   || '',
    origin:    document.getElementById('filterChinaOnly')?.checked ? 'CN' : '',
  };
}

function syncFilterUI(params) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('filterBrand', params.brand);
  set('filterModel', params.model);
  set('filterYear',  params.year_from);
  set('filterPrice', params.price_to);
  set('filterFuel',  params.fuel);
  const china = document.getElementById('filterChinaOnly');
  if (china) china.checked = params.origin === 'CN';
}

function applyFilter() {
  const params = getFilterParams();
  setUrlParams(params);
  document.querySelector('.catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  fetchAndRenderCatalog(params);
}

function resetFilter() {
  ['filterBrand','filterModel','filterYear','filterPrice','filterFuel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const china = document.getElementById('filterChinaOnly');
  if (china) china.checked = false;
  setUrlParams({});
  fetchAndRenderCatalog({ page: 1 });
}

async function fetchAndRenderCatalog(params) {
  const grid  = document.getElementById('catalogGrid');
  const empty = document.getElementById('catalogEmpty');
  const count = document.getElementById('catalogCount');
  if (!grid) return;

  grid.innerHTML = `<div class="catalog__loading"><div class="spinner"></div><p>Загрузка...</p></div>`;
  if (empty) empty.style.display = 'none';
  if (count) count.style.display = 'none';

  try {
    const data = await loadCars(params);
    if (data.cars.length === 0) {
      grid.innerHTML = '';
      if (empty) empty.style.display = '';
    } else {
      grid.innerHTML = data.cars.map(renderCard).join('');
      if (count) {
        count.style.display = '';
        document.getElementById('countNum').textContent = data.total;
      }
    }

    renderPagination(data.page, data.total_pages, function(p) {
      const newParams = { ...getFilterParams(), page: p };
      setUrlParams(newParams);
      fetchAndRenderCatalog(newParams);
      document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  } catch (e) {
    grid.innerHTML = `<div class="catalog__loading"><p style="color:var(--accent)">Ошибка загрузки. Проверьте соединение.</p></div>`;
  }
}

// ═══════════════════════════════════════════════════════
//  SLIDER (special offers)
// ═══════════════════════════════════════════════════════

let sliderIdx = 0;
let specialCarsCache = [];

async function initSlider() {
  const track    = document.getElementById('sliderTrack');
  const dotsWrap = document.getElementById('sliderDots');
  if (!track) return;

  try {
    const data = await loadCars({ special: '1', limit: 20, page: 1 });
    specialCarsCache = data.cars;
  } catch (_) { return; }

  if (!specialCarsCache.length) return;

  track.innerHTML = specialCarsCache.map(car =>
    `<div class="slider__slide">${renderCard(car)}</div>`
  ).join('');

  const visibleCount = () => window.innerWidth < 768 ? 1 : window.innerWidth < 900 ? 2 : 3;

  function buildDots() {
    const vc = visibleCount();
    const total = Math.ceil(specialCarsCache.length / vc);
    dotsWrap.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const btn = document.createElement('button');
      btn.className = 'slider__dot' + (i === sliderIdx ? ' active' : '');
      btn.onclick = () => goTo(i);
      dotsWrap.appendChild(btn);
    }
  }

  function goTo(idx) {
    const vc   = visibleCount();
    const max  = Math.max(0, Math.ceil(specialCarsCache.length / vc) - 1);
    sliderIdx  = Math.min(Math.max(idx, 0), max);
    const slideW = track.parentElement.offsetWidth / vc;
    track.style.transform = `translateX(-${sliderIdx * slideW * vc}px)`;
    document.querySelectorAll('.slider__dot').forEach((d, i) => d.classList.toggle('active', i === sliderIdx));
    document.getElementById('sliderPrev').disabled = sliderIdx === 0;
    document.getElementById('sliderNext').disabled = sliderIdx >= max;
  }

  document.getElementById('sliderPrev').addEventListener('click', () => goTo(sliderIdx - 1));
  document.getElementById('sliderNext').addEventListener('click', () => goTo(sliderIdx + 1));

  buildDots();
  goTo(0);
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { buildDots(); goTo(0); }, 100);
  });
}

// ═══════════════════════════════════════════════════════
//  REVIEWS SLIDER
// ═══════════════════════════════════════════════════════

let reviewIdx = 0;

function initReviewsSlider() {
  const track    = document.getElementById('reviewsTrack');
  const dotsWrap = document.getElementById('reviewDots');
  if (!track) return;

  const reviews = track.querySelectorAll('.review-card');
  const visibleCount = () => window.innerWidth < 768 ? 1 : window.innerWidth < 900 ? 2 : 3;

  function buildDots() {
    const vc    = visibleCount();
    const total = Math.ceil(reviews.length / vc);
    dotsWrap.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const btn = document.createElement('button');
      btn.className = 'slider__dot' + (i === reviewIdx ? ' active' : '');
      btn.onclick = () => goTo(i);
      dotsWrap.appendChild(btn);
    }
  }

  function goTo(idx) {
    const vc  = visibleCount();
    const max = Math.max(0, Math.ceil(reviews.length / vc) - 1);
    reviewIdx = Math.min(Math.max(idx, 0), max);
    const w   = track.parentElement.offsetWidth / vc;
    track.style.transform = `translateX(-${reviewIdx * w * vc}px)`;
    document.querySelectorAll('#reviewDots .slider__dot').forEach((d, i) => d.classList.toggle('active', i === reviewIdx));
    document.getElementById('reviewPrev').disabled = reviewIdx === 0;
    document.getElementById('reviewNext').disabled = reviewIdx >= max;
  }

  document.getElementById('reviewPrev').addEventListener('click', () => goTo(reviewIdx - 1));
  document.getElementById('reviewNext').addEventListener('click', () => goTo(reviewIdx + 1));

  reviews.forEach(r => { r.style.minWidth = `calc(${100 / visibleCount()}% - ${(visibleCount()-1)*24/visibleCount()}px)`; });

  buildDots();
  goTo(0);
  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      reviews.forEach(r => { r.style.minWidth = `calc(${100 / visibleCount()}% - ${(visibleCount()-1)*24/visibleCount()}px)`; });
      buildDots(); goTo(0);
    }, 100);
  });
}

// ═══════════════════════════════════════════════════════
//  CAR DETAIL PAGE
// ═══════════════════════════════════════════════════════

async function initCarDetailPage(carId) {
  const loading = document.getElementById('carDetailLoading');
  const content = document.getElementById('carDetailContent');
  if (!content) return;

  try {
    const car = await loadCar(carId);
    document.title = `${car.brand_name} ${car.model_name} ${car.year} — АВТОМИР`;
    document.getElementById('breadcrumbName').textContent = `${car.brand_name} ${car.model_name} ${car.year}`;

    // Photo
    const img = document.getElementById('detailPhoto');
    img.src = car.photo_main;
    img.alt = `${car.brand_name} ${car.model_name}`;

    // Badge
    const badge = document.getElementById('detailBadge');
    if (car.badge) { badge.textContent = car.badge; badge.style.display = ''; }

    // Favorite button
    const favBtn = document.getElementById('detailFavBtn');
    if (favBtn && isFavoriteCached(car.id, car.is_favorite)) favBtn.classList.add('active');

    // Title + price
    document.getElementById('detailTitle').textContent = `${car.brand_name} ${car.model_name} ${car.year}`;
    document.getElementById('detailPrice').textContent = fmtPrice(car.price_rub);

    // Specs
    const vol = car.engine_volume > 0 ? (car.engine_volume / 1000).toFixed(1) + ' л' : '—';
    const specs = [
      ['Двигатель', `${car.fuel_type}${vol !== '—' ? ', ' + vol : ''}`],
      ['Мощность',  `${car.horsepower} л.с.`],
      ['КПП',       car.transmission],
      ['Пробег',    `${Number(car.mileage).toLocaleString('ru-RU')} км`],
      ['Год',       car.year],
      ['Цвет',      car.color || '—'],
    ];
    document.getElementById('detailSpecs').innerHTML = specs.map(([label, val]) =>
      `<div class="detail-spec"><span class="detail-spec__label">${label}</span><span>${val}</span></div>`
    ).join('');

    // Description
    document.getElementById('detailDesc').textContent = car.description || '';

    // Customs / manager buttons
    document.getElementById('detailCalcBtn').onclick = () => openCustomsForCar(carId, car);
    document.getElementById('detailManagerBtn').onclick = () => openManagerModal(car);

    loading.style.display = 'none';
    content.style.display = '';
  } catch (e) {
    loading.innerHTML = `<p style="color:var(--accent)">Автомобиль не найден.</p>`;
  }
}

// ═══════════════════════════════════════════════════════
//  CUSTOMS INFO (справочный расчёт)
// ═══════════════════════════════════════════════════════

let _customsCar = null;

const CUSTOMS_DEFAULTS = {
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

let _customsSettings = null;
async function getCustomsSettings() {
  if (_customsSettings) return _customsSettings;
  try {
    const res = await fetch('/api/customs-settings');
    _customsSettings = { ...CUSTOMS_DEFAULTS, ...(await res.json()) };
  } catch (_) {
    _customsSettings = CUSTOMS_DEFAULTS;
  }
  return _customsSettings;
}

function calcCustomsBreakdown(car, settings) {
  const s = settings || CUSTOMS_DEFAULTS;
  const priceBase = Number(car.price_base ?? car.price_rub) || 0;
  const year = Number(car.year) || new Date().getFullYear();
  const vol  = Number(car.engine_volume) || 0;
  const hp   = Number(car.horsepower) || 0;
  const fuel = car.fuel_type || 'Бензин';

  const EUR = s.eur_rate;
  const age = new Date().getFullYear() - year;
  const lim = v => v === null || v === undefined ? Infinity : v;

  let duty = 0;
  if (fuel === 'Электро') {
    duty = 0;
  } else if (age < 3) {
    const r = s.duty_new.find(([l]) => vol <= lim(l)) || s.duty_new[s.duty_new.length - 1];
    const [, pct, min] = r;
    duty = Math.max(priceBase / EUR * pct, vol * min) * EUR;
  } else if (age < 5) {
    const r = s.duty_3_5.find(([l]) => vol <= lim(l)) || s.duty_3_5[s.duty_3_5.length - 1];
    const [, rate] = r;
    duty = vol * rate * EUR;
  } else {
    const r = s.duty_5plus.find(([l]) => vol <= lim(l)) || s.duty_5plus[s.duty_5plus.length - 1];
    const [, rate] = r;
    duty = vol * rate * EUR;
  }

  const BASE_UTIL = s.base_util;
  let utilCoeff;
  if (fuel === 'Электро') {
    utilCoeff = age < 3 ? s.util_electro_new : s.util_electro_old;
  } else {
    utilCoeff = age < 3
      ? (vol <= 3000 ? s.util_ice_new_small : s.util_ice_new_large)
      : (vol <= 3000 ? s.util_ice_old_small : s.util_ice_old_large);
  }
  const util = Math.round(BASE_UTIL * utilCoeff);

  let excise = 0;
  for (const [threshold, rate] of s.excise_tiers) {
    if (hp > threshold) { excise = hp * rate; break; }
  }
  excise = Math.round(excise);

  const clearFee = s.clearance_fee;
  const totalCustoms = Math.round(duty) + util + excise + clearFee;

  return { duty: Math.round(duty), util, excise, clearFee, totalCustoms, priceBase };
}

async function openCustomsForCar(carId, carData) {
  let car = carData;
  if (!car) {
    try { car = await loadCar(carId); } catch (_) { return; }
  }
  _customsCar = car;

  const info = document.getElementById('customsCarInfo');
  if (info) info.innerHTML = `<strong>${car.brand_name} ${car.model_name} ${car.year}</strong> — ${fmtPrice(car.price_rub)}`;

  const settings = await getCustomsSettings();
  const b = calcCustomsBreakdown(car, settings);
  const grandTotal = b.priceBase + b.totalCustoms;

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = fmtPrice(v); };
  set('crDuty',         b.duty);
  set('crUtil',         b.util);
  set('crExcise',       b.excise);
  set('crClear',        b.clearFee);
  set('crTotal',        b.totalCustoms);
  set('crCarPrice',     b.priceBase);
  set('crTotalCustoms', b.totalCustoms);
  set('crGrand',        grandTotal);

  // Country select / exchange rate
  const countrySel = document.getElementById('custCountry');
  if (countrySel) {
    countrySel.value = 'CN';
    countrySel.onchange = () => updateExchangeRate(b);
  }
  updateExchangeRate(b);

  openModal('customsModal');
}

async function updateExchangeRate(breakdown) {
  const box = document.getElementById('exchangeRateBox');
  const countrySel = document.getElementById('custCountry');
  if (!box || !countrySel) return;
  const country  = countrySel.value;
  const currency = COUNTRY_CURRENCY[country] || 'CNY';
  const name     = COUNTRY_NAMES[country] || '';

  box.textContent = 'Загрузка курса валют...';
  try {
    const data = await apiFetch('/api/exchange-rate?currency=' + currency);
    const rate = data.rate;
    const rub1 = Number(rate).toLocaleString('ru-RU', { maximumFractionDigits: 4 });
    let html = `<div class="exchange-rate-box__main">1 ${currency} = ${rub1} ₽ <span class="exchange-rate-box__country">(${name})</span></div>`;
    if (breakdown && rate) {
      const totalForeign = (breakdown.totalCustoms / rate).toLocaleString('ru-RU', { maximumFractionDigits: 0 });
      html += `<div class="exchange-rate-box__sub">Сумма таможенных платежей ≈ ${totalForeign} ${currency}</div>`;
    }
    if (data.fallback) html += `<div class="exchange-rate-box__sub">(приблизительный курс)</div>`;
    box.innerHTML = html;
  } catch (_) {
    box.textContent = 'Не удалось загрузить курс валют';
  }
}

// ═══════════════════════════════════════════════════════
//  MODALS
// ═══════════════════════════════════════════════════════

function openModal(id) {
  document.getElementById(id)?.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  document.body.style.overflow = '';
}
function closeModalOutside(e, id) {
  if (e.target === document.getElementById(id)) closeModal(id);
}
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    document.body.style.overflow = '';
  }
});

function openManagerModal(car) {
  _customsCar = car;
  const info = document.getElementById('managerCarInfo');
  if (info) {
    info.textContent = car && car.brand_name
      ? `${car.brand_name} ${car.model_name} ${car.year} — выберите удобный способ связи`
      : 'Выберите удобный способ связи';
  }
  if (car && car.id) {
    sessionStorage.setItem('chatCarContext', JSON.stringify({
      id: car.id, brand_name: car.brand_name, model_name: car.model_name, year: car.year
    }));
  } else {
    sessionStorage.removeItem('chatCarContext');
  }
  openModal('managerModal');
}

async function goToManagerChat() {
  try {
    const { user } = await apiFetch('/api/me');
    if (!user) {
      window.location.href = '/login';
      return;
    }
  } catch (_) {
    window.location.href = '/login';
    return;
  }
  closeModal('managerModal');
  window.location.href = '/chat';
}

// ═══════════════════════════════════════════════════════
//  FORMS
// ═══════════════════════════════════════════════════════

function submitForm(e, formId, modalId) {
  e.preventDefault();
  const form  = document.getElementById(formId);
  const phone = form.querySelector('input[type="tel"]');
  if (phone && !validatePhone(phone.value)) {
    phone.classList.add('error'); phone.focus(); return;
  }
  const name = form.querySelector('input[type="text"]')?.value || '';
  postInquiry({ name, phone: phone?.value || '', car_id: _customsCar?.id || null, message: '' })
    .catch(() => {});
  closeModal(modalId);
  setTimeout(() => openModal('successModal'), 200);
  form.reset();
}

// ═══════════════════════════════════════════════════════
//  PHONE MASK
// ═══════════════════════════════════════════════════════

function initPhoneMask(input) {
  if (!input) return;
  input.addEventListener('input', function () {
    let v = this.value.replace(/\D/g, '');
    if (v.startsWith('8')) v = '7' + v.slice(1);
    if (!v.startsWith('7')) v = '7' + v;
    v = v.slice(0, 11);
    let r = '+7';
    if (v.length > 1)  r += ' (' + v.slice(1, 4);
    if (v.length > 4)  r += ') ' + v.slice(4, 7);
    if (v.length > 7)  r += '-' + v.slice(7, 9);
    if (v.length > 9)  r += '-' + v.slice(9, 11);
    this.value = r;
  });
  input.addEventListener('focus',  function () { if (!this.value) this.value = '+7 ('; });
  input.addEventListener('blur',   function () { if (this.value === '+7 (' || this.value === '+7') this.value = ''; });
}

function validatePhone(v) { return (v || '').replace(/\D/g, '').length === 11; }

// ═══════════════════════════════════════════════════════
//  FAQ TOGGLE
// ═══════════════════════════════════════════════════════

function toggleFaq(btn) {
  const ans = btn.nextElementSibling;
  const isOpen = ans.classList.contains('open');
  document.querySelectorAll('.faq-item__a.open').forEach(a => a.classList.remove('open'));
  document.querySelectorAll('.faq-item__q.open').forEach(b => b.classList.remove('open'));
  if (!isOpen) { ans.classList.add('open'); btn.classList.add('open'); }
}

// ═══════════════════════════════════════════════════════
//  FAVORITES (избранное)
// ═══════════════════════════════════════════════════════

const FAV_LS_KEY = 'avtomir_favorites';
const IS_LOGGED_IN = () => document.body?.dataset?.user === 'logged-in';

function getLocalFavorites() {
  try { return JSON.parse(localStorage.getItem(FAV_LS_KEY) || '[]').map(Number); }
  catch (_) { return []; }
}
function setLocalFavorites(arr) {
  localStorage.setItem(FAV_LS_KEY, JSON.stringify([...new Set(arr.map(Number))]));
}

// Возвращает true/false для отрисовки сердечка. Для гостей берёт из localStorage,
// для авторизованных — из поля is_favorite, переданного сервером.
function isFavoriteCached(carId, serverFlag) {
  if (IS_LOGGED_IN()) return !!serverFlag;
  return getLocalFavorites().includes(Number(carId));
}

async function toggleFavorite(event, carId) {
  event.preventDefault();
  event.stopPropagation();
  const btn = event.currentTarget;
  const nowActive = !btn.classList.contains('active');

  if (IS_LOGGED_IN()) {
    try {
      if (nowActive) {
        await apiFetch('/api/favorites', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ car_id: carId }) });
      } else {
        await apiFetch('/api/favorites/' + carId, { method: 'DELETE' });
      }
    } catch (_) { return; }
  } else {
    let favs = getLocalFavorites();
    if (nowActive) { if (!favs.includes(Number(carId))) favs.push(Number(carId)); }
    else { favs = favs.filter(id => id !== Number(carId)); }
    setLocalFavorites(favs);
  }

  btn.classList.toggle('active', nowActive);
  // Если карточка отрисована и на странице избранного — удаляем при снятии
  if (!nowActive && document.body.dataset.page === 'favorites') {
    btn.closest('.car-card')?.remove();
  }
  updateFavoritesBadge();
}

async function updateFavoritesBadge() {
  const badge = document.getElementById('favoritesBadge');
  if (!badge) return;
  let count = 0;
  if (IS_LOGGED_IN()) {
    try {
      const favs = await apiFetch('/api/favorites');
      count = favs.length;
    } catch (_) { count = 0; }
  } else {
    count = getLocalFavorites().length;
  }
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

// При логине переносим избранное из localStorage в БД
async function mergeLocalFavoritesToServer() {
  const favs = getLocalFavorites();
  if (!favs.length) return;
  try {
    await apiFetch('/api/favorites/merge', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ car_ids: favs })
    });
    localStorage.removeItem(FAV_LS_KEY);
  } catch (_) {}
}

async function initFavoritesPage() {
  const grid  = document.getElementById('catalogGrid') || document.getElementById('favoritesGrid');
  const empty = document.getElementById('catalogEmpty') || document.getElementById('favoritesEmpty');
  if (!grid) return;

  grid.innerHTML = `<div class="catalog__loading"><div class="spinner"></div><p>Загрузка...</p></div>`;
  document.body.dataset.page = 'favorites';

  let cars = [];
  try {
    if (IS_LOGGED_IN()) {
      cars = await apiFetch('/api/favorites');
    } else {
      const ids = getLocalFavorites();
      const results = await Promise.allSettled(ids.map(id => loadCar(id)));
      cars = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    }
  } catch (_) { cars = []; }

  if (!cars.length) {
    grid.innerHTML = '';
    if (empty) empty.style.display = '';
  } else {
    grid.innerHTML = cars.map(renderCard).join('');
    if (empty) empty.style.display = 'none';
  }
}

// ═══════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════

async function logoutUser(e) {
  if (e) e.preventDefault();
  try { await apiFetch('/api/logout', { method: 'POST' }); } catch (_) {}
  window.location.href = '/';
}

function initLoginPage() {
  const form = document.getElementById('loginForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('authError');
    if (errBox) errBox.style.display = 'none';
    try {
      const data = await apiFetch('/api/login', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          email: document.getElementById('loginEmail').value,
          password: document.getElementById('loginPassword').value,
        })
      });
      await mergeLocalFavoritesToServer();
      window.location.href = (data.user && data.user.is_admin) ? '/admin' : '/';
    } catch (err) {
      if (errBox) { errBox.textContent = err.message || 'Ошибка входа'; errBox.style.display = ''; }
    }
  });
}

function initRegisterPage() {
  const form = document.getElementById('registerForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('authError');
    if (errBox) errBox.style.display = 'none';
    const password = document.getElementById('registerPassword').value;
    const password2 = document.getElementById('registerPassword2').value;
    if (password !== password2) {
      if (errBox) { errBox.textContent = 'Пароли не совпадают'; errBox.style.display = ''; }
      return;
    }
    try {
      await apiFetch('/api/register', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          email: document.getElementById('registerEmail').value,
          password,
          name: document.getElementById('registerName').value,
          phone: document.getElementById('registerPhone').value,
        })
      });
      await mergeLocalFavoritesToServer();
      window.location.href = '/';
    } catch (err) {
      if (errBox) { errBox.textContent = err.message || 'Ошибка регистрации'; errBox.style.display = ''; }
    }
  });
}

// ═══════════════════════════════════════════════════════
//  PROFILE PAGE
// ═══════════════════════════════════════════════════════

async function initProfilePage() {
  const profileForm  = document.getElementById('profileForm');
  const passwordForm = document.getElementById('passwordForm');

  try {
    const { user } = await apiFetch('/api/me');
    if (user && profileForm) {
      document.getElementById('profileEmail').value = user.email || '';
      document.getElementById('profileName').value  = user.name  || '';
      document.getElementById('profilePhone').value = user.phone || '';
      document.getElementById('profileCity').value  = user.city  || '';
    }
  } catch (_) {}

  profileForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('profileMsg');
    try {
      await apiFetch('/api/profile', {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          name:  document.getElementById('profileName').value,
          phone: document.getElementById('profilePhone').value,
          city:  document.getElementById('profileCity').value,
        })
      });
      if (msg) { msg.textContent = 'Сохранено!'; msg.className = 'form-msg form-msg--ok'; msg.style.display=''; }
    } catch (err) {
      if (msg) { msg.textContent = err.message || 'Ошибка'; msg.className = 'form-msg form-msg--err'; msg.style.display=''; }
    }
  });

  passwordForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('passwordMsg');
    try {
      await apiFetch('/api/profile/password', {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          old_password: document.getElementById('oldPassword').value,
          new_password: document.getElementById('newPassword').value,
        })
      });
      if (msg) { msg.textContent = 'Пароль изменён!'; msg.className = 'form-msg form-msg--ok'; msg.style.display=''; }
      passwordForm.reset();
    } catch (err) {
      if (msg) { msg.textContent = err.message || 'Ошибка'; msg.className = 'form-msg form-msg--err'; msg.style.display=''; }
    }
  });

  // История заявок
  const histList = document.getElementById('inquiryHistory');
  if (histList) {
    try {
      const items = await apiFetch('/api/inquiries');
      if (!items.length) {
        histList.innerHTML = '<p style="color:var(--muted)">У вас пока нет заявок.</p>';
      } else {
        histList.innerHTML = items.map(it => `
          <div class="history-item">
            <img src="${it.photo_main || ''}" alt="" class="history-item__img"/>
            <div class="history-item__body">
              <div class="history-item__title">${it.brand_name || ''} ${it.model_name || ''} ${it.year || ''}</div>
              <div class="history-item__meta">${it.price_rub ? fmtPrice(it.price_rub) : ''} · ${new Date(it.created_at).toLocaleDateString('ru-RU')}</div>
            </div>
            <span class="history-item__status">${it.status}</span>
          </div>
        `).join('');
      }
    } catch (_) {
      histList.innerHTML = '<p style="color:var(--muted)">Не удалось загрузить историю.</p>';
    }
  }
}

// ═══════════════════════════════════════════════════════
//  CHAT PAGE
// ═══════════════════════════════════════════════════════

async function initChatPage() {
  const list = document.getElementById('chatMessages');
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');
  const carBox = document.getElementById('chatCarContext');
  if (!list || !form) return;

  let lastSignature = '';

  // ── контекст автомобиля ──
  let carContext = null;
  try {
    const raw = sessionStorage.getItem('chatCarContext');
    if (raw) carContext = JSON.parse(raw);
  } catch (_) { carContext = null; }

  function renderCarContext() {
    if (!carBox) return;
    if (carContext && carContext.id) {
      carBox.style.display = '';
      carBox.innerHTML = `
        <span>Вопрос по автомобилю: <strong>${escapeHtml(carContext.brand_name || '')} ${escapeHtml(carContext.model_name || '')} ${escapeHtml(String(carContext.year || ''))}</strong></span>
        <button type="button" class="chat-car-context__clear" onclick="clearChatCarContext()">✕</button>
      `;
    } else {
      carBox.style.display = 'none';
      carBox.innerHTML = '';
    }
  }

  window.clearChatCarContext = function() {
    carContext = null;
    sessionStorage.removeItem('chatCarContext');
    renderCarContext();
  };

  renderCarContext();

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function renderMessages(messages) {
    if (!messages.length) {
      list.innerHTML = '<p style="color:var(--muted);text-align:center;padding:40px 0">Напишите менеджеру — мы ответим в ближайшее время.</p>';
      return;
    }
    list.innerHTML = messages.map(m => {
      const carInfo = m.car_brand
        ? `<div class="chat-message__car">🚗 ${escapeHtml(m.car_brand)} ${escapeHtml(m.car_model)} ${escapeHtml(m.car_year)}</div>`
        : '';
      return `
      <div class="chat-message ${m.is_from_user ? 'chat-message--user' : 'chat-message--manager'}">
        ${carInfo}
        <div class="chat-message__bubble">${escapeHtml(m.message)}</div>
        <div class="chat-message__time">${new Date(m.created_at).toLocaleString('ru-RU', {hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'})}</div>
      </div>
    `;
    }).join('');
    list.scrollTop = list.scrollHeight;
  }

  async function refresh(force) {
    try {
      const messages = await apiFetch('/api/messages');
      const sig = JSON.stringify(messages.map(m => [m.id, m.is_read]));
      if (force || sig !== lastSignature) {
        renderMessages(messages);
        lastSignature = sig;
      }
    } catch (_) {
      if (force) list.innerHTML = '<p style="color:var(--accent)">Не удалось загрузить сообщения.</p>';
    }
  }

  await refresh(true);

  // ── живое обновление чата ──
  setInterval(() => refresh(false), 4000);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try {
      const payload = { message: text };
      if (carContext && carContext.id) payload.car_id = carContext.id;
      const messages = await apiFetch('/api/messages', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      renderMessages(messages);
      lastSignature = JSON.stringify(messages.map(m => [m.id, m.is_read]));
    } catch (_) {}
  });
}

// ═══════════════════════════════════════════════════════
//  HEADER
// ═══════════════════════════════════════════════════════

function initHeader() {
  const header = document.getElementById('header');
  window.addEventListener('scroll', () => header?.classList.toggle('scrolled', window.scrollY > 50));

  const burger = document.getElementById('burger');
  const nav    = document.getElementById('nav');
  burger?.addEventListener('click', () => {
    burger.classList.toggle('open');
    nav?.classList.toggle('open');
  });
  document.querySelectorAll('.nav__link').forEach(link =>
    link.addEventListener('click', () => {
      burger?.classList.remove('open');
      nav?.classList.remove('open');
    })
  );

  updateFavoritesBadge();
}

// ═══════════════════════════════════════════════════════
//  DOMContentLoaded
// ═══════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  document.querySelectorAll('.phone-mask').forEach(initPhoneMask);
  document.querySelectorAll('.form__input').forEach(el =>
    el.addEventListener('input', () => el.classList.remove('error'))
  );
  initLoginPage();
  initRegisterPage();
});

// ── Expose globals ──────────────────────────────────────
window.openModal              = openModal;
window.closeModal             = closeModal;
window.closeModalOutside      = closeModalOutside;
window.openCustomsForCar      = openCustomsForCar;
window.openManagerModal       = openManagerModal;
window.goToManagerChat        = goToManagerChat;
window.submitForm             = submitForm;
window.toggleFaq               = toggleFaq;
window.initIndexPage          = initIndexPage;
window.initCarDetailPage      = initCarDetailPage;
window.initReviewsSlider      = initReviewsSlider;
window.initPhoneMask          = initPhoneMask;
window.validatePhone          = validatePhone;
window.toggleFavorite         = toggleFavorite;
window.initFavoritesPage      = initFavoritesPage;
window.logoutUser             = logoutUser;
window.initProfilePage        = initProfilePage;
window.initChatPage           = initChatPage;
