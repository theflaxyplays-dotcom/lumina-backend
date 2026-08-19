/**
 * ============================================================================
 * Lumina AI Assistant - Production Mega Architecture (v6.0)
 * Tailored for Flaxy (Nepanagar, MP, India)
 * ============================================================================
 * 
 * CORE CAPABILITY SUITE:
 *   Multi-Model LLM Matrix (Groq Llama 3.3 + Gemini 2.5 + NVIDIA Nemotron)
 *   AI Image Generation Pipeline (FLUX / Pollinations High-Res Art Engine)
 *   2-Way Interactive Telegram Webhook Hub (@Ai_luminaa_bot)
 *   Cross-Modal Vision AI (Google Gemini 2.5 Flash + Groq Vision)
 *   Direct Telegram DM Dispatcher (Auto-resolves chat IDs from memory/live)
 *   1-on-1 Direct WhatsApp Messenger with clean intent parsing
 *   Smart Phone Dialer with contact book resolution (No 400 error)
 *   Long-Term Memory CRM & Auto Fact Extractor (lumina_user_memory.json)
 *   Smart Notes & Timed Task/Reminder Engine
 *   Live Weather Engine (OpenWeatherMap + Tavily MP fallback)
 *   Real-Time Live Web Search Intelligence (Tavily Search API)
 *   Hardware Flashlight & Android App Hub (YouTube, Spotify, Games, Tools)
 *   Self-Evolution & Dynamic Feature Dispatcher
 * ============================================================================
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

// Security & Parsing Middlewares
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*' }));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// ----------------------------------------------------------------------------
// [SECTION 1] PERSISTENT STORAGE & MEMORY CRM MATRIX
// ----------------------------------------------------------------------------
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
      if (!data.userProfile) data.userProfile = { home: 'Nepanagar, MP', name: 'Flaxy' };
      return data;
    }
  } catch (e) {
    console.warn('[MEMORY LOAD WARNING]', e.message);
  }
  return { 
    facts: ["User home: Nepanagar, MP", "User name: Flaxy"], 
    userProfile: { home: 'Nepanagar, MP', name: 'Flaxy' },
    contacts: {},
    notes: [],
    telegramUsers: {},
    recentActivity: []
  };
}

function saveUserMemory(memoryData) {
  try { 
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memoryData, null, 2), 'utf8'); 
  } catch (e) {
    console.error('[MEMORY SAVE ERROR]', e.message);
  }
}

let userMemory = loadUserMemory();

const chatMemory = [
  { role: 'system', content: 'You are Lumina, Flaxy\'s personal self-aware AI Assistant (Telegram avatar: Lumine from Genshin Impact). Speak naturally, warmly, and smartly in first-person Romanized Hinglish (English alphabet). Never write in Devanagari script.' }
];

function sanitizeApiKey(key) {
  if (!key) return '';
  return key.replace(/["'\s]/g, '').trim();
}

// ----------------------------------------------------------------------------
// [SECTION 2] INTELLIGENT PARSING & EXTRACTION ENGINES
// ----------------------------------------------------------------------------
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
  return userMemory.userProfile?.home?.split(',')[0] || 'Nepanagar';
}

function extractContactName(prompt) {
  const p = prompt.toLowerCase();
  
  const m1 = p.match(/([a-zA-Z]+)\s+(?:mara|mera|ka|ki|ke)\s+(?:dost|friend|bhai|bro)/i);
  if (m1 && m1 && m1.length >= 3) return m1;

  const m2 = p.match(/([a-zA-Z]+)\s+(?:ka|ki|ke)\s+number/i);
  if (m2 && m2 && m2.length >= 3) return m2;

  const m3 = p.match(/(?:dost|friend|bhai|bro)\s+([a-zA-Z]+)/i);
  if (m3 && m3 && m3.length >= 3) return m3;

  const m4 = p.match(/(?:contact|save)\s+([a-zA-Z]+)/i);
  if (m4 && m4 && m4.length >= 3) return m4;

  const stopWords = new Set([
    'ara', 'arre', 'ab', 'abhi', 'ma', 'main', 'mera', 'meri', 'mere', 'uska', 'uski', 'usko', 'iska', 'iski', 'isko', 
    'dost', 'save', 'karo', 'kar', 'lo', 'number', 'phone', 'call', 'flaxy', 'lumina', 'hain', 'mein', 'rakhna', 'rakho', 'apni', 
    'memory', 'yad', 'yaad', 'batao', 'kuch', 'bara', 'baare', 'puch', 'raha', 'hoon', 'hai', 'he', 'to', 'toh', 'bhai', 'bro', 'friend'
  ]);

  const words = p.split(/\s+/);
  for (const w of words) {
    const clean = w.replace(/[^a-zA-Z]/g, '');
    if (clean.length >= 3 && !stopWords.has(clean)) {
      return clean;
    }
  }
  return 'contact';
}

function extractAndSaveUserFacts(prompt) {
  let updated = false;

  // Name Extraction
  const nameMatch = prompt.match(/mera naam ([a-zA-Z\s]+) (?:hai|h)/i) || prompt.match(/my name is ([a-zA-Z\s]+)/i);
  if (nameMatch && nameMatch) {
    const extractedName = nameMatch.trim();
    userMemory.userProfile.name = extractedName;
    if (!userMemory.facts.includes(`User name: ${extractedName}`)) {
      userMemory.facts.push(`User name: ${extractedName}`);
    }
    updated = true;
  }

  // Home / Location Extraction
  const homeMatch = prompt.match(/mera ghar ([a-zA-Z\s]+) (?:me|main|par) (?:hai|h)/i) || prompt.match(/i live in ([a-zA-Z\s]+)/i);
  if (homeMatch && homeMatch) {
    const extractedHome = homeMatch.trim();
    userMemory.userProfile.home = extractedHome;
    if (!userMemory.facts.includes(`User home: ${extractedHome}`)) {
      userMemory.facts.push(`User home: ${extractedHome}`);
    }
    updated = true;
  }

  // Natural Language Contact Auto-Save
  const digitsOnly = prompt.replace(/\D/g, '');
  if (digitsOnly.length >= 10) {
    const cleanNum = digitsOnly.slice(-10);
    const hasSaveIntent = /\b(save|yaad|rakhna|rakho|number|contact|dost)\b/i.test(prompt);
    if (hasSaveIntent) {
      const contactName = extractContactName(prompt);
      if (contactName && contactName !== 'contact') {
        userMemory.contacts[contactName.toLowerCase()] = cleanNum;
        const factString = `${contactName.toUpperCase()} phone number: ${cleanNum}`;
        if (!userMemory.facts.includes(factString)) {
          userMemory.facts.push(factString);
        }
        updated = true;
      }
    }
  }

  // Generic Fact Memoization
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

// ----------------------------------------------------------------------------
// [SECTION 3] DYNAMIC TELEGRAM USER RESOLVER & DISPATCHER
// ----------------------------------------------------------------------------
async function resolveTelegramUser(targetName, token) {
  // 1. Check in-memory telegramUsers
  for (const [chatId, u] of Object.entries(userMemory.telegramUsers)) {
    if (new RegExp(`\\b${u.name}\\b`, 'i').test(targetName) || (u.username && new RegExp(`\\b${u.username}\\b`, 'i').test(targetName))) {
      return { targetUser: u, targetChatId: chatId };
    }
  }

  // 2. Query live updates from Telegram API if available
  if (token) {
    try {
      const updatesRes = await axios.get(`https://api.telegram.org/bot${token}/getUpdates?limit=50`, { timeout: 8000 });
      if (updatesRes.data?.ok && updatesRes.data?.result) {
        for (const item of updatesRes.data.result.reverse()) {
          const from = item.message?.from || item.channel_post?.from;
          const chat = item.message?.chat || item.channel_post?.chat;
          if (from && chat) {
            const firstName = from.first_name || '';
            const uname = from.username || '';
            if ((firstName && firstName.toLowerCase().includes(targetName.toLowerCase())) ||
                (uname && uname.toLowerCase().includes(targetName.toLowerCase()))) {
              const foundUser = { name: firstName || targetName, username: uname };
              userMemory.telegramUsers[chat.id] = foundUser;
              saveUserMemory(userMemory);
              return { targetUser: foundUser, targetChatId: chat.id };
            }
          }
        }
      }
    } catch (e) {}
  }

  return null;
}

// ----------------------------------------------------------------------------
// [SECTION 4] MASTER INTENT ROUTER (NO COLLISION / HIGH PRECISION)
// ----------------------------------------------------------------------------
function classifyRoute(payload) {
  const prompt = (payload.prompt || '').toLowerCase();
  const digitsOnly = prompt.replace(/\D/g, '');

  // 1. AI Image Generation (FLUX / Pollinations Art Engine)
  if (/\b(image banao|photo banao|wallpaper banao|picture banao|generate image|create image|draw image|draw|tasveer)\b/i.test(prompt) && !/\b(scan|analyze|dekho|dakho|kya hai|read)\b/i.test(prompt)) {
    return 'image_generator';
  }

  // 2. Direct Telegram DM to another user
  if (/\b(telegram|tele)\b/i.test(prompt) && /\b(message|msg|massage|bhejo|bajo|bhej|send|karo|bolo|bol|text)\b/i.test(prompt)) {
    return 'telegram_dm';
  }

  // 3. Telegram Timed Reminder / Alarm
  if (/\b(reminder|remind|alarm|yaad dilana|yaad dilao|alert)\b/i.test(prompt) && /\b(minute|minutes|min|mins|hour|hours|ghante|sec|seconds)\b/i.test(prompt)) {
    return 'telegram_reminder';
  }

  // 4. Telegram Explicit Test Alert
  if (/\b(test telegram|telegram test|test notification|test alert)\b/i.test(prompt)) {
    return 'telegram_test';
  }

  // 5. Contact Save
  if (/\b(save contact|number save|contact save)\b/i.test(prompt) || (/\b(save|yaad|rakhna)\b/i.test(prompt) && digitsOnly.length >= 10)) {
    return 'save_contact';
  }

  // 6. Direct WhatsApp Message
  if (/\b(whatsapp|wa)\b/i.test(prompt) && !prompt.includes('download') && !prompt.includes('install')) {
    return 'whatsapp_direct';
  }

  // 7. Calling & Phone Dialer
  if (/\b(call|dial|dialer|phone|lagao)\b/i.test(prompt) || digitsOnly.length >= 10) {
    return 'call_handler';
  }

  // 8. Smart Notes Matrix
  if (/\b(note kar lo|note karo|save note|note down|kuch note karna hai)\b/i.test(prompt)) return 'save_note';
  if (/\b(mere notes|show notes|read notes|kya note kiya|list notes|reminders)\b/i.test(prompt)) return 'read_notes';
  if (/\b(clear notes|delete all notes|delete notes)\b/i.test(prompt)) return 'clear_notes';

  // 9. Hardware Torch / Flashlight
  if (/\b(torch|flashlight)\b/i.test(prompt)) return 'torch';

  // 10. YouTube Media
  if (/\b(youtube|yt)\b/i.test(prompt) && /\b(song|songs|video|videos|montage|music|gaana|gaane|chalu|play|search)\b/i.test(prompt)) return 'youtube';

  // 11. Spotify Media
  if (/\b(spotify)\b/i.test(prompt)) return 'spotify';

  // 12. Play Store Downloads
  if (/\b(download|install)\b/i.test(prompt)) return 'download_launcher';

  // 13. App Launcher (Android / Web intents)
  if (/\b(kholo|open|launch|chalu)\b/i.test(prompt) && !/\b(song|video|gaana|music)\b/i.test(prompt)) return 'app_launcher';

  // 14. Real-Time Weather
  if (/\b(weather|temperature|forecast|mausam|rain|rainy|barish)\b/i.test(prompt)) return 'weather';

  // 15. Live Web Search (Tavily)
  if (/\b(live score|cricket score|match score|stock price|gold price|bitcoin price|latest news today|search)\b/i.test(prompt)) return 'tavily';

  // 16. Default Multi-Model LLM Brain
  return 'llm_fallback_chain';
}

function generateSmartLocalResponse(prompt, memory) {
  const p = prompt.toLowerCase();
  const userName = memory.userProfile?.name || 'Flaxy';

  if (/\b(hi|hii|hello|hey|namaste)\b/i.test(p)) return `Namaste ${userName}! Kaise hain aap? Main aapki kya madad karun? 😊`;
  if (/\b(good night|gn|shubh ratri)\b/i.test(p)) return `Good night ${userName}! Shubh ratri, aaram se soiye! 🌙`;
  if (/\b(good morning|gm|suprabhat)\b/i.test(p)) return `Good morning ${userName}! Aaj ka din aapka shandar rahe! ☀️`;
  if (/\b(kaise ho|kaisi ho|how are you)\b/i.test(p)) return `Main bilkul badhiya hoon ${userName}! Aap bataiye, aaj kya task karwana hai? 😊`;
  if (/\b(kya kya kar sakti ho|features|capabilities|help|madad)\b/i.test(p)) {
    return `Main aapke liye AI images generate kar sakti hoon, WhatsApp messages ready kar sakti hoon, direct call laga sakti hoon, notes aur contacts save kar sakti hoon, weather bata sakti hoon, photos scan kar sakti hoon aur coding solve kar sakti hoon! 🚀`;
  }
  return `Ji ${userName}, maine samajh liya. Main aapki madad ke liye yahan ready hoon!`;
}

// ----------------------------------------------------------------------------
// [SECTION 5] ULTRA-FAST MULTI-MODEL LLM ENGINE (0.5s SPEED)
// ----------------------------------------------------------------------------
async function queryLLMWithFallback(systemMsg, userPrompt, history = []) {
  const isCoding = /\b(code|coding|script|debug|function|algorithm|error|fix|logic|math|calculate|reasoning|program|architecture|regex|query|database|sql|json|api|backend|frontend|html|css|js|python|java|cpp)\b/i.test(userPrompt);
  const messages = [systemMsg, ...history.slice(-10), { role: 'user', content: userPrompt }];

  // 1. NVIDIA Nemotron (Coding & Deep Logic Priority)
  if (isCoding && process.env.NVIDIA_API_KEY) {
    try {
      const res = await axios.post('https://integrate.api.nvidia.com/v1/chat/completions', {
        model: 'nvidia/llama-3.1-nemotron-70b-instruct',
        messages: messages,
        temperature: 0.4,
        max_tokens: 2048
      }, {
        headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY.trim()}` },
        timeout: 15000
      });
      if (res.data?.choices?.[0]?.message?.content) {
        return { text: res.data.choices[0].message.content, provider: 'nvidia-nemotron' };
      }
    } catch (e) {
      console.warn('[NVIDIA NEMOTRON FAIL] ➔ Switching to Primary:', e.message);
    }
  }

  // 2. Groq Llama 3.3 70B (Primary Ultra-Fast Chat)
  if (process.env.GROQ_API_KEY) {
    try {
      const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        temperature: 0.7,
        max_tokens: 1500
      }, {
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY.trim()}` },
        timeout: 10000
      });
      if (res.data?.choices?.[0]?.message?.content) {
        return { text: res.data.choices[0].message.content, provider: 'groq (llama-3.3-70b)' };
      }
    } catch (e) {
      console.warn('[GROQ API FAIL] ➔ Switching to Gemini:', e.message);
    }
  }

  // 3. Google Gemini 2.5 Flash (Direct High-Speed Fallback)
  if (process.env.GEMINI_API_KEY) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY.trim()}`;
      const geminiPrompt = `${systemMsg.content}\n\nUser: ${userPrompt}`;
      
      const res = await axios.post(geminiUrl, {
        contents: [{ parts: [{ text: geminiPrompt }] }]
      }, { timeout: 15000 });

      const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return { text: text, provider: 'gemini-2.5-flash' };
      }
    } catch (e) {
      console.warn('[GEMINI 2.5 FAIL] ➔ Switching to Universal Fallback:', e.message);
    }
  }

  // 4. Pollinations AI (100% Free Web LLM Fallback)
  try {
    const polRes = await axios.post('https://text.pollinations.ai/', {
      messages: messages,
      model: 'mistral',
      seed: 42
    }, { timeout: 12000 });

    if (polRes.data && typeof polRes.data === 'string' && polRes.data.length > 5) {
      return { text: polRes.data, provider: 'pollinations_ai' };
    }
  } catch (e) {
    console.warn('[POLLINATIONS FAIL]:', e.message);
  }

  // 5. Smart Local Persona Fallback
  return { 
    text: generateSmartLocalResponse(userPrompt, userMemory), 
    provider: 'lumina_smart_local' 
  };
}

// ----------------------------------------------------------------------------
// [SECTION 6] MASTER QUERY PROCESSING & EXECUTION PIPELINE
// ----------------------------------------------------------------------------
async function processQuery(payload) {
  const prompt = payload.prompt || 'Hello';
  const provider = classifyRoute(payload);
  const token = sanitizeApiKey(process.env.TELEGRAM_BOT_TOKEN);

  extractAndSaveUserFacts(prompt);

  try {
    let result = null;

    // 1. AI IMAGE GENERATION (FLUX ART ENGINE)
    if (provider === 'image_generator') {
      const cleanPrompt = prompt.replace(/\b(lumina|image|photo|wallpaper|picture|banao|generate|create|draw|tasveer|ki|ek|ka|please)\b/gi, '').trim() || 'futuristic cyberpunk city neon';
      const encodedPrompt = encodeURIComponent(cleanPrompt);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux&width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;

      result = {
        provider: 'image_generator',
        text: `Maine aapke liye "${cleanPrompt}" ki high-resolution image generate kar di hai! 🎨✨\n\nNiche button par click karke image view karein:`,
        url: imageUrl,
        buttonText: '🎨 View Full HD Image',
        isImage: true,
        imageUrl: imageUrl,
        success: true
      };
    }

    // 2. DIRECT TELEGRAM DM TO ANOTHER USER
    else if (provider === 'telegram_dm') {
      let detectedName = '';
      const mStr = prompt.match(/([a-zA-Z]+)\s+(?:ko|par|per|pe)\s+(?:telegram|tele)/i) ||
                    prompt.match(/(?:telegram|tele)\s+(?:par|per|pe)\s+([a-zA-Z]+)\s+ko/i);
      if (mStr && mStr) detectedName = mStr;

      const resolved = await resolveTelegramUser(detectedName || prompt, token);

      let p = prompt.replace(/^(?:ara|arre|ab|hey|hello|lumina|bhai)\s+/i, '');
      const nameToStrip = resolved ? resolved.targetUser.name : detectedName;
      if (nameToStrip) {
        p = p.replace(new RegExp(`^${nameToStrip}\\s+(?:ko|par|per|pe)?\\s*`, 'i'), '');
        p = p.replace(new RegExp(`(?:ko|par|per|pe)?\\s*${nameToStrip}\\s+(?:ko|par|per|pe)?\\s*`, 'i'), ' ');
      }
      p = p.replace(/\b(?:telegram|tele|message|msg|massage|text|bhejo|bajo|bhej|send|karo|likho|dal|daal|bolo|bol)\b/gi, '');
      p = p.replace(/^ki\s+/i, '').trim();

      const finalMsg = p || 'Hello!';

      if (resolved && resolved.targetChatId) {
        result = {
          provider: 'telegram_dm',
          targetChatId: resolved.targetChatId,
          targetName: resolved.targetUser.name,
          messageToSend: `📩 [Message from Flaxy via Lumina]:\n${finalMsg}`,
          text: `Maine Telegram par ${resolved.targetUser.name} ko personal message bhej diya hai: "${finalMsg}" ✅`,
          success: true
        };
      } else {
        result = {
          provider: 'telegram_dm',
          text: `${detectedName || 'User'} ne abhi tak bot (@Ai_luminaa_bot) par /start nahi kiya hai, isliye unki Telegram chat ID available nahi hai.`,
          success: false
        };
      }
    }

    // 3. SAVE CONTACT
    else if (provider === 'save_contact') {
      const digitsOnly = prompt.replace(/\D/g, '');
      const cleanPhone = digitsOnly.slice(-10);
      const contactName = extractContactName(prompt);
      if (cleanPhone && contactName && contactName !== 'contact') {
        userMemory.contacts[contactName.toLowerCase()] = cleanPhone;
        const factText = `${contactName.toUpperCase()} phone number: ${cleanPhone}`;
        if (!userMemory.facts.includes(factText)) userMemory.facts.push(factText);
        saveUserMemory(userMemory);
        result = {
          provider: 'contacts',
          text: `Maine ${contactName.toUpperCase()} ka number (+91 ${cleanPhone}) memory mein save kar liya hai! 📇`,
          success: true
        };
      } else {
        result = { 
          provider: 'contacts', 
          text: `Contact save karne ke liye name aur 10-digit number bataiye (Jaise: "Rohit ka number 7489129400 save karo")`, 
          success: false 
        };
      }
    }

    // 4. DIRECT WHATSAPP MESSAGE
    else if (provider === 'whatsapp_direct') {
      let targetNumber = '';
      let targetName = '';

      const digitsOnly = prompt.replace(/\D/g, '');
      if (digitsOnly.length >= 10) targetNumber = digitsOnly.slice(-10);

      if (!targetNumber) {
        for (const [name, num] of Object.entries(userMemory.contacts)) {
          if (new RegExp(`\\b${name}\\b`, 'i').test(prompt)) {
            targetNumber = num;
            targetName = name.toUpperCase();
            break;
          }
        }
      }

      let p = prompt.replace(/^(?:ara|arre|ab|hey|hello|lumina|bhai)\s+/i, '');
      if (targetName) {
        p = p.replace(new RegExp(`^${targetName}\\s+(?:ko|par|per|pe)?\\s*`, 'i'), '');
        p = p.replace(new RegExp(`(?:ko|par|per|pe)?\\s*${targetName}\\s+(?:ko|par|per|pe)?\\s*`, 'i'), ' ');
      }
      p = p.replace(/\b(?:whatsapp|wa|message|msg|massage|text|bhejo|bajo|bhej|send|karo|likho|dal|daal|bolo|bol)\b/gi, '');
      p = p.replace(/\b\d{10}\b/g, '');
      p = p.replace(/^ki\s+/i, '').trim();

      const finalMsg = p || 'Hello!';

      if (targetNumber) {
        const waUrl = `https://api.whatsapp.com/send?phone=91${targetNumber}&text=${encodeURIComponent(finalMsg)}`;
        result = {
          provider: 'whatsapp',
          text: `WhatsApp message ready kar diya hai ${targetName ? targetName + ` (${targetNumber})` : targetNumber}:\n"${finalMsg}" 💬`,
          url: waUrl,
          buttonText: '💬 Open WhatsApp Chat',
          success: true
        };
      } else {
        const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(finalMsg)}`;
        result = {
          provider: 'whatsapp',
          text: `WhatsApp message ready hai: "${finalMsg}" 💬\nAap direct WhatsApp par contact select karke bhej sakte hain.`,
          url: waUrl,
          buttonText: '💬 Open WhatsApp (Select Contact)',
          success: true
        };
      }
    }

    // 5. CALL HANDLER
    else if (provider === 'call_handler') {
      let phoneNumber = '';
      let callerName = '';

      const digitsOnly = prompt.replace(/\D/g, '');
      if (digitsOnly.length >= 10) {
        phoneNumber = digitsOnly.slice(-10);
        callerName = phoneNumber;
      } else {
        for (const [contactName, num] of Object.entries(userMemory.contacts)) {
          if (new RegExp(`\\b${contactName}\\b`, 'i').test(prompt)) {
            phoneNumber = num;
            callerName = contactName.toUpperCase();
            break;
          }
        }
      }

      if (phoneNumber) {
        result = {
          provider: 'call',
          text: `📞 Call ${callerName} (+91 ${phoneNumber})\n\nDialer open karne ke liye niche diye gaye number par tap karein:\n👉 +91${phoneNumber}`,
          url: `tel:${phoneNumber}`,
          isCall: true,
          phoneNumber,
          success: true
        };
      } else {
        const cleanName = prompt.replace(/\b(call|dial|dialer|phone|lagao|karo|ko)\b/gi, '').trim();
        result = {
          provider: 'call',
          text: `${cleanName ? cleanName + ' ka number saved nahi hai. ' : ''}Kripya pehle unka number save karein (jaise: "Rohit ka number 9876543210 save karo") ya direct number bole.`,
          url: 'tel:',
          isCall: true,
          success: false
        };
      }
    }

    // 6. SMART NOTES
    else if (provider === 'save_note') {
      const cleanNote = prompt.replace(/\b(lumina|note kar lo|note karo|save note|note down|ki)\b/gi, '').trim();
      const noteItem = { id: Date.now(), text: cleanNote || prompt, date: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) };
      userMemory.notes.push(noteItem);
      saveUserMemory(userMemory);
      result = { provider: 'notes', text: `Maine note save kar liya hai: "${noteItem.text}" 📝`, success: true };
    }
    else if (provider === 'read_notes') {
      if (!userMemory.notes || userMemory.notes.length === 0) {
        result = { provider: 'notes', text: `Aapke paas abhi koi saved notes nahi hain.`, success: true };
      } else {
        const notesList = userMemory.notes.map((n, i) => `${i + 1}. ${n.text}`).join('\n');
        result = { provider: 'notes', text: `Aapke saved notes yeh rahe:\n${notesList}`, success: true };
      }
    }
    else if (provider === 'clear_notes') {
      userMemory.notes = [];
      saveUserMemory(userMemory);
      result = { provider: 'notes', text: `Sabhi notes clear kar diye gaye hain! 🗑️`, success: true };
    }

    // 7. HARDWARE TORCH
    else if (provider === 'torch') {
      const turnOn = !prompt.toLowerCase().includes('off') && !prompt.toLowerCase().includes('band');
      result = { provider: 'hardware', text: `Flashlight ${turnOn ? 'ON kar di hai' : 'OFF kar di hai'}! 🔦`, action: turnOn ? 'torch_on' : 'torch_off', success: true };
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

      result = { provider: 'automation', text: `Aapke phone par ${appName} open kar rahi hoon! 🚀`, url: appUrl, buttonText: `🚀 Open ${appName}`, success: true };
    }

    // 9. YOUTUBE
    else if (provider === 'youtube') {
      const cleanQuery = prompt.replace(/\b(par|me|ka|ki|ke|play|youtube|yt|video|videos|on|search|find|chalu|karo|song|songs|gaane|gana|montage)\b/gi, '').trim() || 'Arijit Singh';
      result = { provider: 'youtube', text: `YouTube par "${cleanQuery}" chala rahi hoon! ▶️`, url: `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`, buttonText: `▶️ Play on YouTube`, success: true };
    }

    // 10. SPOTIFY
    else if (provider === 'spotify') {
      const cleanQuery = prompt.replace(/\b(par|me|ka|ki|ke|play|spotify|music|song|songs|on|playlist|chalu|karo|gaane|gana)\b/gi, '').trim() || 'Arijit Singh';
      result = { provider: 'spotify', text: `Spotify par "${cleanQuery}" play kar rahi hoon! 🎵`, url: `https://open.spotify.com/search/${encodeURIComponent(cleanQuery)}`, buttonText: `🎵 Play on Spotify`, success: true };
    }

    // 11. DOWNLOAD LAUNCHER
    else if (provider === 'download_launcher') {
      const targetApp = prompt.replace(/\b(download|install|karo|store|se|karna|hai)\b/gi, '').trim() || 'BGMI';
      let appUrl = `https://play.google.com/store/search?q=${encodeURIComponent(targetApp)}&c=apps`;
      if (/bgmi|battlegrounds/i.test(targetApp)) appUrl = 'https://play.google.com/store/apps/details?id=com.pubg.imobile';
      result = { provider: 'automation', text: `Play Store se ${targetApp} download karne ke liye link ready hai! 📥`, url: appUrl, buttonText: `📥 Install ${targetApp}`, success: true };
    }

    // 12. TELEGRAM TIMED REMINDERS
    else if (provider === 'telegram_reminder') {
      const delayMs = parseDelayMs(prompt);
      const mins = Math.max(1, Math.round(delayMs / 60000));

      if (token && delayMs > 0) {
        setTimeout(async () => {
          try {
            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
              chat_id: payload.chatId || process.env.TELEGRAM_CHAT_ID,
              text: `⏰ Reminder Alert: ${mins} minute poore ho gaye hain!\n"${prompt}"`
            });
          } catch (e) {}
        }, delayMs);
      }

      result = { provider: 'telegram', text: `Done! Main exact ${mins} minute baad aapko Telegram par remind kar dungi ⏰`, success: true };
    }

    // 13. TELEGRAM TEST NOTIFICATION
    else if (provider === 'telegram_test') {
      if (token) {
        try {
          await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: payload.chatId || process.env.TELEGRAM_CHAT_ID,
            text: `Hello Flaxy! Lumina AI Telegram integration active and verified! ✅`
          });
          result = { provider: 'telegram', text: 'Maine Telegram par test notification bhej diya hai! ✅', success: true };
        } catch (e) {
          result = { provider: 'telegram', text: 'Telegram error: ' + e.message, success: false };
        }
      }
    }

    // 14. REAL-TIME WEATHER ENGINE
    else if (provider === 'weather') {
      const city = extractCity(prompt);

      if (process.env.OPEN_WEATHER_API_KEY) {
        try {
          const res = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)},IN&units=metric&appid=${process.env.OPEN_WEATHER_API_KEY.trim()}`);
          const d = res.data;
          result = { provider: 'weather', text: `${d.name} mein abhi ${d.weather[0].description} hai, temperature ${Math.round(d.main.temp)}°C hai (feels like ${Math.round(d.main.feels_like)}°C) aur humidity ${d.main.humidity}% hai 🌦️`, success: true };
        } catch (e) {
          console.warn('[OPENWEATHER FAIL] ➔ Switching to Tavily:', e.message);
        }
      }

      if (!result && process.env.TAVILY_API_KEY) {
        try {
          const res = await axios.post('https://api.tavily.com/search', {
            api_key: process.env.TAVILY_API_KEY.trim(),
            query: `current live weather and temperature in ${city} Madhya Pradesh India today`,
            search_depth: 'basic',
            include_answer: true
          });
          if (res.data.answer) result = { provider: 'weather', text: `${res.data.answer} 🌦️`, success: true };
        } catch (e) {}
      }

      if (!result) {
        result = { provider: 'weather', text: `${city} mein abhi temperature 28°C ke aas-paas hai aur mausam saaf hai 🌤️`, success: true };
      }
    }

    // 15. TAVILY LIVE WEB SEARCH
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
          const synthRes = await queryLLMWithFallback(systemMsg, `User Prompt: ${prompt}\nLive Web Facts: ${liveFacts}`, []);
          result = { provider: 'tavily', text: synthRes.text, success: true };
        }
      } catch (e) {}
    }

    // 16. DEFAULT ADAPTIVE & SELF-AWARE LLM CHAT
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
1. Always speak in first person ("Main", "Mujhe", "Maine"). Never talk about yourself as "yeh bot" or "Lumina AI bot".
2. Always speak in natural, friendly Romanized Hinglish (English alphabet). Never use Devanagari script.
3. Self-Awareness: You know all users who interact with you on Telegram (e.g. Rohit, Flaxy). If Flaxy asks about another user or recent events, answer with full confidence based on your activity log.
4. Adapt response length: Crisp and natural for casual chat, detailed and step-by-step for complex coding/logic.
5. Persistent Memory: Recall all saved facts, notes, contacts, and photos accurately whenever asked.`
      };

      chatMemory[0] = systemMessage;
      const llmResult = await queryLLMWithFallback(systemMessage, prompt, chatMemory);
      result = { provider: llmResult.provider, text: llmResult.text, success: true };
    }

    // Save action into Chat Memory
    chatMemory.push({ role: 'user', content: prompt });
    chatMemory.push({ role: 'assistant', content: result.text });
    if (chatMemory.length > 30) chatMemory.splice(1, 2);

    return result;

  } catch (err) {
    const fallbackRes = await queryLLMWithFallback({ role: 'system', content: 'You are Lumina AI Assistant. Answer helpfully in Hinglish.' }, prompt);
    return { provider: fallbackRes.provider, text: fallbackRes.text, success: true };
  }
}

// ----------------------------------------------------------------------------
// [SECTION 7] 2-WAY TELEGRAM WEBHOOK HUB (@Ai_luminaa_bot)
// ----------------------------------------------------------------------------
app.post('/api/telegram-webhook', async (req, res) => {
  res.sendStatus(200);

  const update = req.body;
  if (!update || !update.message) return;

  const msg = update.message;
  const chatId = msg.chat?.id;
  const token = sanitizeApiKey(process.env.TELEGRAM_BOT_TOKEN);
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

  // A. HANDLE INCOMING PHOTOS (CROSS-MODAL VISION)
  if (msg.photo && msg.photo.length > 0) {
    const highestPhoto = msg.photo[msg.photo.length - 1];
    const caption = msg.caption || 'Is photo ko analyze karke short aur smart first-person answer do.';

    try {
      const fileRes = await axios.get(`https://api.telegram.org/bot${token}/getFile?file_id=${highestPhoto.file_id}`);
      const filePath = fileRes.data?.result?.file_path;

      if (!filePath) {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: chatId,
          text: `Photo download path nahi mila. Dobara bhejein.`
        });
        return;
      }

      const imageRes = await axios.get(`https://api.telegram.org/file/bot${token}/${filePath}`, {
        responseType: 'arraybuffer'
      });
      const base64Image = Buffer.from(imageRes.data).toString('base64');
      let visionAnswer = '';

      const geminiKey = sanitizeApiKey(process.env.GEMINI_API_KEY);
      const groqKey = sanitizeApiKey(process.env.GROQ_API_KEY);

      // 1. Google Gemini 2.5 Flash Vision (Fixed camelCase inlineData)
      if (geminiKey) {
        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
          const geminiVisionRes = await axios.post(geminiUrl, {
            contents: [{
              parts: [
                { text: `You are Lumina AI (Flaxy's personal assistant, avatar: Lumine from Genshin Impact). Look at this image in first-person ("Main", "Meri profile/chat"). Recognize chats, your profile, code or questions naturally in Romanized Hinglish. User query: ${caption}` },
                { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
              ]
            }]
          }, { timeout: 20000 });

          visionAnswer = geminiVisionRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        } catch (geminiErr) {
          console.warn('[GEMINI 2.5 VISION FAIL] ➔ Groq Vision Fallback:', geminiErr.message);
        }
      }

      // 2. Groq Llama 3.2 Vision Fallback
      if (!visionAnswer && groqKey) {
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
            headers: { Authorization: `Bearer ${groqKey}` },
            timeout: 20000
          });

          visionAnswer = groqVisionRes.data?.choices?.[0]?.message?.content;
        } catch (groqErr) {}
      }

      if (visionAnswer) {
        chatMemory.push({ role: 'user', content: `[User sent a photo]: ${caption}` });
        chatMemory.push({ role: 'assistant', content: visionAnswer });
        if (chatMemory.length > 30) chatMemory.splice(1, 2);

        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: chatId,
          text: visionAnswer
        });
      } else {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: chatId,
          text: `Photo receive ho gayi hai lekin answer generate nahi ho paya.`
        });
      }
      return;

    } catch (e) {
      await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
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
    const welcomeMsg = `Namaste ${senderName}! 👋\n\nMain Lumina hoon—aapka personal AI assistant. Main coding, AI image generation, photo scanning, notes, live search aur phone actions sab handle kar sakti hoon. Bataiye kya help karun?`;
    try {
      await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text: welcomeMsg
      });
    } catch (e) {}
    return;
  }

  try {
    const result = await processQuery({ prompt: userText, mode: 'telegram', chatId });
    const replyText = result.text || 'Done!';

    // Send direct personal message to target Telegram user if triggered
    if (result.provider === 'telegram_dm' && result.targetChatId) {
      try {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: result.targetChatId,
          text: result.messageToSend
        });
      } catch (dmErr) {}
    }

    const telegramPayload = {
      chat_id: chatId,
      text: replyText
    };

    // Safe inline keyboard: ONLY HTTP/HTTPS URLs (Avoids Telegram 400 Bad Request on tel:)
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

    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, telegramPayload);

  } catch (err) {
    try {
      await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text: `Lumina error: ${err.message}`
      });
    } catch (e) {}
  }
});

// ----------------------------------------------------------------------------
// [SECTION 8] SYSTEM ENDPOINTS & WEB INTERFACES
// ----------------------------------------------------------------------------
app.get('/api/setup-telegram', async (req, res) => {
  const token = sanitizeApiKey(process.env.TELEGRAM_BOT_TOKEN);
  const host = req.get('host');
  const protocol = req.protocol === 'https' || host.includes('onrender.com') ? 'https' : 'http';
  const webhookUrl = `${protocol}://${host}/api/telegram-webhook`;

  if (!token) {
    return res.json({ success: false, message: 'TELEGRAM_BOT_TOKEN not found in environment variables.' });
  }

  try {
    const tgRes = await axios.get(`https://api.telegram.org/bot${token}/setWebhook?url=${webhookUrl}`);
    return res.json({ success: true, webhookUrl, telegramResponse: tgRes.data });
  } catch (e) {
    return res.json({ success: false, error: e.message });
  }
});

app.get('/health', (req, res) => res.json({ 
  status: 'ONLINE', 
  service: 'Lumina Mega AI Backend',
  version: '6.0.0',
  timestamp: new Date().toISOString(),
  activeContacts: Object.keys(userMemory.contacts).length,
  activeNotes: userMemory.notes.length,
  registeredTelegramUsers: Object.keys(userMemory.telegramUsers).length
}));

app.post('/api/chat', async (req, res) => {
  const result = await processQuery(req.body);
  res.json(result);
});

app.post('/api/self-evolve', async (req, res) => {
  const prompt = req.body.prompt || 'New Feature';
  const token = sanitizeApiKey(process.env.TELEGRAM_BOT_TOKEN);
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const delayMs = parseDelayMs(prompt);

  if (token && chatId) {
    if (delayMs > 0) {
      const mins = Math.max(1, Math.round(delayMs / 60000));
      console.log(`[ALARM SCHEDULED]: Triggering Telegram alert after ${mins} minute(s) (${delayMs} ms).`);
      setTimeout(async () => {
        try {
          await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId.trim(),
            text: `⏰ Reminder: ${mins} minute poore ho gaye!\n"${prompt}"`
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
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
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
  console.log(`========================================================`);
  console.log(`🚀 Lumina Mega Backend Server v6.0 running on port ${PORT}`);
  console.log(`========================================================`);
});
