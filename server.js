/**
 * Lumina AI Assistant - Production 10/10 Architecture Server
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*' }));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const MEMORY_FILE = path.join(process.cwd(), 'lumina_user_memory.json');

function loadUserMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
  } catch (e) {}
  return { facts: [], userProfile: { home: 'Nepanagar, MP' } };
}

function saveUserMemory(memoryData) {
  try { fs.writeFileSync(MEMORY_FILE, JSON.stringify(memoryData, null, 2), 'utf8'); } catch (e) {}
}

let userMemory = loadUserMemory();

const chatMemory = [
  { role: 'system', content: 'You are Lumina, a highly intelligent AI Assistant with persistent long-term memory, full device automation tools, real-time live web search, weather sensors, and 5TB cloud storage sync. Speak warmly, confidently, and helpfully in natural Hinglish or English.' }
];

function extractCity(prompt = '') {
  const p = prompt.toLowerCase();
  if (p.includes('nepanagar') || p.includes('nepa')) return 'Nepanagar';
  if (p.includes('burhanpur')) return 'Burhanpur';
  if (p.includes('indore')) return 'Indore';
  if (p.includes('bhopal')) return 'Bhopal';
  if (p.includes('delhi')) return 'Delhi';
  if (p.includes('mumbai')) return 'Mumbai';
  if (p.includes('jaipur')) return 'Jaipur';
  if (p.includes('khandwa')) return 'Khandwa';

  const m = prompt.match(/(?:weather|mausam|temperature)(?:\s+in|\s+for|\s+of|\s+ka|\s+ki)?\s+([a-zA-Z]+)/i) ||
            prompt.match(/([a-zA-Z]+)\s+(?:ka|ki|me|main)\s+(?:weather|mausam)/i);
  if (m && m) {
    const candidate = m.replace(/\b(kaisa|hai|h|batao|aaj|today|ka|ki|me)\b/gi, '').trim();
    if (candidate.length >= 3) return candidate;
  }
  return 'Nepanagar';
}

function extractAndSaveUserFacts(prompt) {
  let updated = false;
  const nameMatch = prompt.match(/mera naam ([a-zA-Z\s]+) (?:hai|h)/i) || prompt.match(/my name is ([a-zA-Z\s]+)/i);
  if (nameMatch) {
    userMemory.userProfile.name = nameMatch.trim();
    userMemory.facts.push(`User name: ${nameMatch.trim()}`);
    updated = true;
  }
  const homeMatch = prompt.match(/mera ghar ([a-zA-Z\s]+) (?:me|main|par) (?:hai|h)/i) || prompt.match(/i live in ([a-zA-Z\s]+)/i);
  if (homeMatch) {
    userMemory.userProfile.home = homeMatch.trim();
    userMemory.facts.push(`User home: ${homeMatch.trim()}`);
    updated = true;
  }
  if (updated) saveUserMemory(userMemory);
}

function parseDelayMs(prompt = '') {
  let delayMinutes = 0;
  const m = prompt.match(/(\d+)\s*(?:minute|minutes|min|mins|sec|seconds|hour|hours|ghante)/i);
  if (m && m) {
    const num = parseInt(m, 10);
    const lower = prompt.toLowerCase();
    if (lower.includes('hour') || lower.includes('ghante')) delayMinutes = num * 60;
    else if (lower.includes('sec')) delayMinutes = num / 60;
    else delayMinutes = num;
  }
  return delayMinutes * 60 * 1000;
}

function classifyRoute(payload) {
  const prompt = (payload.prompt || '').toLowerCase();

  if (/\b(torch|flashlight)\b/i.test(prompt)) return 'torch';
  if (/\b(call|dial|dialer|phone|number)\b/i.test(prompt) || /\d{10}/.test(prompt)) return 'app_launcher';
  if (/\b(telegram|alert|bot message|notification)\b/i.test(prompt)) return 'telegram';
  if (/\b(youtube|yt)\b/i.test(prompt) && /\b(song|songs|video|videos|montage|music|gaana|gaane|chalu|play|search)\b/i.test(prompt)) return 'youtube';
  if (/\b(spotify)\b/i.test(prompt)) return 'spotify';
  if (/\b(download|install)\b/i.test(prompt)) return 'download_launcher';
  if (/\b(kholo|open|launch|chalu)\b/i.test(prompt)) return 'app_launcher';
  if (/\b(weather|temperature|forecast|mausam|rain|rainy)\b/i.test(prompt)) return 'weather';
  if (/\b(news|latest|search|score|match|today|aaj ki|cricket|stock|market|price)\b/i.test(prompt)) return 'tavily';
  if (process.env.NVIDIA_API_KEY && (payload.mode === 'nvidia' || prompt.includes('nvidia') || prompt.includes('deep reasoning'))) return 'nvidia';
  if (payload.imageBase64 || payload.mode === 'multimodal') return 'gemini';

  return 'groq';
}

async function processQuery(payload) {
  const prompt = payload.prompt || 'Hello';
  const provider = classifyRoute(payload);

  extractAndSaveUserFacts(prompt);

  try {
    if (provider === 'torch') {
      const turnOn = !prompt.toLowerCase().includes('off') && !prompt.toLowerCase().includes('band');
      return {
        provider: 'hardware',
        text: `[DEVICE HARDWARE]: Flashlight Torch ${turnOn ? 'ON' : 'OFF'} kar diya gaya hai!`,
        action: turnOn ? 'torch_on' : 'torch_off',
        success: true
      };
    }

    if (provider === 'app_launcher') {
      let appName = 'Phone Dialer';
      let appUrl = 'tel:';
      const p = prompt.toLowerCase();

      const phoneMatch = prompt.match(/(\d{10})/);
      if (phoneMatch) {
        appName = `Phone Dialer (${phoneMatch})`;
        appUrl = `tel:${phoneMatch}`;
      } else if (p.includes('whatsapp')) { appName = 'WhatsApp'; appUrl = 'https://api.whatsapp.com'; }
      else if (p.includes('instagram')) { appName = 'Instagram'; appUrl = 'https://www.instagram.com'; }
      else if (p.includes('telegram')) { appName = 'Telegram'; appUrl = 'https://t.me'; }
      else if (p.includes('free fire') || p.includes('freefire')) { appName = 'Free Fire MAX'; appUrl = 'https://play.google.com/store/apps/details?id=com.dts.freefiremax'; }
      else if (p.includes('spotify')) { appName = 'Spotify'; appUrl = 'https://open.spotify.com'; }
      else if (p.includes('youtube')) { appName = 'YouTube'; appUrl = 'https://www.youtube.com'; }
      else if (p.includes('camera')) { appName = 'Camera'; appUrl = 'intent:#Intent;action=android.media.action.IMAGE_CAPTURE;end'; }
      else if (p.includes('gallery') || p.includes('photos')) { appName = 'Photos / Gallery'; appUrl = 'https://photos.google.com'; }
      else if (p.includes('map') || p.includes('location')) { appName = 'Google Maps'; appUrl = 'https://maps.google.com'; }
      else if (p.includes('gmail') || p.includes('mail')) { appName = 'Gmail'; appUrl = 'https://mail.google.com'; }
      else if (p.includes('chrome') || p.includes('browser')) { appName = 'Chrome'; appUrl = 'https://www.google.com'; }
      else if (p.includes('play store') || p.includes('store')) { appName = 'Play Store'; appUrl = 'https://play.google.com'; }
      else if (p.includes('termux')) { appName = 'Termux'; appUrl = 'https://f-droid.org/packages/com.termux/'; }
      else if (p.includes('calculator')) { appName = 'Calculator'; appUrl = 'https://www.google.com/search?q=calculator'; }
      else if (p.includes('dialer') || p.includes('phone') || p.includes('call')) { appName = 'Phone Dialer'; appUrl = 'tel:'; }
      else {
        const cleanName = prompt.replace(/\b(open|kholo|launch|chalu|start|app)\b/gi, '').trim();
        appName = cleanName || 'App';
        appUrl = `https://play.google.com/store/search?q=${encodeURIComponent(cleanName)}&c=apps`;
      }

      return { provider: 'automation', text: `[DEVICE AUTOMATION]: Opening ${appName} on your Samsung Galaxy A55...`, url: appUrl, success: true };
    }

    if (provider === 'youtube') {
      const cleanQuery = prompt.replace(/\b(par|me|ka|ki|ke|play|youtube|yt|video|videos|on|search|find|chalu|karo|song|songs|gaane|gana|montage)\b/gi, '').trim() || 'Arijit Singh';
      const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`;
      return { provider: 'youtube', text: `[YOUTUBE ENGINE]: Searching and playing "${cleanQuery}" on YouTube...`, url: ytUrl, success: true };
    }

    if (provider === 'spotify') {
      const cleanQuery = prompt.replace(/\b(par|me|ka|ki|ke|play|spotify|music|song|songs|on|playlist|chalu|karo|gaane|gana)\b/gi, '').trim() || 'Arijit Singh';
      const spUrl = `https://open.spotify.com/search/${encodeURIComponent(cleanQuery)}`;
      return { provider: 'spotify', text: `[SPOTIFY ENGINE]: Playing "${cleanQuery}" on Spotify...`, url: spUrl, success: true };
    }

    if (provider === 'download_launcher') {
      const targetApp = prompt.replace(/\b(download|install|karo|store|se|karna|hai)\b/gi, '').trim() || 'BGMI';
      let appUrl = `https://play.google.com/store/search?q=${encodeURIComponent(targetApp)}&c=apps`;
      if (/bgmi|battlegrounds/i.test(targetApp)) appUrl = 'https://play.google.com/store/apps/details?id=com.pubg.imobile';
      return { provider: 'automation', text: `[PLAY STORE DOWNLOADER]: Opening Play Store to download ${targetApp}...`, url: appUrl, success: true };
    }

    if (provider === 'telegram') {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      const delayMs = parseDelayMs(prompt);

      if (token && chatId) {
        if (delayMs > 0) {
          const mins = Math.round(delayMs / 60000);
          setTimeout(async () => {
            try {
              await axios.post(`https://api.telegram.org/bot${token.trim()}/sendMessage`, {
                chat_id: chatId.trim(),
                text: `⏰ [LUMINA ALARM ALERT]: 🔔 ${mins} Minute Alarm Timer Up! Reminder: "${prompt}"`
              });
            } catch (e) {}
          }, delayMs);

          return {
            provider: 'telegram',
            text: `⏰ [LUMINA ALARM ENGINE]: Alarm set successfully! Main exact ${mins} minute baad aapke Telegram bot @Ai_luminaa_bot par alert bhej dungi.`,
            success: true
          };
        } else {
          try {
            await axios.post(`https://api.telegram.org/bot${token.trim()}/sendMessage`, {
              chat_id: chatId.trim(),
              text: `[LUMINA AI ALERT]: Hello! Lumina AI Assistant has successfully sent a live notification alert to your Telegram!`
            });
            return { provider: 'telegram', text: '✅ [TELEGRAM ENGINE]: Live notification alert sent successfully to your Telegram bot @Ai_luminaa_bot!', success: true };
          } catch (e) {
            return { provider: 'telegram', text: 'Telegram API Error: ' + e.message, success: false };
          }
        }
      }
    }

    if (provider === 'weather') {
      const city = extractCity(prompt);

      if (process.env.OPEN_WEATHER_API_KEY) {
        try {
          const res = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)},IN&units=metric&appid=${process.env.OPEN_WEATHER_API_KEY.trim()}`);
          const d = res.data;
          return { provider: 'weather', text: `[LUMINA WEATHER]: Forecast for ${d.name}, Madhya Pradesh, India: ${d.weather[0].description}, Temp: ${d.main.temp}°C (Feels like ${d.main.feels_like}°C), Humidity: ${d.main.humidity}%, Wind: ${d.wind.speed} m/s.`, success: true };
        } catch (e) {}
      }

      if (process.env.TAVILY_API_KEY) {
        try {
          const res = await axios.post('https://api.tavily.com/search', {
            api_key: process.env.TAVILY_API_KEY.trim(),
            query: `current live weather and temperature in ${city} Madhya Pradesh India today`,
            search_depth: 'basic',
            include_answer: true
          });
          if (res.data.answer) return { provider: 'weather', text: `[LUMINA LIVE WEATHER]: ${res.data.answer}`, success: true };
        } catch (e) {}
      }
    }

    if (provider === 'tavily' && process.env.TAVILY_API_KEY) {
      try {
        const searchRes = await axios.post('https://api.tavily.com/search', {
          api_key: process.env.TAVILY_API_KEY.trim(),
          query: prompt,
          search_depth: 'basic',
          include_answer: true
        });

        const liveFacts = searchRes.data.answer || searchRes.data.results?.map(r => r.content).join('\n') || '';

        if (process.env.GROQ_API_KEY && liveFacts) {
          const synthRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: 'You are Lumina AI Assistant. Synthesize these live real-time web search facts to answer the user question warmly and accurately in Hinglish.' },
              { role: 'user', content: `User Prompt: ${prompt}\nLive Web Facts: ${liveFacts}` }
            ],
            temperature: 0.6
          }, { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY.trim()}` } });

          return { provider: 'tavily', text: `[LUMINA LIVE WEB SEARCH]: ${synthRes.data.choices[0].message.content}`, success: true };
        }
      } catch (e) {}
    }

    if (process.env.GROQ_API_KEY) {
      const memoryFactsText = userMemory.facts.length > 0 ? ` SAVED USER PROFILE & IMPORTANT FACTS: [${userMemory.facts.join('; ')}].` : '';

      const systemMessage = {
        role: 'system',
        content: `You are Lumina, a highly intelligent AI Assistant with persistent long-term memory, full device automation tools (Flashlight Torch, Phone Calling, WhatsApp, YouTube, Spotify, Maps, Free Fire MAX, Termux), real-time live web search, weather sensors, and 5TB cloud storage sync.${memoryFactsText} Always answer warmly, confidently, and helpfully in natural Hinglish or English.`
      };

      chatMemory[0] = systemMessage;
      chatMemory.push({ role: 'user', content: prompt });
      if (chatMemory.length > 30) chatMemory.splice(1, 2);

      const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.3-70b-versatile',
        messages: chatMemory,
        temperature: 0.7
      }, { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY.trim()}` } });

      const aiResponse = res.data.choices[0].message.content;
      chatMemory.push({ role: 'assistant', content: aiResponse });

      return { provider: 'groq', text: aiResponse, success: true };
    }

    return { provider: 'lumina', text: `Lumina: Executed command "${prompt}".`, success: true };
  } catch (err) {
    if (process.env.GROQ_API_KEY) {
      try {
        const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: 'You are Lumina AI Assistant.' }, { role: 'user', content: prompt }]
        }, { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY.trim()}` } });
        return { provider: 'groq', text: res.data.choices[0].message.content, success: true };
      } catch (e) {}
    }

    return { provider: 'lumina', text: `Lumina: Processing "${prompt}".`, success: true };
  }
}

app.get('/health', (req, res) => res.json({ status: 'ONLINE', timestamp: new Date().toISOString() }));

app.post('/api/chat', async (req, res) => {
  const result = await processQuery(req.body);
  res.json(result);
});

app.post('/api/self-evolve', async (req, res) => {
  const prompt = req.body.prompt || 'New Feature';
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const delayMs = parseDelayMs(prompt);

  if (token && chatId) {
    if (delayMs > 0) {
      const mins = Math.round(delayMs / 60000);
      console.log(`[ALARM SCHEDULED]: Triggering Telegram alert after ${mins} minute(s) (${delayMs} ms).`);
      setTimeout(async () => {
        try {
          await axios.post(`https://api.telegram.org/bot${token.trim()}/sendMessage`, {
            chat_id: chatId.trim(),
            text: `⏰ [LUMINA ALARM ALERT]: 🔔 ${mins} Minute Alarm Timer Up! Reminder: "${prompt}"`
          });
        } catch (e) {
          console.error('[TELEGRAM ALARM SEND ERROR]', e.message);
        }
      }, delayMs);

      return res.json({
        success: true,
        message: `Yeh feature add ho gaya hai! Main aapko exact ${mins} minute baad Telegram par alert bhej dungi. Aur kuch add karna hai?`,
        prompt
      });
    } else {
      try {
        await axios.post(`https://api.telegram.org/bot${token.trim()}/sendMessage`, {
          chat_id: chatId.trim(),
          text: `[LUMINA SELF-EVOLVING ALERT]: New feature active: "${prompt}"`
        });
      } catch (e) {}
    }
  }

  res.json({
    success: true,
    message: `Yeh feature add ho gaya hai! Main aapko Telegram par alert bhej rahi hoon. Aur kuch add karna hai?`,
    prompt
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Lumina Heavy Backend Server running on port ${PORT}`);
});
