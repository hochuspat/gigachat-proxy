/***********************
 * server.js (CommonJS)
 ***********************/

// Отключаем проверку SSL-сертификата (как verify=False в Python).
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // Оставляем временно

const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Настройка CORS для разрешения запросов с вашего клиентского домена
app.use(cors({
  origin: 'https://stage-app53169536-9503cfdaf67b.pages.vk-apps.com',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
}));

app.use(express.json());

// Логирование всех входящих запросов
app.use((req, res, next) => {
  console.log(`Получен запрос: ${req.method} ${req.url} от ${req.headers.origin}`);
  console.log('Заголовки:', req.headers);
  console.log('Тело запроса:', req.body);
  next();
});

// Добавим healthcheck для Railway
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

const GIGACHAT_AUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
const GIGACHAT_API_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions";
const AUTHORIZATION_KEY = "MWJmMWU3ZDQtYTQ0NS00NGFjLTg1OGEtNGFjYmIyNjcxN2Y5OmJhYjhlYTVhLWYwMmUtNGEyOC04NjUzLTQ3MTA3OTE3YmFmMA==";

// Функция для получения токена доступа от GigaChat API
async function getAccessToken() {
  try {
    console.log("Запрос токена доступа от GigaChat API...");
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'RqUID': uuidv4(),
      'Authorization': `Basic ${AUTHORIZATION_KEY}`,
    };
    const params = new URLSearchParams();
    params.append('scope', 'GIGACHAT_API_PERS');

    const response = await fetch(GIGACHAT_AUTH_URL, {
      method: 'POST',
      headers,
      body: params.toString(),
    });

    const responseText = await response.text();
    console.log('Ответ на запрос токена:', response.status, responseText);

    if (response.status === 200) {
      const data = JSON.parse(responseText);
      const token = data.access_token;
      if (token) {
        console.log("Токен успешно получен.");
        return token;
      } else {
        console.error("Токен не найден в ответе.");
        return null;
      }
    } else {
      console.error(`Ошибка при получении токена: ${response.status}`);
      return null;
    }
  } catch (err) {
    console.error("Ошибка запроса к GigaChat API:", err);
    return null;
  }
}

// Эндпоинт /process-text
app.post('/process-text', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      console.error('Отсутствует обязательное поле:', { text });
      return res.status(400).json({ error: "Нужно передать text" });
    }

    // Получаем токен на сервере
    const token = await getAccessToken();
    if (!token) {
      console.error('Не удалось получить токен GigaChat.');
      return res.status(500).json({ error: "Не удалось получить токен GigaChat" });
    }

    // Формируем промпт на сервере
    const prompt = `
Верни JSON (строго без лишних пояснений, только JSON-объект, никаких дополнительных слов) в формате:
{
  "title": "",
  "description": "",
  "deadline": "",
  "time": "",
  "priority": "",
  "category": ""
}
Если дедлайн указан как "завтра", установи его на завтрашнюю дату в формате dd.MM.yyyy (например, "02.03.2025").
Если дедлайн указан как "сегодня", установи его на сегодняшнюю дату в формате dd.MM.yyyy (например, "01.03.2025").
Если указана дата, форматируй её в формате dd.MM.yyyy (например, "28.02.2024").
Если указано время, форматируй его в формате HH:mm (например, "12:00").
Если приоритет не указан, установи "medium".
Если категория не указана, установи пустую строку.
Если поле не указано или не может быть определено, оставь его пустым ("").
Текст пользователя: "${text}"
    `.trim();

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const body = {
      model: "GigaChat",
      messages: [
        {
          role: "system",
          content: prompt,
        },
        {
          role: "user",
          content: text,
        },
      ],
      temperature: 0.0,
      max_tokens: 200,
    };

    console.log('Отправка запроса к GigaChat API (/call):', body);
    const response = await fetch(GIGACHAT_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    console.log('Ответ от GigaChat API (/call):', response.status, responseText);

    if (!response.ok) {
      return res.status(response.status).json({ error: responseText });
    }

    const data = JSON.parse(responseText);
    const message = data?.choices?.[0]?.message?.content || '';
    try {
      const result = JSON.parse(message);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: 'Ответ GigaChat не в формате JSON: ' + message });
    }
  } catch (err) {
    console.error('Ошибка /process-text:', err);
    return res.status(500).json({ error: String(err) });
  }
});

const PORT = process.env.PORT;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`GigaChat proxy server started on port ${PORT}`);
});
