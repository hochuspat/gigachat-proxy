/***********************
 * server.js (CommonJS)
 ***********************/

const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

/**
 * Здесь «зашиваем» переменные напрямую в коде:
 */
const GIGACHAT_AUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
const GIGACHAT_API_URL = 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions';
const GIGACHAT_AUTH_KEY = 'Base64_ВашКлюч'; // <-- Укажите ваш реальный Base64-ключ
const PORT = 3000; // Можно изменить при необходимости

// Создаём Express-приложение
const app = express();

// Разрешаем CORS (для тестов). В продакшене лучше ограничить origin
app.use(cors());

// Парсинг JSON-тел (POST/PUT и т.д.)
app.use(express.json());

// ============================
//   /auth
//   Получение access_token от GigaChat
// ============================
app.post('/auth', async (req, res) => {
  try {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'RqUID': String(Date.now()), // Можно более уникально
      'Authorization': `Basic ${GIGACHAT_AUTH_KEY}`,
    };

    // Тело запроса в формате x-www-form-urlencoded
    const params = new URLSearchParams();
    params.append('scope', 'GIGACHAT_API_PERS');

    // Запрашиваем токен у GigaChat (OAuth)
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

    // Парсим JSON-ответ
    const data = await response.json();
    const token = data?.access_token;

    if (!token) {
      console.error('Токен не найден в ответе:', data);
      return res.status(500).json({ error: 'Нет поля access_token в ответе.' });
    }

    // Отдаём токен клиенту
    return res.json({ access_token: token });
  } catch (err) {
    console.error('Ошибка /auth:', err);
    return res.status(500).json({ error: String(err) });
  }
});

// ============================
//   /call
//   Вызов GigaChat с уже имеющимся token и prompt
// ============================
app.post('/call', async (req, res) => {
  try {
    // Ожидаем в теле { token, prompt }
    const { token, prompt } = req.body;
    if (!token || !prompt) {
      return res.status(400).json({
        error: 'Нужно передать token и prompt в теле запроса',
      });
    }

    // Формируем запрос к GigaChat
    const body = {
      model: 'GigaChat',
      messages: [
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 700,
    };

    const response = await fetch(GIGACHAT_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Ошибка при вызове GigaChat:', response.status, text);
      return res.status(response.status).json({ error: text });
    }

    // Отдаём ответ GigaChat «как есть»
    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error('Ошибка /call:', err);
    return res.status(500).json({ error: String(err) });
  }
});

// Запуск сервера на порту PORT
app.listen(PORT, () => {
  console.log(`GigaChat proxy server started on port ${PORT}`);
});
