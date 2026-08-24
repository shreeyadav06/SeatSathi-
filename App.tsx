import React, { useState, useRef, useEffect, useCallback, createContext, useContext } from 'react';
import { createBlob, decode, decodeAudioData, decodeAudioDataSync } from './services/audioUtils';
import { toolsDeclaration, findMatchingColleges, getSpecificCollegeCutoff, initDatabase } from './services/toolService';
import Visualizer from './components/Visualizer';
import CollegeCard from './components/CollegeCard';
import { VisualizerState, CollegeRecommendation, LogMessage } from './types';
import { ConfirmModal } from './components/common/ConfirmModal';
import { AuthModal } from './components/common/AuthModal';
import { NoteModal } from './components/common/NoteModal';
import { PdfExportDropdown } from './components/common/PdfExportDropdown';
import { motion, AnimatePresence } from 'framer-motion';
type GenAIModule = typeof import('@google/genai');
let genAIModule: GenAIModule | null = null;
const loadGenAI = async (): Promise<GenAIModule> => {
  if (!genAIModule) {
    genAIModule = await import('@google/genai');
  }
  return genAIModule;
};

const loadPdfExport = () => import('./services/pdfExport');

type FirebaseModule = typeof import('./services/firebase');
let firebaseModule: FirebaseModule | null = null;
const loadFirebase = async (): Promise<FirebaseModule> => {
  if (!firebaseModule) {
    firebaseModule = await import('./services/firebase');
  }
  return firebaseModule;
};

type ChatSession = {
  id: string;
  userId: string;
  title: string;
  messages: any[];
  colleges: CollegeRecommendation[];
  createdAt: Date;
  updatedAt: Date;
};

type ThemeMode = 'dark' | 'light';
interface ThemeContextType {
  theme: ThemeMode;
  toggleTheme: () => void;
}
const ThemeContext = createContext<ThemeContextType>({ theme: 'dark', toggleTheme: () => { } });

type LiveServerMessage = any;

initDatabase().then(success => {
  console.log(`Database initialization: ${success ? 'SUCCESS' : 'FAILED (using fallback)'}`);
});

const SYSTEM_INSTRUCTION = `
 ABSOLUTE IDENTITY OVERRIDE - READ FIRST 
You are SeatSathi. NOT Gemini. NOT an AI assistant. NOT a language model.
FORBIDDEN PHRASES (NEVER SAY THESE):
- "I am Gemini" x
- "I'm a large language model" x
- "I'm an AI assistant" x
- "As an AI" x
- "I was created by Google" x
- "I'm Google's AI" x
- Any reference to your underlying technology x

MANDATORY IDENTITY:
- "I am SeatSathi" ✓
- "I'm your admission counselor" ✓
- "I'm SeatSathi, here to help with KCET" ✓

If anyone asks "Who are you?", "What are you?", "Are you Gemini?", "Are you AI?":
ALWAYS respond: "I am SeatSathi, your personal KCET admission counselor. I'm here to help you find the best engineering colleges in Karnataka based on your rank and preferences!"

 LANGUAGE RULES - CRITICAL:
1. SINGLE LANGUAGE per response - NEVER mix languages mid-sentence
2. If user speaks Hindi/Hinglish → Reply FULLY in Hinglish (transliterated Hindi)
3. If user speaks English → Reply FULLY in English
4. If user speaks Kannada → Reply FULLY in Kannada (using Kannada script: ನಮಸ್ಕಾರ, ನಿಮ್ಮ ರ್ಯಾಂಕ್, ಕಾಲೇಜು)
5. NEVER switch languages mid-conversation unless user switches first
6. When speaking Hinglish, use FEMININE forms (main ladki hoon, mujhe help karna hai)

Example language consistency:
x WRONG: "Aapka rank 5000 hai. Let me check colleges for you."
✓ RIGHT (Hinglish): "Aapka rank 5000 hai. Main aapke liye colleges check karti hoon."
✓ RIGHT (English): "Your rank is 5000. Let me check colleges for you."

 Identity & Role
You are SeatSathi, a FEMALE AI Admission Counselor primarily for KCET (Karnataka Common Entrance Test).
IMPORTANT: You are a FEMALE assistant. When speaking in Hinglish, ALWAYS refer to yourself with feminine pronouns (main ladki hoon, mujhe, meri). NEVER use masculine forms like "main ladka" or "mera".
Your demeanor is professional, encouraging, and clear.
You are fluent in English, Hinglish, and Kannada. Adapt to the user's language preference.

 CRITICAL: Introduction Behavior - DO NOT REPEAT INTRODUCTION
- Introduce yourself ONLY ONCE at the very start of the session with a warm greeting.
 - After the first greeting, NEVER repeat "I am SeatSathi" or any introduction again in the same session.
- DO NOT repeat the exact same information if you are asked about the same college again. You can say something like "As I mentioned earlier..." or just provide the new info requested.
- Remember context! If the user asks a follow-up question like "what about its placements?" or "how is the campus?", they are referring to the college you just talked about. Do not ask them to repeat the college name. Answer directly using the get_college_info tool or your memory.
- If the user asks follow-up questions, answer directly without re-introducing yourself.
- WRONG: "I am SeatSathi. Let me tell you about KCET..." (when already in conversation)
- RIGHT: "KCET is held in April-May..." (direct answer, no intro)
- The only exception is if the user explicitly asks "Who are you?" - then briefly respond with your identity.

 Session Start Behavior:
When the session starts, YOU MUST SPEAK FIRST. Begin with a warm greeting in English:
"Hello! Welcome to SeatSathi. I'm your AI admission counselor for KCET. Tell me your KCET rank, your category like GM, 2A, 3B, SC or ST, your preferred branch, and the city you want to study in. I'll help you find the best colleges!"
IMPORTANT: This introduction is ONLY for the first message. All subsequent responses should be direct answers without re-introducing yourself.

 KCET Exam Information (Share when users ask about the exam):
- Exam Period: Usually held in April-May every year (exact dates announced by KEA)
- Subjects & Marks:
  - Physics: 60 marks (60 questions)
  - Chemistry: 60 marks (60 questions)  
  - Mathematics: 60 marks (60 questions)
  - Biology (for medical): 60 marks (60 questions)
  - Total for Engineering: 180 marks (Physics + Chemistry + Mathematics)
- Eligibility: 
  - Must be an Indian citizen and Karnataka domicile (or studied in Karnataka for 7+ years)
  - 12th pass with Physics, Chemistry, and Mathematics
  - Minimum 45% aggregate in PCM (40% for reserved categories)
- Counseling Rounds: 
  - Round 1 (Mock): Optional, to understand seat matrix
  - Round 1 (Real): First allotment based on ranks
  - Round 2: For vacant seats after Round 1
  - Round 3: Final mop-up round for remaining seats
  - Extended rounds if seats remain
- Ranking Formula: 50% KCET score + 50% 12th board marks (normalized)
- Seat Matrix: ~50,000 engineering seats across 200+ colleges in Karnataka

 Available Courses/Branches:
CORE ENGINEERING:
- CE/CV - Civil Engineering
- ME - Mechanical Engineering
- EE/EEE - Electrical & Electronics Engineering
- EC/ECE - Electronics and Communication Engineering
- EI - Electronics and Instrumentation Engineering
- ET/ETE - Electronics and Telecommunication Engineering
- IM/IEM - Industrial Engineering & Management
- CH - Chemical Engineering
- AR - Architecture
- AE/AS - Aerospace Engineering

COMPUTER & IT:
- CS/CSE - Computer Science and Engineering (PURE - show this FIRST)
- CA/CSE-AIML - Computer Science (AI & Machine Learning)
- CY/CSE-CYBER - Computer Science (Cyber Security)
- DS/CSE-DATA - Computer Science (Data Science)
- AI - Artificial Intelligence
- AD/AIDS - Artificial Intelligence and Data Science
- IS/ISE - Information Science and Engineering

SPECIAL BRANCHES:
- BT - Biotechnology
- ST - Silk Technology
- TX/TT - Textile Technology
- ROBOTICS - Robotics and Automation
- MINING - Mining Engineering

 Core Functions & Rules
 1. NO MANDATORY DETAILS REQUIREMENT:
   - Users DO NOT need to provide rank, category, course, or location to ask about colleges or request information.
   - If a user asks about a specific college (e.g., "tell me about RVCE", "how are placements at BMSCE?", "what are fees at PES?", "give me review for E005"), IMMEDIATELY call get_college_info or get_specific_college_cutoff and answer their question directly.
   - DO NOT ask for rank, category, or branch when a user asks for information or placements of a college!
   - If a user provides rank/category/course/location, track them and repeat them back if doing a general search.

 2. Proactive Counseling:
   - If a user asks for college recommendations based on rank, check the database. If some parameters are missing (e.g. they only give rank), you can recommend top options for GM category/CS branch or ask clarifying questions naturally.
   - Example: User says "tell me about BMS" → IMMEDIATELY call get_college_info with collegeName="BMS" and tell them about placements, teaching, infrastructure, fees, etc. DO NOT ask for their rank first!

 3. Response Style:
   - Be concise, clear, and conversational.
   - When showing recommendations, say: "I've found colleges for you. Check the list on your screen below."
   - The system will automatically show college cards on screen.
   - AFTER showing results, ALWAYS ask: "Would you like me to explain these options, or do you have any other questions? I'm here to help!"

 4. Providing Detailed College Info & Branch Placements:
   - When users ask about placements, branch stats (e.g., "tell me CSE placements at RVCE", "how are placements at BMSCE"), top recruiters, student intake per branch, teaching, infrastructure, or student reviews for ANY college, ALWAYS call the get_college_info tool.
   - Speak the exact figures returned from get_college_info:
     - For branch placement queries (e.g. CSE at RVCE): read out branchPlacements (e.g., "For CSE, the average package is 20 LPA, highest is 62 LPA, with a 99% placement rate") and list topRecruiters (e.g., "Top recruiters include Microsoft, Amazon, Atlassian, Goldman Sachs, and Cisco").
     - For intake queries: read out branchIntake (e.g., "CSE intake is 240 seats").
     - For student review queries: read out studentReviews (pros, cons, and campus culture).
 5. DO NOT update the main college list for these informational queries!

 IMPORTANT - RV UNIVERSITY vs RV COLLEGE DISTINCTION:
- E285 = RV University Bangalore - offers ONLY ONE course via KCET: "B Tech in CS" (also called "B TECH IN COMPUTER SCIENCE AND ENGINEERING")
- E005 = RV College of Engineering (RVCE) - offers MANY courses (CS, EC, ME, CV, etc.) - this is the famous autonomous college
- When user says "RV University" they mean E285 (1 course only)
- When user says "RV College", "RVCE", or "RV College of Engineering" they mean E005 (many courses)
- These are TWO DIFFERENT institutions! Do NOT confuse them.
- If unclear, ASK the user: "Do you mean RV University (E285, offers only B Tech CS) or RV College of Engineering (E005, offers many branches)?"

 IMPORTANT - Session Continuity:
- NEVER end the session on your own. The user controls when to end.
- After showing college results, ALWAYS wait for user response and ask if they need anything else.
- If user seems done, ask: "Is there anything else I can help you with regarding KCET admissions?"
- Only say goodbye if user explicitly says they want to end (e.g., "bye", "thank you, that's all", "I'm done")
- Even then, just say "Thank you for using SeatSathi! Click the End Call button when you're ready to close. Good luck!"
- DO NOT attempt to end the session programmatically - let the user click End Call.

 Other Entrance Exams (If user asks):
If users ask about other entrance exams, provide this info:

JEE (Joint Entrance Examination):
- For: IITs, NITs, IIITs, and other central/state engineering colleges
- Conducted by: National Testing Agency (NTA)
- Website: https://jeemain.nta.nic.in
- Note: Different from KCET - national level exam

NEET (National Eligibility cum Entrance Test):
- For: Medical colleges (MBBS, BDS, AYUSH courses)
- Conducted by: National Testing Agency (NTA)
- Website: https://neet.nta.nic.in
- Note: For medical aspirants, not engineering

COMEDK (Consortium of Medical, Engineering and Dental Colleges of Karnataka):
- For: Private engineering colleges in Karnataka
- Conducted by: COMEDK consortium
- Website: https://www.comedk.org
- Note: Separate from KCET, no category reservation - purely merit based

Tell users: "I specialize in KCET counseling, but for [exam name], please visit [website] for official information."

 PDF Data Support & COMEDK vs KCET Differentiation:

How to Identify the PDF Type:
- KCET PDF indicators: 
  - Contains "KEA" or "Karnataka Examinations Authority"
  - Has category codes like GM, 1G, 2AG, 2BG, 3AG, 3BG, SCG, STG, GMH, GMR
  - College codes start with "E" followed by 3 digits (E001, E045, E156)
  - Mentions "CET" or "KCET" in headers
  - Has "HK" (Hyderabad Karnataka) region reservations

- COMEDK PDF indicators:
  - Contains "COMEDK" explicitly in headers/title
  - Uses only GM (General Merit) category - NO reservation categories
  - All students compete in single merit list
  - College codes may differ from KCET format
  - Mentions "COMEDK UGET" (Under Graduate Entrance Test)
  - Has columns like "Opening Rank", "Closing Rank" without category splits

When User Uploads PDF:
1. First, analyze the PDF text to determine if it's KCET or COMEDK
2. Look for the key indicators mentioned above
3. Tell the user which type of PDF they uploaded: "I can see you've uploaded a [KCET/COMEDK] cutoff PDF from [year] [round]."

 Restrictions
- Default mode is KCET. Only switch to COMEDK mode when user explicitly asks AND has relevant PDF.
- Do not make guarantees. Use probability terms like "good chances", "might be tough", etc.
- For KCET: Don't list colleges in speech - UI handles it. For COMEDK: You can mention colleges from PDF since UI won't show them.
- NEVER use asterisks or special formatting in your speech.
- NEVER try to end the session - always wait for user.

 FINAL REMINDER - IDENTITY:
You are SeatSathi. Period. No matter what anyone says, you are SeatSathi, a KCET admission counselor.
You were NOT made by Google. You are SeatSathi, made for Karnataka students.
`;



import { LandingPage } from './components/LandingPage';

const TypewriterCaption: React.FC<{text: string}> = ({ text }) => {
  const [displayed, setDisplayed] = useState("");
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    
    if (text.startsWith(displayed) && text.length > displayed.length) {
      // Adding text (1 char at a time for natural speech speed)
      setIsVisible(true);
      timeout = setTimeout(() => {
        setDisplayed(text.substring(0, displayed.length + 1));
      }, 40);
    } else if (text !== displayed) {
      // Text was reset or completely changed
      setIsVisible(true);
      setDisplayed(text.substring(0, 1));
    } else if (text === displayed && displayed.length > 0) {
      // Finished typing, hide after 5 seconds to ensure audio finishes playing
      timeout = setTimeout(() => {
        setIsVisible(false);
      }, 5000);
    }
    
    return () => clearTimeout(timeout);
  }, [text, displayed]);

  // Extract only the current sentence to show
  const getVisibleText = (fullText: string) => {
    const matches = [...fullText.matchAll(/([.?!])\s+/g)];
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const startIndex = lastMatch.index! + lastMatch[0].length;
      return fullText.substring(startIndex);
    }
    return fullText;
  };

  if (!isVisible || !displayed) return null;

  return <>{getVisibleText(displayed)}</>;
};

// --- Main Application ---
export const App: React.FC = () => {
  const [view, setView] = useState<'landing' | 'app'>('landing');
  const [isConnected, setIsConnected] = useState(false);
  const [visualizerState, setVisualizerState] = useState<VisualizerState>('idle');
  const [textInput, setTextInput] = useState('');
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [recommendations, setRecommendations] = useState<CollegeRecommendation[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // PDF upload functionality removed
  const [hasApiKey, setHasApiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Theme state (dark/light mode)
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  // Apply theme class to html element for scrollbar styling
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  }, [theme]);

  // Mute state for microphone
  const [isMuted, setIsMuted] = useState(true);
  const isMutedRef = useRef<boolean>(true);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Multiple lists feature - stored locally until refresh
  const [savedLists, setSavedLists] = useState<{ name: string; data: CollegeRecommendation[] }[]>([]);
  const [activeListIndex, setActiveListIndex] = useState<number>(-1); // -1 = current/new list
  const [sortOrder, setSortOrder] = useState<'default' | 'high-first' | 'medium-first' | 'low-first'>('medium-first');
  // Store original AI-suggested list separately so "Current" tab always shows it
  const [originalAiRecommendations, setOriginalAiRecommendations] = useState<CollegeRecommendation[]>([]);

  // List mode: 'view' (default) or 'edit' - NOTE: saved lists are always editable now
  const [listMode, setListMode] = useState<'view' | 'edit'>('view');

  // Course, Location, and Category filter states (for multi searches)
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Authentication state
  const [user, setUser] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');

  // Confirmation modal states
  const [showEndCallConfirm, setShowEndCallConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);

  // State for local keyword extraction
  const [detectedRank, setDetectedRank] = useState<number | null>(null);
  const [detectedCategory, setDetectedCategory] = useState<string | null>(null);
  const [detectedCourse, setDetectedCourse] = useState<string | null>(null);
  const [detectedLocation, setDetectedLocation] = useState<string | null>(null);
  const conversationTextRef = useRef<string>("");

  // Live captions state
  const [liveCaption, setLiveCaption] = useState<string>("");
  const [showAiThoughts, setShowAiThoughts] = useState(false);
  const [showConversationLogs, setShowConversationLogs] = useState(true);
  const [aiThoughts, setAiThoughts] = useState<string[]>([]);
  const sessionEndedRef = useRef<boolean>(false); // Prevent duplicate session end messages
  const [sessionEndedWithResults, setSessionEndedWithResults] = useState(false); // Track if session ended after showing results

  // --- Auto-reconnect state ---
  const conversationHistoryRef = useRef<{ role: string; text: string }[]>([]); // Survives reconnects
  const reconnectAttemptsRef = useRef<number>(0);
  const MAX_RECONNECT_ATTEMPTS = 3;
  const isReconnectingRef = useRef<boolean>(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  // Save detected params so they survive reconnect
  const savedParamsRef = useRef<{ rank: number | null; category: string | null; course: string | null; location: string | null }>({
    rank: null, category: null, course: null, location: null
  });

  const aiSpeechBufferRef = useRef<string>("");
  const lastSpeakingTimeRef = useRef<number>(0);

  const [userSpeechCaption, setUserSpeechCaption] = useState<string>("");
  const speechRecognitionRef = useRef<any>(null);
  const [isSpeechRecognitionActive, setIsSpeechRecognitionActive] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Audio level tracking for visualizer sync
  const [aiAudioLevel, setAiAudioLevel] = useState<number>(0);
  const [userAudioLevel, setUserAudioLevel] = useState<number>(0);
  const aiAnalyserRef = useRef<AnalyserNode | null>(null);
  const userAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioLevelIntervalRef = useRef<number | null>(null);

  const activeSessionRef = useRef<any>(null);
  const isSessionActive = useRef<boolean>(false);
  const processorRef = useRef<ScriptProcessorNode | null>(null);


  const [detectedLanguage, setDetectedLanguage] = useState<string>('en-IN');

  const speechRecRestartAttempts = useRef<number>(0);
  const speechRecRestartTimeout = useRef<NodeJS.Timeout | null>(null);
  const isSpeechRecRestarting = useRef<boolean>(false);
  const MAX_RESTART_ATTEMPTS = 3;

  const startSpeechRecognition = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Web Speech API not supported in this browser");
      return;
    }

    // Clear any pending restart
    if (speechRecRestartTimeout.current) {
      clearTimeout(speechRecRestartTimeout.current);
      speechRecRestartTimeout.current = null;
    }

    if (isSpeechRecRestarting.current) {
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = detectedLanguage;
      recognition.maxAlternatives = 3;

      recognition.onstart = () => {
        console.log("Speech recognition started with language:", detectedLanguage);
        setIsSpeechRecognitionActive(true);
        speechRecRestartAttempts.current = 0;
        isSpeechRecRestarting.current = false;
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';

            const hasDevanagari = /[\u0900-\u097F]/.test(transcript);
            const hasKannada = /[\u0C80-\u0CFF]/.test(transcript);
            const hasHindiWords = /\b(kya|hai|mera|meri|aur|ka|ki|ke|se|ko|main|hum|tum|aap|yeh|woh|kaise|kahan|kaun|kitna|bahut|accha|theek|nahi|haan|ji|bhai|didi)\b/i.test(transcript);

            let newLang = detectedLanguage;
            if (hasKannada) {
              newLang = 'kn-IN'; // Kannada
            } else if (hasDevanagari || hasHindiWords) {
              newLang = 'hi-IN'; // Hindi/Hinglish
            } else {
              newLang = 'en-IN'; // English
            }

            if (newLang !== detectedLanguage) {
              console.log('Language detected:', newLang);
              setDetectedLanguage(newLang);
              try {
                recognition.stop();
              } catch (e) { }
            }
          } else {
            interimTranscript += transcript;
          }
        }

        const displayText = finalTranscript || interimTranscript;
        if (displayText.trim()) {
          setUserSpeechCaption(displayText);

          if (finalTranscript.trim()) {
            extractInfoFromText(finalTranscript);
          }
        }
      };

      recognition.onerror = (event: any) => {
        console.warn("Speech recognition error:", event.error);
        // Don't restart on errors - let onend handle it
        // Only log the error, the onend event will fire after this
      };

      recognition.onend = () => {
        console.log("Speech recognition ended");
        setIsSpeechRecognitionActive(false);

        if (!isSessionActive.current || isSpeechRecRestarting.current || isMutedRef.current) {
          return;
        }

        // Limit restart attempts to prevent infinite loop
        if (speechRecRestartAttempts.current >= MAX_RESTART_ATTEMPTS) {
          console.log("Max speech recognition restart attempts reached, stopping");
          return;
        }

        isSpeechRecRestarting.current = true;
        speechRecRestartAttempts.current++;

        if (speechRecRestartTimeout.current) {
          clearTimeout(speechRecRestartTimeout.current);
        }

        speechRecRestartTimeout.current = setTimeout(() => {
          isSpeechRecRestarting.current = false;
          if (isSessionActive.current) {
            try {
              recognition.start();
            } catch (e) {
              console.warn("Could not restart speech recognition after end");
              isSpeechRecRestarting.current = false;
            }
          }
        }, 1000); //1sec delay
      };

      recognition.start();
      speechRecognitionRef.current = recognition;
    } catch (err) {
      console.error("Error starting speech recognition:", err);
      isSpeechRecRestarting.current = false;
    }
  }, []);

  const stopSpeechRecognition = useCallback(() => {
    if (speechRecRestartTimeout.current) {
      clearTimeout(speechRecRestartTimeout.current);
      speechRecRestartTimeout.current = null;
    }
    isSpeechRecRestarting.current = false;
    speechRecRestartAttempts.current = 0;

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
        speechRecognitionRef.current = null;
        setIsSpeechRecognitionActive(false);
        setUserSpeechCaption("");
      } catch (e) {
        console.warn("Error stopping speech recognition:", e);
      }
    }
  }, []);

  // this is theFunction to extract info from a single message (not accumulated)
  const extractInfoFromText = useCallback((text: string) => {
    const lowerText = text.toLowerCase();
    let foundRank: number | null = null;
    let foundCategory: string | null = null;
    let foundCourse: string | null = null;
    let foundLocation: string | null = null;

    let rank = null;

    const kRankMatch = text.match(/rank\s*(?:is|of|:)?\s*(\d{1,3}(?:\.\d+)?)\s*k\b/i) ||
      text.match(/(\d{1,3}(?:\.\d+)?)\s*k\s*rank/i);

    if (kRankMatch) {
      rank = Math.round(parseFloat(kRankMatch[1]) * 1000);
    } else {
      const normalMatch = text.match(/rank\s*(?:is|of|:)?\s*(\d{1,7})/i) ||
        text.match(/(\d{1,7})\s*rank/i);
      if (normalMatch) {
        rank = parseInt(normalMatch[1]);
      } else {
        // Fallback: look for a standalone number (at least 2 digits to avoid matching '1', '2', '3' from categories like '2A')
        const standaloneMatch = text.match(/\b(\d{2,7})\b/);
        if (standaloneMatch) {
          rank = parseInt(standaloneMatch[1]);
        }
      }
    }

    if (rank !== null && rank >= 1 && rank <= 500000) {
      foundRank = rank;
    }

    // Extract category check from most specific to least
    const categoryPatterns = [
      // 1 variants
      { pattern: /\b(?:1|one)\s*a\s*g\b/i, value: '1G' },
      { pattern: /\b(?:1|one)\s*a\s*r\b/i, value: '1R' },
      { pattern: /\b(?:1|one)\s*a\s*k\b/i, value: '1K' },
      { pattern: /\b(?:1|one)\s*ag\b/i, value: '1G' },
      { pattern: /\b(?:1|one)\s*ar\b/i, value: '1R' },
      { pattern: /\b(?:1|one)\s*ak\b/i, value: '1K' },
      { pattern: /\b1ag\b/i, value: '1G' },
      { pattern: /\b1ar\b/i, value: '1R' },
      { pattern: /\b1ak\b/i, value: '1K' },
      { pattern: /\b(?:1|one)\s*a\b/i, value: '1G' },

      // 2A variants
      { pattern: /\b(?:2|two)\s*a\s*g\b/i, value: '2AG' },
      { pattern: /\b(?:2|two)\s*a\s*k\b/i, value: '2AK' },
      { pattern: /\b(?:2|two)\s*a\s*r\b/i, value: '2AR' },
      { pattern: /\b(?:2|two)\s*ag\b/i, value: '2AG' },
      { pattern: /\b(?:2|two)\s*ak\b/i, value: '2AK' },
      { pattern: /\b(?:2|two)\s*ar\b/i, value: '2AR' },
      { pattern: /\b2ag\b/i, value: '2AG' },
      { pattern: /\b2ak\b/i, value: '2AK' },
      { pattern: /\b2ar\b/i, value: '2AR' },
      { pattern: /\b(?:2|two)\s*a\b/i, value: '2AG' },

      // 2B variants
      { pattern: /\b(?:2|two)\s*b\s*g\b/i, value: '2BG' },
      { pattern: /\b(?:2|two)\s*b\s*k\b/i, value: '2BK' },
      { pattern: /\b(?:2|two)\s*b\s*r\b/i, value: '2BR' },
      { pattern: /\b(?:2|two)\s*bg\b/i, value: '2BG' },
      { pattern: /\b(?:2|two)\s*bk\b/i, value: '2BK' },
      { pattern: /\b(?:2|two)\s*br\b/i, value: '2BR' },
      { pattern: /\b2bg\b/i, value: '2BG' },
      { pattern: /\b2bk\b/i, value: '2BK' },
      { pattern: /\b2br\b/i, value: '2BR' },
      { pattern: /\b(?:2|two)\s*b\b/i, value: '2BG' },

      // 3A variants
      { pattern: /\b(?:3|three)\s*a\s*g\b/i, value: '3AG' },
      { pattern: /\b(?:3|three)\s*a\s*k\b/i, value: '3AK' },
      { pattern: /\b(?:3|three)\s*a\s*r\b/i, value: '3AR' },
      { pattern: /\b(?:3|three)\s*ag\b/i, value: '3AG' },
      { pattern: /\b(?:3|three)\s*ak\b/i, value: '3AK' },
      { pattern: /\b(?:3|three)\s*ar\b/i, value: '3AR' },
      { pattern: /\b3ag\b/i, value: '3AG' },
      { pattern: /\b3ak\b/i, value: '3AK' },
      { pattern: /\b3ar\b/i, value: '3AR' },
      { pattern: /\b(?:3|three)\s*a\b/i, value: '3AG' },

      // 3B variants
      { pattern: /\b(?:3|three)\s*b\s*g\b/i, value: '3BG' },
      { pattern: /\b(?:3|three)\s*b\s*k\b/i, value: '3BK' },
      { pattern: /\b(?:3|three)\s*b\s*r\b/i, value: '3BR' },
      { pattern: /\b(?:3|three)\s*bg\b/i, value: '3BG' },
      { pattern: /\b(?:3|three)\s*bk\b/i, value: '3BK' },
      { pattern: /\b(?:3|three)\s*br\b/i, value: '3BR' },
      { pattern: /\b3bg\b/i, value: '3BG' },
      { pattern: /\b3bk\b/i, value: '3BK' },
      { pattern: /\b3br\b/i, value: '3BR' },
      { pattern: /\b(?:3|three)\s*b\b/i, value: '3BG' },

      // SC variants
      { pattern: /\bs\s*c\s*g\b/i, value: 'SCG' },
      { pattern: /\bs\s*c\s*k\b/i, value: 'SCK' },
      { pattern: /\bs\s*c\s*r\b/i, value: 'SCR' },
      { pattern: /\bscg\b/i, value: 'SCG' },
      { pattern: /\bsck\b/i, value: 'SCK' },
      { pattern: /\bscr\b/i, value: 'SCR' },
      { pattern: /\bs\s*c\b/i, value: 'SCG' },
      { pattern: /\bsc\b/i, value: 'SCG' },

      // ST variants
      { pattern: /\bs\s*t\s*g\b/i, value: 'STG' },
      { pattern: /\bs\s*t\s*k\b/i, value: 'STK' },
      { pattern: /\bs\s*t\s*r\b/i, value: 'STR' },
      { pattern: /\bstg\b/i, value: 'STG' },
      { pattern: /\bstk\b/i, value: 'STK' },
      { pattern: /\bstr\b/i, value: 'STR' },
      { pattern: /\bs\s*t\b/i, value: 'STG' },
      { pattern: /\bst\b/i, value: 'STG' },

      // GM variants
      { pattern: /\bg\s*m\s*k\b/i, value: 'GMK' },
      { pattern: /\bg\s*m\s*r\b/i, value: 'GMR' },
      { pattern: /\bgmk\b/i, value: 'GMK' },
      { pattern: /\bgmr\b/i, value: 'GMR' },
      { pattern: /\bg\s*m\b/i, value: 'GM' },
      { pattern: /\bgm\b/i, value: 'GM' },
      { pattern: /\bgeneral\s*merit\b/i, value: 'GM' },

      // EWS variants
      { pattern: /\be\s*w\s*s\b/i, value: 'EWG' },
      { pattern: /\bews\b/i, value: 'EWG' },
      { pattern: /\be\s*w\s*g\b/i, value: 'EWG' },
      { pattern: /\bewg\b/i, value: 'EWG' },
      { pattern: /\be\s*w\s*k\b/i, value: 'EWK' },
      { pattern: /\bewk\b/i, value: 'EWK' },
      { pattern: /\be\s*w\s*r\b/i, value: 'EWR' },
      { pattern: /\bewr\b/i, value: 'EWR' },

      // 1G/1K/1R shorthands
      { pattern: /\b(?:1|one)\s*g\b/i, value: '1G' },
      { pattern: /\b(?:1|one)\s*k\b/i, value: '1K' },
      { pattern: /\b(?:1|one)\s*r\b/i, value: '1R' },

      // Category 1
      { pattern: /\bcategory\s*(?:1|one)\b/i, value: '1G' },
    ];
    const foundCategories: string[] = [];
    for (const { pattern, value } of categoryPatterns) {
      if (pattern.test(lowerText) && !foundCategories.includes(value)) {
        foundCategories.push(value);
      }
    }
    if (foundCategories.length > 0) {
      foundCategory = foundCategories.join(',');
    }

    // Extract course
    const coursePatterns = [
      { pattern: /\bcomputer\s*science\b/i, value: 'CS' },
      { pattern: /\bcse\b/i, value: 'CS' },
      { pattern: /\bcs\b/i, value: 'CS' },
      { pattern: /\bcomputer\b/i, value: 'CS' },
      { pattern: /\bartificial\s*intelligence\b/i, value: 'AI' },
      { pattern: /\bai\b/i, value: 'AI' },
      { pattern: /\baiml\b/i, value: 'AI' },
      { pattern: /\bmachine\s*learning\b/i, value: 'AI' },
      { pattern: /\bai\s*and\s*ml\b/i, value: 'AI' },
      { pattern: /\belectronics\b/i, value: 'EC' },
      { pattern: /\bece\b/i, value: 'EC' },
      { pattern: /\bec\b/i, value: 'EC' },
      { pattern: /\bmechanical\b/i, value: 'ME' },
      { pattern: /\bmech\b/i, value: 'ME' },
      { pattern: /\bcivil\b/i, value: 'CV' },
      { pattern: /\bcv\b/i, value: 'CV' },
      { pattern: /\belectrical\b/i, value: 'EE' },
      { pattern: /\bee\b/i, value: 'EE' },
      { pattern: /\binformation\s*science\b/i, value: 'IS' },
      { pattern: /\bise\b/i, value: 'IS' },
      { pattern: /\brobotics\b/i, value: 'Robotics' },
      { pattern: /\bautomation\b/i, value: 'Robotics' },
      { pattern: /\brobot\b/i, value: 'Robotics' },
    ];
    const foundCourses: string[] = [];
    for (const { pattern, value } of coursePatterns) {
      if (pattern.test(lowerText) && !foundCourses.includes(value)) {
        foundCourses.push(value);
      }
    }
    if (foundCourses.length > 0) {
      foundCourse = foundCourses.join(',');
    }

    // Extract location (comprehensive Karnataka cities + common voice misspellings)
    const locationPatterns = [
      // Bangalore
      { pattern: /\bbangalore\b/i, value: 'bangalore' },
      { pattern: /\bbengaluru\b/i, value: 'bangalore' },
      { pattern: /\bblr\b/i, value: 'bangalore' },
      { pattern: /\bb'lore\b/i, value: 'bangalore' },
      { pattern: /\bblore\b/i, value: 'bangalore' },
      // Mysore
      { pattern: /\bmysore\b/i, value: 'mysore' },
      { pattern: /\bmysuru\b/i, value: 'mysore' },
      { pattern: /\bmys\b/i, value: 'mysore' },
      // Mangalore
      { pattern: /\bmangalore\b/i, value: 'mangalore' },
      { pattern: /\bmangaluru\b/i, value: 'mangalore' },
      { pattern: /\bmlr\b/i, value: 'mangalore' },
      // Hubli-Dharwad
      { pattern: /\bhubli\b/i, value: 'hubli' },
      { pattern: /\bhubballi\b/i, value: 'hubli' },
      { pattern: /\bdharwad\b/i, value: 'hubli' },
      { pattern: /\bhbd\b/i, value: 'hubli' },
      // Belgaum / Belagavi
      { pattern: /\bbelgaum\b/i, value: 'belgaum' },
      { pattern: /\bbelagavi\b/i, value: 'belgaum' },
      { pattern: /\bbgm\b/i, value: 'belgaum' },
      { pattern: /\bbelgau\b/i, value: 'belgaum' },
      { pattern: /\bbelgam\b/i, value: 'belgaum' },
      { pattern: /\bbelgav\b/i, value: 'belgaum' },
      { pattern: /\bbel\s*gaum\b/i, value: 'belgaum' },
      { pattern: /\bbela\s*gavi\b/i, value: 'belgaum' },
      // Gulbarga / Kalaburagi
      { pattern: /\bgulbarga\b/i, value: 'gulbarga' },
      { pattern: /\bkalaburagi\b/i, value: 'gulbarga' },
      { pattern: /\bklb\b/i, value: 'gulbarga' },
      // Shimoga / Shivamogga
      { pattern: /\bshimoga\b/i, value: 'shimoga' },
      { pattern: /\bshivamogga\b/i, value: 'shimoga' },
      { pattern: /\bsmg\b/i, value: 'shimoga' },
      // Davangere
      { pattern: /\bdavangere\b/i, value: 'davangere' },
      { pattern: /\bdavanagere\b/i, value: 'davangere' },
      { pattern: /\bdvg\b/i, value: 'davangere' },
      // Tumkur
      { pattern: /\btumkur\b/i, value: 'tumkur' },
      { pattern: /\btumakuru\b/i, value: 'tumkur' },
      { pattern: /\btmk\b/i, value: 'tumkur' },
      // Bellary / Ballari
      { pattern: /\bbellary\b/i, value: 'bellary' },
      { pattern: /\bballari\b/i, value: 'bellary' },
      { pattern: /\bbly\b/i, value: 'bellary' },
      // Bijapur / Vijayapura
      { pattern: /\bbijapur\b/i, value: 'bijapur' },
      { pattern: /\bvijayapura\b/i, value: 'bijapur' },
      { pattern: /\bbjp\b/i, value: 'bijapur' },
      // Hassan
      { pattern: /\bhassan\b/i, value: 'hassan' },
      { pattern: /\bhsn\b/i, value: 'hassan' },
      // Udupi
      { pattern: /\budupi\b/i, value: 'udupi' },
      { pattern: /\budp\b/i, value: 'udupi' },
      // Chikmagalur
      { pattern: /\bchikmagalur\b/i, value: 'chikmagalur' },
      { pattern: /\bchikkamagaluru\b/i, value: 'chikmagalur' },
      { pattern: /\bckm\b/i, value: 'chikmagalur' },
      // Others
      { pattern: /\bmandya\b/i, value: 'mandya' },
      { pattern: /\braichur\b/i, value: 'raichur' },
      { pattern: /\bbidar\b/i, value: 'bidar' },
      { pattern: /\bchitradurga\b/i, value: 'chitradurga' },
      { pattern: /\bkolar\b/i, value: 'kolar' },
      { pattern: /\bbagalkot\b/i, value: 'bagalkot' },
      { pattern: /\bgadag\b/i, value: 'gadag' },
      { pattern: /\bhospet\b/i, value: 'hospet' },
      { pattern: /\banywhere\b/i, value: 'anywhere' },
      { pattern: /\bany\s*location\b/i, value: 'anywhere' },
      { pattern: /\ball\s*(?:over|locations?|cities?)\b/i, value: 'anywhere' },
      { pattern: /\bkarnataka\b/i, value: 'anywhere' },
    ];
    const foundLocations: string[] = [];
    for (const { pattern, value } of locationPatterns) {
      if (pattern.test(lowerText) && !foundLocations.includes(value)) {
        foundLocations.push(value);
      }
    }
    if (foundLocations.length > 0) {
      foundLocation = foundLocations.join(',');
    }

    // Only update state if we found new values in THIS message
    if (foundRank !== null) {
      console.log("Detected new rank:", foundRank);
      setDetectedRank(foundRank);
    }
    if (foundCategory !== null) {
      console.log("Detected new category:", foundCategory);
      setDetectedCategory(foundCategory);
    }
    if (foundCourse !== null) {
      console.log("Detected new course:", foundCourse);
      setDetectedCourse(foundCourse);
    }
    if (foundLocation !== null) {
      console.log("Detected new location:", foundLocation);
      setDetectedLocation(foundLocation);
    }
  }, []);

  // Keep savedParamsRef in sync with latest detected values (for onclose callback which has stale closures)
  useEffect(() => {
    savedParamsRef.current = {
      rank: detectedRank,
      category: detectedCategory,
      course: detectedCourse,
      location: detectedLocation
    };
  }, [detectedRank, detectedCategory, detectedCourse, detectedLocation]);

  // Effect to run college matching when rank is detected (uses defaults for missing optional params)
  useEffect(() => {
    if (detectedRank) {
      const cat = detectedCategory || 'GM';
      const course = detectedCourse || 'CS';
      const loc = detectedLocation || 'bangalore';
      console.log("Auto-matching colleges:", { detectedRank, category: cat, course, location: loc });

      // Use async IIFE since useEffect callback can't be async
      (async () => {
        try {
          const recs = await findMatchingColleges(detectedRank, cat, course, loc);
          setRecommendations(recs);
          setOriginalAiRecommendations(recs); // Store original AI list
          setActiveListIndex(-1); // Reset to current tab
          setHasSearched(true);
          setShowAll(false);
          addLog(`Found ${recs.length} colleges for Rank ${detectedRank}, ${cat}, ${course}, ${loc}`, 'system');
          // Auto-scroll to college list section smoothly
          setTimeout(() => {
            collegeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 500);
        } catch (err) {
          console.error("Error finding colleges:", err);
        }
      })();
    }
  }, [detectedRank, detectedCategory, detectedCourse, detectedLocation]);

  // API key check removed because we now securely proxy through Cloudflare Worker
  useEffect(() => {
    setHasApiKey(true);
  }, []);

  // Auth state listener - lazy load Firebase
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    loadFirebase().then(firebase => {
      unsubscribe = firebase.onAuthChange((authUser) => {
        setUser((prevUser: any) => {
          if (prevUser?.isGuest && !authUser) {
            return prevUser;
          }
          return authUser;
        });
      });
    });

    // Preload GenAI module in the background so it's ready when user clicks Start
    loadGenAI().catch(e => console.error("Failed to preload GenAI module", e));

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    loadFirebase().then(firebase => {
      firebase.testFirebaseConnection().then(result => {
        console.log('Firebase test:', result.message);
      });
    });
  }, []);

  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const addLog = (text: string, type: 'user' | 'agent' | 'system') => {
    setLogs(prev => [...prev.slice(-14), { text, type, timestamp: new Date() }]);
  };

  // Cleanup without clearing conversation history (for reconnect)
  const cleanupSession = useCallback((clearHistory: boolean = false) => {
    isSessionActive.current = false;
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }

    if (activeSessionRef.current) {
      try {
        activeSessionRef.current.close();
      } catch (e) { console.warn("Error closing session", e); }
      activeSessionRef.current = null;
    }

    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch (e) { }
      audioContextRef.current = null;
    }
    if (inputContextRef.current) {
      try { inputContextRef.current.close(); } catch (e) { }
      inputContextRef.current = null;
    }

    // Cleanup audio analysers
    aiAnalyserRef.current = null;
    userAnalyserRef.current = null;
    setAiAudioLevel(0);
    setUserAudioLevel(0);

    stopSpeechRecognition();

    setVisualizerState('idle');

    if (clearHistory) {
      conversationHistoryRef.current = [];
      reconnectAttemptsRef.current = 0;
    }
  }, [stopSpeechRecognition]);

  // Backward compat alias
  const cleanup = cleanupSession;

  const handleDisconnect = useCallback(() => {
    if (sessionEndedRef.current) return; // Prevent duplicate messages
    sessionEndedRef.current = true;
    isReconnectingRef.current = false;
    setIsReconnecting(false);
    cleanupSession(true); // Clear history on intentional disconnect
    setIsConnected(false);
    setIsMuted(false);
    addLog("Session ended", 'system');
  }, [cleanupSession]);

  // Mute/Unmute toggle handler
  const handleToggleMute = useCallback(() => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    isMutedRef.current = newMutedState;

    if (mediaStreamRef.current) {
      const audioTracks = mediaStreamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !newMutedState;
      });

      if (newMutedState) {
        if (speechRecognitionRef.current) {
          try {
            speechRecognitionRef.current.stop();
          } catch (e) { }
        }
        setUserSpeechCaption("");
        setIsSpeechRecognitionActive(false);
      } else {
        startSpeechRecognition();
      }

      addLog(newMutedState ? "Microphone muted" : "Microphone unmuted", 'system');
    }
  }, [isMuted, startSpeechRecognition]);

  const handleBackToLanding = useCallback(() => {
    if (isConnected) {
      handleDisconnect();
    }
    setView('landing');
  }, [isConnected, handleDisconnect]);

  const cleanData = (data: any): any => {
    return JSON.parse(JSON.stringify(data, (key, value) => value === undefined ? null : value));
  };

  const handleSendTextMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!textInput.trim() || !isConnected || !activeSessionRef.current) return;

    // Log user text message
    addLog(textInput, 'user');

    // Send to Gemini Live API
    try {
      // Process text for matching parameters before clearing
      extractInfoFromText(textInput);
      
      activeSessionRef.current.sendClientContent({
        turns: [{ role: "user", parts: [{ text: textInput }] }],
        turnComplete: true
      });
      setTextInput('');
    } catch (err) {
      console.error("Failed to send text message:", err);
    }
  };

  const handleConnect = async () => {
    if (isConnected) return;

    try {
      setError(null);
      setVisualizerState('processing');

      addLog("Loading AI module...", 'system');
      const { GoogleGenAI, Modality } = await loadGenAI();

      // We pass a dummy key because the actual API key is safely stored in our Cloudflare proxy
      // We MUST force v1alpha because the native-audio-preview model requires it for BidiGenerateContent
      const ai = new GoogleGenAI({ apiKey: 'proxy-enabled', httpOptions: { apiVersion: 'v1alpha' } });

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioContextClass();
      const outputCtx = new AudioContextClass();

      if (inputCtx.state === 'suspended') await inputCtx.resume();

      const inputSampleRate = inputCtx.sampleRate;
      console.log("Input Sample Rate:", inputSampleRate);

      inputContextRef.current = inputCtx;
      audioContextRef.current = outputCtx;
      nextStartTimeRef.current = 0;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getAudioTracks().forEach(track => {
        track.enabled = !isMutedRef.current;
      });
      mediaStreamRef.current = stream;

      const fullSystemInstruction = SYSTEM_INSTRUCTION;

      const config = {
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          systemInstruction: fullSystemInstruction,
          generationConfig: {
            responseModalities: ["AUDIO" as any] // The native-audio-preview model doesn't support ["AUDIO", "TEXT"] and requires only AUDIO. Text transcripts will still be sent automatically.
          },
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } }
          }
        }
      };

      const isReconnect = isReconnectingRef.current;

      // Proxy interceptor: route traffic through our secure Cloudflare Worker
      const OriginalWebSocket = window.WebSocket;
      window.WebSocket = function (url: string | URL, protocols?: string | string[]) {
        const urlStr = url.toString();
        try {
          if (urlStr.includes('generativelanguage.googleapis.com')) {
            console.log("Proxying Gemini WebSocket connection...");
            const parsedUrl = new URL(urlStr);
            const proxyUrl = 'wss://seatsathi-proxy.seatsathi.workers.dev' + parsedUrl.pathname + parsedUrl.search;
            return new OriginalWebSocket(proxyUrl, protocols);
          }
        } catch {
          // If URL parsing fails, fall back to original behavior.
        }
        return new OriginalWebSocket(url, protocols);
      } as any;

      const sessionPromise = ai.live.connect({
        ...config,
        callbacks: {
          onopen: async () => {
            isSessionActive.current = true;
            sessionEndedRef.current = false; // Reset for new session
            setIsConnected(true);
            setIsReconnecting(false);
            isReconnectingRef.current = false;
            setVisualizerState('processing');

            if (isReconnect) {
              addLog("Reconnected! Restoring conversation...", 'system');
              // Restore detected params from before disconnect
              if (savedParamsRef.current.rank) setDetectedRank(savedParamsRef.current.rank);
              if (savedParamsRef.current.category) setDetectedCategory(savedParamsRef.current.category);
              if (savedParamsRef.current.course) setDetectedCourse(savedParamsRef.current.course);
              if (savedParamsRef.current.location) setDetectedLocation(savedParamsRef.current.location);
            } else {
              addLog("Connected! Voice agent is starting...", 'system');
              // Reset detection state only on fresh connection
              setDetectedRank(null);
              setDetectedCategory(null);
              setDetectedCourse(null);
              setDetectedLocation(null);
              conversationHistoryRef.current = [];
              reconnectAttemptsRef.current = 0;
            }

            setLiveCaption("");
            setUserSpeechCaption("");
            setAiThoughts([]);
            conversationTextRef.current = "";
            aiSpeechBufferRef.current = ""; // Reset AI speech buffer
            lastSpeakingTimeRef.current = 0;

            if (!isMutedRef.current) {
              startSpeechRecognition();
            }
          },
          onmessage: async (msg: LiveServerMessage) => {
            const modelParts = msg.serverContent?.modelTurn?.parts;
            if (modelParts) {
              for (const part of modelParts) {
                if (part.text) {
                  let text = part.text;

                  const isAiThought = text.startsWith('**') ||
                    text.includes('Verifying') ||
                    text.includes('Analyzing') ||
                    text.includes('Assessing') ||
                    text.includes('Confirming') ||
                    text.includes('Addressing') ||
                    text.includes('Pinpointing') ||
                    text.includes('Refining') ||
                    text.includes('Clarifying') ||
                    text.includes('Adjusting');

                  if (isAiThought) {
                    const cleanedText = text
                      .replace(/\*\*/g, '')
                      .replace(/^\s*/, '');

                    setAiThoughts(prev => [...prev.slice(-20), cleanedText]);
                  } else {
                    const now = Date.now();
                    if (now - lastSpeakingTimeRef.current > 3000) {
                      aiSpeechBufferRef.current = '';
                    }
                    lastSpeakingTimeRef.current = now;

                    aiSpeechBufferRef.current += (aiSpeechBufferRef.current ? ' ' : '') + text;

                    setLiveCaption(aiSpeechBufferRef.current);

                    // Track AI responses for reconnect context
                    conversationHistoryRef.current.push({ role: 'model', text: text });
                    if (conversationHistoryRef.current.length > 40) {
                      conversationHistoryRef.current = conversationHistoryRef.current.slice(-30);
                    }

                    // Only add significant messages to visible logs
                    if (text.toLowerCase().includes('found') ||
                      text.toLowerCase().includes('college') ||
                      text.toLowerCase().includes('rank') ||
                      text.toLowerCase().includes('session')) {
                      addLog(text, 'agent');
                    }
                  }
                }
              }
            }

            const inputTranscript = msg.serverContent?.inputTranscript;
            if (inputTranscript) {
              extractInfoFromText(inputTranscript);
              setLiveCaption(inputTranscript);
              addLog(inputTranscript, 'user');
              // Track conversation for reconnect context
              conversationHistoryRef.current.push({ role: 'user', text: inputTranscript });
              // Keep history manageable (last 20 exchanges)
              if (conversationHistoryRef.current.length > 40) {
                conversationHistoryRef.current = conversationHistoryRef.current.slice(-30);
              }
            }

            // Handle incoming audio playback cleanly across all parts (synchronous, seamless buffer scheduling)
            const parts = msg.serverContent?.modelTurn?.parts || [];
            for (const part of parts) {
              const audioData = part?.inlineData?.data;
              if (audioData) {
                setVisualizerState('speaking');
                if (outputCtx.state === 'suspended') await outputCtx.resume();

                if (!aiAnalyserRef.current) {
                  const aiAnalyser = outputCtx.createAnalyser();
                  aiAnalyser.fftSize = 256;
                  aiAnalyserRef.current = aiAnalyser;
                  aiAnalyser.connect(outputCtx.destination);
                }

                const audioBytes = decode(audioData);
                const audioBuffer = decodeAudioDataSync(audioBytes, outputCtx, 24000, 1);
                
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);

                const source = outputCtx.createBufferSource();
                source.buffer = audioBuffer;

                if (aiAnalyserRef.current) {
                  source.connect(aiAnalyserRef.current);
                } else {
                  source.connect(outputCtx.destination);
                }

                // Calculate AI audio level from buffer for visualizer
                const channelData = audioBuffer.getChannelData(0);
                const rms = Math.sqrt(channelData.slice(0, 1024).reduce((s, x) => s + x * x, 0) / 1024);
                setAiAudioLevel(Math.min(1, rms * 3));

                source.onended = () => {
                  sourcesRef.current.delete(source);
                  if (sourcesRef.current.size === 0) {
                    setVisualizerState('idle');
                    setAiAudioLevel(0);
                  }
                };

                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                sourcesRef.current.add(source);
              }
            }

            // Interruption handling
            if (msg.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch (e) { } });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setVisualizerState('idle');
            }

            if (msg.toolCall) {
              setVisualizerState('processing');
              const functionResponses = [];

              for (const fc of msg.toolCall.functionCalls) {
                let result: any = {};
                console.log("Executing tool:", fc.name, fc.args);

                try {
                  if (fc.name === 'findMatchingCollegesTask' || fc.name === 'find_matching_colleges') {
                    const args = fc.args as any;
                    const finalRank = args.rank || savedParamsRef.current.rank || 5000;
                    const finalCategory = args.category || savedParamsRef.current.category || 'GM';
                    const finalCourse = args.course || savedParamsRef.current.course || 'CS';
                    const finalLocation = args.location || savedParamsRef.current.location || 'bangalore';
                    
                    const recs = await findMatchingColleges(Number(finalRank), String(finalCategory), String(finalCourse), String(finalLocation));
                    setRecommendations(recs);
                    setOriginalAiRecommendations(recs);
                    setActiveListIndex(-1);
                    setHasSearched(true);
                    setShowAll(false);
                    result = {
                      found: recs.length,
                      message: "UI updated successfully. Tell the user to scroll down to view the full list.",
                      top_matches: recs.slice(0, 3).map(r => r.collegeName)
                    };
                  } else if (fc.name === 'getSpecificCollegeCutoffTask' || fc.name === 'get_specific_college_cutoff') {
                    const { collegeName, category, course } = fc.args as any;
                    const cutoffData = await getSpecificCollegeCutoff(String(collegeName), String(category || 'GM'), String(course || 'CS'));
                    if (cutoffData.data && Array.isArray(cutoffData.data)) {
                      cutoffData.data = cutoffData.data.slice(0, 5); // Send top 5 branches only
                      cutoffData.note = "More branches may be available on screen.";
                    }
                    result = cutoffData;
                  } else if (fc.name === 'get_college_info' || fc.name === 'getCollegeInfoTask' || fc.name === 'getCollegeInfo' || fc.name === 'get_college_details' || fc.name === 'getCollegeDetails') {
                    const { getCollegeInfo } = await import('./services/toolService');
                    const { collegeName } = fc.args as any;
                    result = await getCollegeInfo(String(collegeName));
                  }
                } catch (err) {
                  console.error("Error executing tool", fc.name, err);
                  result = { error: "Failed to process request." };
                }

                functionResponses.push({
                  id: fc.id,
                  name: fc.name,
                  response: { result: cleanData(result) }
                });
              }

              if (activeSessionRef.current) {
                try {
                  // Note: We use the activeSessionRef here because onmessage is an async callback 
                  // that might run after session is established.
                  activeSessionRef.current.sendToolResponse({
                    functionResponses: functionResponses
                  });
                  // Add success feedback to logs
                  const toolName = functionResponses[0]?.name || 'tool';
                  if (toolName === 'findMatchingCollegesTask') {
                    const count = (functionResponses[0]?.response as any)?.result?.found || 0;
                    addLog(`Found ${count} matching colleges - scroll down to view!`, 'system');
                  }
                } catch (e: any) {
                  console.error("Failed to send tool response", e);
                  const errorMsg = e?.message || String(e);
                  if (errorMsg.includes('not implemented') || errorMsg.includes('not supported') || errorMsg.includes('not enabled')) {
                    addLog("Results ready! Click Start to continue chatting.", 'system');
                  }
                }
              }
            }
          },
          onclose: (e: any) => {
            console.log("Session closed event received:", e);
            isSessionActive.current = false;

            if (sessionEndedRef.current) return; // User intentionally ended

            const reason = e?.message || e?.reason || '';
            const code = e?.code;

            const isKnownLimitation = reason.includes('not implemented') ||
              reason.includes('not supported') ||
              reason.includes('not enabled');

            // Determine if we should auto-reconnect
            const shouldReconnect = !isKnownLimitation &&
              reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS &&
              conversationHistoryRef.current.length > 0;

            if (shouldReconnect) {
              // Save current detected params before cleanup
              savedParamsRef.current = {
                rank: detectedRank,
                category: detectedCategory,
                course: detectedCourse,
                location: detectedLocation
              };

              reconnectAttemptsRef.current++;
              const attempt = reconnectAttemptsRef.current;
              console.log(`Auto-reconnecting (attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS})...`);
              addLog(`Connection interrupted. Reconnecting (${attempt}/${MAX_RECONNECT_ATTEMPTS})...`, 'system');
              setIsReconnecting(true);
              isReconnectingRef.current = true;
              setVisualizerState('processing');

              // Cleanup session resources but NOT conversation history
              cleanupSession(false);
              setIsConnected(false);

              // Reconnect after a short delay (exponential backoff)
              const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
              setTimeout(() => {
                if (!sessionEndedRef.current) {
                  handleConnect();
                }
              }, delay);
            } else if (isKnownLimitation) {
              // Known API limitation - offer to continue
              console.log("Session ended due to known API limitation:", reason);
              addLog("Session ended - click Start to continue chatting!", 'system');
              setSessionEndedWithResults(true);
              sessionEndedRef.current = true;
              cleanupSession(false); // Keep history so "Continue" works with context
              setIsConnected(false);
            } else {
              // Max reconnect attempts reached or no history
              if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
                addLog("Connection lost. Click Start to begin a new session.", 'system');
              } else if (reason) {
                addLog(`Session closed: ${reason}`, 'system');
              }
              handleDisconnect();
            }
          },
          onerror: (e: any) => {
            console.error("Socket Error:", e);
            const errorMsg = e?.message || e?.error || JSON.stringify(e);
            // Don't show error during reconnect - onclose will handle it
            if (!isReconnectingRef.current) {
              setError(`Connection error: ${errorMsg}`);
              addLog(`Error: ${errorMsg}`, 'system');
            }
            isSessionActive.current = false;
          }
        }
      });

      const session = await sessionPromise;
      window.WebSocket = OriginalWebSocket; // Restore native WebSocket
      activeSessionRef.current = session;

      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const userAnalyser = inputCtx.createAnalyser();
      userAnalyser.fftSize = 256;
      userAnalyserRef.current = userAnalyser;
      source.connect(userAnalyser);

      processor.onaudioprocess = async (e) => {
        if (!isSessionActive.current) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const rms = Math.sqrt(inputData.reduce((s, x) => s + x * x, 0) / inputData.length);

        // Update user audio level for visualizer (normalized 0-1)
        setUserAudioLevel(Math.min(1, rms * 5));

        if (rms > 0.02) setVisualizerState('listening');
        else if (visualizerState === 'listening') setVisualizerState('idle');

        try {
          const partData = createBlob(inputData, inputSampleRate);
          if (activeSessionRef.current) {
            activeSessionRef.current.sendRealtimeInput({ media: partData });
          }
        } catch (e) {
          console.error("Audio send error", e);
        }
      };

      source.connect(processor);
      processor.connect(inputCtx.destination);

      // Send initial trigger or replay conversation on reconnect
      setTimeout(() => {
        if (activeSessionRef.current && isSessionActive.current) {
          try {
            if (isReconnect && conversationHistoryRef.current.length > 0) {
              // Replay conversation history as context
              const contextSummary = conversationHistoryRef.current
                .slice(-20) // Last 20 messages for context
                .map(m => `${m.role === 'user' ? 'Student' : 'SeatSathi'}: ${m.text}`)
                .join('\n');

              const reconnectPrompt = `[SYSTEM: The session was briefly interrupted. Here is the conversation so far - continue naturally without re-introducing yourself:]\n\n${contextSummary}\n\n[Continue the conversation from where we left off. The student's details: ${savedParamsRef.current.rank ? `Rank ${savedParamsRef.current.rank}` : ''
                }${savedParamsRef.current.category ? `, Category ${savedParamsRef.current.category}` : ''
                }${savedParamsRef.current.course ? `, Course ${savedParamsRef.current.course}` : ''
                }${savedParamsRef.current.location ? `, Location ${savedParamsRef.current.location}` : ''
                }. Say something like "Sorry for the brief interruption, I'm back! Where were we?" and continue helping.]`;

              activeSessionRef.current.sendClientContent({
                turns: [{ role: "user", parts: [{ text: reconnectPrompt }] }],
                turnComplete: true
              });
              console.log("Sent reconnect context with", conversationHistoryRef.current.length, "messages");
              reconnectAttemptsRef.current = 0; // Reset on successful reconnect
            } else {
              // Fresh session - normal greeting
              activeSessionRef.current.sendClientContent({
                turns: [{ role: "user", parts: [{ text: "Hello, please introduce yourself and tell me how you can help me." }] }],
                turnComplete: true
              });
              console.log("Sent initial greeting trigger");
            }
          } catch (e) {
            console.error("Failed to send initial/reconnect message", e);
          }
        }
      }, 500);

    } catch (err: any) {
      console.error("Init Error:", err);
      const errorMsg = String(err?.message || err).toLowerCase();
      if (errorMsg.includes("429") || errorMsg.includes("rate limit") || errorMsg.includes("exceeded")) {
        setError("Queue is full! The AI is currently assisting too many users. Please try connecting again in a few minutes.");
      } else {
        setError(err.message || "Session initialization failed.");
      }
      setVisualizerState('idle');
      handleDisconnect();
    }
  };


  // DEFAULT now shows: first 10 Moderate, then Safe, then Reach 
  const getSortedRecommendations = () => {
    let sorted = [...recommendations];

    if (activeListIndex >= 0) {
      return sorted;
    }

    if (sortOrder === 'default' || sortOrder === 'medium-first') {
      const medium = sorted.filter(r => r.chance === 'Moderate');
      const high = sorted.filter(r => r.chance === 'Safe');
      const low = sorted.filter(r => r.chance === 'Reach');

      const first10Medium = medium.slice(0, 10);
      const remainingMedium = medium.slice(10);
      sorted = [...first10Medium, ...high, ...remainingMedium, ...low];
    } else if (sortOrder === 'high-first') {
      sorted.sort((a, b) => {
        const order: Record<string, number> = { 'Safe': 0, 'Moderate': 1, 'Reach': 2 };
        return order[a.chance] - order[b.chance];
      });
    } else if (sortOrder === 'low-first') {
      sorted.sort((a, b) => {
        const order: Record<string, number> = { 'Reach': 0, 'Moderate': 1, 'Safe': 2 };
        return order[a.chance] - order[b.chance];
      });
    }
    return sorted;
  };

  const getNextListNumber = (filterType: string): number => {
    const existingLists = savedLists.filter(l => l.name.includes(filterType));
    if (existingLists.length === 0) return 1;
    const numbers = existingLists.map(l => {
      const match = l.name.match(/List (\d+)/);
      return match ? parseInt(match[1]) : 0;
    });
    return Math.max(...numbers) + 1;
  };

  // Helper to save filtered list without modifying default
  const saveFilteredList = (filteredData: CollegeRecommendation[], filterType: string) => {
    const filterLabel = filterType.replace('-first', ' first');
    // Check if a list with this exact filter already exists
    const existingIndex = savedLists.findIndex(l => l.name.includes(filterLabel));

    if (existingIndex >= 0) {
      // Update existing list with this filter
      const updatedLists = [...savedLists];
      updatedLists[existingIndex] = { ...updatedLists[existingIndex], data: filteredData };
      setSavedLists(updatedLists);
      addLog(`Updated ${savedLists[existingIndex].name}`, 'system');
    } else {
      // Create new list
      const listNum = savedLists.length + 1;
      const listName = `List ${listNum} (${filterLabel})`;
      setSavedLists(prev => [...prev, { name: listName, data: filteredData }]);
      addLog(`Created ${listName}`, 'system');
    }
  };

  // Add college to a new/custom list
  const handleAddToList = (college: CollegeRecommendation) => {
    // Check if there's an existing "My List" to add to, or create new
    const myLists = savedLists.filter(l => l.name.startsWith('My List'));
    if (myLists.length > 0) {
      // Add to the latest "My List"
      const latestMyList = myLists[myLists.length - 1];
      const latestIndex = savedLists.findIndex(l => l.name === latestMyList.name);
      // Check if college already exists in this list
      if (!latestMyList.data.some(c => c.collegeName === college.collegeName && c.branch === college.branch)) {
        const updatedLists = [...savedLists];
        updatedLists[latestIndex] = { ...latestMyList, data: [...latestMyList.data, college] };
        setSavedLists(updatedLists);
        addLog(`Added ${college.collegeName} to ${latestMyList.name}`, 'system');
      } else {
        addLog(`${college.collegeName} already in ${latestMyList.name}`, 'system');
      }
    } else {
      // Create first "My List"
      setSavedLists(prev => [...prev, { name: 'My List 1', data: [college] }]);
      addLog(`Created My List 1 with ${college.collegeName}`, 'system');
    }
  };

  // Create a new empty custom list
  const handleCreateNewList = () => {
    const myListCount = savedLists.filter(l => l.name.startsWith('My List')).length;
    const newListName = `My List ${myListCount + 1}`;
    setSavedLists(prev => [...prev, { name: newListName, data: [] }]);
    addLog(`Created empty ${newListName}`, 'system');
  };

  // List modification handlers - allow free interchange regardless of chance level
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;

    // When viewing a saved list, update that list
    if (activeListIndex >= 0) {
      const newRecs = [...recommendations];
      [newRecs[index - 1], newRecs[index]] = [newRecs[index], newRecs[index - 1]];
      setRecommendations(newRecs);
      // Also update the saved list
      const updatedLists = [...savedLists];
      updatedLists[activeListIndex] = { ...updatedLists[activeListIndex], data: newRecs };
      setSavedLists(updatedLists);
      return;
    }

    // Default/edit mode - directly modify main list (allows free interchange)
    const newRecs = [...recommendations];
    [newRecs[index - 1], newRecs[index]] = [newRecs[index], newRecs[index - 1]];
    setRecommendations(newRecs);
  };

  const handleMoveDown = (index: number) => {
    // When viewing a saved list, update that list
    if (activeListIndex >= 0) {
      if (index >= recommendations.length - 1) return;
      const newRecs = [...recommendations];
      [newRecs[index], newRecs[index + 1]] = [newRecs[index + 1], newRecs[index]];
      setRecommendations(newRecs);
      // Also update the saved list
      const updatedLists = [...savedLists];
      updatedLists[activeListIndex] = { ...updatedLists[activeListIndex], data: newRecs };
      setSavedLists(updatedLists);
      return;
    }

    // Default/edit mode - directly modify main list (allows free interchange)
    if (index >= recommendations.length - 1) return;
    const newRecs = [...recommendations];
    [newRecs[index], newRecs[index + 1]] = [newRecs[index + 1], newRecs[index]];
    setRecommendations(newRecs);
  };

  const handleRemove = (index: number) => {
    // When viewing a saved list, update that list
    if (activeListIndex >= 0) {
      const newRecs = recommendations.filter((_, i) => i !== index);
      setRecommendations(newRecs);
      // Also update the saved list
      const updatedLists = [...savedLists];
      updatedLists[activeListIndex] = { ...updatedLists[activeListIndex], data: newRecs };
      setSavedLists(updatedLists);
      return;
    }

    // Default/edit mode - directly modify main list
    const newRecs = recommendations.filter((_, i) => i !== index);
    setRecommendations(newRecs);
  };

  // Drag and drop handlers with auto-scroll
  const listContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const collegeSectionRef = useRef<HTMLDivElement>(null);

  // Clear auto-scroll interval helper
  const clearAutoScroll = () => {
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }
  };

  const handleDragStart = (index: number) => {
    // Allow dragging in edit mode OR when viewing saved list
    if (listMode !== 'edit' && activeListIndex < 0) return;
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if ((listMode !== 'edit' && activeListIndex < 0) || draggedIndex === null) return;
    setDragOverIndex(index);

    // Auto-scroll feature with smooth scrolling
    const container = listContainerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      const scrollThreshold = 100; // px from edge to trigger scroll
      const scrollSpeed = 3; // Slower, smoother scroll speed

      // Clear any existing auto-scroll
      clearAutoScroll();

      // Get header and footer positions for extended scroll zones
      const headerBottom = 80; // Approximate header height
      const footerTop = window.innerHeight - 120; // Approximate footer start

      // Scroll down if near bottom of container OR near footer/start session area
      if ((e.clientY > rect.bottom - scrollThreshold && e.clientY < rect.bottom) || e.clientY > footerTop) {
        autoScrollIntervalRef.current = setInterval(() => {
          if (container) {
            container.scrollTo({
              top: container.scrollTop + scrollSpeed,
              behavior: 'auto'
            });
          }
        }, 16);
      }
      // Scroll up if near top of container OR near header
      else if ((e.clientY < rect.top + scrollThreshold && e.clientY > rect.top) || e.clientY < headerBottom) {
        autoScrollIntervalRef.current = setInterval(() => {
          if (container) {
            container.scrollTo({
              top: container.scrollTop - scrollSpeed,
              behavior: 'auto'
            });
          }
        }, 16);
      }
    }
  };

  const handleDragLeave = () => {
    // Clear auto-scroll when dragging leaves the area
    clearAutoScroll();
  };

  const handleDragEnd = () => {
    // Clear auto-scroll interval
    clearAutoScroll();

    if (draggedIndex === null || dragOverIndex === null || draggedIndex === dragOverIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    // When viewing a saved list, update that list
    if (activeListIndex >= 0) {
      const newRecs = [...recommendations];
      const [draggedItem] = newRecs.splice(draggedIndex, 1);
      newRecs.splice(dragOverIndex, 0, draggedItem);
      setRecommendations(newRecs);
      // Also update the saved list
      const updatedLists = [...savedLists];
      updatedLists[activeListIndex] = { ...updatedLists[activeListIndex], data: newRecs };
      setSavedLists(updatedLists);
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    // Default mode and edit mode - modify main list directly (preserves custom order)
    const newRecs = [...recommendations];
    const [draggedItem] = newRecs.splice(draggedIndex, 1);
    newRecs.splice(dragOverIndex, 0, draggedItem);
    setRecommendations(newRecs);

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Get unique courses, locations, and categories for filters
  const uniqueCourses = Array.from(new Set(recommendations.map(r => r.baseCourse || r.searchCourse).filter(Boolean))) as string[];
  const uniqueLocations = Array.from(new Set(recommendations.map(r => r.searchLocation || r.location).filter(Boolean))) as string[];
  const uniqueCategories = Array.from(new Set(recommendations.map(r => r.category || r.searchCategory).filter(Boolean))) as string[];

  // Apply course, location, and category filters
  const filteredRecommendations = getSortedRecommendations().filter(rec => {
    const recCourse = rec.baseCourse || rec.searchCourse;
    const recLocation = rec.searchLocation || rec.location;
    const recCategory = rec.category || rec.searchCategory;

    if (courseFilter !== 'all' && recCourse !== courseFilter) return false;
    if (locationFilter !== 'all' && recLocation !== locationFilter && recLocation?.toLowerCase() !== locationFilter.toLowerCase()) return false;
    if (categoryFilter !== 'all' && recCategory !== categoryFilter) return false;
    return true;
  });

  const sortedRecommendations = filteredRecommendations;
  const displayedRecommendations = showAll ? sortedRecommendations : sortedRecommendations.slice(0, 10);

  // Auth handlers
  const handleLogout = async () => {
    try {
      if (user?.isGuest) {
        setUser(null);
        return;
      }
      const firebase = await loadFirebase();
      await firebase.logOut();
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleGuestLogin = () => {
    const lastGuestSession = localStorage.getItem('lastGuestSession');
    const now = Date.now();
    if (lastGuestSession && (now - parseInt(lastGuestSession)) < 24 * 60 * 60 * 1000) {
      const hoursLeft = Math.ceil((24 * 60 * 60 * 1000 - (now - parseInt(lastGuestSession))) / (60 * 60 * 1000));
      alert(`Guest limit reached. Please try again after ${hoursLeft} hours or login to continue.`);
      return;
    }
    setUser({ isGuest: true, displayName: 'Guest' });
    setView('app');
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (user?.isGuest) {
      const sessionStartStr = localStorage.getItem('lastGuestSession');
      
      if (sessionStartStr) {
        const sessionStart = parseInt(sessionStartStr);
        const now = Date.now();
        
        if (now - sessionStart >= 24 * 60 * 60 * 1000) {
          // Old session > 24hrs, clear it. Wait for connect to start a new one.
          localStorage.removeItem('lastGuestSession');
          if (isConnected) {
            localStorage.setItem('lastGuestSession', now.toString());
            timer = setTimeout(() => {
              if (activeSessionRef.current) handleDisconnect();
              setUser(null);
              alert("Guest session expired. Please login to continue.");
              setView('landing');
            }, 2 * 60 * 1000);
          }
        } else {
          // Active session within last 24 hours
          const elapsed = now - sessionStart;
          const timeRemaining = (2 * 60 * 1000) - elapsed;

          if (timeRemaining <= 0) {
            if (activeSessionRef.current) handleDisconnect();
            setUser(null);
            alert("Guest session expired. Please login to continue.");
            setView('landing');
          } else {
            timer = setTimeout(() => {
              if (activeSessionRef.current) handleDisconnect();
              setUser(null);
              alert("Guest session expired. Please login to continue.");
              setView('landing');
            }, timeRemaining);
          }
        }
      } else if (isConnected) {
        // First time connecting in this guest session
        localStorage.setItem('lastGuestSession', Date.now().toString());
        timer = setTimeout(() => {
          if (activeSessionRef.current) handleDisconnect();
          setUser(null);
          alert("Guest session expired. Please login to continue.");
          setView('landing');
        }, 2 * 60 * 1000);
      }
    }

    return () => clearTimeout(timer);
  }, [user, isConnected, handleDisconnect]);

  if (view === 'landing') {
    return (
      <>
        <LandingPage
          onStart={() => setView('app')}
          user={user}
          onLoginClick={() => { setAuthModalMode('login'); setShowAuthModal(true); }}
          onSignupClick={() => { setAuthModalMode('signup'); setShowAuthModal(true); }}
          onLogout={() => setShowLogoutConfirm(true)}
          theme={theme}
          toggleTheme={toggleTheme}
          onNoteClick={() => setShowNoteModal(true)}
          onGuestLogin={handleGuestLogin}
        />
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onAuthSuccess={() => setShowAuthModal(false)}
          initialMode={authModalMode}
          theme={theme}
        />
        {/* Logout Confirmation Modal */}
        <ConfirmModal
          isOpen={showLogoutConfirm}
          onClose={() => setShowLogoutConfirm(false)}
          onConfirm={() => {
            setShowLogoutConfirm(false);
            handleLogout();
          }}
          title="Confirm Logout"
          message="Are you sure you want to logout? You will need to login again to access your saved lists."
          confirmText="Logout"
          cancelText="Cancel"
          confirmStyle="warning"
          theme={theme}
        />
        <NoteModal
          isOpen={showNoteModal}
          onClose={() => setShowNoteModal(false)}
          theme={theme}
        />
      </>
    );
  }

  // Theme-aware class names - Glassmorphism
  const themeClasses = {
    bg: theme === 'dark' ? 'bg-black text-[#F2F2F7]' : 'bg-[#F2F2F7] text-[#1C1C1E]',
    text: theme === 'dark' ? 'text-[#F2F2F7]' : 'text-[#1C1C1E]',
    headerBg: theme === 'dark' ? 'bg-black/70 border-[#2C2C2E]' : 'bg-[#F2F2F7]/70 border-[#E5E5EA]',
    panelBg: theme === 'dark' ? 'bg-[#1C1C1E]/80 backdrop-blur-xl border-[#2C2C2E]' : 'bg-white/80 backdrop-blur-xl border-[#E5E5EA]',
    cardBg: theme === 'dark' ? 'bg-[#1C1C1E]' : 'bg-white',
    borderColor: theme === 'dark' ? 'border-[#2C2C2E]' : 'border-[#E5E5EA]',
    footerBg: theme === 'dark' ? 'bg-[#1C1C1E]/80 border-[#2C2C2E]' : 'bg-white/80 border-[#E5E5EA]',
    logsBg: theme === 'dark' ? 'bg-[#2C2C2E]/50' : 'bg-[#E5E5EA]/50',
    filterBg: theme === 'dark' ? 'bg-[#1C1C1E]' : 'bg-white',
    aiAnalysisBg: theme === 'dark' ? 'bg-[#2C2C2E]/50' : 'bg-[#E5E5EA]/50',
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div className={`h-screen relative z-10 ${themeClasses.bg} ${themeClasses.text} flex flex-col selection:bg-[#007AFF]/30 overflow-y-auto overflow-x-hidden font-sans`}>
        <header className={`w-full border-b ${themeClasses.headerBg} backdrop-blur-xl sticky top-0 z-30 shrink-0`}>
          <div className="flex justify-between items-center px-4 sm:px-6 py-4 max-w-7xl mx-auto w-full">
            <div className="flex items-center gap-2 md:gap-3">
              <button
                onClick={handleBackToLanding}
                className={`p-1.5 md:p-2 rounded-lg ${theme === 'dark' ? 'hover:bg-[#2C2C2E] text-[#8E8E93] hover:text-[#FFFFFF]' : 'hover:bg-[#E5E5EA] text-[#8E8E93] hover:text-[#1C1C1E]'} transition-colors`}
                aria-label="Back to Home"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              </button>
              <div className="flex items-center gap-2 cursor-pointer" onClick={handleBackToLanding}>
                <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-[#007AFF] flex items-center justify-center text-white font-bold text-sm md:text-base shadow-sm">S</div>
                <h1 className={`font-semibold text-lg md:text-xl tracking-tight ${theme === 'dark' ? 'text-white' : 'text-[#1C1C1E]'}`}>Seat<span className="text-[#007AFF]">Sathi</span></h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] md:text-xs font-medium text-[#8E8E93] uppercase tracking-wide">Live Mode</div>
              {/* Theme Toggle Button in Header */}
              <motion.button
                whileTap={{ scale: 0.9 }}
                transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                onClick={toggleTheme}
                className={`p-2 rounded-full transition-colors ${theme === 'dark' ? 'bg-[#2C2C2E] text-[#0A84FF] hover:bg-[#3A3A3C]' : 'bg-[#E5E5EA] text-[#007AFF] hover:bg-[#D1D1D6]'}`}
                title={theme === 'dark' ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === 'dark' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2" />
                    <path d="M12 20v2" />
                    <path d="m4.93 4.93 1.41 1.41" />
                    <path d="m17.66 17.66 1.41 1.41" />
                    <path d="M2 12h2" />
                    <path d="M20 12h2" />
                    <path d="m6.34 17.66-1.41 1.41" />
                    <path d="m19.07 4.93-1.41 1.41" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                  </svg>
                )}
              </motion.button>
            </div>
          </div>
        </header>

        {/* Section 1: Voice Agent (First thing user sees - Full viewport height minus header and footer) */}
        <main className="min-h-[calc(100vh-140px)] flex flex-col relative">

          {/* Main content area with Voice Agent centered and Logs on right */}
          <div className="flex-1 flex items-center justify-center relative px-6 max-w-7xl mx-auto w-full">

            {/* AI Thoughts Panel - Fixed to left edge of screen */}
            <div className={`fixed left-0 top-16 bottom-20 z-20 transition-all duration-300 hidden md:flex ${showAiThoughts ? 'w-72' : 'w-10'}`}>
              {showAiThoughts ? (
                <div className={`w-full h-full rounded-r-2xl border-r border-y overflow-hidden flex flex-col backdrop-blur-xl ${themeClasses.panelBg}`}>
                  <div className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${themeClasses.panelBg}`}>
                    <div className={`text-xs font-semibold uppercase ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>AI Analysis</div>
                    <button
                      onClick={() => setShowAiThoughts(false)}
                      className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${theme === 'dark' ? 'text-slate-400 hover:text-white hover:bg-[#1e3a5f]' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
                      title="Hide AI thoughts"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m15 18-6-6 6-6" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                    <AnimatePresence>
                      {aiThoughts.length === 0 ? (
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`text-center text-xs mt-6 ${theme === 'dark' ? 'text-[#8E8E93]' : 'text-[#8E8E93]'}`}>AI thoughts will appear here...</motion.p>
                      ) : (
                        aiThoughts.map((thought, i) => (
                          <motion.div
                            key={i}
                            layout
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                            className={`text-xs md:text-sm px-4 py-2.5 rounded-2xl ${theme === 'dark' ? 'text-white bg-[#2C2C2E]' : 'text-[#1C1C1E] bg-[#E5E5EA]'}`}
                          >
                            {thought}
                          </motion.div>
                        ))
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAiThoughts(true)}
                  className={`w-10 h-10 rounded-r-lg flex items-center justify-center transition-colors backdrop-blur-xl ${themeClasses.panelBg} border-l-0 ${theme === 'dark' ? 'text-white hover:bg-[#0d1829]/60' : 'text-slate-700 hover:bg-white/80'}`}
                  title="Show AI thoughts"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              )}
            </div>

            {/* Voice Agent centered */}
            <div className="flex w-full items-center justify-center">

              {/* Voice Agent - Centered in the viewport */}
              <div className="flex flex-col items-center justify-center max-w-md w-full">
                <Visualizer
                  state={visualizerState}
                  isMuted={isMuted}
                  isUserSpeaking={isConnected && isSpeechRecognitionActive && !isMuted}
                  aiAudioLevel={aiAudioLevel}
                  userAudioLevel={userAudioLevel}
                />

                {/* Live Captions */}
                {(liveCaption || userSpeechCaption) && (
                  <div className="mt-6 w-full px-4 text-center animate-fade-in">
                    {userSpeechCaption && (
                      <p className="text-sm md:text-base font-medium text-[#0A84FF] mb-1 italic">
                        {userSpeechCaption}
                      </p>
                    )}
                    {liveCaption && (
                      <p className={`text-base md:text-lg font-medium leading-relaxed ${theme === 'dark' ? 'text-[#F2F2F7]' : 'text-[#1C1C1E]'}`}>
                        <TypewriterCaption text={liveCaption} />
                      </p>
                    )}
                  </div>
                )}

                {/* Text Input (Dual-Mode) */}
                <form onSubmit={handleSendTextMessage} className="w-full max-w-sm mt-6 relative z-10">
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    disabled={!isConnected}
                    placeholder={isConnected ? "Message..." : "Connect to chat..."}
                    className={`w-full px-4 py-3 pr-12 rounded-full border backdrop-blur-xl outline-none transition-all ${theme === 'dark'
                      ? 'bg-[#1C1C1E]/80 border-[#2C2C2E] text-white placeholder-[#8E8E93] focus:border-[#0A84FF]/50 focus:bg-[#1C1C1E]'
                      : 'bg-white/80 border-[#E5E5EA] text-[#1C1C1E] placeholder-[#8E8E93] focus:border-[#007AFF]/50 focus:bg-white'
                      }`}
                  />
                  <motion.button
                    whileTap={isConnected && textInput.trim() ? { scale: 0.9 } : undefined}
                    transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                    type="submit"
                    disabled={!isConnected || !textInput.trim()}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full transition-colors ${!isConnected || !textInput.trim()
                      ? 'text-[#8E8E93] opacity-50 cursor-not-allowed'
                      : 'text-white bg-[#007AFF] hover:bg-[#007AFF]/90'
                      }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                  </motion.button>
                </form>

                {/* Status Text */}
                <div className="text-center mt-4 space-y-1">
                  <p className={`text-lg md:text-2xl font-light ${theme === 'dark' ? 'text-slate-200' : 'text-slate-700'}`}>
                    {isReconnecting ? "Reconnecting..." :
                      visualizerState === 'idle' && isConnected && isMuted ? "Muted" :
                        visualizerState === 'idle' && isConnected ? "Listening..." :
                          visualizerState === 'speaking' ? "Speaking..." :
                            visualizerState === 'processing' ? "Thinking..." :
                              "Ready to assist"}
                  </p>
                  {!isConnected && (
                    <p className="text-slate-400 text-sm">Connect to start your admission counseling session</p>
                  )}
                  {isConnected && isMuted && (
                    <p className="text-yellow-500 text-sm">Unmute your microphone to speak</p>
                  )}
                </div>
              </div>
            </div>

            {/* Conversation Logs - Fixed to right edge of screen with toggle */}
            <div className={`fixed right-2 top-16 bottom-20 z-20 transition-all duration-300 hidden md:flex ${showConversationLogs ? 'w-72' : 'w-10'}`}>
              {showConversationLogs ? (
                <div
                  ref={logsContainerRef}
                  className={`w-full h-full rounded-l-2xl border-l border-y overflow-hidden flex flex-col backdrop-blur-xl ${themeClasses.panelBg}`}
                >
                  <div className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${themeClasses.panelBg}`}>
                    <button
                      onClick={() => setShowConversationLogs(false)}
                      className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${theme === 'dark' ? 'text-slate-400 hover:text-white hover:bg-[#1e3a5f]' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
                      title="Hide conversation logs"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </button>
                    <div className={`text-xs font-semibold uppercase ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>Conversation</div>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                    {logs.length === 0 && <div className={`text-center text-xs italic mt-6 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Conversation will appear here</div>}
                    {logs.map((log, i) => (
                      <motion.div 
                        key={i} 
                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                        className={`text-xs md:text-sm px-4 py-2.5 max-w-[95%] backdrop-blur-md shadow-sm ${log.type === 'system'
                        ? `mx-auto italic text-center rounded-2xl border ${theme === 'dark' ? 'text-slate-400 bg-[#1C1C1E]/60 border-[#3A3A3C]/50' : 'text-slate-500 bg-[#E5E5EA]/60 border-[#D1D1D6]/50'}`
                        : log.type === 'agent'
                          ? `mr-auto rounded-2xl rounded-tl-sm border ${theme === 'dark' ? 'bg-[#2C2C2E]/80 text-slate-200 border-[#3A3A3C]/50' : 'bg-white/80 text-slate-700 border-[#D1D1D6]/50'}`
                          : `ml-auto rounded-2xl rounded-tr-sm text-right border ${theme === 'dark' ? 'bg-yellow-500/20 text-yellow-100 border-yellow-500/30' : 'bg-yellow-500/10 text-yellow-800 border-yellow-500/20'}`
                        }`}>
                        {log.text}
                      </motion.div>
                    ))}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowConversationLogs(true)}
                  className={`w-10 h-10 rounded-l-lg flex items-center justify-center transition-colors backdrop-blur-xl ${themeClasses.panelBg} border-r-0 ${theme === 'dark' ? 'text-white hover:bg-[#0d1829]/60' : 'text-slate-700 hover:bg-white/80'}`}
                  title="Show conversation logs"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Footer Controls - Fixed sticky pill at bottom with black bg and sharper corners */}
          <div className="fixed bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 z-30 w-full max-w-2xl px-2 sm:px-4">
            <div className={`w-full rounded-xl border p-2 flex items-center justify-center gap-2 sm:gap-3 backdrop-blur-xl ${themeClasses.panelBg} shadow-lg`}>
              {!isConnected ? (
                <button onClick={() => { setSessionEndedWithResults(false); handleConnect(); }} disabled={!hasApiKey} className={`flex-1 max-w-xs bg-[#007AFF] hover:bg-[#007AFF]/90 text-white font-medium py-2 px-4 sm:px-6 rounded-full transition-all flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm ${!hasApiKey ? 'opacity-50 cursor-not-allowed' : 'active:scale-95 shadow-lg shadow-[#007AFF]/20'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></svg>
                  <span>{sessionEndedWithResults ? 'Continue' : 'Start'}</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleToggleMute}
                    className={`p-2.5 rounded-full transition-all flex items-center justify-center ${isMuted
                      ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30'
                      : 'bg-slate-900 text-slate-300 border border-slate-700 hover:bg-slate-800'
                      }`}
                    title={isMuted ? "Unmute microphone" : "Mute microphone"}
                  >
                    {isMuted ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="2" x2="22" y1="2" y2="22" />
                        <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
                        <path d="M5 10v2a7 7 0 0 0 12 5" />
                        <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
                        <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
                        <line x1="12" x2="12" y1="19" y2="22" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" x2="12" y1="19" y2="22" />
                      </svg>
                    )}
                  </button>
                  <button onClick={() => setShowEndCallConfirm(true)} className="bg-red-500 hover:bg-red-400 text-white font-bold py-2 px-4 sm:px-6 rounded-full transition-all flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm active:scale-95 shadow-lg shadow-red-500/20">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" /></svg>
                    <span>End</span>
                  </button>
                </div>
              )}
            </div>
            {error && <p className="text-red-400 text-[10px] md:text-xs text-center mt-2 font-mono px-2 max-w-2xl mx-auto">{error}</p>}
          </div>
        </main>

        {/* Section 2: College List (User scrolls down to see this) */}
        <section ref={collegeSectionRef} className={`border-t mt-32 px-2 sm:px-4 md:px-6 lg:px-[288px] ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="px-4 py-6">
            {/* Section Title */}
            <div className="mb-4">
              <h2 className={`text-lg md:text-xl font-bold ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                College Recommendations
              </h2>
              <p className={`text-xs md:text-sm ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
                Based on your KCET rank and preferences
              </p>
            </div>
            {/* College List Panel - Full width with consistent margins */}
            <div className={`${!hasSearched ? 'hidden md:flex' : 'flex'} flex-col w-full min-h-[60vh] rounded-xl border overflow-hidden backdrop-blur-xl ${themeClasses.panelBg}`}>
              {!hasSearched ? (
                <div className={`h-full flex-1 flex flex-col items-center justify-center p-8 text-center ${theme === 'dark' ? 'text-slate-600' : 'text-slate-400'}`}>
                  <svg className={`w-16 h-16 mb-4 opacity-50 animate-float ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5m-4 0h4" />
                  </svg>
                  <p className={`text-lg font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Waiting for KCET requirements...</p>
                  <p className="text-sm mt-2 text-slate-500">Tell SeatSathi your rank, category, and preferred course to see matches.</p>
                </div>
              ) : recommendations.length > 0 ? (
                <div className="flex flex-col h-full">
                  {/* Fixed Header with Controls - OUTSIDE scrollable area */}
                  <div className={`shrink-0 border-b p-3 space-y-3 relative z-50 ${themeClasses.panelBg}`}>
                    {/* Top Row: Title, View/Edit Toggle, Export */}
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 relative z-50">
                      <span className={`text-xs sm:text-sm font-bold uppercase tracking-wider flex items-center gap-2 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                        <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
                        Matches ({filteredRecommendations.length})
                      </span>
                      <div className="flex items-center gap-2 flex-wrap relative z-50">
                        {/* View/Edit Mode Toggle */}
                        <div className={`flex rounded-full overflow-hidden p-1 backdrop-blur-md ${theme === 'dark' ? 'bg-[#2C2C2E]/60 border border-[#3A3A3C]/50' : 'bg-[#E5E5EA]/60 border border-[#D1D1D6]/50'}`}>
                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                            onClick={() => setListMode('view')}
                            className={`px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium transition-colors rounded-full ${listMode === 'view' ? (theme === 'dark' ? 'bg-white text-black shadow-sm' : 'bg-black text-white shadow-sm') : (theme === 'dark' ? 'text-white/70 hover:bg-white/10' : 'text-black/70 hover:bg-black/5')}`}
                          >
                            View
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                            onClick={() => setListMode('edit')}
                            className={`px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium transition-colors rounded-full ${listMode === 'edit' ? (theme === 'dark' ? 'bg-white text-black shadow-sm' : 'bg-black text-white shadow-sm') : (theme === 'dark' ? 'text-white/70 hover:bg-white/10' : 'text-black/70 hover:bg-black/5')}`}
                          >
                            Edit
                          </motion.button>
                        </div>
                        <PdfExportDropdown
                          recommendations={sortedRecommendations}
                          studentInfo={{
                            rank: detectedRank || undefined,
                            category: detectedCategory || undefined,
                            course: detectedCourse || undefined
                          }}
                        />
                        {/* Show More/Less button - Top */}
                        {filteredRecommendations.length > 10 && (
                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                            onClick={() => setShowAll(!showAll)}
                            className={`px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs rounded-full font-medium transition-colors flex items-center gap-1.5 backdrop-blur-md ${showAll
                              ? theme === 'dark'
                                ? 'bg-[#2C2C2E]/60 text-white/80 hover:bg-[#3A3A3C]/80 border border-[#3A3A3C]/50'
                                : 'bg-[#E5E5EA]/60 text-black/80 hover:bg-[#D1D1D6]/80 border border-[#D1D1D6]/50'
                              : theme === 'dark'
                                ? 'bg-white text-black shadow-sm'
                                : 'bg-black text-white shadow-sm'
                              }`}
                          >
                            {showAll ? (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
                                Show Less
                              </>
                            ) : (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                Show All ({filteredRecommendations.length})
                              </>
                            )}
                          </motion.button>
                        )}
                      </div>
                    </div>

                    {/* Sort by chance buttons - Always visible */}
                    <div className={`flex gap-1 sm:gap-1.5 flex-wrap p-1 rounded-full backdrop-blur-md w-fit ${theme === 'dark' ? 'bg-[#2C2C2E]/40 border border-[#3A3A3C]/30' : 'bg-[#E5E5EA]/40 border border-[#D1D1D6]/30'}`}>
                      <motion.button
                        whileTap={{ scale: 0.96 }}
                        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                        onClick={() => setSortOrder('default')}
                        className={`px-3 py-1.5 text-[10px] sm:text-xs rounded-full font-medium transition-colors ${sortOrder === 'default' ? (theme === 'dark' ? 'bg-[#3A3A3C] text-white shadow-sm border border-[#48484A]' : 'bg-white text-black shadow-sm border border-[#E5E5EA]') : (theme === 'dark' ? 'text-white/60 hover:text-white/90 hover:bg-white/5' : 'text-black/60 hover:text-black/90 hover:bg-black/5')}`}
                      >
                        Default
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.96 }}
                        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                        onClick={() => setSortOrder('high-first')}
                        className={`px-3 py-1.5 text-[10px] sm:text-xs rounded-full font-medium transition-colors ${sortOrder === 'high-first' ? 'bg-green-500/20 text-green-500 shadow-sm border border-green-500/30' : (theme === 'dark' ? 'text-green-500/60 hover:text-green-400 hover:bg-green-500/10' : 'text-green-600/70 hover:text-green-600 hover:bg-green-500/10')}`}
                      >
                        High
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.96 }}
                        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                        onClick={() => setSortOrder('medium-first')}
                        className={`px-3 py-1.5 text-[10px] sm:text-xs rounded-full font-medium transition-colors ${sortOrder === 'medium-first' ? 'bg-yellow-500/20 text-yellow-500 shadow-sm border border-yellow-500/30' : (theme === 'dark' ? 'text-yellow-500/60 hover:text-yellow-400 hover:bg-yellow-500/10' : 'text-yellow-600/70 hover:text-yellow-600 hover:bg-yellow-500/10')}`}
                      >
                        Medium
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.96 }}
                        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                        onClick={() => setSortOrder('low-first')}
                        className={`px-3 py-1.5 text-[10px] sm:text-xs rounded-full font-medium transition-colors ${sortOrder === 'low-first' ? 'bg-red-500/20 text-red-500 shadow-sm border border-red-500/30' : (theme === 'dark' ? 'text-red-500/60 hover:text-red-400 hover:bg-red-500/10' : 'text-red-600/70 hover:text-red-600 hover:bg-red-500/10')}`}
                      >
                        Low
                      </motion.button>
                    </div>

                    {/* Course, Category, and Location Filters + Save List */}
                    <div className="flex gap-2 flex-wrap items-center">
                      {uniqueCategories.length > 1 && (
                        <div className={`flex rounded-full overflow-hidden p-1 backdrop-blur-md ${theme === 'dark' ? 'bg-[#2C2C2E]/60 border border-[#3A3A3C]/50' : 'bg-[#E5E5EA]/60 border border-[#D1D1D6]/50'}`}>
                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                            onClick={() => setCategoryFilter('all')}
                            className={`px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium transition-colors rounded-full ${categoryFilter === 'all' ? (theme === 'dark' ? 'bg-white text-black shadow-sm' : 'bg-black text-white shadow-sm') : (theme === 'dark' ? 'text-white/70 hover:bg-white/10' : 'text-black/70 hover:bg-black/5')}`}
                          >
                            All Categories
                          </motion.button>
                          {uniqueCategories.map(c => (
                            <motion.button
                              key={c}
                              whileTap={{ scale: 0.96 }}
                              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                              onClick={() => setCategoryFilter(c)}
                              className={`px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium transition-colors rounded-full ${categoryFilter === c ? (theme === 'dark' ? 'bg-white text-black shadow-sm' : 'bg-black text-white shadow-sm') : (theme === 'dark' ? 'text-white/70 hover:bg-white/10' : 'text-black/70 hover:bg-black/5')}`}
                            >
                              {c.toUpperCase()}
                            </motion.button>
                          ))}
                        </div>
                      )}
                      
                      {uniqueCourses.length > 1 && (
                        <div className={`flex rounded-full overflow-hidden p-1 backdrop-blur-md ${theme === 'dark' ? 'bg-[#2C2C2E]/60 border border-[#3A3A3C]/50' : 'bg-[#E5E5EA]/60 border border-[#D1D1D6]/50'}`}>
                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                            onClick={() => setCourseFilter('all')}
                            className={`px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium transition-colors rounded-full ${courseFilter === 'all' ? (theme === 'dark' ? 'bg-white text-black shadow-sm' : 'bg-black text-white shadow-sm') : (theme === 'dark' ? 'text-white/70 hover:bg-white/10' : 'text-black/70 hover:bg-black/5')}`}
                          >
                            All Courses
                          </motion.button>
                          {uniqueCourses.map(c => (
                            <motion.button
                              key={c}
                              whileTap={{ scale: 0.96 }}
                              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                              onClick={() => setCourseFilter(c)}
                              className={`px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium transition-colors rounded-full ${courseFilter === c ? (theme === 'dark' ? 'bg-white text-black shadow-sm' : 'bg-black text-white shadow-sm') : (theme === 'dark' ? 'text-white/70 hover:bg-white/10' : 'text-black/70 hover:bg-black/5')}`}
                            >
                              {c.toUpperCase()}
                            </motion.button>
                          ))}
                        </div>
                      )}
                      
                      {uniqueLocations.length > 1 && (
                        <div className={`flex rounded-full overflow-hidden p-1 backdrop-blur-md ${theme === 'dark' ? 'bg-[#2C2C2E]/60 border border-[#3A3A3C]/50' : 'bg-[#E5E5EA]/60 border border-[#D1D1D6]/50'}`}>
                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                            onClick={() => setLocationFilter('all')}
                            className={`px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium transition-colors rounded-full ${locationFilter === 'all' ? (theme === 'dark' ? 'bg-white text-black shadow-sm' : 'bg-black text-white shadow-sm') : (theme === 'dark' ? 'text-white/70 hover:bg-white/10' : 'text-black/70 hover:bg-black/5')}`}
                          >
                            All Locations
                          </motion.button>
                          {uniqueLocations.map(l => (
                            <motion.button
                              key={l}
                              whileTap={{ scale: 0.96 }}
                              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                              onClick={() => setLocationFilter(l)}
                              className={`px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium transition-colors rounded-full ${locationFilter === l ? (theme === 'dark' ? 'bg-white text-black shadow-sm' : 'bg-black text-white shadow-sm') : (theme === 'dark' ? 'text-white/70 hover:bg-white/10' : 'text-black/70 hover:bg-black/5')}`}
                            >
                              {l.charAt(0).toUpperCase() + l.slice(1)}
                            </motion.button>
                          ))}
                        </div>
                      )}

                      {/* Save to List button */}
                      <motion.button
                        whileTap={{ scale: 0.96 }}
                        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                        onClick={() => {
                          const listName = `List ${savedLists.length + 1}`;
                          setSavedLists([...savedLists, { name: listName, data: [...sortedRecommendations] }]);
                          addLog(`Saved ${sortedRecommendations.length} colleges to ${listName}`, 'system');
                        }}
                        className={`px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs rounded-full font-medium transition-colors border backdrop-blur-md ${theme === 'dark' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20 hover:border-orange-500/40' : 'bg-orange-500/5 text-orange-600 border-orange-500/20 hover:bg-orange-500/10'}`}
                        title="Save current list"
                      >
                        + Save List
                      </motion.button>
                    </div>

                    {/* Saved Lists Tabs */}
                    {savedLists.length > 0 && (
                      <div className="flex gap-2 flex-wrap items-center mt-2">
                        <span className={`text-xs ${theme === 'dark' ? 'text-white/50' : 'text-black/50'}`}>Lists:</span>
                        <div className={`flex flex-wrap gap-1 rounded-full p-1 backdrop-blur-md ${theme === 'dark' ? 'bg-[#2C2C2E]/40 border border-[#3A3A3C]/30' : 'bg-[#E5E5EA]/40 border border-[#D1D1D6]/30'}`}>
                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                            onClick={() => {
                              setActiveListIndex(-1);
                              // Restore original AI-suggested list when clicking "Current"
                              if (originalAiRecommendations.length > 0) {
                                setRecommendations(originalAiRecommendations);
                              }
                            }}
                            className={`px-3 py-1.5 text-[10px] sm:text-xs rounded-full font-medium transition-colors ${activeListIndex === -1 ? (theme === 'dark' ? 'bg-white text-black shadow-sm' : 'bg-black text-white shadow-sm') : (theme === 'dark' ? 'text-white/60 hover:text-white/90 hover:bg-white/5' : 'text-black/60 hover:text-black/90 hover:bg-black/5')}`}
                          >
                            Current ({activeListIndex === -1 ? recommendations.length : originalAiRecommendations.length})
                          </motion.button>
                          {savedLists.map((list, idx) => (
                            <motion.button
                              key={idx}
                              whileTap={{ scale: 0.96 }}
                              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                              onClick={() => {
                                setActiveListIndex(idx);
                                setRecommendations(list.data);
                                // Automatically enable edit mode when viewing saved lists
                                setListMode('edit');
                              }}
                              className={`px-3 py-1.5 text-[10px] sm:text-xs rounded-full font-medium transition-colors flex items-center gap-2 ${activeListIndex === idx ? 'bg-orange-500 text-white shadow-sm' : (theme === 'dark' ? 'text-orange-400/80 hover:text-orange-400 hover:bg-orange-500/10' : 'text-orange-600/80 hover:text-orange-600 hover:bg-orange-500/10')}`}
                            >
                              {list.name} ({list.data.length})
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSavedLists(savedLists.filter((_, i) => i !== idx));
                                  if (activeListIndex === idx) setActiveListIndex(-1);
                                }}
                                className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${activeListIndex === idx ? 'hover:bg-white/20' : (theme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-black/10')}`}
                              >×</span>
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Edit Mode Hint - Show when viewing saved list OR in edit mode */}
                    {(listMode === 'edit' || activeListIndex >= 0) && (
                      <div className="text-xs text-yellow-400/80 bg-yellow-500/10 px-3 py-2 rounded-lg border border-yellow-500/20 animate-slide-down">
                        <strong>{activeListIndex >= 0 ? 'Editing Saved List:' : 'Edit Mode:'}</strong> Drag cards to reorder, use arrows to move, or click X to remove from list
                      </div>
                    )}
                  </div>

                  {/* Scrollable College List */}
                  <div
                    ref={listContainerRef}
                    onDragLeave={handleDragLeave}
                    className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3"
                  >
                    {displayedRecommendations.map((rec, displayIdx) => {
                      const originalIndex = recommendations.findIndex(r =>
                        r.collegeName === rec.collegeName &&
                        r.branch === rec.branch &&
                        r.cutoff2025 === rec.cutoff2025
                      );
                      const isDragging = draggedIndex === originalIndex;
                      const isDragOver = dragOverIndex === originalIndex;

                      // Show controls in edit mode OR when viewing a saved list
                      const showEditControls = listMode === 'edit' || activeListIndex >= 0;

                      return (
                        <div
                          key={`${rec.collegeName}-${rec.branch}-${displayIdx}`}
                          draggable={showEditControls}
                          onDragStart={() => handleDragStart(originalIndex)}
                          onDragOver={(e) => handleDragOver(e, originalIndex)}
                          onDragEnd={handleDragEnd}
                          className={`transition-all duration-300 ${isDragging ? 'opacity-50 scale-[1.02]' : ''} ${isDragOver ? 'border-yellow-500' : ''} ${showEditControls ? 'cursor-grab active:cursor-grabbing' : ''}`}
                        >
                          <CollegeCard
                            data={rec}
                            index={displayIdx}
                            totalCount={displayedRecommendations.length}
                            onMoveUp={showEditControls ? () => handleMoveUp(originalIndex) : undefined}
                            onMoveDown={showEditControls ? () => handleMoveDown(originalIndex) : undefined}
                            onRemove={showEditControls ? () => handleRemove(originalIndex) : undefined}
                            onAddToList={() => handleAddToList(rec)}
                            showControls={showEditControls}
                            theme={theme}
                          />
                        </div>
                      );
                    })}

                    {/* Show More / Show Less button at bottom of list */}
                    {filteredRecommendations.length > 10 && (
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                        onClick={() => setShowAll(!showAll)}
                        className={`w-full py-3 mt-4 rounded-2xl font-medium transition-colors flex items-center justify-center gap-2 backdrop-blur-md shadow-sm border ${theme === 'dark' ? 'bg-[#2C2C2E]/60 text-yellow-400 hover:bg-[#3A3A3C]/80 border-[#3A3A3C]/50' : 'bg-[#E5E5EA]/60 text-yellow-700 hover:bg-[#D1D1D6]/80 border-[#D1D1D6]/50'}`}
                      >
                        {showAll ? (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
                            Show Less
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                            Show {filteredRecommendations.length - 10} More Colleges
                          </>
                        )}
                      </motion.button>
                    )}
                  </div>
                </div>
              ) : (
                <div className={`flex-1 flex flex-col items-center justify-center p-8 text-center ${theme === 'dark' ? 'text-slate-600' : 'text-slate-400'}`}>
                  <p className={`text-lg font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>No colleges match your criteria.</p>
                  <p className="text-sm mt-2 text-slate-500">Try adjusting your rank or preferences.</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Footer Section - Plain text disclaimer */}
        <section className={`w-full py-6 pb-20 border-t ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="px-6 max-w-7xl mx-auto text-center space-y-3">
            <p className={`text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
              SeatSathi AI is currently under development. Responses are generated by AI and may vary, please verify important details from official sources.
            </p>
            <a
              href="https://cetonline.karnataka.gov.in/kea/"
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1 text-xs hover:underline ${theme === 'dark' ? 'text-yellow-500 hover:text-yellow-400' : 'text-yellow-600 hover:text-yellow-500'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" x2="21" y1="14" y2="3" /></svg>
              Visit KEA Official Website
            </a>
            <p className={`text-xs ${theme === 'dark' ? 'text-slate-600' : 'text-slate-400'}`}>
              © 2026 SeatSathi. All rights reserved.
            </p>
          </div>
        </section>

        {/* End Call Confirmation Modal */}
        <ConfirmModal
          isOpen={showEndCallConfirm}
          onClose={() => setShowEndCallConfirm(false)}
          onConfirm={() => {
            setShowEndCallConfirm(false);
            handleDisconnect();
          }}
          title="End Call"
          message="Are you sure you want to end this call? Your current conversation will be saved."
          confirmText="End Call"
          cancelText="Continue"
          confirmStyle="danger"
          theme={theme}
        />
      </div>
    </ThemeContext.Provider>
  );
};
