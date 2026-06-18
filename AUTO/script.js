'use strict';

// ===== DATABASE =====
const CARS_DB = [
  {
    id: 1, brand: 'BMW', model: 'X5 xDrive40i', year: 2022,
    price: 7_490_000, mileage: 32_000, engine: 'Бензин', volume: '3.0л',
    transmission: 'АКПП', power: '340 л.с.', color: 'Черный',
    special: true, badge: 'Хит продаж',
    img: 'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80',
    desc: 'Великолепный BMW X5 в идеальном состоянии. Один владелец, полный сервисный пакет от дилера.'
  },
  {
    id: 2, brand: 'Mercedes-Benz', model: 'GLE 350d', year: 2021,
    price: 6_850_000, mileage: 45_000, engine: 'Дизель', volume: '3.0л',
    transmission: 'АКПП', power: '272 л.с.', color: 'Серый',
    special: true, badge: 'Выгода 300 000 ₽',
    img: 'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&q=80',
    desc: 'Mercedes-Benz GLE в комплектации AMG Line. Панорамная крыша, Burmester аудиосистема.'
  },
  {
    id: 3, brand: 'Porsche', model: 'Cayenne S', year: 2023,
    price: 12_900_000, mileage: 8_500, engine: 'Бензин', volume: '2.9л',
    transmission: 'АКПП', power: '440 л.с.', color: 'Белый',
    special: false, badge: null,
    img: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80',
    desc: 'Porsche Cayenne S — практически новый автомобиль. На гарантии до 2026 года.'
  },
  {
    id: 4, brand: 'Audi', model: 'Q7 55 TFSI', year: 2022,
    price: 8_200_000, mileage: 22_000, engine: 'Бензин', volume: '3.0л',
    transmission: 'АКПП', power: '340 л.с.', color: 'Синий',
    special: true, badge: 'Кредит 0%',
    img: 'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800&q=80',
    desc: 'Audi Q7 в максимальной комплектации. Матричные фары, адаптивная подвеска.'
  },
  {
    id: 5, brand: 'Toyota', model: 'Land Cruiser 300', year: 2022,
    price: 9_750_000, mileage: 18_000, engine: 'Бензин', volume: '3.5л',
    transmission: 'АКПП', power: '415 л.с.', color: 'Черный',
    special: true, badge: 'В наличии',
    img: 'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=800&q=80',
    desc: 'Toyota Land Cruiser 300 — легендарная надёжность. Комплектация Executive Lounge.'
  },
  {
    id: 6, brand: 'Lexus', model: 'LX 600', year: 2023,
    price: 14_500_000, mileage: 5_200, engine: 'Бензин', volume: '3.5л',
    transmission: 'АКПП', power: '415 л.с.', color: 'Перламутр',
    special: false, badge: null,
    img: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&q=80',
    desc: 'Lexus LX 600 Ultra Luxury. Четыре места, массаж, вентиляция, Lexus Premium Sound.'
  },
  {
    id: 7, brand: 'Volkswagen', model: 'Touareg R-Line', year: 2021,
    price: 4_650_000, mileage: 58_000, engine: 'Дизель', volume: '3.0л',
    transmission: 'АКПП', power: '231 л.с.', color: 'Серебристый',
    special: false, badge: null,
    img: 'https://images.unsplash.com/photo-1489824904134-891ab64532f1?w=800&q=80',
    desc: 'VW Touareg в спортивном пакете R-Line. Пробег подтверждён сервисной книжкой.'
  },
  {
    id: 8, brand: 'BMW', model: 'M5 Competition', year: 2021,
    price: 9_300_000, mileage: 41_000, engine: 'Бензин', volume: '4.4л',
    transmission: 'АКПП', power: '625 л.с.', color: 'Красный',
    special: true, badge: 'Спорт',
    img: 'https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?w=800&q=80',
    desc: 'BMW M5 Competition — 625 лошадиных сил в элегантном кузове. 0–100 за 3.3 секунды.'
  },
  {
    id: 9, brand: 'Mercedes-Benz', model: 'G 63 AMG', year: 2022,
    price: 18_900_000, mileage: 12_000, engine: 'Бензин', volume: '4.0л',
    transmission: 'АКПП', power: '585 л.с.', color: 'Матовый черный',
    special: false, badge: 'Эксклюзив',
    img: 'https://images.unsplash.com/photo-1563720223185-11003d516935?w=800&q=80',
    desc: 'Mercedes G 63 AMG — икона стиля. Уникальный цвет Manufaktur, карбоновые вставки.'
  },
  {
    id: 10, brand: 'Land Rover', model: 'Range Rover Sport', year: 2022,
    price: 8_990_000, mileage: 26_000, engine: 'Бензин', volume: '3.0л',
    transmission: 'АКПП', power: '400 л.с.', color: 'Зеленый',
    special: true, badge: 'Trade-in зачет',
    img: 'https://images.unsplash.com/photo-1488956041116-d1f8f8f68934?w=800&q=80',
    desc: 'Range Rover Sport в редком цвете Carpathian Grey. Meridian Signature Sound System.'
  },
  {
    id: 11, brand: 'Audi', model: 'e-tron GT', year: 2023,
    price: 11_200_000, mileage: 7_000, engine: 'Электро', volume: '—',
    transmission: 'Авто', power: '476 л.с.', color: 'Серо-синий',
    special: false, badge: null,
    img: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=800&q=80',
    desc: 'Audi e-tron GT — электромобиль будущего. Запас хода 487 км, зарядка до 270 кВт.'
  },
  {
    id: 12, brand: 'Lexus', model: 'ES 250', year: 2021,
    price: 3_250_000, mileage: 67_000, engine: 'Бензин', volume: '2.5л',
    transmission: 'АКПП', power: '184 л.с.', color: 'Белый',
    special: false, badge: null,
    img: 'https://images.unsplash.com/photo-1571987502227-9231b837d92a?w=800&q=80',
    desc: 'Lexus ES 250 — идеальный автомобиль для города. Полное техобслуживание у официального дилера.'
  },
];

// Models by brand
const MODELS_MAP = {};
CARS_DB.forEach(car => {
  if (!MODELS_MAP[car.brand]) MODELS_MAP[car.brand] = new Set();
  MODELS_MAP[car.brand].add(car.model);
});

// ===== FORMAT PRICE =====
function fmtPrice(n) {
  return n.toLocaleString('ru-RU') + ' ₽';
}

// ===== RENDER CAR CARD =====
function renderCard(car) {
  return `
    <div class="car-card" data-id="${car.id}">
      <div class="car-card__img-wrap">
        <img class="car-card__img" src="${car.img}" alt="${car.brand} ${car.model}" loading="lazy" />
        ${car.badge ? `<span class="car-card__badge">${car.badge}</span>` : ''}
      </div>
      <div class="car-card__body">
        <div class="car-card__title">${car.brand} ${car.model}</div>
        <div>
          <div class="car-card__price">${fmtPrice(car.price)}</div>
          <div class="car-card__price-credit">от ${fmtPrice(Math.round(car.price * 0.8 / 60 * 1.09 / 1000) * 1000)} / мес. в кредит</div>
        </div>
        <div class="car-card__specs">
          <span class="car-card__spec"><span class="car-card__spec-icon">⛽</span>${car.engine}${car.volume !== '—' ? ', ' + car.volume : ''}</span>
          <span class="car-card__spec"><span class="car-card__spec-icon">📍</span>${car.mileage.toLocaleString('ru-RU')} км</span>
          <span class="car-card__spec"><span class="car-card__spec-icon">⚙️</span>${car.transmission}</span>
          <span class="car-card__spec"><span class="car-card__spec-icon">📅</span>${car.year} г.</span>
          <span class="car-card__spec"><span class="car-card__spec-icon">🏎️</span>${car.power}</span>
        </div>
        <div class="car-card__actions">
          <a href="car.html?id=${car.id}" class="btn btn--outline">Подробнее</a>
          <button class="btn btn--accent" onclick="openCredit(${car.id})">В кредит</button>
        </div>
      </div>
    </div>
  `;
}

// ===== CATALOG =====
let currentCars = [...CARS_DB];

function renderCatalog(cars) {
  const grid = document.getElementById('catalogGrid');
  const empty = document.getElementById('catalogEmpty');
  const count = document.getElementById('countNum');
  if (!grid) return;
  count.textContent = cars.length;
  if (cars.length === 0) {
    grid.innerHTML = '';
    empty.style.display = '';
  } else {
    grid.innerHTML = cars.map(renderCard).join('');
    empty.style.display = 'none';
  }
  currentCars = cars;
}

function applyFilters() {
  const brand = document.getElementById('filterBrand')?.value || '';
  const model = document.getElementById('filterModel')?.value || '';
  const year  = parseInt(document.getElementById('filterYear')?.value) || 0;
  const price = parseInt(document.getElementById('filterPrice')?.value) || 0;
  const engine = document.getElementById('filterEngine')?.value || '';

  const filtered = CARS_DB.filter(car => {
    if (brand && car.brand !== brand) return false;
    if (model && car.model !== model) return false;
    if (year && car.year < year) return false;
    if (price && car.price > price) return false;
    if (engine && car.engine !== engine) return false;
    return true;
  });
  renderCatalog(filtered);
}

function initFilter() {
  const brandSel = document.getElementById('filterBrand');
  const modelSel = document.getElementById('filterModel');
  if (!brandSel) return;

  brandSel.addEventListener('change', () => {
    const brand = brandSel.value;
    modelSel.innerHTML = '<option value="">Все модели</option>';
    if (brand && MODELS_MAP[brand]) {
      MODELS_MAP[brand].forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        modelSel.appendChild(opt);
      });
    }
    applyFilters();
  });

  // Real-time filter on every select change
  ['filterModel','filterYear','filterPrice','filterEngine'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', applyFilters);
  });

  document.getElementById('filterBtn')?.addEventListener('click', () => {
    applyFilters();
    document.querySelector('.catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ===== SLIDER =====
let sliderIdx = 0;
const specialCars = CARS_DB.filter(c => c.special);

function initSlider() {
  const track = document.getElementById('sliderTrack');
  const dotsWrap = document.getElementById('sliderDots');
  if (!track) return;

  const visibleCount = () => window.innerWidth < 768 ? 1 : window.innerWidth < 1024 ? 2 : 3;

  track.innerHTML = specialCars.map(car => `
    <div class="slider__slide">${renderCard(car)}</div>
  `).join('');

  function buildDots() {
    const vc = visibleCount();
    const total = Math.ceil(specialCars.length / vc);
    dotsWrap.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const btn = document.createElement('button');
      btn.className = 'slider__dot' + (i === 0 ? ' active' : '');
      btn.onclick = () => goToSlide(i);
      dotsWrap.appendChild(btn);
    }
  }

  function goToSlide(idx) {
    const vc = visibleCount();
    const maxIdx = Math.max(0, Math.ceil(specialCars.length / vc) - 1);
    sliderIdx = Math.min(Math.max(idx, 0), maxIdx);
    const slideW = track.parentElement.offsetWidth / vc;
    track.style.transform = `translateX(-${sliderIdx * slideW * vc}px)`;
    document.querySelectorAll('.slider__dot').forEach((d, i) => d.classList.toggle('active', i === sliderIdx));
    document.getElementById('sliderPrev').disabled = sliderIdx === 0;
    document.getElementById('sliderNext').disabled = sliderIdx >= maxIdx;
  }

  document.getElementById('sliderPrev').addEventListener('click', () => goToSlide(sliderIdx - 1));
  document.getElementById('sliderNext').addEventListener('click', () => goToSlide(sliderIdx + 1));

  buildDots();
  goToSlide(0);

  window.addEventListener('resize', () => { buildDots(); goToSlide(0); });
}

// ===== MODAL =====
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

// ===== CREDIT MODAL =====
let creditCarId = null;

function openCredit(carId) {
  const car = CARS_DB.find(c => c.id === carId);
  if (!car) return;
  creditCarId = carId;
  document.getElementById('creditCarInfo').innerHTML =
    `<strong>${car.brand} ${car.model} ${car.year}</strong> — ${fmtPrice(car.price)}`;
  document.getElementById('creditPrice').value = fmtPrice(car.price);
  document.getElementById('downPayment').value = 20;
  document.getElementById('creditTerm').value = 36;
  recalcCredit();
  openModal('creditModal');
}

function recalcCredit() {
  const car = CARS_DB.find(c => c.id === creditCarId);
  if (!car) return;
  const dp = parseInt(document.getElementById('downPayment').value);
  const term = parseInt(document.getElementById('creditTerm').value);
  const rate = 0.159 / 12; // 15.9% годовых

  document.getElementById('downPaymentVal').textContent = dp;
  document.getElementById('termVal').textContent = term;

  const downSum = Math.round(car.price * dp / 100);
  const loan = car.price - downSum;
  const monthly = Math.round(loan * rate / (1 - Math.pow(1 + rate, -term)));

  document.getElementById('downPaymentSum').textContent = fmtPrice(downSum);
  document.getElementById('loanSum').textContent = fmtPrice(loan);
  document.getElementById('monthlyPayment').textContent = fmtPrice(monthly);
}

// ===== PHONE MASK =====
function initPhoneMask(input) {
  if (!input) return;
  input.addEventListener('input', function () {
    let val = this.value.replace(/\D/g, '');
    if (val.startsWith('8')) val = '7' + val.slice(1);
    if (!val.startsWith('7')) val = '7' + val;
    val = val.slice(0, 11);
    let res = '+7';
    if (val.length > 1) res += ' (' + val.slice(1, 4);
    if (val.length > 4) res += ') ' + val.slice(4, 7);
    if (val.length > 7) res += '-' + val.slice(7, 9);
    if (val.length > 9) res += '-' + val.slice(9, 11);
    this.value = res;
  });
  input.addEventListener('focus', function () {
    if (!this.value) this.value = '+7 (';
  });
  input.addEventListener('blur', function () {
    if (this.value === '+7 (' || this.value === '+7') this.value = '';
  });
}

function validatePhone(val) {
  return val.replace(/\D/g, '').length === 11;
}

// ===== FORM SUBMIT =====
function submitForm(e, formId, modalId) {
  e.preventDefault();
  const form = document.getElementById(formId);
  const phoneInput = form.querySelector('input[type="tel"]');
  if (phoneInput && !validatePhone(phoneInput.value)) {
    phoneInput.classList.add('error');
    phoneInput.focus();
    return;
  }
  closeModal(modalId);
  setTimeout(() => openModal('successModal'), 200);
  form.reset();
}

// ===== HEADER SCROLL =====
function initHeader() {
  const header = document.getElementById('header');
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 50);
  });

  const burger = document.getElementById('burger');
  const nav = document.getElementById('nav');
  burger?.addEventListener('click', () => {
    burger.classList.toggle('open');
    nav.classList.toggle('open');
  });

  // Close nav on link click
  document.querySelectorAll('.nav__link').forEach(link => {
    link.addEventListener('click', () => {
      burger?.classList.remove('open');
      nav?.classList.remove('open');
    });
  });
}

// ===== CAR DETAIL PAGE =====
function renderCarDetail() {
  const params = new URLSearchParams(window.location.search);
  const id = parseInt(params.get('id'));
  const car = CARS_DB.find(c => c.id === id);
  if (!car) return;

  const el = document.getElementById('carDetail');
  if (!el) return;

  document.title = `${car.brand} ${car.model} ${car.year} — АВТОМИР`;
  el.innerHTML = `
    <div class="detail-grid">
      <div class="detail-img-wrap">
        <img src="${car.img}" alt="${car.brand} ${car.model}" />
        ${car.badge ? `<span class="car-card__badge">${car.badge}</span>` : ''}
      </div>
      <div class="detail-info">
        <h1 class="section-title">${car.brand} ${car.model} ${car.year}</h1>
        <div class="car-card__price" style="font-size:32px;margin:16px 0 4px">${fmtPrice(car.price)}</div>
        <div class="car-card__price-credit">от ${fmtPrice(Math.round(car.price * 0.8 / 60 * 1.09 / 1000) * 1000)} / мес. в кредит</div>
        <div class="detail-specs">
          <div class="detail-spec"><span class="detail-spec__label">Двигатель</span><span>${car.volume} ${car.engine}</span></div>
          <div class="detail-spec"><span class="detail-spec__label">Мощность</span><span>${car.power}</span></div>
          <div class="detail-spec"><span class="detail-spec__label">КПП</span><span>${car.transmission}</span></div>
          <div class="detail-spec"><span class="detail-spec__label">Пробег</span><span>${car.mileage.toLocaleString('ru-RU')} км</span></div>
          <div class="detail-spec"><span class="detail-spec__label">Год</span><span>${car.year}</span></div>
          <div class="detail-spec"><span class="detail-spec__label">Цвет</span><span>${car.color}</span></div>
        </div>
        <p style="color:var(--text-muted);margin:20px 0 28px;line-height:1.8">${car.desc}</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <button class="btn btn--accent" onclick="openModal('contactModal')">Оставить заявку</button>
          <button class="btn btn--outline" onclick="openCredit(${car.id})">Рассчитать кредит</button>
        </div>
      </div>
    </div>
  `;
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initHeader();

  // Phone masks
  ['contactPhone','creditPhone'].forEach(id => initPhoneMask(document.getElementById(id)));

  // Remove error class on input
  document.querySelectorAll('.form__input').forEach(el => {
    el.addEventListener('input', () => el.classList.remove('error'));
  });

  if (document.getElementById('catalogGrid')) {
    renderCatalog(CARS_DB);
    initFilter();
    initSlider();
  }

  if (document.getElementById('carDetail')) {
    renderCarDetail();
  }
});

// Expose for inline handlers
window.openModal = openModal;
window.closeModal = closeModal;
window.closeModalOutside = closeModalOutside;
window.openCredit = openCredit;
window.recalcCredit = recalcCredit;
window.submitForm = submitForm;
