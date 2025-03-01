/***********************
 * server.js (CommonJS)
 ***********************/

// Отключаем проверку SSL-сертификата (как verify=False в Python).
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // Оставляем временно, но лучше заменить на https.Agent

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

    console.log('Отправка запроса к GigaChat API для получения токена:', { headers, params: params.toString() });
    const response = await fetch(GIGACHAT_AUTH_URL, {
      method: 'POST',
      headers,
      body: params.toString(),
    });

    const responseText = await response.text();
    console.log('Ответ от GigaChat API (/auth):', response.status, responseText);

    if (!response.ok) {
      return res.status(response.status).json({ error: responseText });
    }

    const data = JSON.parse(responseText);
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
      console.error('Отсутствуют обязательные поля:', { token, text });
      return res.status(400).json({ error: "Нужно передать token и text" });
    }

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
          content: text, // Используем текст клиента напрямую, так как клиент уже сформировал промпт
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
    return res.json(data);
  } catch (err) {
    console.error('Ошибка /call:', err);
    return res.status(500).json({ error: String(err) });
  }
});

const PORT = process.env.PORT;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`GigaChat proxy server started on port ${PORT}`);
});
