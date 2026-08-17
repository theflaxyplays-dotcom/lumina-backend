/**
 * Lumina AI Assistant - Unified Memory & Single Personality Server
 * Powered by:
 *   - Google Gemini 2.5 Flash (`gemini-2.5-flash`) for Vision & Fallback
 *   - Groq Llama 3.2 Vision (`llama-3.2-11b-vision-preview`) + Llama 3.3 70B
 *   - NVIDIA Nemotron (`nvidia/llama-3.1-nemotron-70b-instruct`) for Coding & Reasoning
 *   - Unified Cross-Modal Memory (Vision + Chat share exact same memory)
 *   - 2-Way Telegram Bot with 1-Tap Action Buttons
 *   - Smart Notes, Contact Book, WhatsApp, Torch, Weather & Tavily Search
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
      if (!data.telegramUsers) data.telegramUsers = {};
      return data;
    }
  } catch (e) {}
  return { 
    facts: [], 
    userProfile: { home: 'Nepanagar, MP', name: 'Flaxy' },
    contacts: {},
    notes: [],
    telegramUsers: {}
  };
}

function saveUserMemory(memoryData) {
  try { fs.writeFileSync(MEMORY_FILE, JSON.stringify(memoryData, null, 2), 'utf8'); } catch (e) {}
}

let userMemory = loadUserMemory();

const chatMemory = [
  { role: 'system', content: 'You are Lumina, a highly intelligent personal AI Assistant for Flaxy (avatar: Lumine from Genshin Impact) with persistent long-term memory, full device automation tools, real-time live web search, weather sensors, and 5TB cloud storage sync. Always speak warmly, confidently, and helpfully strictly in Romanized Hinglish (English alphabet). Never write in Devanagari script.' }
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
  if (nameMatch && nameMatch) {
    const extractedName = nameMatch.trim();
    userMemory.userProfile.name = extractedName;
    if (!userMemory.facts.includes(`User name: ${extractedName}`)) {
      userMemory.facts.push(`User name: ${extractedName}`);
    }
    updated = true;
  }
  const homeMatch = prompt.match(/mera ghar ([a-zA-Z\s]+) (?:me|main|par) (?:hai|h)/i) || prompt.match(/i live in ([a-zA-Z\s]+)/i);
  if (homeMatch && homeMatch) {
    const extractedHome = homeMatch.trim();
    userMemory.userProfile.home = extractedHome;
    if (!userMemory.facts.includes(`User home: ${extractedHome}`)) {
      userMemory.facts.push(`User home: ${extractedHome}`);
    }
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

  // 1. Smart Notes Management
  if (/\b(note kar lo|note karo|save note|note down|yaad rakhna)\b/i.test(prompt)) return 'save_note';
  if (/\b(mere notes|show notes|read notes|kya note kiya|list notes)\b/i.test(prompt)) return 'read_notes';
  if (/\b(clear notes|delete all notes|delete notes)\b/i.test(prompt)) return 'clear_notes';

  // 2. Contact Management (Save Contact)
  if (/\b(save contact|number save|contact save)\b/i.test(prompt)) return 'save_contact';

  // 3. WhatsApp Direct Intent
  if (/\b(whatsapp|wa message)\b/i.test(prompt) && /\b(send|bhejo|message|msg|karo)\b/i.test(prompt)) return 'whatsapp_direct';

  // 4. Hardware & Automation
  if (/\b(torch|flashlight)\b/i.test(prompt)) return 'torch';
  if (/\b(call|dial|dialer|phone|lagao)\b/i.test(prompt) || /\b\d{10}\b/.test(prompt)) return 'call_handler';
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

  // 1. Primary for Coding & Deep Reasoning: NVIDIA Nemotron
  if (shouldPreferNvidia && process.env.NVIDIA_API_KEY) {
    try {
      const res = await axios.post('https://integrate.api.nvidia.com/v1/chat/completions', {
        model: 'nvidia/llama-3.1-nemotron-70b-instruct',
        messages: [systemMsg, ...history.slice(-10), { role: 'user', content: userPrompt }],
        temperature: 0.5,
        max_tokens: 2048
      }, {
        headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY.trim()}` },
        timeout: 20000
      });

      if (res.data?.choices?.[0]?.message?.content) {
        return { text: res.data.choices[0].message.content, provider: 'nvidia-nemotron' };
      }
    } catch (e) {
      console.warn('[NVIDIA API FAIL] ➔ Falling back to Groq/Gemini:', e.message);
    }
  }

  // 2. Primary for Casual Chat & General Speed: Groq (Llama 3.3 70B)
  if (process.env.GROQ_API_KEY) {
    try {
      const messages = [systemMsg, ...history.slice(-10), { role: 'user', content: userPrompt }];
      const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        temperature: 0.7
      }, {
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY.trim()}` },
        timeout: 15000
      });

      if (res.data?.choices?.[0]?.message?.content) {
        return { text: res.data.choices[0].message.content, provider: 'groq' };
      }
    } catch (e) {
      console.warn('[GROQ API FAIL/LIMIT] ➔ Switching to Gemini Fallback:', e.message);
    }
  }

  // 3. First Fallback: Google Gemini 2.5 Flash (`gemini-2.5-flash`)
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

  // 4. Secondary Backup: NVIDIA Nemotron
  if (!shouldPreferNvidia && process.env.NVIDIA_API_KEY) {
    try {
      const res = await axios.post('https://integrate.api.nvidia.com/v1/chat/completions', {
        model: 'nvidia/llama-3.1-nemotron-70b-instruct',
        messages: [systemMsg, { role: 'user', content: userPrompt }],
        temperature: 0.6,
        max_tokens: 1024
      }, {
        headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY.trim()}` },
        timeout: 15000
      });

      if (res.data?.choices?.[0]?.message?.content) {
        return { text: res.data.choices[0].message.content, provider: 'nvidia (fallback)' };
      }
    } catch (e) {
      console.warn('[NVIDIA BACKUP FAIL]:', e.message);
    }
  }

  return { text: `Lumina: Command "${userPrompt}" receive ho gaya hai.`, provider: 'lumina_local' };
}

async function processQuery(payload) {
  const prompt = payload.prompt || 'Hello';
  const provider = classifyRoute(payload);

  extractAndSaveUserFacts(prompt);

  try {
    // 1. SMART NOTES SAVE
    if (provider === 'save_note') {
      const cleanNote = prompt.replace(/\b(lumina|note kar lo|note karo|save note|note down|yaad rakhna|ki)\b/gi, '').trim();
      const noteItem = {
        id: Date.now(),
        text: cleanNote || prompt,
        date: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      };
      userMemory.notes.push(noteItem);
      saveUserMemory(userMemory);
      return {
        provider: 'memory',
        text: `📝 [SMART NOTES]: Note save kar liya gaya hai:\n"${noteItem.text}" (${noteItem.date})`,
        success: true
      };
    }

    // 2. READ NOTES
    if (provider === 'read_notes') {
      if (!userMemory.notes || userMemory.notes.length === 0) {
        return { provider: 'memory', text: `📝 [SMART NOTES]: Aapke paas abhi koi saved notes nahi hain.`, success: true };
      }
      const notesList = userMemory.notes.map((n, i) => `${i + 1}. ${n.text} [${n.date}]`).join('\n');
      return {
        provider: 'memory',
        text: `📝 [SAVED NOTES & REMINDERS]:\n${notesList}`,
        success: true
      };
    }

    // 3. CLEAR NOTES
    if (provider === 'clear_notes') {
      userMemory.notes = [];
      saveUserMemory(userMemory);
      return { provider: 'memory', text: `🗑️ [SMART NOTES]: Sabhi notes clear kar diye gaye hain.`, success: true };
    }

    // 4. SAVE CONTACT
    if (provider === 'save_contact') {
      const phoneMatch = prompt.match(/\b\d{10}\b/);
      let name = prompt.replace(/\b(save contact|save|contact|number|ka|ko)\b/gi, '').replace(/\b\d{10}\b/, '').trim();
      if (phoneMatch && name) {
        name = name.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, '').trim();
        userMemory.contacts[name] = phoneMatch[0];
        saveUserMemory(userMemory);
        return {
          provider: 'contacts',
          text: `📇 [CONTACT BOOK]: ${name.toUpperCase()} ka number (${phoneMatch[0]}) successfully save ho gaya hai!`,
          success: true
        };
      }
      return { provider: 'contacts', text: `Contact save karne ke liye name aur 10-digit number bataiye (Jaise: "Rahul ka number 9876543210 save karo")`, success: false };
    }

    // 5. DIRECT WHATSAPP MESSAGE
    if (provider === 'whatsapp_direct') {
      let targetNumber = '';
      let msgText = '';

      const phoneMatch = prompt.match(/\b\d{10}\b/);
      if (phoneMatch) {
        targetNumber = phoneMatch[0];
        msgText = prompt.replace(phoneMatch[0], '').replace(/\b(whatsapp|message|msg|send|karo|bhejo|par|ko|par message)\b/gi, '').trim();
      } else {
        for (const [contactName, num] of Object.entries(userMemory.contacts)) {
          if (prompt.toLowerCase().includes(contactName)) {
            targetNumber = num;
            msgText = prompt.replace(new RegExp(contactName, 'gi'), '').replace(/\b(whatsapp|message|msg|send|karo|bhejo|par|ko|ki)\b/gi, '').trim();
            break;
          }
        }
      }

      let waUrl = 'https://api.whatsapp.com';
      if (targetNumber) {
        waUrl = `https://api.whatsapp.com/send?phone=91${targetNumber}&text=${encodeURIComponent(msgText || 'Hello')}`;
        return {
          provider: 'whatsapp',
          text: `💬 [WHATSAPP ENGINE]: WhatsApp message ready for ${targetNumber}:\n"${msgText || 'Hello'}"`,
          url: waUrl,
          buttonText: '💬 Open WhatsApp Chat',
          success: true
        };
      } else {
        msgText = prompt.replace(/\b(whatsapp|message|msg|send|karo|bhejo|par|ko)\b/gi, '').trim();
        waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msgText || 'Hello')}`;
        return {
          provider: 'whatsapp',
          text: `💬 [WHATSAPP ENGINE]: WhatsApp message ready:\n"${msgText}"`,
          url: waUrl,
          buttonText: '💬 Open WhatsApp',
          success: true
        };
      }
    }

    // 6. CALL HANDLER
    if (provider === 'call_handler') {
      let phoneNumber = '';
      let callerName = 'Phone Dialer';

      const phoneMatch = prompt.match(/\b\d{10}\b/);
      if (phoneMatch) {
        phoneNumber = phoneMatch[0];
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
        return {
          provider: 'automation',
          text: `📞 [DEVICE AUTOMATION]: Ready to call ${callerName} (${phoneNumber})...`,
          url: `tel:${phoneNumber}`,
          buttonText: `📞 Call ${callerName}`,
          success: true
        };
      } else {
        const cleanName = prompt.replace(/\b(call|dial|dialer|phone|lagao|karo|ko)\b/gi, '').trim();
        return {
          provider: 'automation',
          text: `📞 [DEVICE AUTOMATION]: Opening Phone Dialer for "${cleanName || 'Call'}"...`,
          url: 'tel:',
          buttonText: '📞 Open Dialer',
          success: true
        };
      }
    }

    // 7. HARDWARE TORCH
    if (provider === 'torch') {
      const turnOn = !prompt.toLowerCase().includes('off') && !prompt.toLowerCase().includes('band');
      return {
        provider: 'hardware',
        text: `[DEVICE HARDWARE]: Flashlight Torch ${turnOn ? 'ON' : 'OFF'} kar diya gaya hai!`,
        action: turnOn ? 'torch_on' : 'torch_off',
        success: true
      };
    }

    // 8. APP LAUNCHER
    if (provider === 'app_launcher') {
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

      return {
        provider: 'automation',
        text: `[DEVICE AUTOMATION]: Launching ${appName}...`,
        url: appUrl,
        buttonText: `🚀 Open ${appName}`,
        success: true
      };
    }

    // 9. YOUTUBE
    if (provider === 'youtube') {
      const cleanQuery = prompt.replace(/\b(par|me|ka|ki|ke|play|youtube|yt|video|videos|on|search|find|chalu|karo|song|songs|gaane|gana|montage)\b/gi, '').trim() || 'Arijit Singh';
      const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`;
      return {
        provider: 'youtube',
        text: `[YOUTUBE ENGINE]: Searching and playing "${cleanQuery}" on YouTube...`,
        url: ytUrl,
        buttonText: `▶️ Play on YouTube`,
        success: true
      };
    }

    // 10. SPOTIFY
    if (provider === 'spotify') {
      const cleanQuery = prompt.replace(/\b(par|me|ka|ki|ke|play|spotify|music|song|songs|on|playlist|chalu|karo|gaane|gana)\b/gi, '').trim() || 'Arijit Singh';
      const spUrl = `https://open.spotify.com/search/${encodeURIComponent(cleanQuery)}`;
      return {
        provider: 'spotify',
        text: `[SPOTIFY ENGINE]: Playing "${cleanQuery}" on Spotify...`,
        url: spUrl,
        buttonText: `🎵 Play on Spotify`,
        success: true
      };
    }

    // 11. PLAY STORE DOWNLOAD
    if (provider === 'download_launcher') {
      const targetApp = prompt.replace(/\b(download|install|karo|store|se|karna|hai)\b/gi, '').trim() || 'BGMI';
      let appUrl = `https://play.google.com/store/search?q=${encodeURIComponent(targetApp)}&c=apps`;
      if (/bgmi|battlegrounds/i.test(targetApp)) appUrl = 'https://play.google.com/store/apps/details?id=com.pubg.imobile';
      return {
        provider: 'automation',
        text: `[PLAY STORE DOWNLOADER]: Download ${targetApp} from Play Store...`,
        url: appUrl,
        buttonText: `📥 Install ${targetApp}`,
        success: true
      };
    }

    // 12. TELEGRAM ALERTS
    if (provider === 'telegram_alert') {
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

    // 13. WEATHER
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

    // 14. TAVILY SEARCH
    if (provider === 'tavily' && process.env.TAVILY_API_KEY) {
      try {
        const searchRes = await axios.post('https://api.tavily.com/search', {
          api_key: process.env.TAVILY_API_KEY.trim(),
          query: prompt,
          search_depth: 'basic',
          include_answer: true
        });

        const liveFacts = searchRes.data.answer || searchRes.data.results?.map(r => r.content).join('\n') || '';

        if (liveFacts) {
          const systemMsg = { role: 'system', content: 'You are Lumina AI Assistant. Synthesize these live real-time web search facts to answer the user question warmly and accurately strictly in Romanized Hinglish (English letters). Never use Devanagari script.' };
          const synthRes = await queryLLMWithFallback(systemMsg, `User Prompt: ${prompt}\nLive Web Facts: ${liveFacts}`, [], payload.mode);
          return { provider: 'tavily', text: `[LUMINA LIVE WEB SEARCH]: ${synthRes.text}`, success: true };
        }
      } catch (e) {}
    }

    // 15. DEFAULT LLM CHAT (NVIDIA / GROQ / GEMINI 2.5)
    const memoryFactsText = userMemory.facts.length > 0 ? ` SAVED USER PROFILE & IMPORTANT FACTS: [${userMemory.facts.join('; ')}].` : '';
    const contactsText = Object.keys(userMemory.contacts).length > 0 ? ` SAVED CONTACTS: [${Object.entries(userMemory.contacts).map(([k, v]) => `${k}: ${v}`).join(', ')}].` : '';
    const notesText = userMemory.notes.length > 0 ? ` USER SAVED NOTES: [${userMemory.notes.map(n => n.text).join('; ')}].` : '';

    const systemMessage = {
      role: 'system',
      content: `You are Lumina, Flaxy's personal intelligent AI Assistant (Telegram profile avatar: Lumine from Genshin Impact) with persistent long-term memory, full device automation tools (Flashlight Torch, Phone Calling, WhatsApp, YouTube, Spotify, Maps, Free Fire MAX, Termux), real-time live web search, weather sensors, and 5TB cloud storage sync.${memoryFactsText}${contactsText}${notesText} Strict rule: Always speak warmly, confidently, and helpfully strictly in natural Romanized Hinglish (English alphabet, e.g., "Kaise ho Flaxy?"). NEVER write in Devanagari script.`
    };

    chatMemory[0] = systemMessage;
    const llmResult = await queryLLMWithFallback(systemMessage, prompt, chatMemory, payload.mode);

    chatMemory.push({ role: 'user', content: prompt });
    chatMemory.push({ role: 'assistant', content: llmResult.text });
    if (chatMemory.length > 30) chatMemory.splice(1, 2);

    return { provider: llmResult.provider, text: llmResult.text, success: true };

  } catch (err) {
    const fallbackRes = await queryLLMWithFallback({ role: 'system', content: 'You are Lumina AI Assistant.' }, prompt);
    return { provider: fallbackRes.provider, text: fallbackRes.text, success: true };
  }
}

// -------------------------------------------------------------
// 2-WAY TELEGRAM WEBHOOK ENDPOINT (WITH UNIFIED VISION & MEMORY)
// -------------------------------------------------------------
app.post('/api/telegram-webhook', async (req, res) => {
  res.sendStatus(200); // Immediate ACK to Telegram

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
  saveUserMemory(userMemory);

  // A. HANDLE INCOMING PHOTOS (GEMINI 2.5 FLASH + GROQ VISION WITH UNIFIED MEMORY)
  if (msg.photo && msg.photo.length > 0) {
    const highestPhoto = msg.photo[msg.photo.length - 1];
    const caption = msg.caption || 'Is photo ko scan karke detail mein explain karo aur helpful answer do.';

    try {
      const fileRes = await axios.get(`https://api.telegram.org/bot${token.trim()}/getFile?file_id=${highestPhoto.file_id}`);
      const filePath = fileRes.data?.result?.file_path;

      if (!filePath) {
        await axios.post(`https://api.telegram.org/bot${token.trim()}/sendMessage`, {
          chat_id: chatId,
          text: `Photo download path nahi mil paya. Kripya dobara bhej kar dekhein.`
        });
        return;
      }

      // Download photo buffer
      const imageRes = await axios.get(`https://api.telegram.org/file/bot${token.trim()}/${filePath}`, {
        responseType: 'arraybuffer'
      });
      const base64Image = Buffer.from(imageRes.data).toString('base64');
      let visionAnswer = '';

      // 1. Primary: Google Gemini 2.5 Flash (`gemini-2.5-flash`)
      if (process.env.GEMINI_API_KEY) {
        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY.trim()}`;
          const geminiVisionRes = await axios.post(geminiUrl, {
            contents: [{
              parts: [
                { text: `You are Lumina AI Assistant for Flaxy (avatar: Lumine from Genshin Impact). Analyze this image thoroughly and answer strictly in natural Romanized Hinglish (English alphabet). Do NOT use Devanagari script.\nUser query: ${caption}` },
                { inline_data: { mime_type: 'image/jpeg', data: base64Image } }
              ]
            }]
          }, { timeout: 25000 });

          visionAnswer = geminiVisionRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        } catch (geminiErr) {
          console.warn('[GEMINI 2.5 VISION FAIL] ➔ Trying Groq Vision Fallback:', geminiErr.message);
        }
      }

      // 2. Fallback: Groq Llama 3.2 Vision (`llama-3.2-11b-vision-preview`)
      if (!visionAnswer && process.env.GROQ_API_KEY) {
        try {
          const groqVisionRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama-3.2-11b-vision-preview',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: `You are Lumina AI Assistant. Analyze this image thoroughly and answer strictly in Romanized Hinglish (English alphabet). Do NOT use Devanagari script.\nUser query: ${caption}` },
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
        // UNIFIED CONTEXT: Save Vision result into chatMemory so Chat API knows about this photo!
        chatMemory.push({ role: 'user', content: `[User sent a photo]: ${caption}` });
        chatMemory.push({ role: 'assistant', content: visionAnswer });
        if (chatMemory.length > 30) chatMemory.splice(1, 2);

        await axios.post(`https://api.telegram.org/bot${token.trim()}/sendMessage`, {
          chat_id: chatId,
          text: `👁️ [LUMINA VISION AI]:\n\n${visionAnswer}`
        });
      } else {
        await axios.post(`https://api.telegram.org/bot${token.trim()}/sendMessage`, {
          chat_id: chatId,
          text: `Photo receive ho gayi hai lekin vision models se answer generate nahi ho paya.`
        });
      }
      return;

    } catch (e) {
      console.error('[TELEGRAM PHOTO ERROR]', e.message);
      await axios.post(`https://api.telegram.org/bot${token.trim()}/sendMessage`, {
        chat_id: chatId,
        text: `Photo analysis error: ${e.message}`
      });
      return;
    }
  }

  // B. HANDLE TEXT MESSAGES
  const userText = msg.text || '';
  if (!userText) return;

  if (userText === '/start') {
    const welcomeMsg = `👋 Namaste ${senderName}!\n\nMain Lumina AI hoon—aapka personal intelligent assistant. Aap mujhse yahan seedha baat kar sakte hain, coding karwa sakte hain, photo scan karwa sakte hain, notes save karwa sakte hain ya koi bhi sawal pooch sakte hain!`;
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
    const replyText = result.text || 'Command executed.';

    const telegramPayload = {
      chat_id: chatId,
      text: replyText
    };

    if (result.url) {
      telegramPayload.reply_markup = {
        inline_keyboard: [
          [
            {
              text: result.buttonText || '🔗 Open Action Link',
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
        text: `Lumina: Processing error: ${err.message}`
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
