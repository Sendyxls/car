"""
АВТОМИР — Flask backend
Запуск: python app.py  (или двойной клик start.bat)
URL: http://localhost:5000
"""
import sqlite3
import json
import os
import uuid
import urllib.request
from functools import wraps
from datetime import datetime
from flask import Flask, jsonify, request, render_template, send_from_directory, session, redirect, g
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

app = Flask(__name__, template_folder='templates', static_folder='static')
app.secret_key = os.environ.get('SECRET_KEY', 'avtomir-dev-secret-change-in-production')

# На Railway данные хранятся в /data (Persistent Volume).
# Локально — рядом с app.py.
_DATA_DIR = os.environ.get('DATA_DIR', os.path.dirname(os.path.abspath(__file__)))
os.makedirs(_DATA_DIR, exist_ok=True)
DB = os.path.join(_DATA_DIR, 'auto.db')
CURRENT_YEAR = datetime.now().year

# ─── Customs calculation (RF formulas) ─────────────────────────────────────

# Параметры калькулятора растаможки по умолчанию.
# Администратор может изменить их в админ-панели (/admin → "Калькулятор") —
# изменения сохраняются в таблице settings (ключ 'customs') в виде JSON
# и переопределяют значения по умолчанию (см. get_customs_settings()).
DEFAULT_CUSTOMS_SETTINGS = {
    'eur_rate': 100,
    'base_util': 20000,
    'duty_new':    [[1000, .54, 2.5], [1500, .54, 3.5], [1800, .54, 5.0],
                     [2300, .54, 7.5], [3000, .54, 7.5], [None, .80, 15.0]],
    'duty_3_5':    [[1000, 1.5], [1500, 1.7], [1800, 2.5], [2300, 2.7], [3000, 3.0], [None, 3.6]],
    'duty_5plus':  [[1000, 3.0], [1500, 3.2], [1800, 3.5], [2300, 4.8], [3000, 5.0], [None, 5.7]],
    'util_electro_new': 0.17,
    'util_electro_old': 0.26,
    'util_ice_new_small': 4.26,
    'util_ice_new_large': 5.84,
    'util_ice_old_small': 12.98,
    'util_ice_old_large': 18.89,
    'excise_tiers': [[300, 1628], [200, 955], [150, 583], [90, 61]],
    'clearance_fee': 2462,
}


def get_customs_settings():
    conn = get_db()
    row = conn.execute("SELECT value FROM settings WHERE key='customs'").fetchone()
    conn.close()
    if row:
        try:
            saved = json.loads(row['value'])
            return {**DEFAULT_CUSTOMS_SETTINGS, **saved}
        except (ValueError, TypeError):
            pass
    return dict(DEFAULT_CUSTOMS_SETTINGS)


def calc_customs_rub(price_base, year, vol, hp, fuel, settings=None):
    """Возвращает суммарные таможенные платежи в рублях (пошлина + утильсбор + акциз + оформление)."""
    s = settings or DEFAULT_CUSTOMS_SETTINGS
    EUR = s['eur_rate']
    age = CURRENT_YEAR - year

    def lim_or_inf(lim):
        return float('inf') if lim is None else lim

    # ── Пошлина
    duty = 0
    if fuel == 'Электро':
        duty = 0
    elif age < 3:
        for lim, pct, mn in s['duty_new']:
            if vol <= lim_or_inf(lim):
                duty = max(price_base / EUR * pct, vol * mn) * EUR
                break
    elif age < 5:
        for lim, rate in s['duty_3_5']:
            if vol <= lim_or_inf(lim):
                duty = vol * rate * EUR
                break
    else:
        for lim, rate in s['duty_5plus']:
            if vol <= lim_or_inf(lim):
                duty = vol * rate * EUR
                break

    # ── Утилизационный сбор
    BASE_UTIL = s['base_util']
    if fuel == 'Электро':
        util_coeff = s['util_electro_new'] if age < 3 else s['util_electro_old']
    else:
        if age < 3:
            util_coeff = s['util_ice_new_small'] if vol <= 3000 else s['util_ice_new_large']
        else:
            util_coeff = s['util_ice_old_small'] if vol <= 3000 else s['util_ice_old_large']
    util = round(BASE_UTIL * util_coeff)

    # ── Акциз (по мощности)
    excise = 0
    for threshold, rate in s['excise_tiers']:
        if hp > threshold:
            excise = hp * rate
            break

    # ── Таможенное оформление
    clearance = s['clearance_fee']

    return round(duty) + util + round(excise) + clearance


# ─── Database ──────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    # Если БД существует, но создана по старой схеме (без таблицы users) —
    # пересоздаём целиком (схема и модель цен изменились в Phase 3).
    if os.path.exists(DB):
        conn = get_db()
        has_users = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
        ).fetchone()
        conn.close()
        if has_users:
            return
        os.remove(DB)

    conn = get_db()
    c = conn.cursor()

    c.executescript("""
        CREATE TABLE brands (
            id     INTEGER PRIMARY KEY AUTOINCREMENT,
            name   TEXT NOT NULL,
            slug   TEXT NOT NULL UNIQUE,
            origin TEXT DEFAULT 'OTHER'
        );
        CREATE TABLE models (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            brand_id INTEGER NOT NULL REFERENCES brands(id),
            name     TEXT NOT NULL,
            slug     TEXT NOT NULL
        );
        CREATE TABLE cars (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            brand_id      INTEGER NOT NULL REFERENCES brands(id),
            model_id      INTEGER NOT NULL REFERENCES models(id),
            year          INTEGER NOT NULL,
            price_base    INTEGER NOT NULL,
            price_rub     INTEGER NOT NULL,
            mileage       INTEGER NOT NULL,
            engine_volume INTEGER NOT NULL,
            horsepower    INTEGER NOT NULL,
            fuel_type     TEXT    NOT NULL,
            transmission  TEXT    NOT NULL,
            color         TEXT,
            description   TEXT,
            photo_main    TEXT,
            photos_json   TEXT    DEFAULT '[]',
            is_special    INTEGER DEFAULT 0,
            badge         TEXT,
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE inquiries (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            car_id     INTEGER REFERENCES cars(id),
            name       TEXT NOT NULL,
            phone      TEXT NOT NULL,
            message    TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            email         TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            name          TEXT,
            phone         TEXT,
            city          TEXT,
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE favorites (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL REFERENCES users(id),
            car_id     INTEGER NOT NULL REFERENCES cars(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, car_id)
        );
        CREATE TABLE guest_favorites (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            car_id     INTEGER NOT NULL REFERENCES cars(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE messages (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER NOT NULL REFERENCES users(id),
            message      TEXT NOT NULL,
            is_from_user INTEGER DEFAULT 1,
            is_read      INTEGER DEFAULT 0,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE inquiries_history (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL REFERENCES users(id),
            car_id     INTEGER REFERENCES cars(id),
            status     TEXT DEFAULT 'new',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_cars_brand     ON cars(brand_id);
        CREATE INDEX idx_cars_price     ON cars(price_rub);
        CREATE INDEX idx_cars_year      ON cars(year);
        CREATE INDEX idx_cars_special   ON cars(is_special);
        CREATE INDEX idx_cars_fuel      ON cars(fuel_type);
        CREATE INDEX idx_brands_origin  ON brands(origin);
        CREATE INDEX idx_fav_user       ON favorites(user_id);
        CREATE INDEX idx_guestfav_sess  ON guest_favorites(session_id);
        CREATE INDEX idx_messages_user  ON messages(user_id);
        CREATE INDEX idx_inqhist_user   ON inquiries_history(user_id);
    """)

    # ── Seed brands (китайские бренды — приоритет, идут первыми по origin='CN')
    brands = [
        ('BYD', 'byd', 'CN'), ('Chery', 'chery', 'CN'), ('Geely', 'geely', 'CN'),
        ('Haval', 'haval', 'CN'), ('Omoda', 'omoda', 'CN'), ('Exeed', 'exeed', 'CN'),
        ('Li Auto', 'li-auto', 'CN'), ('Nio', 'nio', 'CN'), ('Zeekr', 'zeekr', 'CN'),
        ('BMW', 'bmw', 'DE'), ('Mercedes-Benz', 'mercedes', 'DE'), ('Audi', 'audi', 'DE'),
        ('Porsche', 'porsche', 'DE'), ('Toyota', 'toyota', 'JP'), ('Lexus', 'lexus', 'JP'),
        ('Volkswagen', 'volkswagen', 'DE'), ('Land Rover', 'land-rover', 'GB'),
    ]
    c.executemany("INSERT INTO brands(name,slug,origin) VALUES(?,?,?)", brands)

    def bid(name): return c.execute("SELECT id FROM brands WHERE name=?", (name,)).fetchone()[0]

    # ── Seed models
    models_data = [
        ('BMW', 'X5 xDrive40i'), ('BMW', 'M5 Competition'),
        ('Mercedes-Benz', 'GLE 350d'), ('Mercedes-Benz', 'G 63 AMG'),
        ('Audi', 'Q7 55 TFSI'), ('Audi', 'e-tron GT'),
        ('Porsche', 'Cayenne S'),
        ('Toyota', 'Land Cruiser 300'),
        ('Lexus', 'LX 600'), ('Lexus', 'ES 250'),
        ('Volkswagen', 'Touareg R-Line'),
        ('Land Rover', 'Range Rover Sport'),
        ('BYD', 'Song Plus Champion'),
        ('Chery', 'Tiggo 8 Pro Max'),
        ('Geely', 'Monjaro'),
        ('Haval', 'Jolion'),
        ('Omoda', 'C5'),
    ]
    for bname, mname in models_data:
        slug = mname.lower().replace(' ', '-')
        c.execute("INSERT INTO models(brand_id,name,slug) VALUES(?,?,?)", (bid(bname), mname, slug))

    def mid(bname, mname):
        return c.execute(
            "SELECT m.id FROM models m JOIN brands b ON m.brand_id=b.id WHERE b.name=? AND m.name=?",
            (bname, mname)
        ).fetchone()[0]

    # ── Seed cars (price_base — цена авто без растаможки; price_rub — итоговая цена "на дороге")
    CARS = [
        # brand, model, year, price_base, mileage, vol_cc, hp, fuel, trans, color, desc, photo, special, badge
        ('BMW','X5 xDrive40i', 2022, 7_490_000, 32_000, 2998, 340,'Бензин','АКПП','Черный',
         'Великолепный BMW X5 в идеальном состоянии. Один владелец, полный сервисный пакет от дилера.',
         'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80', 1,'Хит продаж'),

        ('Mercedes-Benz','GLE 350d', 2021, 6_850_000, 45_000, 2987, 272,'Дизель','АКПП','Серый',
         'Mercedes-Benz GLE в комплектации AMG Line. Панорамная крыша, Burmester аудиосистема.',
         'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&q=80', 1,'Выгода 300 000 ₽'),

        ('Porsche','Cayenne S', 2023, 12_900_000, 8_500, 2894, 440,'Бензин','АКПП','Белый',
         'Porsche Cayenne S — практически новый автомобиль. На гарантии до 2026 года.',
         'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80', 0, None),

        ('Audi','Q7 55 TFSI', 2022, 8_200_000, 22_000, 2998, 340,'Бензин','АКПП','Синий',
         'Audi Q7 в максимальной комплектации. Матричные фары, адаптивная подвеска.',
         'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800&q=80', 1,'Топ выбор'),

        ('Toyota','Land Cruiser 300', 2022, 9_750_000, 18_000, 3445, 415,'Бензин','АКПП','Черный',
         'Toyota Land Cruiser 300 — легендарная надёжность. Комплектация Executive Lounge.',
         'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=800&q=80', 1,'В наличии'),

        ('Lexus','LX 600', 2023, 14_500_000, 5_200, 3445, 415,'Бензин','АКПП','Перламутр',
         'Lexus LX 600 Ultra Luxury. Четыре места, массаж, вентиляция, Lexus Premium Sound.',
         'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&q=80', 0, None),

        ('Volkswagen','Touareg R-Line', 2021, 4_650_000, 58_000, 2967, 231,'Дизель','АКПП','Серебристый',
         'VW Touareg в спортивном пакете R-Line. Пробег подтверждён сервисной книжкой.',
         'https://images.unsplash.com/photo-1489824904134-891ab64532f1?w=800&q=80', 0, None),

        ('BMW','M5 Competition', 2021, 9_300_000, 41_000, 4395, 625,'Бензин','АКПП','Красный',
         'BMW M5 Competition — 625 лошадиных сил в элегантном кузове. 0–100 за 3.3 секунды.',
         'https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?w=800&q=80', 1,'Спорт'),

        ('Mercedes-Benz','G 63 AMG', 2022, 18_900_000, 12_000, 3982, 585,'Бензин','АКПП','Матовый черный',
         'Mercedes G 63 AMG — икона стиля. Уникальный цвет Manufaktur, карбоновые вставки.',
         'https://images.unsplash.com/photo-1563720223185-11003d516935?w=800&q=80', 0,'Эксклюзив'),

        ('Land Rover','Range Rover Sport', 2022, 8_990_000, 26_000, 2998, 400,'Бензин','АКПП','Зеленый',
         'Range Rover Sport в редком цвете Carpathian Grey. Meridian Signature Sound System.',
         'https://images.unsplash.com/photo-1488956041116-d1f8f8f68934?w=800&q=80', 1,'Trade-in зачет'),

        ('Audi','e-tron GT', 2023, 11_200_000, 7_000, 0, 476,'Электро','Авто','Серо-синий',
         'Audi e-tron GT — электромобиль будущего. Запас хода 487 км, зарядка до 270 кВт.',
         'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=800&q=80', 0, None),

        ('Lexus','ES 250', 2021, 3_250_000, 67_000, 2494, 184,'Бензин','АКПП','Белый',
         'Lexus ES 250 — идеальный автомобиль для города. Полное ТО у официального дилера.',
         'https://images.unsplash.com/photo-1571987502227-9231b837d92a?w=800&q=80', 0, None),

        # ── Китайские марки ──
        ('BYD','Song Plus Champion', 2023, 2_800_000, 15_000, 1500, 197,'Гибрид','АКПП','Белый',
         'BYD Song Plus Champion Edition — гибрид нового поколения с запасом хода 1000+ км. Полный привод, панорамная крыша.',
         'https://images.unsplash.com/photo-1617469767053-d3b523a0b982?w=800&q=80', 1,'Новинка из Китая'),

        ('Chery','Tiggo 8 Pro Max', 2023, 3_200_000, 20_000, 1998, 197,'Бензин','АКПП','Серый',
         'Chery Tiggo 8 Pro Max — просторный 7-местный кроссовер. Премиальная отделка, два больших экрана.',
         'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&q=80', 1,'Хит из Китая'),

        ('Geely','Monjaro', 2023, 3_500_000, 12_000, 1998, 238,'Бензин','АКПП','Синий',
         'Geely Monjaro — флагманский кроссовер бренда. Мощный турбомотор 238 л.с., богатая комплектация.',
         'https://images.unsplash.com/photo-1619767886558-efdc259cde1a?w=800&q=80', 0, None),

        ('Haval','Jolion', 2022, 1_900_000, 35_000, 1500, 150,'Бензин','АКПП','Красный',
         'Haval Jolion — компактный кроссовер с богатой базовой комплектацией и экономичным расходом.',
         'https://images.unsplash.com/photo-1606220588911-5117e1825042?w=800&q=80', 1,'Доступная цена'),

        ('Omoda','C5', 2023, 2_100_000, 8_000, 1500, 147,'Бензин','АКПП','Зеленый',
         'Omoda C5 — стильный городской кроссовер с современным мультимедийным комплексом и ADAS.',
         'https://images.unsplash.com/photo-1627454822466-0a1f5e7b9d3a?w=800&q=80', 0, None),
    ]
    for brand, model, year, price_base, mileage, vol, hp, fuel, trans, color, desc, photo, special, badge in CARS:
        customs = calc_customs_rub(price_base, year, vol, hp, fuel)
        price_rub = price_base + customs
        c.execute("""
            INSERT INTO cars
            (brand_id,model_id,year,price_base,price_rub,mileage,engine_volume,horsepower,
             fuel_type,transmission,color,description,photo_main,is_special,badge)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (bid(brand), mid(brand, model), year, price_base, price_rub, mileage, vol, hp,
              fuel, trans, color, desc, photo, 1 if special else 0, badge))

    conn.commit()
    conn.close()
    print("✓ База данных создана и заполнена")


def migrate_db():
    """Добавляет новые таблицы/колонки для админ-панели, не трогая существующие данные."""
    conn = get_db()
    c = conn.cursor()

    user_cols = [r['name'] for r in c.execute("PRAGMA table_info(users)").fetchall()]
    if 'is_admin' not in user_cols:
        c.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0")
    if 'is_blocked' not in user_cols:
        c.execute("ALTER TABLE users ADD COLUMN is_blocked INTEGER DEFAULT 0")

    msg_cols = [r['name'] for r in c.execute("PRAGMA table_info(messages)").fetchall()]
    if 'admin_id' not in msg_cols:
        c.execute("ALTER TABLE messages ADD COLUMN admin_id INTEGER")
    if 'car_id' not in msg_cols:
        c.execute("ALTER TABLE messages ADD COLUMN car_id INTEGER REFERENCES cars(id)")

    c.executescript("""
        CREATE TABLE IF NOT EXISTS site_content (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    """)

    admin = c.execute("SELECT id FROM users WHERE is_admin=1").fetchone()
    if not admin:
        existing = c.execute("SELECT id FROM users WHERE email=?", ('admin@avtomir.ru',)).fetchone()
        if existing:
            c.execute("UPDATE users SET is_admin=1 WHERE id=?", (existing['id'],))
        else:
            c.execute(
                "INSERT INTO users(email,password_hash,name,is_admin) VALUES(?,?,?,1)",
                ('admin@avtomir.ru', generate_password_hash('admin12345'), 'Администратор')
            )
            print("✓ Создан администратор: admin@avtomir.ru / admin12345")

    conn.commit()
    conn.close()


# ─── Site content (CMS) ─────────────────────────────────────────────────────

# key -> (label, default text). Редактируется в /admin → "Контент".
CONTENT_KEYS = {
    'hero_sub':        ('Главная: подзаголовок над заголовком', 'Более 200 автомобилей в наличии'),
    'hero_desc':       ('Главная: описание под заголовком', 'Проверенные автомобили из Китая и Европы. Цена уже включает растаможку. Выкуп вашего авто.'),
    'about_sub':       ('О компании: подзаголовок', 'Более 5 лет помогаем находить идеальный автомобиль'),
    'about_history_1': ('О компании: абзац истории 1', 'Автосалон <strong>АВТОМИР</strong> основан в 2019 году командой профессионалов автомобильного рынка. Мы начинали с небольшого шоурума в 10 автомобилей — сегодня наш парк насчитывает более 200 проверенных автомобилей с пробегом.'),
    'about_history_2': ('О компании: абзац истории 2', 'За пять лет мы выстроили прозрачный процесс продаж, при котором клиент всегда знает полную историю автомобиля ещё до подписания договора. Каждое авто проходит 150-точечную диагностику в нашем техническом центре.'),
    'about_history_3': ('О компании: абзац истории 3', 'Мы напрямую работаем с поставщиками автомобилей из Китая — все таможенные платежи уже включены в цену на сайте, без скрытых доплат. Программа trade-in позволяет быстро обменять ваш автомобиль на более новый.'),
    'contacts_sub':    ('Контакты: подзаголовок', 'Свяжитесь с нами любым удобным способом'),
    'howtobuy_sub':    ('Как купить: подзаголовок', 'Простой и прозрачный процесс в 6 шагов'),
    'footer_desc':     ('Подвал сайта: описание', 'Проверенные автомобили из Китая и Европы.<br/>Цена уже включает растаможку. Trade-in.'),
}


def get_content(key, default=''):
    cache = getattr(g, '_content_cache', None)
    if cache is None:
        conn = get_db()
        rows = conn.execute("SELECT key,value FROM site_content").fetchall()
        conn.close()
        cache = {r['key']: r['value'] for r in rows}
        g._content_cache = cache
    return cache.get(key, default)


app.jinja_env.globals['cms'] = get_content


# ─── Helpers ───────────────────────────────────────────────────────────────

def car_to_dict(row, fav_ids=None):
    d = dict(row)
    d['brand_name'] = d.pop('brand_name', '')
    d['model_name'] = d.pop('model_name', '')
    d['photos'] = json.loads(d.get('photos_json') or '[]')
    if fav_ids is not None:
        d['is_favorite'] = d['id'] in fav_ids
    return d


def current_user():
    uid = session.get('user_id')
    if not uid:
        return None
    conn = get_db()
    row = conn.execute(
        "SELECT id,email,name,phone,city,created_at,is_admin,is_blocked FROM users WHERE id=?", (uid,)
    ).fetchone()
    conn.close()
    if not row:
        session.pop('user_id', None)
        return None
    if row['is_blocked']:
        session.pop('user_id', None)
        return None
    return dict(row)


def login_required_api(f):
    @wraps(f)
    def wrapper(*a, **kw):
        if not current_user():
            return jsonify({'error': 'unauthorized'}), 401
        return f(*a, **kw)
    return wrapper


def login_required_page(f):
    @wraps(f)
    def wrapper(*a, **kw):
        if not current_user():
            return redirect('/login')
        return f(*a, **kw)
    return wrapper


def admin_required_api(f):
    @wraps(f)
    def wrapper(*a, **kw):
        u = current_user()
        if not u or not u.get('is_admin'):
            return jsonify({'error': 'forbidden'}), 403
        return f(*a, **kw)
    return wrapper


def admin_required_page(f):
    @wraps(f)
    def wrapper(*a, **kw):
        u = current_user()
        if not u:
            return redirect('/login')
        if not u.get('is_admin'):
            return redirect('/')
        return f(*a, **kw)
    return wrapper


def get_user_favorite_ids(user_id):
    conn = get_db()
    rows = conn.execute("SELECT car_id FROM favorites WHERE user_id=?", (user_id,)).fetchall()
    conn.close()
    return {r['car_id'] for r in rows}


# ─── Static assets ─────────────────────────────────────────────────────────

@app.route('/images/<path:filename>')
def serve_images(filename):
    return send_from_directory('images', filename)


# ─── Page routes ───────────────────────────────────────────────────────────

@app.route('/')
def page_index():
    return render_template('index.html', active='catalog', user=current_user())

@app.route('/about')
def page_about():
    return render_template('about.html', active='about', user=current_user())

@app.route('/how-to-buy')
def page_how_to_buy():
    return render_template('how-to-buy.html', active='how', user=current_user())

@app.route('/contacts')
def page_contacts():
    return render_template('contacts.html', active='contacts', user=current_user())

@app.route('/car/<int:car_id>')
def page_car(car_id):
    return render_template('car.html', active='catalog', car_id=car_id, user=current_user())

@app.route('/login')
def page_login():
    if session.get('user_id'):
        return redirect('/profile')
    return render_template('login.html', active='login', user=None)

@app.route('/register')
def page_register():
    if session.get('user_id'):
        return redirect('/profile')
    return render_template('register.html', active='register', user=None)

@app.route('/profile')
@login_required_page
def page_profile():
    return render_template('profile.html', active='profile', user=current_user())

@app.route('/chat')
@login_required_page
def page_chat():
    return render_template('chat.html', active='chat', user=current_user())

@app.route('/favorites')
def page_favorites():
    return render_template('favorites.html', active='favorites', user=current_user())

@app.route('/admin')
@admin_required_page
def page_admin():
    return render_template('admin.html', active='admin', user=current_user())


# ─── API: catalog ───────────────────────────────────────────────────────────

@app.route('/api/brands')
def api_brands():
    conn = get_db()
    rows = conn.execute("SELECT * FROM brands ORDER BY (origin='CN') DESC, name").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/models')
def api_models():
    brand_id = request.args.get('brand_id')
    conn = get_db()
    if brand_id:
        rows = conn.execute("SELECT * FROM models WHERE brand_id=? ORDER BY name", (brand_id,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM models ORDER BY name").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/cars')
def api_cars():
    page  = max(1, int(request.args.get('page', 1)))
    limit = 12
    offset = (page - 1) * limit

    filters = []
    params  = []

    brand = request.args.get('brand', '').strip()
    model = request.args.get('model', '').strip()
    year_from  = request.args.get('year_from',  '').strip()
    price_to   = request.args.get('price_to',   '').strip()
    fuel       = request.args.get('fuel',       '').strip()
    special    = request.args.get('special',    '').strip()
    origin     = request.args.get('origin',     '').strip()

    if brand:
        filters.append("b.name = ?"); params.append(brand)
    if model:
        filters.append("m.name = ?"); params.append(model)
    if year_from:
        filters.append("c.year >= ?"); params.append(int(year_from))
    if price_to:
        filters.append("c.price_rub <= ?"); params.append(int(price_to))
    if fuel:
        filters.append("c.fuel_type = ?"); params.append(fuel)
    if special == '1':
        filters.append("c.is_special = 1")
    if origin:
        filters.append("b.origin = ?"); params.append(origin.upper())

    where = ("WHERE " + " AND ".join(filters)) if filters else ""

    base_query = f"""
        SELECT c.*, b.name AS brand_name, m.name AS model_name
        FROM cars c
        JOIN brands b ON c.brand_id = b.id
        JOIN models m ON c.model_id = m.id
        {where}
    """

    conn = get_db()
    total = conn.execute(f"SELECT COUNT(*) FROM ({base_query})", params).fetchone()[0]
    rows  = conn.execute(base_query + " ORDER BY c.created_at DESC LIMIT ? OFFSET ?",
                         params + [limit, offset]).fetchall()
    conn.close()

    fav_ids = get_user_favorite_ids(session['user_id']) if session.get('user_id') else set()

    total_pages = max(1, (total + limit - 1) // limit)
    return jsonify({
        'cars': [car_to_dict(r, fav_ids) for r in rows],
        'total': total,
        'page': page,
        'total_pages': total_pages,
    })


@app.route('/api/car/<int:car_id>')
def api_car(car_id):
    conn = get_db()
    row = conn.execute("""
        SELECT c.*, b.name AS brand_name, m.name AS model_name
        FROM cars c
        JOIN brands b ON c.brand_id = b.id
        JOIN models m ON c.model_id = m.id
        WHERE c.id = ?
    """, (car_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({'error': 'Not found'}), 404
    fav_ids = get_user_favorite_ids(session['user_id']) if session.get('user_id') else set()
    return jsonify(car_to_dict(row, fav_ids))


@app.route('/api/inquiry', methods=['POST'])
def api_inquiry():
    data = request.get_json(silent=True) or {}
    name  = (data.get('name') or '').strip()
    phone = (data.get('phone') or '').strip()
    car_id = data.get('car_id')
    msg   = (data.get('message') or '').strip()
    if not name or not phone:
        return jsonify({'error': 'name and phone required'}), 400
    conn = get_db()
    conn.execute("INSERT INTO inquiries(car_id,name,phone,message) VALUES(?,?,?,?)",
                 (car_id, name, phone, msg))
    if session.get('user_id'):
        conn.execute("INSERT INTO inquiries_history(user_id,car_id,status) VALUES(?,?,?)",
                     (session['user_id'], car_id, 'new'))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


# ─── API: exchange rate proxy ───────────────────────────────────────────────

FALLBACK_RATES = {'CNY': 12.5, 'KRW': 0.067, 'JPY': 0.63, 'EUR': 100.0, 'USD': 92.0}

@app.route('/api/exchange-rate')
def api_exchange_rate():
    currency = request.args.get('currency', 'CNY').upper()
    try:
        with urllib.request.urlopen(f'https://open.er-api.com/v6/latest/{currency}', timeout=5) as resp:
            data = json.loads(resp.read().decode())
        rate = (data.get('rates') or {}).get('RUB')
        if rate:
            return jsonify({'currency': currency, 'rate': rate, 'success': True})
    except Exception:
        pass
    return jsonify({'currency': currency, 'rate': FALLBACK_RATES.get(currency, 1), 'success': False, 'fallback': True})


@app.route('/api/customs-settings')
def api_customs_settings():
    return jsonify(get_customs_settings())


# ─── API: auth ───────────────────────────────────────────────────────────────

@app.route('/api/register', methods=['POST'])
def api_register():
    data = request.get_json(silent=True) or {}
    email    = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    name     = (data.get('name') or '').strip()
    phone    = (data.get('phone') or '').strip()

    if not email or not password:
        return jsonify({'error': 'email и пароль обязательны'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Пароль должен быть не менее 6 символов'}), 400

    conn = get_db()
    existing = conn.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
    if existing:
        conn.close()
        return jsonify({'error': 'Пользователь с таким email уже существует'}), 400

    cur = conn.execute(
        "INSERT INTO users(email,password_hash,name,phone) VALUES(?,?,?,?)",
        (email, generate_password_hash(password), name, phone)
    )
    conn.commit()
    user_id = cur.lastrowid
    conn.close()

    session['user_id'] = user_id
    return jsonify({'ok': True, 'user': {'id': user_id, 'email': email, 'name': name, 'phone': phone, 'is_admin': False}})


@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json(silent=True) or {}
    email    = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    conn.close()

    if not row or not check_password_hash(row['password_hash'], password):
        return jsonify({'error': 'Неверный email или пароль'}), 401
    if row['is_blocked']:
        return jsonify({'error': 'Доступ заблокирован. Обратитесь в поддержку.'}), 403

    session['user_id'] = row['id']
    return jsonify({'ok': True, 'user': {
        'id': row['id'], 'email': row['email'], 'name': row['name'],
        'phone': row['phone'], 'city': row['city'], 'is_admin': bool(row['is_admin'])
    }})


@app.route('/api/logout', methods=['POST'])
def api_logout():
    session.pop('user_id', None)
    return jsonify({'ok': True})


@app.route('/api/me')
def api_me():
    user = current_user()
    return jsonify({'user': user})


# ─── API: profile ────────────────────────────────────────────────────────────

@app.route('/api/profile', methods=['PUT'])
@login_required_api
def api_profile_update():
    data = request.get_json(silent=True) or {}
    name  = (data.get('name')  or '').strip()
    phone = (data.get('phone') or '').strip()
    city  = (data.get('city')  or '').strip()
    conn = get_db()
    conn.execute("UPDATE users SET name=?, phone=?, city=? WHERE id=?",
                 (name, phone, city, session['user_id']))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/profile/password', methods=['PUT'])
@login_required_api
def api_profile_password():
    data = request.get_json(silent=True) or {}
    old_password = data.get('old_password') or ''
    new_password = data.get('new_password') or ''
    if len(new_password) < 6:
        return jsonify({'error': 'Новый пароль должен быть не менее 6 символов'}), 400

    conn = get_db()
    row = conn.execute("SELECT password_hash FROM users WHERE id=?", (session['user_id'],)).fetchone()
    if not row or not check_password_hash(row['password_hash'], old_password):
        conn.close()
        return jsonify({'error': 'Неверный текущий пароль'}), 400

    conn.execute("UPDATE users SET password_hash=? WHERE id=?",
                 (generate_password_hash(new_password), session['user_id']))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/inquiries')
@login_required_api
def api_inquiries_history():
    conn = get_db()
    rows = conn.execute("""
        SELECT ih.id, ih.status, ih.created_at, c.id AS car_id,
               b.name AS brand_name, m.name AS model_name, c.year, c.price_rub, c.photo_main
        FROM inquiries_history ih
        LEFT JOIN cars c ON ih.car_id = c.id
        LEFT JOIN brands b ON c.brand_id = b.id
        LEFT JOIN models m ON c.model_id = m.id
        WHERE ih.user_id=?
        ORDER BY ih.created_at DESC
    """, (session['user_id'],)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


# ─── API: favorites ──────────────────────────────────────────────────────────

@app.route('/api/favorites', methods=['GET'])
@login_required_api
def api_favorites_get():
    conn = get_db()
    rows = conn.execute("""
        SELECT c.*, b.name AS brand_name, m.name AS model_name
        FROM favorites f
        JOIN cars c ON f.car_id = c.id
        JOIN brands b ON c.brand_id = b.id
        JOIN models m ON c.model_id = m.id
        WHERE f.user_id=?
        ORDER BY f.created_at DESC
    """, (session['user_id'],)).fetchall()
    conn.close()
    return jsonify([car_to_dict(r, {r['id'] for r in rows}) for r in rows])


@app.route('/api/favorites', methods=['POST'])
@login_required_api
def api_favorites_add():
    data = request.get_json(silent=True) or {}
    car_id = data.get('car_id')
    if not car_id:
        return jsonify({'error': 'car_id required'}), 400
    conn = get_db()
    conn.execute("INSERT OR IGNORE INTO favorites(user_id,car_id) VALUES(?,?)", (session['user_id'], car_id))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/favorites/<int:car_id>', methods=['DELETE'])
@login_required_api
def api_favorites_remove(car_id):
    conn = get_db()
    conn.execute("DELETE FROM favorites WHERE user_id=? AND car_id=?", (session['user_id'], car_id))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/favorites/merge', methods=['POST'])
@login_required_api
def api_favorites_merge():
    data = request.get_json(silent=True) or {}
    car_ids = data.get('car_ids') or []
    conn = get_db()
    for cid in car_ids:
        try:
            conn.execute("INSERT OR IGNORE INTO favorites(user_id,car_id) VALUES(?,?)", (session['user_id'], int(cid)))
        except (ValueError, TypeError):
            continue
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


# ─── API: chat / messages ────────────────────────────────────────────────────

AUTO_REPLY = "Спасибо за сообщение! Менеджер свяжется с вами в ближайшее время. Также вы можете написать нам напрямую в Telegram: t.me/Sendyxls"

MESSAGES_SELECT = """
    SELECT m.*, b.name AS car_brand, mo.name AS car_model, c.year AS car_year
    FROM messages m
    LEFT JOIN cars c ON m.car_id = c.id
    LEFT JOIN brands b ON c.brand_id = b.id
    LEFT JOIN models mo ON c.model_id = mo.id
    WHERE m.user_id=?
    ORDER BY m.created_at ASC
"""


@app.route('/api/messages', methods=['GET'])
@login_required_api
def api_messages_get():
    conn = get_db()
    rows = conn.execute(MESSAGES_SELECT, (session['user_id'],)).fetchall()
    conn.execute("UPDATE messages SET is_read=1 WHERE user_id=? AND is_from_user=0", (session['user_id'],))
    conn.commit()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/messages', methods=['POST'])
@login_required_api
def api_messages_post():
    data = request.get_json(silent=True) or {}
    text = (data.get('message') or '').strip()
    if not text:
        return jsonify({'error': 'message required'}), 400

    car_id = data.get('car_id')
    try:
        car_id = int(car_id) if car_id else None
    except (TypeError, ValueError):
        car_id = None

    conn = get_db()
    if car_id is not None:
        exists = conn.execute("SELECT 1 FROM cars WHERE id=?", (car_id,)).fetchone()
        if not exists:
            car_id = None

    conn.execute("INSERT INTO messages(user_id,message,is_from_user,is_read,car_id) VALUES(?,?,1,1,?)",
                 (session['user_id'], text, car_id))

    # автоответ менеджера-заглушки — отправляется только один раз для каждого клиента
    already_replied = conn.execute(
        "SELECT 1 FROM messages WHERE user_id=? AND is_from_user=0 AND admin_id IS NULL LIMIT 1",
        (session['user_id'],)
    ).fetchone()
    if not already_replied:
        conn.execute("INSERT INTO messages(user_id,message,is_from_user,is_read) VALUES(?,?,0,0)",
                     (session['user_id'], AUTO_REPLY))

    conn.commit()
    rows = conn.execute(MESSAGES_SELECT, (session['user_id'],)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


# ─── API: admin — клиенты ────────────────────────────────────────────────────

@app.route('/api/admin/users')
@admin_required_api
def admin_users_list():
    q = request.args.get('q', '').strip()
    page = max(1, int(request.args.get('page', 1)))
    limit = 20
    offset = (page - 1) * limit

    where, params = "", []
    if q:
        like = f"%{q}%"
        where = "WHERE u.email LIKE ? OR u.name LIKE ? OR u.phone LIKE ?"
        params = [like, like, like]

    conn = get_db()
    total = conn.execute(f"SELECT COUNT(*) FROM users u {where}", params).fetchone()[0]
    rows = conn.execute(f"""
        SELECT u.id, u.email, u.name, u.phone, u.city, u.created_at, u.is_admin, u.is_blocked,
               (SELECT COUNT(*) FROM favorites f WHERE f.user_id=u.id) AS fav_count,
               (SELECT COUNT(*) FROM inquiries_history ih WHERE ih.user_id=u.id) AS inquiry_count,
               (SELECT COUNT(*) FROM messages mm WHERE mm.user_id=u.id) AS message_count
        FROM users u {where}
        ORDER BY u.created_at DESC LIMIT ? OFFSET ?
    """, params + [limit, offset]).fetchall()
    conn.close()

    return jsonify({
        'users': [dict(r) for r in rows],
        'total': total, 'page': page,
        'total_pages': max(1, (total + limit - 1) // limit),
    })


@app.route('/api/admin/users/<int:uid>')
@admin_required_api
def admin_user_detail(uid):
    conn = get_db()
    user = conn.execute(
        "SELECT id,email,name,phone,city,created_at,is_admin,is_blocked FROM users WHERE id=?", (uid,)
    ).fetchone()
    if not user:
        conn.close()
        return jsonify({'error': 'not found'}), 404
    favorites = conn.execute("""
        SELECT c.id, b.name AS brand_name, m.name AS model_name, c.year, c.price_rub, c.photo_main
        FROM favorites f
        JOIN cars c ON f.car_id = c.id
        JOIN brands b ON c.brand_id = b.id
        JOIN models m ON c.model_id = m.id
        WHERE f.user_id=?
        ORDER BY f.created_at DESC
    """, (uid,)).fetchall()
    inquiries = conn.execute("""
        SELECT ih.id, ih.status, ih.created_at, c.id AS car_id,
               b.name AS brand_name, m.name AS model_name, c.year, c.price_rub
        FROM inquiries_history ih
        LEFT JOIN cars c ON ih.car_id = c.id
        LEFT JOIN brands b ON c.brand_id = b.id
        LEFT JOIN models m ON c.model_id = m.id
        WHERE ih.user_id=?
        ORDER BY ih.created_at DESC
    """, (uid,)).fetchall()
    messages = conn.execute(MESSAGES_SELECT, (uid,)).fetchall()
    conn.close()
    return jsonify({
        'user': dict(user),
        'favorites': [dict(r) for r in favorites],
        'inquiries': [dict(r) for r in inquiries],
        'messages': [dict(r) for r in messages],
    })


@app.route('/api/admin/users/<int:uid>/block', methods=['POST'])
@admin_required_api
def admin_user_block(uid):
    conn = get_db()
    row = conn.execute("SELECT is_admin, is_blocked FROM users WHERE id=?", (uid,)).fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'not found'}), 404
    if row['is_admin']:
        conn.close()
        return jsonify({'error': 'нельзя заблокировать администратора'}), 400
    new_val = 0 if row['is_blocked'] else 1
    conn.execute("UPDATE users SET is_blocked=? WHERE id=?", (new_val, uid))
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'is_blocked': bool(new_val)})


@app.route('/api/admin/users/<int:uid>', methods=['DELETE'])
@admin_required_api
def admin_user_delete(uid):
    conn = get_db()
    row = conn.execute("SELECT is_admin FROM users WHERE id=?", (uid,)).fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'not found'}), 404
    if row['is_admin']:
        conn.close()
        return jsonify({'error': 'нельзя удалить администратора'}), 400
    conn.execute("DELETE FROM favorites WHERE user_id=?", (uid,))
    conn.execute("DELETE FROM messages WHERE user_id=?", (uid,))
    conn.execute("DELETE FROM inquiries_history WHERE user_id=?", (uid,))
    conn.execute("DELETE FROM users WHERE id=?", (uid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


# ─── API: admin — объявления (cars/brands/models) ───────────────────────────

@app.route('/api/admin/brands', methods=['GET', 'POST'])
@admin_required_api
def admin_brands():
    conn = get_db()
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        name = (data.get('name') or '').strip()
        origin = (data.get('origin') or 'OTHER').strip().upper()
        if not name:
            conn.close()
            return jsonify({'error': 'name required'}), 400
        slug = name.lower().replace(' ', '-')
        cur = conn.execute("INSERT INTO brands(name,slug,origin) VALUES(?,?,?)", (name, slug, origin))
        conn.commit()
        bid_ = cur.lastrowid
        conn.close()
        return jsonify({'ok': True, 'id': bid_})
    rows = conn.execute("SELECT * FROM brands ORDER BY (origin='CN') DESC, name").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/admin/models', methods=['GET', 'POST'])
@admin_required_api
def admin_models():
    conn = get_db()
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        brand_id = data.get('brand_id')
        name = (data.get('name') or '').strip()
        if not brand_id or not name:
            conn.close()
            return jsonify({'error': 'brand_id and name required'}), 400
        slug = name.lower().replace(' ', '-')
        cur = conn.execute("INSERT INTO models(brand_id,name,slug) VALUES(?,?,?)", (brand_id, name, slug))
        conn.commit()
        mid_ = cur.lastrowid
        conn.close()
        return jsonify({'ok': True, 'id': mid_})
    brand_id = request.args.get('brand_id')
    if brand_id:
        rows = conn.execute("SELECT * FROM models WHERE brand_id=? ORDER BY name", (brand_id,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM models ORDER BY name").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/admin/cars')
@admin_required_api
def admin_cars_list():
    q = request.args.get('q', '').strip()
    where, params = "", []
    if q:
        like = f"%{q}%"
        where = "WHERE b.name LIKE ? OR m.name LIKE ?"
        params = [like, like]
    conn = get_db()
    rows = conn.execute(f"""
        SELECT c.*, b.name AS brand_name, m.name AS model_name
        FROM cars c
        JOIN brands b ON c.brand_id = b.id
        JOIN models m ON c.model_id = m.id
        {where}
        ORDER BY c.created_at DESC
    """, params).fetchall()
    conn.close()
    return jsonify([car_to_dict(r) for r in rows])


CAR_FIELDS = ['brand_id', 'model_id', 'year', 'price_base', 'mileage', 'engine_volume',
               'horsepower', 'fuel_type', 'transmission', 'color', 'description',
               'photo_main', 'is_special', 'badge']


def _parse_car_payload(data):
    vals = {f: data.get(f) for f in CAR_FIELDS}
    for f in ['brand_id', 'model_id', 'year', 'price_base', 'mileage', 'engine_volume', 'horsepower']:
        vals[f] = int(vals[f])
    vals['is_special'] = 1 if vals.get('is_special') else 0
    settings = get_customs_settings()
    customs = calc_customs_rub(vals['price_base'], vals['year'], vals['engine_volume'],
                                vals['horsepower'], vals['fuel_type'], settings)
    vals['price_rub'] = vals['price_base'] + customs
    return vals


@app.route('/api/admin/cars', methods=['POST'])
@admin_required_api
def admin_car_create():
    data = request.get_json(silent=True) or {}
    try:
        vals = _parse_car_payload(data)
    except (TypeError, ValueError, KeyError):
        return jsonify({'error': 'invalid data'}), 400
    conn = get_db()
    cur = conn.execute("""
        INSERT INTO cars
        (brand_id,model_id,year,price_base,price_rub,mileage,engine_volume,horsepower,
         fuel_type,transmission,color,description,photo_main,is_special,badge)
        VALUES (:brand_id,:model_id,:year,:price_base,:price_rub,:mileage,:engine_volume,:horsepower,
                :fuel_type,:transmission,:color,:description,:photo_main,:is_special,:badge)
    """, vals)
    conn.commit()
    cid = cur.lastrowid
    conn.close()
    return jsonify({'ok': True, 'id': cid, 'price_rub': vals['price_rub']})


@app.route('/api/admin/cars/<int:car_id>', methods=['PUT'])
@admin_required_api
def admin_car_update(car_id):
    data = request.get_json(silent=True) or {}
    try:
        vals = _parse_car_payload(data)
    except (TypeError, ValueError, KeyError):
        return jsonify({'error': 'invalid data'}), 400
    vals['id'] = car_id
    conn = get_db()
    conn.execute("""
        UPDATE cars SET brand_id=:brand_id, model_id=:model_id, year=:year, price_base=:price_base,
            price_rub=:price_rub, mileage=:mileage, engine_volume=:engine_volume, horsepower=:horsepower,
            fuel_type=:fuel_type, transmission=:transmission, color=:color, description=:description,
            photo_main=:photo_main, is_special=:is_special, badge=:badge
        WHERE id=:id
    """, vals)
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'price_rub': vals['price_rub']})


@app.route('/api/admin/cars/<int:car_id>', methods=['DELETE'])
@admin_required_api
def admin_car_delete(car_id):
    conn = get_db()
    conn.execute("DELETE FROM favorites WHERE car_id=?", (car_id,))
    conn.execute("DELETE FROM guest_favorites WHERE car_id=?", (car_id,))
    conn.execute("UPDATE inquiries_history SET car_id=NULL WHERE car_id=?", (car_id,))
    conn.execute("UPDATE inquiries SET car_id=NULL WHERE car_id=?", (car_id,))
    conn.execute("DELETE FROM cars WHERE id=?", (car_id,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


# ─── API: admin — загрузка фото ──────────────────────────────────────────────

# Загруженные фото: на Railway лежат в /data/uploads (персистентный том),
# локально — в static/uploads/ (Flask отдаёт их напрямую)
UPLOAD_FOLDER = os.environ.get(
    'UPLOAD_FOLDER',
    os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'uploads')
)
ALLOWED_UPLOAD_EXT = {'png', 'jpg', 'jpeg', 'gif', 'webp'}


@app.route('/static/uploads/<path:filename>')
def serve_upload(filename):
    """Отдаёт загруженные файлы из UPLOAD_FOLDER (работает и локально, и на Railway)."""
    return send_from_directory(UPLOAD_FOLDER, filename)


@app.route('/api/admin/upload', methods=['POST'])
@admin_required_api
def admin_upload():
    file = request.files.get('file')
    if not file or not file.filename:
        return jsonify({'error': 'file required'}), 400
    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in ALLOWED_UPLOAD_EXT:
        return jsonify({'error': 'invalid file type'}), 400
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.{ext}"
    filename = secure_filename(filename)
    file.save(os.path.join(UPLOAD_FOLDER, filename))
    return jsonify({'url': f'/static/uploads/{filename}'})


# ─── API: admin — контент сайта ──────────────────────────────────────────────

@app.route('/api/admin/content', methods=['GET'])
@admin_required_api
def admin_content_get():
    conn = get_db()
    rows = conn.execute("SELECT key,value FROM site_content").fetchall()
    conn.close()
    saved = {r['key']: r['value'] for r in rows}
    return jsonify([
        {'key': key, 'label': label, 'value': saved.get(key, default)}
        for key, (label, default) in CONTENT_KEYS.items()
    ])


@app.route('/api/admin/content', methods=['PUT'])
@admin_required_api
def admin_content_update():
    data = request.get_json(silent=True) or {}
    items = data.get('items') or {}
    conn = get_db()
    for k, v in items.items():
        if k not in CONTENT_KEYS:
            continue
        conn.execute(
            "INSERT INTO site_content(key,value) VALUES(?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (k, v)
        )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


# ─── API: admin — калькулятор растаможки ─────────────────────────────────────

@app.route('/api/admin/customs-settings', methods=['GET'])
@admin_required_api
def admin_customs_get():
    return jsonify(get_customs_settings())


@app.route('/api/admin/customs-settings', methods=['PUT'])
@admin_required_api
def admin_customs_update():
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify({'error': 'invalid data'}), 400
    conn = get_db()
    conn.execute(
        "INSERT INTO settings(key,value) VALUES('customs',?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (json.dumps(data),)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


# ─── API: admin — статистика ─────────────────────────────────────────────────

@app.route('/api/admin/stats')
@admin_required_api
def admin_stats():
    conn = get_db()
    total_cars = conn.execute("SELECT COUNT(*) FROM cars").fetchone()[0]
    total_users = conn.execute("SELECT COUNT(*) FROM users WHERE is_admin=0").fetchone()[0]
    total_inquiries = conn.execute("SELECT COUNT(*) FROM inquiries").fetchone()[0]
    total_favorites = (conn.execute("SELECT COUNT(*) FROM favorites").fetchone()[0]
                        + conn.execute("SELECT COUNT(*) FROM guest_favorites").fetchone()[0])
    avg_price = conn.execute("SELECT AVG(price_rub) FROM cars").fetchone()[0] or 0

    top_requested = conn.execute("""
        SELECT b.name, COUNT(*) AS cnt FROM inquiries i
        JOIN cars c ON i.car_id = c.id
        JOIN brands b ON c.brand_id = b.id
        GROUP BY b.name ORDER BY cnt DESC LIMIT 5
    """).fetchall()

    top_favorites = conn.execute("""
        SELECT b.name, COUNT(*) AS cnt FROM favorites f
        JOIN cars c ON f.car_id = c.id
        JOIN brands b ON c.brand_id = b.id
        GROUP BY b.name ORDER BY cnt DESC LIMIT 5
    """).fetchall()

    inquiries_by_day = conn.execute("""
        SELECT date(created_at) AS d, COUNT(*) AS cnt FROM inquiries
        WHERE created_at >= date('now','-30 days')
        GROUP BY d ORDER BY d
    """).fetchall()

    conn.close()
    return jsonify({
        'total_cars': total_cars,
        'total_users': total_users,
        'total_inquiries': total_inquiries,
        'total_favorites': total_favorites,
        'avg_price': round(avg_price),
        'top_requested_brands': [dict(r) for r in top_requested],
        'top_favorite_brands': [dict(r) for r in top_favorites],
        'inquiries_by_day': [dict(r) for r in inquiries_by_day],
    })


# ─── API: admin — архив (заявки и переписка) ─────────────────────────────────

@app.route('/api/admin/archive')
@admin_required_api
def admin_archive():
    q = request.args.get('q', '').strip()
    conn = get_db()
    if q:
        like = f"%{q}%"
        inquiries = conn.execute("""
            SELECT i.*, b.name AS brand_name, m.name AS model_name
            FROM inquiries i
            LEFT JOIN cars c ON i.car_id = c.id
            LEFT JOIN brands b ON c.brand_id = b.id
            LEFT JOIN models m ON c.model_id = m.id
            WHERE i.name LIKE ? OR i.phone LIKE ? OR i.message LIKE ?
            ORDER BY i.created_at DESC LIMIT 100
        """, (like, like, like)).fetchall()
        messages = conn.execute("""
            SELECT msg.*, u.email, u.name AS user_name
            FROM messages msg
            JOIN users u ON msg.user_id = u.id
            WHERE msg.message LIKE ? OR u.email LIKE ? OR u.name LIKE ?
            ORDER BY msg.created_at DESC LIMIT 100
        """, (like, like, like)).fetchall()
    else:
        inquiries = conn.execute("""
            SELECT i.*, b.name AS brand_name, m.name AS model_name
            FROM inquiries i
            LEFT JOIN cars c ON i.car_id = c.id
            LEFT JOIN brands b ON c.brand_id = b.id
            LEFT JOIN models m ON c.model_id = m.id
            ORDER BY i.created_at DESC LIMIT 100
        """).fetchall()
        messages = conn.execute("""
            SELECT msg.*, u.email, u.name AS user_name
            FROM messages msg
            JOIN users u ON msg.user_id = u.id
            ORDER BY msg.created_at DESC LIMIT 100
        """).fetchall()
    conn.close()
    return jsonify({
        'inquiries': [dict(r) for r in inquiries],
        'messages': [dict(r) for r in messages],
    })


# ─── API: admin — чат с клиентами ────────────────────────────────────────────

@app.route('/api/admin/chat/users')
@admin_required_api
def admin_chat_users():
    conn = get_db()
    rows = conn.execute("""
        SELECT u.id, u.email, u.name,
               (SELECT COUNT(*) FROM messages mm WHERE mm.user_id=u.id AND mm.is_from_user=1 AND mm.is_read=0) AS unread,
               (SELECT MAX(created_at) FROM messages mm WHERE mm.user_id=u.id) AS last_msg
        FROM users u
        WHERE u.is_admin=0 AND EXISTS(SELECT 1 FROM messages mm WHERE mm.user_id=u.id)
        ORDER BY last_msg DESC
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/admin/chat/<int:uid>', methods=['GET', 'POST'])
@admin_required_api
def admin_chat_conversation(uid):
    conn = get_db()
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        text = (data.get('message') or '').strip()
        if not text:
            conn.close()
            return jsonify({'error': 'message required'}), 400
        admin_user = current_user()
        conn.execute(
            "INSERT INTO messages(user_id,message,is_from_user,is_read,admin_id) VALUES(?,?,0,1,?)",
            (uid, text, admin_user['id'])
        )
        conn.commit()
    conn.execute("UPDATE messages SET is_read=1 WHERE user_id=? AND is_from_user=1", (uid,))
    conn.commit()
    rows = conn.execute(MESSAGES_SELECT, (uid,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


# ─── Run ───────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    init_db()
    migrate_db()
    print("✓ Сервер запущен: http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=False)
