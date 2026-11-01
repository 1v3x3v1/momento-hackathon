import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Search, PenLine, Moon, Sun, Database, Sparkles, Circle, Square } from 'lucide-react';
import Recorder from './components/Recorder';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface SearchResult {
  text: string;
  metadata: { type: string; timestamp: number; session_id: string; image_url?: string; };
}

function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [backendError, setBackendError] = useState(false);
  
  const [notes, setNotes] = useState('');
  const [isDark, setIsDark] = useState(false);
  
  const [isRedacting, setIsRedacting] = useState(false);
  const [redactionBoxes, setRedactionBoxes] = useState<{ [key: number]: any[] }>({});
  const [pendingBoxes, setPendingBoxes] = useState<{ [key: number]: any[] }>({});
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentBox, setCurrentBox] = useState<{x: number, y: number, w: number, h: number} | null>(null);

  const [isSharing, setIsSharing] = useState(false);
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
    } catch (err) {
      console.error("Screen share cancelled", err);
    }
  };

  useEffect(() => {
    if (isSharing && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      setTimeout(() => {
        videoRef.current?.play().catch(e => console.error("Play error:", e));
      }, 100);
    }
  }, [isSharing]);

  const stopRecording = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsSharing(false);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;
    setLoading(true);
    setBackendError(false);
    try {
      const response = await axios.post(`${API_URL}/search`, { query });
      setResults(response.data.results);
      setRedactionBoxes({});
      setPendingBoxes({});
    } catch (error) {
      setBackendError(true);
    }
    setLoading(false);
  };

  const handleMouseDown = (e: React.MouseEvent, index: number) => {
    if (!isRedacting) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setStartPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setIsDrawing(true);
    setCurrentBox({ x: e.clientX - rect.left, y: e.clientY - rect.top, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent, index: number) => {
    if (!isDrawing || !isRedacting) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    setCurrentBox({
      x: Math.min(startPos.x, currentX),
      y: Math.min(startPos.y, currentY),
      w: Math.abs(currentX - startPos.x),
      h: Math.abs(currentY - startPos.y)
    });
  };

  const handleMouseUp = (index: number) => {
    if (!isDrawing || !currentBox) return;
    setIsDrawing(false);
    
    if (currentBox.w < 10 || currentBox.h < 10) {
      setCurrentBox(null);
      return;
    }

    setPendingBoxes((prev: any) => ({
      ...prev,
      [index]: [...(prev[index] || []), currentBox]
    }));
    setCurrentBox(null);
  };

  const commitPendingBoxes = () => {
    setRedactionBoxes((prev: any) => {
      const newBoxes = { ...prev };
      Object.keys(pendingBoxes).forEach((key) => {
        const idx = parseInt(key);
        newBoxes[idx] = [...(newBoxes[idx] || []), ...pendingBoxes[idx]];
      });
      return newBoxes;
    });
    setPendingBoxes({});
    setIsRedacting(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && isRedacting) {
        commitPendingBoxes();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRedacting, pendingBoxes]);

  return (
    <div className="min-h-screen p-6 md:p-12 relative">
      
      <button onClick={toggleDarkMode} className="absolute top-6 right-6 p-2 rounded-full bg-card border border-borderSoft shadow-sm hover:bg-gray-50 dark:bg-darkCard dark:border-darkBorderSoft dark:hover:bg-gray-700 transition-colors">
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
              className="w-full bg-background border border-borderSoft rounded-xl px-4 py-3 text-sm text-textMain placeholder-textMuted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all mb-4 dark:bg-darkBackground dark:border-darkBorderSoft dark:text-darkTextMain dark:placeholder-darkTextMuted"
            />
            <button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primaryHover text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
              <Search className="w-4 h-4" /> {loading ? "Searching..." : "Search Memory"}
            </button>
          </form>
        </div>

        {results.length > 0 && (
          <div className="space-y-4">
            {results.map((result, index) => {
              return (
                <div 
                  key={index} 
                  className="bg-card p-5 rounded-xl border border-borderSoft dark:bg-darkCard dark:border-darkBorderSoft relative group transition-all"
                >
                  <div className="flex items-center gap-2 mb-3 text-sm text-textMuted dark:text-darkTextMuted">
                    <span className="capitalize font-medium">{result.metadata.type} Capture</span>
                  </div>
                  
                  <div className="relative">
                    <div className="text-sm text-textMain dark:text-darkTextMain mb-4">
                      {result.text}
                    </div>

                    {result.metadata.type === 'screen' && result.metadata.image_url && (
                      <div className="rounded-lg overflow-hidden border border-borderSoft dark:border-darkBorderSoft bg-black/5">
                        <img src={`${API_URL}${result.metadata.image_url}`} alt="Memory" className="w-full h-auto object-contain max-h-64" />
                      </div>
                    )}
                  </div>

                  {isRedacting && (
                    <div 
                      className="absolute inset-0 z-10 cursor-crosshair rounded-xl"
                      onMouseDown={(e) => handleMouseDown(e, index)}
                      onMouseMove={(e) => handleMouseMove(e, index)}
                      onMouseUp={() => handleMouseUp(index)}
                    />
                  )}

                  {redactionBoxes[index]?.map((box: any, boxIdx: number) => (
                    <div 
                      key={`final-${boxIdx}`} 
                      className="absolute bg-gray-900/90 backdrop-blur-sm border border-gray-600 pointer-events-none rounded-sm z-20"
                      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
                    />
                  ))}

                  {pendingBoxes[index]?.map((box: any, boxIdx: number) => (
                    <div 
                      key={`pending-${boxIdx}`} 
                      className="absolute bg-orange-500/30 border border-dashed border-black pointer-events-none rounded-sm z-20"
                      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
                    />
                  ))}

                  {isDrawing && currentBox && (
                    <div 
                      className="absolute bg-orange-500/30 border border-dashed border-black pointer-events-none rounded-sm z-20"
                      style={{ left: currentBox.x, top: currentBox.y, width: currentBox.w, height: currentBox.h }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!isSharing ? (
          <div className="bg-card rounded-3xl p-6 md:p-8 shadow-sm border border-borderSoft dark:bg-darkCard dark:border-darkBorderSoft">
            <div className="flex justify-between items-center mb-6">
              <div>
                <p className="text-xs font-semibold tracking-widest text-textMuted uppercase mb-1 dark:text-darkTextMuted">
                  Quick Capture
                </p>
                <h2 className="text-2xl font-serif font-semibold text-textMain dark:text-darkTextMain">
                  What are you working on?
                </h2>
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
              <button onClick={startRecording} className="flex items-center gap-2 bg-primary hover:bg-primaryHover text-white px-6 py-2.5 rounded-full text-sm font-medium transition-colors shadow-md">
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
                <h2 className="text-2xl font-serif font-semibold text-textMain dark:text-darkTextMain">
                  Capturing your screen
                </h2>
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden border border-borderSoft bg-black/5 dark:border-darkBorderSoft relative">
              <video ref={videoRef} autoPlay muted playsInline className="w-full max-h-[300px] object-contain" />
            </div>
            
            <p className="text-xs text-textMuted mt-4 text-center dark:text-darkTextMuted">
              Use the floating widget to snap screenshots, record voice notes, or type.
            </p>
          </div>
        )}

      </div>

      <Recorder 
        isSharing={isSharing} 
        stopScreenShare={stopRecording} 
        restartScreenShare={startRecording}
        videoRef={videoRef} 
        isRedacting={isRedacting}
        onToggleRedact={() => {
          if (isRedacting) commitPendingBoxes();
          else setIsRedacting(true);
        }}
      />
    </div>
  );
}
export default App;