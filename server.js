/***********************
 * server.js (CommonJS)
 ***********************/

// 1) Отключаем проверку SSL-сертификата (как verify=False в Python).
//    НЕБЕЗОПАСНО для продакшена, но помогает обойти SELF_SIGNED_CERT_IN_CHAIN.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// 2) Подключаем модули
const express = require('express');
const fetch = require('node-fetch'); // убедитесь, что установлена версия 2.x: npm install node-fetch@2.6.9
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// 3) Настройки GigaChat (как в Python)
const GIGACHAT_AUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
const GIGACHAT_API_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions";
// Скопируйте ровно ту Base64-строку, которая у вас в Python-коде.
// Пример: "MWJmMWU3Z...." (убедитесь, что строка совпадает символ в символ).
const AUTHORIZATION_KEY = "MWJmMWU3ZDQtYTQ0NS00NGFjLTg1OGEtNGFjYmIyNjcxN2Y5OmJhYjhlYTVhLWYwMmUtNGEyOC04NjUzLTQ3MTA3OTE3YmFmMA==";

const app = express();

// Разрешаем CORS для всех (как в Python-скрипте).
app.use(cors());
// Принимаем JSON в теле запросов (для /call).
app.use(express.json());

/**
 * /auth — аналог функции get_access_token() в Python
 *  - Отправляем scope=GIGACHAT_API_PERS (x-www-form-urlencoded)
 *  - verify=False (тут решаем через process.env.NODE_TLS_REJECT_UNAUTHORIZED="0")
 *  - Заголовки: Authorization: Basic ...
 *  - Возвращаем JSON (как Python возвращал token).
 */
app.post('/auth', async (req, res) => {
  try {
    // Собираем заголовки, как в Python:
    // requests.post(..., headers={
    //   'Content-Type': 'application/x-www-form-urlencoded',
    //   'Accept': 'application/json',
    //   'RqUID': str(uuid.uuid4()),
    //   'Authorization': f'Basic {AUTHORIZATION_KEY}'
    // }, data={'scope': 'GIGACHAT_API_PERS'}, verify=False)
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'RqUID': uuidv4(), // генерируем UUID
      'Authorization': `Basic ${AUTHORIZATION_KEY}`,
    };

    // Тело запроса (x-www-form-urlencoded)
    // В Python: payload = {'scope': 'GIGACHAT_API_PERS'}
    const params = new URLSearchParams();
    params.append('scope', 'GIGACHAT_API_PERS');

    // Отправляем запрос
    const response = await fetch(GIGACHAT_AUTH_URL, {
      method: 'POST',
      headers,
      body: params.toString() // x-www-form-urlencoded
      // SSL отключен глобально (process.env.NODE_TLS_REJECT_UNAUTHORIZED="0")
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Ошибка при получении токена:', response.status, text);
      return res.status(response.status).json({ error: text });
    }

    // Парсим JSON-ответ
    const data = await response.json();
    // Python возвращал token = response.json().get("access_token")
    // Мы вернём все поля как есть
    return res.json(data);
  } catch (err) {
    console.error('Ошибка /auth:', err);
    return res.status(500).json({ error: String(err) });
  }
});

/**
 * /call — аналог функции classify_personality() в Python
 *  - Ждём на вход JSON: { token, text }
 *  - Составляем payload (model, messages, temperature, max_tokens)
 *  - Заголовки: "Authorization": "Bearer <token>", "Content-Type": "application/json"
 *  - verify=False (отключаем SSL)
 *  - Возвращаем ответ от GigaChat
 */
app.post('/call', async (req, res) => {
  try {
    // Клиент должен прислать { token, text } (или prompt)
    const { token, text } = req.body;
    if (!token || !text) {
      return res.status(400).json({ error: "Нужно передать token и text" });
    }

    // Как в Python (classify_personality):
    // headers = {
    //   "Authorization": f"Bearer {token}",
    //   "Content-Type": "application/json",
    //   "Accept": "application/json",
    // }
    // payload = {
    //   "model": "GigaChat",
    //   "messages": [{"role": "user", "content": prompt}],
    //   "temperature": 0.0,
    //   "max_tokens": 100,
    // }
    // verify=False
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const body = {
      model: "GigaChat",
      messages: [
        {
          role: "user",
          content: text
        }
      ],
      temperature: 0.0,
      max_tokens: 100
    };

    const response = await fetch(GIGACHAT_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
      // SSL отключен глобально
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

// Запускаем сервер
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`GigaChat proxy server started on port ${PORT}`);
});
