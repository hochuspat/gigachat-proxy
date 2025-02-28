// server.js
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';


 GIGACHAT_AUTH_URL=https://ngw.devices.sberbank.ru:9443/api/v2/oauth
 GIGACHAT_API_URL=https://gigachat.devices.sberbank.ru/api/v1/chat/completions
 GIGACHAT_AUTH_KEY=MWJmMWU3ZDQtYTQ0NS00NGFjLTg1OGEtNGFjYmIyNjcxN2Y5OmJhYjhlYTVhLWYwMmUtNGEyOC04NjUzLTQ3MTA3OTE3YmFmMA==


// Если Railway не поддерживает ES-модули, перейдите на CommonJS:
// const express = require('express');
// const fetch = require('node-fetch');
// const cors = require('cors');

const {
  GIGACHAT_AUTH_URL,
  GIGACHAT_API_URL,
  GIGACHAT_AUTH_KEY,
  PORT = 3000
} = process.env;

if (!GIGACHAT_AUTH_URL || !GIGACHAT_API_URL || !GIGACHAT_AUTH_KEY) {
  console.error('Отсутствуют необходимые переменные окружения!');
  console.error('Установите GIGACHAT_AUTH_URL, GIGACHAT_API_URL, GIGACHAT_AUTH_KEY');
  process.exit(1);
}

const app = express();
app.use(cors());       // Разрешаем CORS для всех (на демо)
app.use(express.json());

// ============ Эндпоинт для получения токена ============
app.post('/auth', async (req, res) => {
  try {
    // Заголовки
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      RqUID: crypto.randomUUID?.() || String(Date.now()),
      Authorization: `Basic ${GIGACHAT_AUTH_KEY}`, 
    };

    const params = new URLSearchParams();
    params.append('scope', 'GIGACHAT_API_PERS');

    const response = await fetch(GIGACHAT_AUTH_URL, {
      method: 'POST',
      headers,
      body: params.toString(),
      // Можете добавить { agent: httpsAgent } или { rejectUnauthorized: false }
      // если нужно отключить проверку сертификата (НЕ рекомендуется для продакшена).
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Ошибка при получении токена:', response.status, text);
      return res.status(response.status).json({ error: text });
    }

    const data = await response.json();
    const token = data?.access_token;

    if (!token) {
      console.error('Токен не найден в ответе:', data);
      return res.status(500).json({ error: 'Нет поля access_token.' });
    }

    // Возвращаем токен клиенту
    return res.json({ access_token: token });
  } catch (err) {
    console.error('Ошибка /auth:', err);
    return res.status(500).json({ error: String(err) });
  }
});

// ============ Эндпоинт для вызова GigaChat ============
app.post('/call', async (req, res) => {
  try {
    // Текст запроса и сам токен передаются из фронтенда
    const { token, prompt } = req.body;
    if (!token || !prompt) {
      return res.status(400).json({ error: 'Необходимо передать token и prompt.' });
    }

    // Формируем тело запроса к GigaChat
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
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Ошибка вызова GigaChat:', response.status, text);
      return res.status(response.status).json({ error: text });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error('Ошибка /call:', err);
    return res.status(500).json({ error: String(err) });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
