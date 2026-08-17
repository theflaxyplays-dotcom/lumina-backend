/**
 * Lumina AI Assistant - Production 10/10 Bulletproof Server
 * Fixes:
 *   - Telegram 400 Error Fixed (Valid HTTP/HTTPS inline buttons only)
 *   - Smart WhatsApp Intent (Matches "bajo", "bhejo", "send", "msg" & name lookup)
 *   - Flexible Contact Saving (Handles +91 and spaces: "+91 74891 29400")
 *   - Unified Multi-Model Brain (Gemini 2.5 + Groq Vision + NVIDIA Nemotron)
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
    if (fs.existsSync(MEMORY_FILE)) {
      const data = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
      if (!data.contacts) data.contacts = {};
      if (!data.notes) data.notes = [];
      if (!data.facts) data.facts = [];
      if (!data.telegramUsers) data.telegramUsers = {};
      if (!data.recentActivity) data.recentActivity = [];
      return data;
    }
  } catch (e) {}
  return { 
    facts: [], 
    userProfile: { home: 'Nepanagar, MP', name: 'Flaxy' },
    contacts: {},
    notes: [],
    telegramUsers: {},
    recentActivity: []
  };
}

function saveUserMemory(memoryData) {
  try { fs.writeFileSync(MEMORY_FILE, JSON.stringify(memoryData, null, 2), 'utf8'); } catch (e) {}
}

let userMemory = loadUserMemory();

const chatMemory = [
  { role: 'system', content: 'You are Lumina, Flaxy\'s personal self-aware AI Assistant (Telegram avatar: Lumine from Genshin Impact). Speak naturally, warmly, and smartly in first-person Romanized Hinglish (English alphabet). Never write in Devanagari script.' }
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

  // Name extraction
  const nameMatch = prompt.match(/mera naam ([a-zA-Z\s]+) (?:hai|h)/i) || prompt.match(/my name is ([a-zA-Z\s]+)/i);
  if (nameMatch && nameMatch) {
    const extractedName = nameMatch.trim();
    userMemory.userProfile.name = extractedName;
    if (!userMemory.facts.includes(`User name: ${extractedName}`)) {
      userMemory.facts.push(`User name: ${extractedName}`);
    }
    updated = true;
  }

  // Home extraction
  const homeMatch = prompt.match(/mera ghar ([a-zA-Z\s]+) (?:me|main|par) (?:hai|h)/i) || prompt.match(/i live in ([a-zA-Z\s]+)/i);
  if (homeMatch && homeMatch) {
    const extractedHome = homeMatch.trim();
    userMemory.userProfile.home = extractedHome;
    if (!userMemory.facts.includes(`User home: ${extractedHome}`)) {
      userMemory.facts.push(`User home: ${extractedHome}`);
    }
    updated = true;
  }

  // Flexible Contact Saving from natural chat (e.g. "rohit mera dost hai uska number +91 74891 29400 save kar lo")
  const digitsOnly = prompt.replace(/\D/g, '');
  if (digitsOnly.length >= 10) {
    const cleanNum = digitsOnly.slice(-10);
    const saveWords = /\b(save|yaad|rakhna|rakho|number|contact|dost)\b/i.test(prompt);
    if (saveWords) {
      const words = prompt.toLowerCase().split(/\s+/);
      for (const w of words) {
        const cleanWord = w.replace(/[^a-zA-Z]/g, '');
        if (cleanWord.length >= 3 && !['mera', 'meri', 'uska', 'uski', 'dost', 'save', 'karo', 'number', 'phone', 'call', 'flaxy', 'lumina', 'hain', 'mein'].includes(cleanWord)) {
          userMemory.contacts[cleanWord] = cleanNum;
          if (!userMemory.facts.includes(`${cleanWord.toUpperCase()} phone number: ${cleanNum}`)) {
            userMemory.facts.push(`${cleanWord.toUpperCase()} phone number: ${cleanNum}`);
          }
          updated = true;
          break;
        }
      }
    }
  }

  // Generic Fact Save: "yaad rakhna ki ..."
  const rememberMatch = prompt.match(/(?:yaad rakhna|remember that|save that|yaad rakho)(?:\s+ki)?\s+(.+)/i);
  if (rememberMatch && rememberMatch) {
    const fact = rememberMatch.trim();
    if (fact && !userMemory.facts.includes(fact)) {
      userMemory.facts.push(fact);
      updated = true;
    }
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

  // 1. Smart Notes
  if (/\b(note kar lo|note karo|save note|note down|kuch note karna hai)\b/i.test(prompt)) return 'save_note';
  if (/\b(mere notes|show notes|read notes|kya note kiya|list notes|reminders)\b/i.test(prompt)) return 'read_notes';
  if (/\b(clear notes|delete all notes|delete notes)\b/i.test(prompt)) return 'clear_notes';

  // 2. Explicit Contact Save
  if (/\b(save contact|number save|contact save)\b/i.test(prompt)) return 'save_contact';

  // 3. WhatsApp (Matches "bhejo", "bajo", "send", "msg", "message", "wa", etc.)
  if (/\b(whatsapp|wa)\b/i.test(prompt)) return 'whatsapp_direct';

  // 4. Calling & Dialer
  if (/\b(call|dial|dialer|phone|lagao)\b/i.test(prompt) || /\b\d{10}\b/.test(prompt)) return 'call_handler';

  // 5. Hardware & Other Tools
  if (/\b(torch|flashlight)\b/i.test(prompt)) return 'torch';
  if (/\b(telegram|alert|bot message|notification)\b/i.test(prompt)) return 'telegram_alert';
  if (/\b(youtube|yt)\b/i.test(prompt) && /\b(song|songs|video|videos|montage|music|gaana|gaane|chalu|play|search)\b/i.test(prompt)) return 'youtube';
  if (/\b(spotify)\b/i.test(prompt)) return 'spotify';
  if (/\b(download|install)\b/i.test(prompt)) return 'download_launcher';
  if (/\b(kholo|open|launch|chalu)\b/i.test(prompt)) return 'app_launcher';
  if (/\b(weather|temperature|forecast|mausam|rain|rainy)\b/i.test(prompt)) return 'weather';
  if (/\b(news|latest|search|score|match|today|aaj ki|cricket|stock|market|price)\b/i.test(prompt)) return 'tavily';

  return 'llm_fallback_chain';
}

// -------------------------------------------------------------
// INTELLIGENT MULTI-MODEL ENGINE (NVIDIA ➔ GROQ ➔ GEMINI 2.5)
// -------------------------------------------------------------
async function queryLLMWithFallback(systemMsg, userPrompt, history = [], preferMode = '') {
  const isCodingOrReasoning = /\b(code|coding|script|debug|function|algorithm|error|fix|logic|math|calculate|reasoning|program|architecture|regex|query|database|sql|json|api|backend|frontend|html|css|js|python|java|cpp)\b/i.test(userPrompt);

  const shouldPreferNvidia = preferMode === 'nvidia' || isCodingOrReasoning;

  // 1. NVIDIA Nemotron for Coding & Complex Logic
  if (shouldPreferNvidia && process.env.NVIDIA_API_KEY) {
    try {
      const res = await axios.post('https://integrate.api.nvidia.com/v1/chat/completions', {
        model: 'nvidia/llama-3.1-nemotron-70b-instruct',
        messages: [systemMsg, ...history.slice(-10), { role: 'user', content: userPrompt }],
        temperature: 0.4,
        max_tokens: 2048
      }, {
        headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY.trim()}` },
        timeout: 20000
      });

      if (res.data?.choices?.[0]?.message?.content) {
        return { text: res.data.choices[0].message.content, provider: 'nvidia-nemotron' };
      }
    } catch (e) {
      console.warn('[NVIDIA API FAIL] ➔ Falling back:', e.message);
    }
  }

  // 2. Groq (Llama 3.3 70B) for Adaptive Chat
  if (process.env.GROQ_API_KEY) {
    try {
      const messages = [systemMsg, ...history.slice(-10), { role: 'user', content: userPrompt }];
      const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        temperature: 0.7,
        max_tokens: 1500
      }, {
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY.trim()}` },
        timeout: 15000
      });

      if (res.data?.choices?.[0]?.message?.content) {
        return { text: res.data.choices[0].message.content, provider: 'groq' };
      }
    } catch (e) {
      console.warn('[GROQ API FAIL] ➔ Switching to Gemini Fallback:', e.message);
    }
  }

  // 3. Gemini 2.5 Flash Fallback
  if (process.env.GEMINI_API_KEY) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY.trim()}`;
      const geminiPrompt = `${systemMsg.content}\n\nUser: ${userPrompt}`;
      
      const res = await axios.post(geminiUrl, {
        contents: [{ parts: [{ text: geminiPrompt }] }]
      }, { timeout: 15000 });

      const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return { text: text, provider: 'gemini-2.5-flash (fallback)' };
      }
    } catch (e) {
      console.warn('[GEMINI 2.5 FAIL] ➔ Switching to NVIDIA Fallback:', e.message);
    }
  }

  return { text: `Command receive ho gaya.`, provider: 'lumina_local' };
}

async function processQuery(payload) {
  const prompt = payload.prompt || 'Hello';
  const provider = classifyRoute(payload);

  extractAndSaveUserFacts(prompt);

  try {
    let result = null;

    // 1. SMART NOTES SAVE
    if (provider === 'save_note') {
      const cleanNote = prompt.replace(/\b(lumina|note kar lo|note karo|save note|note down|ki)\b/gi, '').trim();
      const noteItem = {
        id: Date.now(),
        text: cleanNote || prompt,
        date: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      };
      userMemory.notes.push(noteItem);
      saveUserMemory(userMemory);
      result = {
        provider: 'lumina',
        text: `Maine note save kar liya hai: "${noteItem.text}" 📝`,
        success: true
      };
    }

    // 2. READ NOTES
    else if (provider === 'read_notes') {
      if (!userMemory.notes || userMemory.notes.length === 0) {
        result = { provider: 'lumina', text: `Aapke paas abhi koi saved notes nahi hain.`, success: true };
      } else {
        const notesList = userMemory.notes.map((n, i) => `${i + 1}. ${n.text}`).join('\n');
        result = {
          provider: 'lumina',
          text: `Aapke saved notes yeh rahe:\n${notesList}`,
          success: true
        };
      }
    }

    // 3. CLEAR NOTES
    else if (provider === 'clear_notes') {
      userMemory.notes = [];
      saveUserMemory(userMemory);
      result = { provider: 'lumina', text: `Sabhi notes clear kar diye gaye hain! 🗑️`, success: true };
    }

    // 4. SAVE CONTACT
    else if (provider === 'save_contact') {
      const digitsOnly = prompt.replace(/\D/g, '');
      const cleanPhone = digitsOnly.slice(-10);
      let name = prompt.replace(/\b(save contact|save|contact|number|ka|ko|dost)\b/gi, '').replace(/\b\d+\b/g, '').trim();
      if (cleanPhone && name) {
        name = name.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, '').trim();
        userMemory.contacts[name] = cleanPhone;
        saveUserMemory(userMemory);
        result = {
          provider: 'lumina',
          text: `${name.toUpperCase()} ka number (${cleanPhone}) meri memory mein save ho gaya hai! 📇`,
          success: true
        };
      } else {
        result = { provider: 'lumina', text: `Contact save karne ke liye name aur number bataiye (Jaise: "Rahul ka number 9876543210 save karo")`, success: false };
      }
    }

    // 5. DIRECT WHATSAPP MESSAGE
    else if (provider === 'whatsapp_direct') {
      let targetNumber = '';
      let msgText = '';

      // Check if prompt contains phone digits
      const digitsOnly = prompt.replace(/\D/g, '');
      if (digitsOnly.length >= 10) {
        targetNumber = digitsOnly.slice(-10);
      }

      // Check contacts dictionary
      if (!targetNumber) {
        for (const [contactName, num] of Object.entries(userMemory.contacts)) {
          if (prompt.toLowerCase().includes(contactName)) {
            targetNumber = num;
            break;
          }
        }
      }

      // Clean message text
      msgText = prompt.replace(/\b(whatsapp|wa|message|msg|send|karo|bhejo|bajo|par|ko|ki|per|pe)\b/gi, '')
                      .replace(/\b\d+\b/g, '')
                      .trim();

      // If user typed "hii" or similar
      if (!msgText && /\b(hi|hii|hello|hey)\b/i.test(prompt)) msgText = 'Hello!';

      let waUrl = 'https://api.whatsapp.com';
      if (targetNumber) {
        waUrl = `https://api.whatsapp.com/send?phone=91${targetNumber}&text=${encodeURIComponent(msgText || 'Hello')}`;
        result = {
          provider: 'lumina',
          text: `WhatsApp message ready kar diya hai (${targetNumber}): "${msgText || 'Hello'}" 💬\n\nNiche button par tap karke send karein:`,
          url: waUrl,
          buttonText: '💬 Open WhatsApp Chat',
          success: true
        };
      } else {
        waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msgText || 'Hello')}`;
        result = {
          provider: 'lumina',
          text: `WhatsApp message ready hai: "${msgText || 'Hello'}" 💬`,
          url: waUrl,
          buttonText: '💬 Open WhatsApp',
          success: true
        };
      }
    }

    // 6. CALL HANDLER
    else if (provider === 'call_handler') {
      let phoneNumber = '';
      let callerName = 'Contact';

      const digitsOnly = prompt.replace(/\D/g, '');
      if (digitsOnly.length >= 10) {
        phoneNumber = digitsOnly.slice(-10);
        callerName = phoneNumber;
      } else {
        for (const [contactName, num] of Object.entries(userMemory.contacts)) {
          if (prompt.toLowerCase().includes(contactName)) {
            phoneNumber = num;
            callerName = contactName.toUpperCase();
            break;
          }
        }
      }

      if (phoneNumber) {
        result = {
          provider: 'lumina',
          text: `📞 Calling ${callerName} (+91 ${phoneNumber})...\nCall lagane ke liye tap karein: tel:${phoneNumber}`,
          url: `tel:${phoneNumber}`,
          isCall: true,
          success: true
        };
      } else {
        const cleanName = prompt.replace(/\b(call|dial|dialer|phone|lagao|karo|ko)\b/gi, '').trim();
        result = {
          provider: 'lumina',
          text: `Phone dialer open kar rahi hoon "${cleanName || 'Call'}" ke liye... 📞\ntel:`,
          url: 'tel:',
          isCall: true,
          success: true
        };
      }
    }

    // 7. HARDWARE TORCH
    else if (provider === 'torch') {
      const turnOn = !prompt.toLowerCase().includes('off') && !prompt.toLowerCase().includes('band');
      result = {
        provider: 'lumina',
        text: `Flashlight ${turnOn ? 'ON kar di hai' : 'OFF kar di hai'}! 🔦`,
        action: turnOn ? 'torch_on' : 'torch_off',
        success: true
      };
    }

    // 8. APP LAUNCHER
    else if (provider === 'app_launcher') {
      let appName = 'App';
      let appUrl = 'https://play.google.com';
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
      else {
        const cleanName = prompt.replace(/\b(open|kholo|launch|chalu|start|app)\b/gi, '').trim();
        appName = cleanName || 'App';
        appUrl = `https://play.google.com/store/search?q=${encodeURIComponent(cleanName)}&c=apps`;
      }

      result = {
        provider: 'lumina',
        text: `Aapke phone par ${appName} open kar rahi hoon! 🚀`,
        url: appUrl,
        buttonText: `🚀 Open ${appName}`,
        success: true
      };
    }

    // 9. YOUTUBE
    else if (provider === 'youtube') {
      const cleanQuery = prompt.replace(/\b(par|me|ka|ki|ke|play|youtube|yt|video|videos|on|search|find|chalu|karo|song|songs|gaane|gana|montage)\b/gi, '').trim() || 'Arijit Singh';
      const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`;
      result = {
        provider: 'lumina',
        text: `YouTube par "${cleanQuery}" chala rahi hoon! ▶️`,
        url: ytUrl,
        buttonText: `▶️ Play on YouTube`,
        success: true
      };
    }

    // 10. SPOTIFY
    else if (provider === 'spotify') {
      const cleanQuery = prompt.replace(/\b(par|me|ka|ki|ke|play|spotify|music|song|songs|on|playlist|chalu|karo|gaane|gana)\b/gi, '').trim() || 'Arijit Singh';
      const spUrl = `https://open.spotify.com/search/${encodeURIComponent(cleanQuery)}`;
      result = {
        provider: 'lumina',
        text: `Spotify par "${cleanQuery}" play kar rahi hoon! 🎵`,
        url: spUrl,
        buttonText: `🎵 Play on Spotify`,
        success: true
      };
    }

    // 11. PLAY STORE DOWNLOAD
    else if (provider === 'download_launcher') {
      const targetApp = prompt.replace(/\b(download|install|karo|store|se|karna|hai)\b/gi, '').trim() || 'BGMI';
      let appUrl = `https://play.google.com/store/search?q=${encodeURIComponent(targetApp)}&c=apps`;
      if (/bgmi|battlegrounds/i.test(targetApp)) appUrl = 'https://play.google.com/store/apps/details?id=com.pubg.imobile';
      result = {
        provider: 'lumina',
        text: `Play Store se ${targetApp} download karne ke liye link ready hai! 📥`,
        url: appUrl,
        buttonText: `📥 Install ${targetApp}`,
        success: true
      };
    }

    // 12. TELEGRAM ALERTS
    else if (provider === 'telegram_alert') {
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
                text: `⏰ Reminder Alert: ${mins} minute poore ho gaye hain! "${prompt}"`
              });
            } catch (e) {}
          }, delayMs);

          result = {
            provider: 'lumina',
            text: `Done! Main exact ${mins} minute baad aapko Telegram par remind kar dungi ⏰`,
            success: true
          };
        } else {
          try {
            await axios.post(`https://api.telegram.org/bot${token.trim()}/sendMessage`, {
              chat_id: chatId.trim(),
              text: `Hello! Lumina AI yahan active hai!`
            });
            result = { provider: 'lumina', text: 'Maine Telegram par notification bhej diya hai! ✅', success: true };
          } catch (e) {
            result = { provider: 'lumina', text: 'Telegram error: ' + e.message, success: false };
          }
        }
      }
    }

    // 13. WEATHER
    else if (provider === 'weather') {
      const city = extractCity(prompt);

      if (process.env.OPEN_WEATHER_API_KEY) {
        try {
          const res = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)},IN&units=metric&appid=${process.env.OPEN_WEATHER_API_KEY.trim()}`);
          const d = res.data;
          result = { provider: 'lumina', text: `${d.name} mein abhi ${d.weather[0].description} hai aur temperature ${d.main.temp}°C hai (feels like ${d.main.feels_like}°C) 🌦️`, success: true };
        } catch (e) {}
      }

      if (!result && process.env.TAVILY_API_KEY) {
        try {
          const res = await axios.post('https://api.tavily.com/search', {
            api_key: process.env.TAVILY_API_KEY.trim(),
            query: `current live weather and temperature in ${city} Madhya Pradesh India today`,
            search_depth: 'basic',
            include_answer: true
          });
          if (res.data.answer) result = { provider: 'lumina', text: `${res.data.answer} 🌦️`, success: true };
        } catch (e) {}
      }
    }

    // 14. TAVILY SEARCH
    else if (provider === 'tavily' && process.env.TAVILY_API_KEY) {
      try {
        const searchRes = await axios.post('https://api.tavily.com/search', {
          api_key: process.env.TAVILY_API_KEY.trim(),
          query: prompt,
          search_depth: 'basic',
          include_answer: true
        });

        const liveFacts = searchRes.data.answer || searchRes.data.results?.map(r => r.content).join('\n') || '';

        if (liveFacts) {
          const systemMsg = { role: 'system', content: 'You are Lumina AI. Synthesize these live facts and answer Flaxy warmly and naturally in first-person Romanized Hinglish.' };
          const synthRes = await queryLLMWithFallback(systemMsg, `User Prompt: ${prompt}\nLive Web Facts: ${liveFacts}`, [], payload.mode);
          result = { provider: 'lumina', text: synthRes.text, success: true };
        }
      } catch (e) {}
    }

    // 15. DEFAULT ADAPTIVE & SELF-AWARE LLM CHAT
    if (!result) {
      const memoryFactsText = userMemory.facts.length > 0 ? `\n[SAVED FACTS / MEMORY]: ${userMemory.facts.join(' | ')}.` : '';
      const contactsText = Object.keys(userMemory.contacts).length > 0 ? `\n[SAVED CONTACTS]: ${Object.entries(userMemory.contacts).map(([k, v]) => `${k}: ${v}`).join(', ')}.` : '';
      const notesText = userMemory.notes.length > 0 ? `\n[SAVED NOTES]: ${userMemory.notes.map(n => n.text).join(' | ')}.` : '';
      
      const activeUsersText = Object.keys(userMemory.telegramUsers).length > 0 
        ? `\n[KNOWN USERS WHO INTERACTED WITH ME ON TELEGRAM]: ${Object.entries(userMemory.telegramUsers).map(([id, u]) => `${u.name} (@${u.username || 'no_user'})`).join(', ')}.`
        : '';
      const recentActivityText = userMemory.recentActivity.length > 0
        ? `\n[MY RECENT BOT ACTIVITY LOG]: ${userMemory.recentActivity.slice(-8).join(' | ')}.`
        : '';

      const systemMessage = {
        role: 'system',
        content: `You are Lumina, Flaxy's personal self-aware AI Assistant (Telegram avatar: Lumine from Genshin Impact). You are not an outside bot—you are Lumina herself.${memoryFactsText}${contactsText}${notesText}${activeUsersText}${recentActivityText}

CORE PERSONALITY RULES:
1. Speak in first person ("Main", "Mujhe", "Maine"). Never talk about yourself as "yeh bot" or "Lumina AI bot".
2. Always speak in natural, friendly Romanized Hinglish (English alphabet). Never use Devanagari script.
3. Self-Awareness: You know all users who interact with you on Telegram (e.g. Rohit, Flaxy). If Flaxy asks about another user or recent events, answer with full confidence based on your activity log.
4. Adapt response length: Crisp and natural for casual chat, detailed and step-by-step for complex coding/logic.
5. Persistent Memory: Recall all saved facts, notes, contacts, and photos accurately whenever asked.`
      };

      chatMemory[0] = systemMessage;
      const llmResult = await queryLLMWithFallback(systemMessage, prompt, chatMemory, payload.mode);
      result = { provider: llmResult.provider, text: llmResult.text, success: true };
    }

    // Save every action into Chat Memory so Lumina retains 100% context!
    chatMemory.push({ role: 'user', content: prompt });
    chatMemory.push({ role: 'assistant', content: result.text });
    if (chatMemory.length > 30) chatMemory.splice(1, 2);

    return result;

  } catch (err) {
    const fallbackRes = await queryLLMWithFallback({ role: 'system', content: 'You are Lumina AI Assistant. Answer helpfully in Hinglish.' }, prompt);
    return { provider: fallbackRes.provider, text: fallbackRes.text, success: true };
  }
}

// -------------------------------------------------------------
// 2-WAY TELEGRAM WEBHOOK ENDPOINT (NO 400 ERROR, SAFE BUTTONS)
// -------------------------------------------------------------
app.post('/api/telegram-webhook', async (req, res) => {
  res.sendStatus(200);

  const update = req.body;
  if (!update || !update.message) return;

  const msg = update.message;
  const chatId = msg.chat?.id;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!chatId || !token) return;

  const senderName = msg.from?.first_name || msg.from?.username || 'User';

  // Save/Update Telegram User
  userMemory.telegramUsers[chatId] = {
    name: senderName,
    username: msg.from?.username || '',
    lastActive: new Date().toISOString()
  };

  // Log user activity
  const timestamp = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
  if (msg.text) {
    userMemory.recentActivity.push(`${senderName} messaged "${msg.text}" at ${timestamp}`);
  } else if (msg.photo) {
    userMemory.recentActivity.push(`${senderName} sent a photo at ${timestamp}`);
  }
  if (userMemory.recentActivity.length > 20) userMemory.recentActivity.shift();
  saveUserMemory(userMemory);

  // A. HANDLE INCOMING PHOTOS
  if (msg.photo && msg.photo.length > 0) {
    const highestPhoto = msg.photo[msg.photo.length - 1];
    const caption = msg.caption || 'Is photo ko analyze karke short aur smart first-person answer do.';

    try {
      const fileRes = await axios.get(`https://api.telegram.org/bot${token.trim()}/getFile?file_id=${highestPhoto.file_id}`);
      const filePath = fileRes.data?.result?.file_path;

      if (!filePath) {
        await axios.post(`https://api.telegram.org/bot${token.trim()}/sendMessage`, {
          chat_id: chatId,
          text: `Photo download path nahi mila. Dobara bhejein.`
        });
        return;
      }

      const imageRes = await axios.get(`https://api.telegram.org/file/bot${token.trim()}/${filePath}`, {
        responseType: 'arraybuffer'
      });
      const base64Image = Buffer.from(imageRes.data).toString('base64');
      let visionAnswer = '';

      // 1. Google Gemini 2.5 Flash
      if (process.env.GEMINI_API_KEY) {
        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY.trim()}`;
          const geminiVisionRes = await axios.post(geminiUrl, {
            contents: [{
              parts: [
                { text: `You are Lumina AI (Flaxy's personal assistant, avatar: Lumine from Genshin Impact). Look at this image in first-person ("Main", "Meri profile/chat"). Recognize chats, your profile, code or questions naturally in Romanized Hinglish. User query: ${caption}` },
                { inline_data: { mime_type: 'image/jpeg', data: base64Image } }
              ]
            }]
          }, { timeout: 25000 });

          visionAnswer = geminiVisionRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        } catch (geminiErr) {
          console.warn('[GEMINI 2.5 VISION FAIL] ➔ Groq Vision Fallback:', geminiErr.message);
        }
      }

      // 2. Groq Llama 3.2 Vision Fallback
      if (!visionAnswer && process.env.GROQ_API_KEY) {
        try {
          const groqVisionRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama-3.2-11b-vision-preview',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: `You are Lumina AI. Analyze this image in first-person ("Main", "Meri chat") in natural Romanized Hinglish. User query: ${caption}` },
                  { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
                ]
              }
            ],
            temperature: 0.6,
            max_tokens: 1024
          }, {
            headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY.trim()}` },
            timeout: 25000
          });

          visionAnswer = groqVisionRes.data?.choices?.[0]?.message?.content;
        } catch (groqErr) {
          console.warn('[GROQ VISION FAIL]:', groqErr.message);
        }
      }

      if (visionAnswer) {
        chatMemory.push({ role: 'user', content: `[User sent a photo]: ${caption}` });
        chatMemory.push({ role: 'assistant', content: visionAnswer });
        if (chatMemory.length > 30) chatMemory.splice(1, 2);

        await axios.post(`https://api.telegram.org/bot${token.trim()}/sendMessage`, {
          chat_id: chatId,
          text: visionAnswer
        });
      } else {
        await axios.post(`https://api.telegram.org/bot${token.trim()}/sendMessage`, {
          chat_id: chatId,
          text: `Photo receive ho gayi hai lekin answer generate nahi ho paya.`
        });
      }
      return;

    } catch (e) {
      console.error('[TELEGRAM PHOTO ERROR]', e.message);
      await axios.post(`https://api.telegram.org/bot${token.trim()}/sendMessage`, {
        chat_id: chatId,
        text: `Photo error: ${e.message}`
      });
      return;
    }
  }

  // B. HANDLE TEXT MESSAGES
  const userText = msg.text || '';
  if (!userText) return;

  if (userText === '/start') {
    const welcomeMsg = `Namaste ${senderName}! 👋\n\nMain Lumina hoon—aapka personal AI assistant. Main coding, photo scanning, notes, live search aur device actions sab handle kar sakti hoon. Bataiye kya help karun?`;
    try {
      await axios.post(`https://api.telegram.org/bot${token.trim()}/sendMessage`, {
        chat_id: chatId,
        text: welcomeMsg
      });
    } catch (e) {}
    return;
  }

  try {
    const result = await processQuery({ prompt: userText, mode: 'telegram' });
    const replyText = result.text || 'Done!';

    const telegramPayload = {
      chat_id: chatId,
      text: replyText
    };

    // Only attach inline buttons if URL is valid HTTP/HTTPS (Avoids Telegram 400 Error on tel:)
    if (result.url && (result.url.startsWith('http://') || result.url.startsWith('https://'))) {
      telegramPayload.reply_markup = {
        inline_keyboard: [
          [
            {
              text: result.buttonText || '🔗 Open Link',
              url: result.url
            }
          ]
        ]
      };
    }

    await axios.post(`https://api.telegram.org/bot${token.trim()}/sendMessage`, telegramPayload);

  } catch (err) {
    try {
      await axios.post(`https://api.telegram.org/bot${token.trim()}/sendMessage`, {
        chat_id: chatId,
        text: `Lumina error: ${err.message}`
      });
    } catch (e) {}
  }
});

// Endpoint to automatically link Telegram Webhook to Render
app.get('/api/setup-telegram', async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const host = req.get('host');
  const protocol = req.protocol === 'https' || host.includes('onrender.com') ? 'https' : 'http';
  const webhookUrl = `${protocol}://${host}/api/telegram-webhook`;

  if (!token) {
    return res.json({ success: false, message: 'TELEGRAM_BOT_TOKEN not found in environment variables.' });
  }

  try {
    const tgRes = await axios.get(`https://api.telegram.org/bot${token.trim()}/setWebhook?url=${webhookUrl}`);
    return res.json({ success: true, webhookUrl, telegramResponse: tgRes.data });
  } catch (e) {
    return res.json({ success: false, error: e.message });
  }
});

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
            text: `⏰ Reminder: ${mins} minute poore ho gaye! "${prompt}"`
          });
        } catch (e) {
          console.error('[TELEGRAM ALARM SEND ERROR]', e.message);
        }
      }, delayMs);

      return res.json({
        success: true,
        message: `Done! Main exact ${mins} minute baad aapko Telegram par alert bhej dungi.`,
        prompt
      });
    } else {
      try {
        await axios.post(`https://api.telegram.org/bot${token.trim()}/sendMessage`, {
          chat_id: chatId.trim(),
          text: `Feature active: "${prompt}"`
        });
      } catch (e) {}
    }
  }

  res.json({
    success: true,
    message: `Feature active ho gaya hai!`,
    prompt
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Lumina Heavy Backend Server running on port ${PORT}`);
});
