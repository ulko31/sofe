# SOFE — Telegram Mini App

## Структура проекта

```
sofe/
├── frontend/          # React приложение (Netlify)
├── backend/           # Express API + бот (Railway/Render)
└── README.md
```

---

## Шаг 1 — Создай бота в Telegram

1. Открой [@BotFather](https://t.me/BotFather)
2. `/newbot` → дай имя → получи **токен**
3. `/setmenubutton` → выбери бота → нажми "Настроить кнопку меню"
4. Введи URL приложения (получишь после деплоя фронтенда)

---

## Шаг 2 — Деплой фронтенда на Netlify

### Установка
```bash
cd frontend
npm install
```

### Настройка
```bash
cp .env.example .env
# Открой .env и вставь URL твоего бэкенда:
# VITE_API_URL=https://your-backend.railway.app/api
```

### Деплой на Netlify
1. Зайди на [netlify.com](https://netlify.com) → "Add new site" → "Import from Git"
2. Подключи репозиторий GitHub (сначала загрузи код на GitHub)
3. Настройки сборки:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - **Base directory:** `frontend`
4. Environment variables → Add variable:
   - `VITE_API_URL` = URL твоего бэкенда (добавишь после шага 3)

### Или деплой через CLI:
```bash
npm install -g netlify-cli
netlify login
cd frontend
npm run build
netlify deploy --prod --dir=dist
```

**Скопируй URL сайта** (например `https://sofe-app.netlify.app`) — он нужен для бэкенда.

---

## Шаг 3 — Деплой бэкенда на Railway

### Почему Railway?
Бесплатный план, поддержка SQLite, простой деплой.

1. Зайди на [railway.app](https://railway.app)
2. "New Project" → "Deploy from GitHub repo"
3. Выбери папку `backend` (или корень репо)
4. Добавь переменные окружения (Settings → Variables):
   ```
   BOT_TOKEN=твой_токен_от_BotFather
   MINI_APP_URL=https://sofe-app.netlify.app
   PORT=4000
   NODE_ENV=production
   ```
5. В `package.json` start скрипт уже есть: `node index.js`

**Скопируй URL бэкенда** (например `https://sofe-api.railway.app`)

### Альтернатива — Render.com (тоже бесплатно):
1. New Web Service → Connect GitHub
2. Build Command: `npm install`
3. Start Command: `node index.js`
4. Те же env переменные

---

## Шаг 4 — Обнови переменные

1. В Netlify (frontend):
   - `VITE_API_URL` = `https://your-railway-url.railway.app/api`
   - Нажми "Redeploy"

2. Запусти бота:
```bash
cd backend
node bot.js
```
Или добавь скрипт в Railway/Render для запуска бота отдельно.

---

## Шаг 5 — Зарегистрируй Mini App в BotFather

1. Напиши [@BotFather](https://t.me/BotFather): `/newapp`
2. Выбери своего бота
3. Дай название: `SOFE`
4. Загрузи иконку (512x512 PNG)
5. URL приложения: `https://sofe-app.netlify.app`

---

## Локальная разработка

### Запуск фронтенда:
```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

### Запуск бэкенда:
```bash
cd backend
npm install
cp .env.example .env
# Заполни BOT_TOKEN в .env
node index.js      # API на порту 4000
node bot.js        # Бот (в другом терминале)
```

---

## API Endpoints

| Метод | URL | Описание |
|-------|-----|----------|
| GET | /api/user/me | Текущий пользователь |
| PUT | /api/user/profile | Обновить профиль |
| GET | /api/nutrition/today | Статистика дня |
| GET | /api/nutrition/meals | Список приёмов пищи |
| POST | /api/nutrition/meals | Добавить приём пищи |
| DELETE | /api/nutrition/meals/:id | Удалить |
| GET | /api/trackers | Трекеры за дату |
| POST | /api/trackers | Обновить трекер |
| GET | /api/workouts | Все тренировки |
| POST | /api/workouts/my | Записать тренировку |
| GET | /api/subscriptions | Абонементы |
| POST | /api/subscriptions | Добавить абонемент |
| GET | /api/recipes | Рецепты |
| GET | /api/progress | Прогресс |
| GET | /health | Проверка сервера |

---

## Что отправить мне для следующего шага?

Когда будешь готов — скажи, и я сделаю:
- 🌐 **Лендинг** для SOFE
- 📱 **Продвинутый бот** с уведомлениями и рассылками
- 📊 **Административную панель**
- 🤖 **Интеграцию с OpenAI** для ИИ-ассистента
