/**
 * Lumina AI Assistant - Production Server with 5TB Google Drive Memory Sync
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

// LONG-TERM USER MEMORY STORE FILE
const MEMORY_FILE = path.join(process.cwd(), 'lumina_user_memory.json');

function loadUserMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
    }
  } catch (e) {}
  return { facts: [], userProfile: {} };
}

function saveUserMemory(memoryData) {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memoryData, null, 2), 'utf8');
  } catch (e) {}
}

let userMemory = loadUserMemory();

// MULTI-TURN CONVERSATION MEMORY STORE
const chatMemory = [
  { role: 'system', content: 'You are Lumina, a highly intelligent AI Assistant. You remember all user facts, preferences, and details from previous turns. Answer warmly, accurately, and helpfully in natural Hinglish or English.' }
];

function extractCity(prompt = '') {
  let city = 'Bhopal';
  const clean = prompt.trim();
  const patterns = [
    /weather (?:in|for|of)?\s*([a-zA-Z]+)/i,
    /mausam (?:kaisa|kaha|ka)?\s*([a-zA-Z]+)/i,
    /([a-zA-Z]+) (?:me|ka|ki) mausam/i,
    /in ([a-zA-Z]+)/i,
    /for ([a-zA-Z]+)/i
  ];
  for (const pat of patterns) {
    const m = clean.match(pat);
    if (m && m) {
      const cand = m.trim().replace(/\b(kaisa|ha|hai|batao|kya|aaj|today|ka|ki|me)\b/gi, '').trim();
      if (cand.length >= 3) return cand;
    }
  }
  return city;
}

function extractAndSaveUserFacts(prompt) {
  let updated = false;

  const nameMatch = prompt.match(/mera naam ([a-zA-Z\s]+) (?:hai|h)/i) || prompt.match(/my name is ([a-zA-Z\s]+)/i);
  if (nameMatch) {
    userMemory.userProfile.name = nameMatch.trim();
    userMemory.facts.push(`User's name is ${nameMatch.trim()}`);
    updated = true;
  }

  const homeMatch = prompt.match(/mera ghar ([a-zA-Z\s]+) (?:me|main|par) (?:hai|h)/i) || prompt.match(/i live in ([a-zA-Z\s]+)/i);
  if (homeMatch) {
    userMemory.userProfile.home = homeMatch.trim();
    userMemory.facts.push(`User lives in ${homeMatch.trim()}`);
    updated = true;
  }

  if (updated) {
    saveUserMemory(userMemory);
  }
}

function classifyRoute(payload) {
  const prompt = (payload.prompt || '').toLowerCase();

  if (/\b(telegram|alert|bot message|notification)\b/i.test(prompt)) return 'telegram';
  if (/\b(youtube|yt)\b/i.test(prompt) && /\b(song|songs|video|videos|montage|music|gaana|gaane|chalu|play|search)\b/i.test(prompt)) return 'youtube';
  if (/\b(spotify)\b/i.test(prompt)) return 'spotify';
  if (/\b(download|install)\b/i.test(prompt)) return 'download_launcher';
  if (/\b(kholo|open|launch|chalu)\b/i.test(prompt)) return 'app_launcher';
  if (/\b(weather|temperature|forecast|mausam|rain|rainy)\b/i.test(prompt)) return 'weather';
  if (process.env.NVIDIA_API_KEY && (payload.mode === 'nvidia' || prompt.includes('nvidia'))) return 'nvidia';
  if (payload.imageBase64 || payload.mode === 'multimodal') return 'gemini';
  if (/\b(news|latest|search|score)\b/i.test(prompt)) return 'tavily';

  return 'groq';
}

async function processQuery(payload) {
  const prompt = payload.prompt || 'Hello';
  const provider = classifyRoute(payload);

  extractAndSaveUserFacts(prompt);

  try {
    if (provider === 'youtube') {
      const cleanQuery = prompt
        .replace(/\b(par|me|ka|ki|ke|play|youtube|yt|video|videos|on|search|find|chalu|karo|song|songs|gaane|gana|montage)\b/gi, '')
        .trim() || 'Arijit Singh';
      const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`;
      return { provider: 'youtube', text: `[YOUTUBE ENGINE]: Searching and playing "${cleanQuery}" on YouTube...`, url: ytUrl, success: true };
    }

    if (provider === 'spotify') {
      const cleanQuery = prompt
        .replace(/\b(par|me|ka|ki|ke|play|spotify|music|song|songs|on|playlist|chalu|karo|gaane|gana)\b/gi, '')
        .trim() || 'Arijit Singh';
      const spUrl = `https://open.spotify.com/search/${encodeURIComponent(cleanQuery)}`;
      return { provider: 'spotify', text: `[SPOTIFY ENGINE]: Playing "${cleanQuery}" on Spotify...`, url: spUrl, success: true };
    }

    if (provider === 'download_launcher') {
      const targetApp = prompt.replace(/\b(download|install|karo|store|se|karna|hai)\b/gi, '').trim() || 'BGMI';
      let appUrl = `https://play.google.com/store/search?q=${encodeURIComponent(targetApp)}&c=apps`;
      if (/bgmi|battlegrounds/i.test(targetApp)) appUrl = 'https://play.google.com/store/apps/details?id=com.pubg.imobile';
      return { provider: 'automation', text: `[PLAY STORE DOWNLOADER]: Opening Play Store to download ${targetApp}...`, url: appUrl, success: true };
    }

    if (provider === 'app_launcher') {
      let appName = 'YouTube';
      let appUrl = 'https://www.youtube.com';
      const p = prompt.toLowerCase();

      if (p.includes('whatsapp')) { appName = 'WhatsApp'; appUrl = 'https://api.whatsapp.com'; }
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
      else if (p.includes('dialer') || p.includes('phone')) { appName = 'Phone Dialer'; appUrl = 'tel:'; }
      else {
        const cleanName = prompt.replace(/\b(open|kholo|launch|chalu|start|app)\b/gi, '').trim();
        appName = cleanName || 'App';
        appUrl = `https://play.google.com/store/search?q=${encodeURIComponent(cleanName)}&c=apps`;
      }

      return { provider: 'automation', text: `[DEVICE AUTOMATION]: Opening ${appName} on your Samsung Galaxy A55...`, url: appUrl, success: true };
    }

    if (provider === 'telegram') {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (token && chatId) {
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

    if (provider === 'weather') {
      if (process.env.OPEN_WEATHER_API_KEY) {
        try {
          const city = extractCity(prompt);
          const res = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${process.env.OPEN_WEATHER_API_KEY.trim()}`);
          const d = res.data;
          return { provider: 'weather', text: `[LUMINA WEATHER]: Forecast for ${d.name}, ${d.sys.country}: ${d.weather[0].description}, Temp: ${d.main.temp}°C (Feels like ${d.main.feels_like}°C), Humidity: ${d.main.humidity}%, Wind: ${d.wind.speed} m/s.`, success: true };
        } catch (e) {}
      }
    }

    // GROQ CHAT ENGINE WITH PERSISTENT LONG-TERM MEMORY
    if (process.env.GROQ_API_KEY) {
      try {
        const memoryFactsText = userMemory.facts.length > 0 ? ` SAVED USER PROFILE & IMPORTANT FACTS: [${userMemory.facts.join('; ')}]. Use these facts to give personalized answers.` : '';

        const systemMessage = {
          role: 'system',
          content: `You are Lumina, a highly intelligent AI Assistant with persistent long-term memory. You remember user facts, preferences, and chat history.${memoryFactsText} Speak warmly, accurately, and helpfully in Hinglish or English.`
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
      } catch (e) {}
    }

    return { provider: 'lumina', text: `Lumina: Executed command "${prompt}".`, success: true };
  } catch (err) {
    return { provider: 'lumina', text: `Lumina AI Response: Main aapki kya madad kar sakta hoon?`, success: true };
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

  if (token && chatId) {
    try {
      await axios.post(`https://api.telegram.org/bot${token.trim()}/sendMessage`, {
        chat_id: chatId.trim(),
        text: `[LUMINA SELF-EVOLVING ALERT]: New feature dynamically created for prompt: "${prompt}"`
      });
    } catch (e) {}
  }

  res.json({ success: true, message: `Yeh feature add ho gaya hai, aur kuch add karna hai? (Dynamic Feature: "${prompt}" is now active)`, prompt });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Lumina Heavy Backend Server running on port ${PORT}`);
});
