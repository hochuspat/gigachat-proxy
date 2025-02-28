/***********************
 * server.js (CommonJS)
 ***********************/

// Отключаем проверку SSL-сертификата (как verify=False в Python).
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Настройка CORS для разрешения запросов с вашего клиентского домена
app.use(cors({
  origin: 'https://stage-app53169536-248ef1e78cc8.pages.vk-apps.com',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Добавим healthcheck для Railway
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

const GIGACHAT_AUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
const GIGACHAT_API_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions";
const AUTHORIZATION_KEY = "MWJmMWU3ZDQtYTQ0NS00NGFjLTg1OGEtNGFjYmIyNjcxN2Y5OmJhYjhlYTVhLWYwMmUtNGEyOC04NjUzLTQ3MTA3OTE3YmFmMA==";

app.post('/auth', async (req, res) => {
  try {
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

    if (!response.ok) {
      const text = await response.text();
      console.error('Ошибка при получении токена:', response.status, text);
      return res.status(response.status).json({ error: text });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error('Ошибка /auth:', err);
    return res.status(500).json({ error: String(err) });
  }
});

app.post('/call', async (req, res) => {
  try {
    const { token, text } = req.body;
    if (!token || !text) {
      return res.status(400).json({ error: "Нужно передать token и text" });
    }

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const prompt = `
      Ты помощник, который извлекает данные для создания задачи из текста. Верни JSON с полями: 
      - text (строка, текст задачи),
      - deadline (строка в формате ISO или "undefined"),
      - priority ("low", "medium", "high"),
      - category ("Работа", "Личное", "Учёба" или "undefined").
      Если дедлайн указан как "завтра", установи его на завтрашнюю дату в формате ISO. 
      Если приоритет не указан, установи "medium". 
      Если категория не указана, установи "undefined".
      Текст: "${text}"
    `;

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

    const response = await fetch(GIGACHAT_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const textErr = await response.text();
      console.error('Ошибка при вызове GigaChat:', response.status, textErr);
      return res.status(response.status).json({ error: textErr });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error('Ошибка /call:', err);
    return res.status(500).json({ error: String(err) });
  }
});

// Слушаем на порту, который указывает Railway
const PORT = process.env.PORT; // Убираем дефолтное значение 3000
app.listen(PORT, '0.0.0.0', () => {
  console.log(`GigaChat proxy server started on port ${PORT}`);
});
