/**
 * Lumina AI Assistant - Production 10/10 Optimized Server (v4.2)
 * Built for Flaxy (Nepanagar, MP)
 * 
 * Hierarchy:
 *   1. Google Gemini 2.5 Flash (Primary High-Speed Brain)
 *   2. NVIDIA Nemotron 70B (Deep Reasoning & Coding Fallback)
 *   3. Groq Llama 3.3 (Fast Fallback)
 *   4. Pollinations Mistral (Universal Free Fallback)
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
      if (!data.userProfile) data.userProfile = { home: 'Nepanagar, MP', name: 'Flaxy' };
      return data;
    }
  } catch (e) {}
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
  try { fs.writeFileSync(MEMORY_FILE, JSON.stringify(memoryData, null, 2), 'utf8'); } catch (e) {}
}

let userMemory = loadUserMemory();

const chatMemory = [
  { role: 'system', content: 'You are Lumina, Flaxy\'s personal self-aware AI Assistant (Telegram avatar: Lumine from Genshin Impact). Speak naturally, warmly, and smartly in first-person Romanized Hinglish (English alphabet). Never write in Devanagari script.' }
];

function sanitizeApiKey(key) {
  if (!key) return '';
  return key.replace(/["'\s]/g, '').trim();
}

// -------------------------------------------------------------
// HELPER FUNCTIONS & SAFE EXTRACTORS
// -------------------------------------------------------------
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

  const [, c1 = ''] = prompt.match(/(?:weather|mausam|temperature)(?:\s+in|\s+for|\s+of|\s+ka|\s+ki)?\s+([a-zA-Z]+)/i) || [];
  if (c1 && c1.length >= 3 && !['kaisa', 'aaj', 'today', 'batao', 'hai', 'kya'].includes(c1.toLowerCase())) {
    return c1;
  }

  const [, c2 = ''] = prompt.match(/([a-zA-Z]+)\s+(?:ka|ki|me|main)\s+(?:weather|mausam)/i) || [];
  if (c2 && c2.length >= 3 && !['kaisa', 'aaj', 'today', 'batao', 'hai', 'kya'].includes(c2.toLowerCase())) {
    return c2;
  }

  return userMemory.userProfile?.home?.split(',')[0] || 'Nepanagar';
}

function extractContactFromPrompt(prompt) {
  const digitsOnly = prompt.replace(/\D/g, '');
  if (digitsOnly.length < 10) return null;
  const cleanPhone = digitsOnly.slice(-10);

  const stopWords = new Set([
    'ara', 'arre', 'ab', 'abhi', 'ma', 'main', 'mera', 'meri', 'mere', 'uska', 'uski', 'usko', 'iska', 'iski', 'isko', 
    'dost', 'save', 'karo', 'kar', 'lo', 'number', 'phone', 'call', 'flaxy', 'lumina', 'hain', 'mein', 'rakhna', 'rakho', 'apni', 
    'memory', 'yad', 'yaad', 'batao', 'kuch', 'bara', 'baare', 'puch', 'raha', 'hoon', 'hai', 'he', 'to', 'toh', 'bhai', 'bro', 'friend'
  ]);

  let name = '';
  const p = prompt.toLowerCase();
  
  const [, m1 = ''] = p.match(/([a-zA-Z]+)\s+(?:mara|mera|ka|ki|ke)\s+(?:dost|friend|bhai|bro)/i) || [];
  if (m1 && m1.length >= 3 && !stopWords.has(m1)) name = m1;

  if (!name) {
    const [, m2 = ''] = p.match(/([a-zA-Z]+)\s+(?:ka|ki|ke)\s+number/i) || [];
    if (m2 && m2.length >= 3 && !stopWords.has(m2)) name = m2;
  }

  if (!name) {
    const [, m3 = ''] = p.match(/(?:dost|friend|bhai|bro)\s+([a-zA-Z]+)/i) || [];
    if (m3 && m3.length >= 3 && !stopWords.has(m3)) name = m3;
  }

  if (!name) {
    const [, m4 = ''] = p.match(/(?:save|contact)\s+([a-zA-Z]+)/i) || [];
    if (m4 && m4.length >= 3 && !stopWords.has(m4)) name = m4;
  }

  if (!name) {
    const words = p.split(/\s+/);
    for (const w of words) {
      const clean = w.replace(/[^a-zA-Z]/g, '');
      if (clean.length >= 3 && !stopWords.has(clean)) {
        name = clean;
        break;
      }
    }
  }

  return { name: name || 'contact', phone: cleanPhone };
}

function extractAndSaveUserFacts(prompt) {
  let updated = false;

  const [, extractedName = ''] = prompt.match(/mera naam ([a-zA-Z\s]+) (?:hai|h)/i) || prompt.match(/my name is ([a-zA-Z\s]+)/i) || [];
  if (extractedName && extractedName.trim()) {
    const cleanName = extractedName.trim();
    userMemory.userProfile.name = cleanName;
    if (!userMemory.facts.includes(`User name: ${cleanName}`)) {
      userMemory.facts.push(`User name: ${cleanName}`);
    }
    updated = true;
  }

  const [, extractedHome = ''] = prompt.match(/mera ghar ([a-zA-Z\s]+) (?:me|main|par) (?:hai|h)/i) || prompt.match(/i live in ([a-zA-Z\s]+)/i) || [];
  if (extractedHome && extractedHome.trim()) {
    const cleanHome = extractedHome.trim();
    userMemory.userProfile.home = cleanHome;
    if (!userMemory.facts.includes(`User home: ${cleanHome}`)) {
      userMemory.facts.push(`User home: ${cleanHome}`);
    }
    updated = true;
  }

  const digitsOnly = prompt.replace(/\D/g, '');
  if (digitsOnly.length >= 10) {
    const hasSaveIntent = /\b(save|yaad|rakhna|rakho|number|contact|dost)\b/i.test(prompt);
    if (hasSaveIntent) {
      const c = extractContactFromPrompt(prompt);
      if (c && c.name && c.name !== 'contact') {
        userMemory.contacts[c.name.toLowerCase()] = c.phone;
        const factText = `${c.name.toUpperCase()} phone number: ${c.phone}`;
        if (!userMemory.facts.includes(factText)) {
          userMemory.facts.push(factText);
        }
        updated = true;
      }
    }
  }

  const [, factMatch = ''] = prompt.match(/(?:yaad rakhna|remember that|save that|yaad rakho)(?:\s+ki)?\s+(.+)/i) || [];
  if (factMatch && factMatch.trim()) {
    const fact = factMatch.trim();
    if (fact && !userMemory.facts.includes(fact)) {
      userMemory.facts.push(fact);
      updated = true;
    }
  }

  if (updated) saveUserMemory(userMemory);
}

function parseDelayMs(prompt = '') {
  let delayMinutes = 0;
  const [, numStr = ''] = prompt.match(/(\d+)\s*(?:minute|minutes|min|mins|sec|seconds|hour|hours|ghante)/i) || [];
  if (numStr) {
    const num = parseInt(numStr, 10);
    const lower = prompt.toLowerCase();
    if (lower.includes('hour') || lower.includes('ghante')) delayMinutes = num * 60;
    else if (lower.includes('sec')) delayMinutes = num / 60;
    else delayMinutes = num;
  }
  return delayMinutes * 60 * 1000;
}

// -------------------------------------------------------------
// DYNAMIC TELEGRAM USER RESOLVER
// -------------------------------------------------------------
async function resolveTelegramUser(targetName, token) {
  for (const [chatId, u] of Object.entries(userMemory.telegramUsers)) {
    if (new RegExp(`\\b${u.name}\\b`, 'i').test(targetName) || (u.username && new RegExp(`\\b${u.username}\\b`, 'i').test(targetName))) {
      return { targetUser: u, targetChatId: chatId };
    }
  }

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

// -------------------------------------------------------------
// INTELLIGENT ROUTER
// -------------------------------------------------------------
function classifyRoute(payload) {
  const prompt = (payload.prompt || '').toLowerCase();
  const digitsOnly = prompt.replace(/\D/g, '');

  if (/\b(save contact|number save|contact save|save|yaad|rakhna|rakho)\b/i.test(prompt) && (/\b(number|contact|phone|dost)\b/i.test(prompt) || digitsOnly.length >= 10)) {
    if (digitsOnly.length >= 10) return 'save_contact';
  }

  if (/\b(telegram|tele)\b/i.test(prompt) && /\b(message|msg|massage|bhejo|bajo|bhej|send|karo|bolo|bol|text)\b/i.test(prompt)) {
    return 'telegram_dm';
  }

  if (/\b(reminder|remind|alarm|yaad dilana|yaad dilao|alert)\b/i.test(prompt) && /\b(minute|minutes|min|mins|hour|hours|ghante|sec|seconds)\b/i.test(prompt)) {
    return 'telegram_reminder';
  }

  if (/\b(test telegram|telegram test|test notification|test alert)\b/i.test(prompt)) {
    return 'telegram_test';
  }

  if (/\b(whatsapp|wa)\b/i.test(prompt) && !prompt.includes('download') && !prompt.includes('install')) {
    return 'whatsapp_direct';
  }

  if (/\b(call|dial|dialer|phone|lagao)\b/i.test(prompt) && (/\b(karo|lagao|ko|par|dial)\b/i.test(prompt) || digitsOnly.length >= 10)) {
    return 'call_handler';
  }

  if (/\b(note kar lo|note karo|save note|note down|kuch note karna hai)\b/i.test(prompt)) return 'save_note';
  if (/\b(mere notes|show notes|read notes|kya note kiya|list notes|reminders)\b/i.test(prompt)) return 'read_notes';
  if (/\b(clear notes|delete all notes|delete notes)\b/i.test(prompt)) return 'clear_notes';

  if (/\b(torch|flashlight)\b/i.test(prompt)) return 'torch';
  if (/\b(youtube|yt)\b/i.test(prompt) && /\b(song|songs|video|videos|montage|music|gaana|gaane|chalu|play|search)\b/i.test(prompt)) return 'youtube';
  if (/\b(spotify)\b/i.test(prompt)) return 'spotify';
  if (/\b(download|install)\b/i.test(prompt)) return 'download_launcher';
  if (/\b(kholo|open|launch|chalu)\b/i.test(prompt) && !/\b(song|video|gaana|music)\b/i.test(prompt)) return 'app_launcher';
  if (/\b(weather|temperature|forecast|mausam|rain|rainy|barish)\b/i.test(prompt)) return 'weather';
  if (/\b(live score|cricket score|match score|stock price|gold price|bitcoin price|latest news today)\b/i.test(prompt)) return 'tavily';

  return 'llm_fallback_chain';
}

function generateSmartLocalResponse(prompt, memory) {
  const p = prompt.toLowerCase();
  const userName = memory.userProfile?.name || 'Flaxy';

  if (/\b(hi|hii|hello|hey|namaste)\b/i.test(p)) {
    return `Namaste ${userName}! Kaise hain aap? Main aapki kya madad karun?`;
  }
  if (/\b(good night|gn|shubh ratri)\b/i.test(p)) {
    return `Good night ${userName}! Shubh ratri, aaram se soiye! 🌙`;
  }
  if (/\b(good morning|gm|suprabhat)\b/i.test(p)) {
    return `Good morning ${userName}! Aaj ka din aapka shandar rahe! ☀️`;
  }
  if (/\b(kaise ho|kaisi ho|how are you)\b/i.test(p)) {
    return `Main bilkul badhiya hoon ${userName}! Aap bataiye, aaj kya task karwana hai? 😊`;
  }
  if (/\b(kya kya kar sakti ho|features|capabilities|help|madad)\b/i.test(p)) {
    return `Main aapke liye WhatsApp messages ready kar sakti hoon, direct call laga sakti hoon, notes aur contacts save kar sakti hoon, weather bata sakti hoon, photos scan kar sakti hoon aur coding solve kar sakti hoon!`;
  }
  return `Ji ${userName}, maine samajh liya. Main aapki madad ke liye yahan ready hoon!`;
}

// -------------------------------------------------------------
// 4-TIER MULTI-MODEL ENGINE (GEMINI ➔ NVIDIA ➔ GROQ ➔ POLLINATIONS)
// -------------------------------------------------------------
async function queryLLMWithFallback(systemMsg, userPrompt, history = []) {
  const geminiKey = sanitizeApiKey(process.env.GEMINI_API_KEY);
  const nvidiaKey = sanitizeApiKey(process.env.NVIDIA_API_KEY);
  const groqKey = sanitizeApiKey(process.env.GROQ_API_KEY);

  const messages = [systemMsg, ...history.slice(-10), { role: 'user', content: userPrompt }];

  // Tier 1: Google Gemini 2.5 Flash & 1.5 Flash (Primary High-Speed Brain)
  if (geminiKey) {
    const geminiModels = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash'];
    for (const model of geminiModels) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
        const geminiPrompt = `${systemMsg.content}\n\nUser: ${userPrompt}`;
        
        const res = await axios.post(geminiUrl, {
          contents: [{ parts: [{ text: geminiPrompt }] }]
        }, { timeout: 12000 });

        const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return { text: text, provider: `gemini (${model})` };
        }
      } catch (e) {
        console.warn(`[GEMINI ${model} FAIL] ➔ ${e.message}`);
      }
    }
  }

  // Tier 2: NVIDIA Nemotron 70B (Deep Reasoning & Coding Fallback)
  if (nvidiaKey) {
    try {
      const res = await axios.post('https://integrate.api.nvidia.com/v1/chat/completions', {
        model: 'nvidia/llama-3.1-nemotron-70b-instruct',
        messages: messages,
        temperature: 0.4,
        max_tokens: 2048
      }, {
        headers: { Authorization: `Bearer ${nvidiaKey}` },
        timeout: 12000
      });

      if (res.data?.choices?.[0]?.message?.content) {
        return { text: res.data.choices[0].message.content, provider: 'nvidia-nemotron' };
      }
    } catch (e) {
      console.warn(`[NVIDIA NEMOTRON FAIL] ➔ ${e.message}`);
    }
  }

  // Tier 3: Groq (Llama 3.3 70B / 8B Fallback)
  if (groqKey) {
    const groqModels = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'llama3-70b-8192'];
    for (const model of groqModels) {
      try {
        const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
          model: model,
          messages: messages,
          temperature: 0.7,
          max_tokens: 1500
        }, {
          headers: { Authorization: `Bearer ${groqKey}` },
          timeout: 10000
        });

        if (res.data?.choices?.[0]?.message?.content) {
          return { text: res.data.choices[0].message.content, provider: `groq (${model})` };
        }
      } catch (e) {
        console.warn(`[GROQ ${model} FAIL] ➔ ${e.message}`);
      }
    }
  }

  // Tier 4: Pollinations AI (100% Free Web Fallback)
  try {
    const polPrompt = `${systemMsg.content}\n\nUser: ${userPrompt}`;
    const polRes = await axios.get(`https://text.pollinations.ai/${encodeURIComponent(polPrompt)}?model=mistral`, { timeout: 12000 });

    if (polRes.data && typeof polRes.data === 'string' && polRes.data.length > 5) {
      return { text: polRes.data, provider: 'pollinations_ai (free)' };
    }
  } catch (e) {
    console.warn(`[POLLINATIONS FAIL] ➔ ${e.message}`);
  }

  // Tier 5: Smart Local Contextual Response
  return { 
    text: generateSmartLocalResponse(userPrompt, userMemory), 
    provider: 'lumina_smart_local' 
  };
}

// -------------------------------------------------------------
// MAIN QUERY PROCESSING ENGINE
// -------------------------------------------------------------
async function processQuery(payload) {
  const prompt = payload.prompt || 'Hello';
  const provider = classifyRoute(payload);
  const token = sanitizeApiKey(process.env.TELEGRAM_BOT_TOKEN);

  extractAndSaveUserFacts(prompt);

  try {
    let result = null;

    // 1. SAVE CONTACT
    if (provider === 'save_contact') {
      const c = extractContactFromPrompt(prompt);
      if (c && c.name && c.phone) {
        userMemory.contacts[c.name.toLowerCase()] = c.phone;
        const factText = `${c.name.toUpperCase()} phone number: ${c.phone}`;
        if (!userMemory.facts.includes(factText)) {
          userMemory.facts.push(factText);
        }
        saveUserMemory(userMemory);
        result = {
          provider: 'contacts',
          text: `Maine ${c.name.toUpperCase()} ka number (+91 ${c.phone}) memory mein save kar liya hai! 📇`,
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

    // 2. DIRECT TELEGRAM DM TO ANOTHER USER
    else if (provider === 'telegram_dm') {
      let detectedName = '';
      const [, mStr = ''] = prompt.match(/([a-zA-Z]+)\s+(?:ko|par|per|pe)\s+(?:telegram|tele)/i) ||
                            prompt.match(/(?:telegram|tele)\s+(?:par|per|pe)\s+([a-zA-Z]+)\s+ko/i) || [];
      if (mStr) detectedName = mStr;

      const resolved = await resolveTelegramUser(detectedName || prompt, token);

      let p = prompt.replace(/^(?:ara|arre|ab|hey|hello|lumina|bhai)\s+/i, '');
      const nameToStrip = resolved ? resolved.targetUser.name : detectedName;
      if (nameToStrip) {
        p = p.replace(new RegExp(`^${nameToStrip}\\s+(?:ko|par|per|pe)?\\s*`, 'i'), '');
        p = p.replace(new RegExp(`(?:ko|par|per|pe)?\\s*${nameToStrip}\\s+(?:ko|par|per|pe)?\\s*`, 'i'), ' ');
      }
      p = p.replace(/\b(?:telegram|tele)\s+(?:par|per|pe|me|main)?\s*/gi, '');
      p = p.replace(/\s+(?:telegram|tele)\s+(?:par|per|pe|me|main)?$/gi, '');
      p = p.replace(/\b(?:message|msg|massage|text)\s+(?:karo|bhejo|bajo|bhej|send|likho|dal|daal)?\s*/gi, '');
      p = p.replace(/\b(?:bhejo|bajo|bhej|send|karo|likho|daal|dal|bolo|bol)\b/gi, '');
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

    // 3. DIRECT WHATSAPP MESSAGE
    else if (provider === 'whatsapp_direct') {
      let targetNumber = '';
      let targetName = '';

      const digitsOnly = prompt.replace(/\D/g, '');
      if (digitsOnly.length >= 10) {
        targetNumber = digitsOnly.slice(-10);
      }

      if (!targetNumber) {
        for (const [name, num] of Object.entries(userMemory.contacts)) {
          if (new RegExp(`\\b${name}\\b`, 'i').test(prompt)) {
            targetNumber = num;
            targetName = name.toUpperCase();
            break;
          }
        }
      }

      let detectedUnsavedName = '';
      if (!targetNumber && !targetName) {
        const [, mUnsaved = ''] = prompt.match(/([a-zA-Z]+)\s+(?:ko|par|per|pe)\s+(?:whatsapp|wa)/i) ||
                                  prompt.match(/(?:whatsapp|wa)\s+(?:par|per|pe)\s+([a-zA-Z]+)\s+ko/i) || [];
        if (mUnsaved) detectedUnsavedName = mUnsaved;
      }

      let p = prompt.replace(/^(?:ara|arre|ab|hey|hello|lumina|bhai)\s+/i, '');
      const nameToStrip = targetName || detectedUnsavedName;
      if (nameToStrip) {
        p = p.replace(new RegExp(`^${nameToStrip}\\s+(?:ko|par|per|pe)?\\s*`, 'i'), '');
        p = p.replace(new RegExp(`(?:ko|par|per|pe)?\\s*${nameToStrip}\\s+(?:ko|par|per|pe)?\\s*`, 'i'), ' ');
      }
      p = p.replace(/\b(?:whatsapp|wa)\s+(?:par|per|pe|me|main)?\s*/gi, '');
      p = p.replace(/\s+(?:whatsapp|wa)\s+(?:par|per|pe|me|main)?$/gi, '');
      p = p.replace(/\b(?:message|msg|massage|text)\s+(?:karo|bhejo|bajo|bhej|send|likho|dal|daal)?\s*/gi, '');
      p = p.replace(/\b(?:bhejo|bajo|bhej|send|karo|likho|daal|dal|bolo|bol)\b/gi, '');
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
          text: `${detectedUnsavedName ? detectedUnsavedName + ' ka number saved nahi hai. ' : ''}WhatsApp message ready hai: "${finalMsg}" 💬\nAap direct WhatsApp par contact select karke bhej sakte hain.`,
          url: waUrl,
          buttonText: '💬 Open WhatsApp (Select Contact)',
          success: true
        };
      }
    }

    // 4. CALL HANDLER
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

    // 5. SMART NOTES SAVE
    else if (provider === 'save_note') {
      const cleanNote = prompt.replace(/\b(lumina|note kar lo|note karo|save note|note down|ki)\b/gi, '').trim();
      const noteItem = {
        id: Date.now(),
        text: cleanNote || prompt,
        date: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      };
      userMemory.notes.push(noteItem);
      saveUserMemory(userMemory);
      result = {
        provider: 'notes',
        text: `Maine note save kar liya hai: "${noteItem.text}" 📝`,
        success: true
      };
    }

    // 6. READ NOTES
    else if (provider === 'read_notes') {
      if (!userMemory.notes || userMemory.notes.length === 0) {
        result = { provider: 'notes', text: `Aapke paas abhi koi saved notes nahi hain.`, success: true };
      } else {
        const notesList = userMemory.notes.map((n, i) => `${i + 1}. ${n.text}`).join('\n');
        result = {
          provider: 'notes',
          text: `Aapke saved notes yeh rahe:\n${notesList}`,
          success: true
        };
      }
    }

    // 7. CLEAR NOTES
    else if (provider === 'clear_notes') {
      userMemory.notes = [];
      saveUserMemory(userMemory);
      result = { provider: 'notes', text: `Sabhi notes clear kar diye gaye hain! 🗑️`, success: true };
    }

    // 8. HARDWARE TORCH
    else if (provider === 'torch') {
      const turnOn = !prompt.toLowerCase().includes('off') && !prompt.toLowerCase().includes('band');
      result = {
        provider: 'hardware',
        text: `Flashlight ${turnOn ? 'ON kar di hai' : 'OFF kar di hai'}! 🔦`,
        action: turnOn ? 'torch_on' : 'torch_off',
        success: true
      };
    }

    // 9. APP LAUNCHER
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
        provider: 'automation',
        text: `Aapke phone par ${appName} open kar rahi hoon! 🚀`,
        url: appUrl,
        buttonText: `🚀 Open ${appName}`,
        success: true
      };
    }

    // 10. YOUTUBE
    else if (provider === 'youtube') {
      const cleanQuery = prompt.replace(/\b(par|me|ka|ki|ke|play|youtube|yt|video|videos|on|search|find|chalu|karo|song|songs|gaane|gana|montage)\b/gi, '').trim() || 'Arijit Singh';
      const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`;
      result = {
        provider: 'youtube',
        text: `YouTube par "${cleanQuery}" chala rahi hoon! ▶️`,
        url: ytUrl,
        buttonText: `▶️ Play on YouTube`,
        success: true
      };
    }

    // 11. SPOTIFY
    else if (provider === 'spotify') {
      const cleanQuery = prompt.replace(/\b(par|me|ka|ki|ke|play|spotify|music|song|songs|on|playlist|chalu|karo|gaane|gana)\b/gi, '').trim() || 'Arijit Singh';
      const spUrl = `https://open.spotify.com/search/${encodeURIComponent(cleanQuery)}`;
      result = {
        provider: 'spotify',
        text: `Spotify par "${cleanQuery}" play kar rahi hoon! 🎵`,
        url: spUrl,
        buttonText: `🎵 Play on Spotify`,
        success: true
      };
    }

    // 12. PLAY STORE DOWNLOAD
    else if (provider === 'download_launcher') {
      const targetApp = prompt.replace(/\b(download|install|karo|store|se|karna|hai)\b/gi, '').trim() || 'BGMI';
      let appUrl = `https://play.google.com/store/search?q=${encodeURIComponent(targetApp)}&c=apps`;
      if (/bgmi|battlegrounds/i.test(targetApp)) appUrl = 'https://play.google.com/store/apps/details?id=com.pubg.imobile';
      result = {
        provider: 'automation',
        text: `Play Store se ${targetApp} download karne ke liye link ready hai! 📥`,
        url: appUrl,
        buttonText: `📥 Install ${targetApp}`,
        success: true
      };
    }

    // 13. TELEGRAM REMINDERS
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

      result = {
        provider: 'telegram',
        text: `Done! Main exact ${mins} minute baad aapko Telegram par remind kar dungi ⏰`,
        success: true
      };
    }

    // 14. TELEGRAM TEST NOTIFICATION
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

    // 15. WEATHER (OpenWeatherMap + Tavily fallback)
    else if (provider === 'weather') {
      const city = extractCity(prompt);

      if (process.env.OPEN_WEATHER_API_KEY) {
        try {
          const res = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)},IN&units=metric&appid=${process.env.OPEN_WEATHER_API_KEY.trim()}`);
          const d = res.data;
          result = { 
            provider: 'weather', 
            text: `${d.name} mein abhi ${d.weather[0].description} hai, temperature ${Math.round(d.main.temp)}°C hai (feels like ${Math.round(d.main.feels_like)}°C) aur humidity ${d.main.humidity}% hai 🌦️`, 
            success: true 
          };
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
          if (res.data.answer) {
            result = { provider: 'weather', text: `${res.data.answer} 🌦️`, success: true };
          }
        } catch (e) {}
      }

      if (!result) {
        result = { provider: 'weather', text: `${city} mein mausam ka live update lene ke liye OPEN_WEATHER_API_KEY ya TAVILY_API_KEY check karein.`, success: false };
      }
    }

    // 16. TAVILY LIVE WEB SEARCH
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

    // 17. DEFAULT 4-TIER LLM CHAT
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

// -------------------------------------------------------------
// 2-WAY TELEGRAM WEBHOOK ENDPOINT
// -------------------------------------------------------------
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

  // A. HANDLE INCOMING PHOTOS (STANDARD CAMELCASE INLINEDATA)
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

      // 1. Google Gemini 2.5 Flash
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
          }, { timeout: 25000 });

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
      console.error('[TELEGRAM PHOTO ERROR]', e.message);
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
    const welcomeMsg = `Namaste ${senderName}! 👋\n\nMain Lumina hoon—aapka personal AI assistant. Main coding, photo scanning, notes, live search aur device actions sab handle kar sakti hoon. Bataiye kya help karun?`;
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
      } catch (dmErr) {
        console.error('[TELEGRAM DM SEND ERROR]', dmErr.message);
      }
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

// Endpoint to automatically link Telegram Webhook to Render
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

app.get('/health', (req, res) => res.json({ status: 'ONLINE', timestamp: new Date().toISOString() }));

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
  console.log(`Lumina Heavy Backend Server running on port ${PORT}`);
});
