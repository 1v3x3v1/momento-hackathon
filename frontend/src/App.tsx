import { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import { Search, PenLine, Moon, Sun, Database, Circle } from 'lucide-react';
import Recorder from './components/Recorder';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface SearchResult {
  text: string;
  metadata: { type: string; timestamp: number; session_id: string; image_url?: string };
}

function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [isDark, setIsDark] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  
  const [isPiPActive, setIsPiPActive] = useState(false);
  const pipWindowRef = useRef<Window | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const toggleDarkMode = () => {
    setIsDark(!isDark);
    if (!isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      streamRef.current = stream;
      setIsSharing(true);
      
      // Auto-open PiP after state is set
      setTimeout(() => openPiP(), 500);

    } catch (err) {
      console.error('Screen share cancelled', err);
    }
  };

  useEffect(() => {
    if (isSharing && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      setTimeout(() => {
        videoRef.current?.play().catch((e) => console.error('Play error:', e));
      }, 100);
    }
  }, [isSharing]);

  const stopRecording = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsSharing(false);
    if (pipWindowRef.current) {
      pipWindowRef.current.close();
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/search`, { query });
      setResults(response.data.results);
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  const openPiP = async () => {
    if (!('documentPictureInPicture' in window)) {
      alert("Your browser does not support Picture-in-Picture. Please use Chrome or Edge.");
      return;
    }

    try {
      const pipWindow = await (window as any).documentPictureInPicture.requestWindow({
        width: 450,
        height: 120,
      });

      // 1. Copy existing Tailwind styles (if possible)
      const styleSheets = Array.from(document.styleSheets);
      styleSheets.forEach((styleSheet) => {
        try {
          const cssRules = Array.from(styleSheet.cssRules).map(rule => rule.cssText).join('');
          const style = document.createElement('style');
          style.textContent = cssRules;
          pipWindow.document.head.appendChild(style);
        } catch (e) {
          console.warn("Could not copy stylesheet", e);
        }
      });

      // 2. FORCE FALLBACK STYLES (This is the fix)
      const forceStyle = pipWindow.document.createElement('style');
      forceStyle.textContent = `
        body { 
          background-color: #111827 !important; 
          margin: 0; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          height: 100vh; 
          overflow: hidden;
        }
        .bg-card\\/90 { background-color: rgba(31, 41, 55, 0.9) !important; border: 1px solid #374151 !important; }
        .bg-card\\/95 { background-color: rgba(31, 41, 55, 0.95) !important; border: 1px solid #374151 !important; }
        .bg-gray-50 { background-color: #1F2937 !important; }
        .text-textMuted { color: #9CA3AF !important; }
        .border-borderSoft { border-color: #374151 !important; }
      `;
      pipWindow.document.head.appendChild(forceStyle);

      // 3. Render the widget
      const container = pipWindow.document.createElement('div');
      pipWindow.document.body.appendChild(container);
      
      const root = ReactDOM.createRoot(container);
      
      // Force isSharing to TRUE so it doesn't return null
      root.render(
        <Recorder
          isSharing={true}
          stopScreenShare={stopRecording}
          restartScreenShare={startRecording}
          videoRef={videoRef}
        />
      );

      setIsPiPActive(true);
      pipWindowRef.current = pipWindow;

      pipWindow.addEventListener('pagehide', () => {
        setIsPiPActive(false);
        pipWindowRef.current = null;
      });
    } catch (err) {
      console.error("Failed to open PiP", err);
    }
  };

  return (
    <div className="min-h-screen p-6 md:p-12 relative select-none">
      <button
        onClick={toggleDarkMode}
        className="absolute top-6 right-6 p-2 rounded-full bg-card border border-borderSoft shadow-sm hover:bg-gray-50 dark:bg-darkCard dark:border-darkBorderSoft"
      >
        {isDark ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5 text-textMuted" />}
      </button>

      <div className="max-w-3xl mx-auto space-y-8">
        <header className="text-center space-y-3 mb-12 pt-8">
          <div className="flex justify-center mb-4">
            <Database className="w-10 h-10 text-primary dark:text-green-500" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-textMain dark:text-darkTextMain">Momento</h1>
          <p className="text-textMuted text-sm md:text-base max-w-lg mx-auto dark:text-darkTextMuted">
            Your personal research memory. Capture your screen, voice, and thoughts.
          </p>
        </header>

        <div className="bg-card rounded-3xl p-6 md:p-8 shadow-sm border border-borderSoft dark:bg-darkCard dark:border-darkBorderSoft">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-2xl font-serif font-semibold text-textMain dark:text-darkTextMain">Ask your memory</h2>
          </div>

          <form onSubmit={handleSearch}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='e.g., "Where did I figure out the auth bug?"'
              className="w-full bg-background border border-borderSoft rounded-xl px-4 py-3 text-sm text-textMain placeholder-textMuted focus:outline-none mb-4 dark:bg-darkBackground dark:text-darkTextMain dark:placeholder-darkTextMuted dark:border-darkBorderSoft"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primaryHover text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Search className="w-4 h-4" /> {loading ? 'Searching...' : 'Search Memory'}
            </button>
          </form>
        </div>

        {results.length > 0 && (
          <div className="space-y-4">
            {results.map((result, index) => (
              <div
                key={index}
                className="bg-card p-5 rounded-xl border border-borderSoft dark:bg-darkCard dark:border-darkBorderSoft relative group transition-all"
              >
                <div className="flex items-center gap-2 mb-3 text-sm text-textMuted dark:text-darkTextMuted">
                  <span className="capitalize font-medium">{result.metadata.type} Capture</span>
                  <span>•</span>
                  <span>{new Date(result.metadata.timestamp * 1000).toLocaleTimeString()}</span>
                </div>

                <div className="text-sm text-textMain dark:text-darkTextMain mb-4 leading-relaxed">
                  {result.text}
                </div>

                {result.metadata.type === 'screen' && result.metadata.image_url && (
                  <div className="rounded-lg overflow-hidden border border-borderSoft bg-black/5 dark:border-darkBorderSoft">
                    <img src={`${API_URL}${result.metadata.image_url}`} alt="Memory" className="w-full h-auto object-contain max-h-64" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!isSharing ? (
          <div className="bg-card rounded-3xl p-6 md:p-8 shadow-sm border border-borderSoft dark:bg-darkCard dark:border-darkBorderSoft">
            <div className="flex justify-between items-center mb-6">
              <div>
                <p className="text-xs font-semibold tracking-widest text-textMuted uppercase mb-1 dark:text-darkTextMuted">Quick Capture</p>
                <h2 className="text-2xl font-serif font-semibold text-textMain dark:text-darkTextMain">What are you working on?</h2>
              </div>
            </div>

            <div className="bg-background rounded-2xl p-4 border border-borderSoft dark:bg-darkBackground dark:border-darkBorderSoft">
              <div className="flex items-center gap-2 mb-3 text-textMuted dark:text-darkTextMuted">
                <PenLine className="w-4 h-4" />
                <span className="text-sm font-medium">Type a quick note</span>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Type a thought, a bug you found, or a decision you made..."
                className="w-full bg-transparent border-none resize-none focus:outline-none text-sm text-textMain placeholder-textMuted min-h-[100px] dark:text-darkTextMain dark:placeholder-darkTextMuted"
              />
            </div>

            <div className="flex justify-center mt-6">
              <button
                onClick={startRecording}
                className="flex items-center gap-2 bg-primary hover:bg-primaryHover text-white px-6 py-2.5 rounded-full text-sm font-medium transition-colors shadow-md"
              >
                <Circle className="w-4 h-4 fill-white" /> Start Screen Share
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-card rounded-3xl p-6 md:p-8 shadow-sm border border-borderSoft dark:bg-darkCard dark:border-darkBorderSoft">
            <div className="flex justify-between items-center mb-6">
              <div>
                <p className="text-xs font-semibold tracking-widest text-red-500 uppercase mb-1 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> Live Recording
                </p>
                <h2 className="text-2xl font-serif font-semibold text-textMain dark:text-darkTextMain">Capturing your screen</h2>
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden border border-borderSoft bg-black/5 dark:border-darkBorderSoft relative">
              <video ref={videoRef} autoPlay muted playsInline className="w-full max-h-[300px] object-contain" />
            </div>

            <p className="text-xs text-textMuted mt-4 text-center dark:text-darkTextMuted">
              The control widget is floating on your screen. Use it to capture moments.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;