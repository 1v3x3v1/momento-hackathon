import { useState, useEffect, useRef } from 'react';
import { Mic, ShieldCheck, Scissors, Type, Camera, Square, Pause, Play, SwitchCamera, GripVertical, Check, X } from 'lucide-react';
import { Reorder } from 'framer-motion';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface RecorderProps {
  isSharing: boolean;
  stopScreenShare: () => void;
  restartScreenShare: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isRedacting: boolean;
  onToggleRedact: () => void;
}

const DEFAULT_ORDER = ['switch', 'pause', 'blur', 'note', 'voice', 'capture', 'stop'];

export default function Recorder({ isSharing, stopScreenShare, restartScreenShare, videoRef, isRedacting, onToggleRedact }: RecorderProps) {
  
  const [items, setItems] = useState<string[]>(() => {
    const saved = localStorage.getItem('momento_widget_order');
    if (saved) {
       const parsed = JSON.parse(saved);
       if (!parsed.includes('pause')) return DEFAULT_ORDER;
       return parsed;
    }
    return DEFAULT_ORDER;
  });

  const [visibleCount, setVisibleCount] = useState<number>(() => {
    const saved = localStorage.getItem('momento_widget_visible_count');
    return saved ? parseInt(saved) : 7;
  });

  const [isHovered, setIsHovered] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem('momento_widget_position');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.x > 0 && parsed.y > 0 && parsed.x < window.innerWidth - 100 && parsed.y < window.innerHeight - 100) {
        return parsed;
      }
    }
    return { x: window.innerWidth - 450, y: window.innerHeight - 120 };
  });
  
  const widgetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0 });

  useEffect(() => {
    localStorage.setItem('momento_widget_order', JSON.stringify(items));
    localStorage.setItem('momento_widget_visible_count', visibleCount.toString());
    if (!dragRef.current.isDragging) {
      localStorage.setItem('momento_widget_position', JSON.stringify(position));
    }
  }, [items, visibleCount, position]);

  const onDragStart = (e: React.MouseEvent) => {
    if (isNoteOpen) return; 
    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      initialX: widgetRef.current?.offsetLeft || position.x,
      initialY: widgetRef.current?.offsetTop || position.y
    };
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (dragRef.current.isDragging && widgetRef.current) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        widgetRef.current.style.left = `${dragRef.current.initialX + dx}px`;
        widgetRef.current.style.top = `${dragRef.current.initialY + dy}px`;
      }
    };

    const onMouseUp = () => {
      if (dragRef.current.isDragging) {
        dragRef.current.isDragging = false;
        setPosition({
          x: widgetRef.current?.offsetLeft || position.x,
          y: widgetRef.current?.offsetTop || position.y
        });
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [position]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (isRecordingVoice && analyserRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const analyser = analyserRef.current;
      
      if (!ctx) return;
      
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        animationFrameRef.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#3B82F6'; 
        ctx.beginPath();

        const sliceWidth = canvas.width * 1.0 / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = v * canvas.height / 2;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);

          x += sliceWidth;
        }

        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
      };

      draw();
    }

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isRecordingVoice]);

  const captureMoment = () => {
    if (!videoRef.current) return;
    console.log("Camera clicked! Ready to capture frame.");
  };

  const togglePause = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault(); 
    e.currentTarget.blur(); 
    setIsPaused(!isPaused);
  };

  const handleToggleRedact = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.blur();
    onToggleRedact();
  };

  const handleSaveNote = async () => {
    if (!noteText.trim()) {
      setIsNoteOpen(false);
      return;
    }
    setIsSavingNote(true);
    try {
      await axios.post(`${API_URL}/capture/note`, {
        text: noteText,
        timestamp: Date.now() / 1000,
        session_id: "demo_session"
      });
      setNoteText('');
      setIsNoteOpen(false);
    } catch (err) {
      console.error("Failed to save note", err);
    }
    setIsSavingNote(false);
  };

  const toggleVoiceRecording = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.blur();

    if (isRecordingVoice) {
      mediaRecorderRef.current?.stop();
      setIsRecordingVoice(false);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    } else {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        let systemAudioTrack = null;
        if (videoRef.current && videoRef.current.srcObject) {
          const displayStream = videoRef.current.srcObject as MediaStream;
          systemAudioTrack = displayStream.getAudioTracks()[0];
        }

        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioContext;
        
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }

        const destination = audioContext.createMediaStreamDestination();

        const micSource = audioContext.createMediaStreamSource(micStream);
        micSource.connect(destination);

        if (systemAudioTrack) {
            const systemSource = audioContext.createMediaStreamSource(new MediaStream([systemAudioTrack]));
            systemSource.connect(destination);
        }

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        const micAnalyserSource = audioContext.createMediaStreamSource(micStream);
        micAnalyserSource.connect(analyser);
        analyserRef.current = analyser;

        const mixedStream = destination.stream;
        const mediaRecorder = new MediaRecorder(mixedStream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const formData = new FormData();
          formData.append("audio", audioBlob, "voice_note.webm");
          formData.append("timestamp", (Date.now() / 1000).toString());
          formData.append("session_id", "demo_session");

          try {
            await axios.post(`${API_URL}/capture/voice`, formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
            });
          } catch (err) {
            console.error("Failed to save voice note", err);
          }
          
          micStream.getTracks().forEach(track => track.stop());
          audioContext.close();
        };

        mediaRecorder.start();
        setIsRecordingVoice(true);
      } catch (err) {
        console.error(err);
        alert("Microphone access denied. Ensure you are using HTTPS or localhost.");
      }
    }
  };

  if (!isSharing) return null;

  const visibleItems = items.slice(0, visibleCount);

  return (
    <div 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ left: position.x, top: position.y }}
      className={`fixed z-[9999] flex flex-col items-center pb-2 transition-all duration-300 ${
        isHovered || isNoteOpen || isRecordingVoice 
          ? 'opacity-100' 
          : 'opacity-70'
      }`}
      ref={widgetRef}
    >
      {isNoteOpen ? (
        <div className="mb-2 animate-in slide-in-from-bottom-2 w-[280px] flex items-center bg-card/95 backdrop-blur-md border border-borderSoft dark:bg-darkCard/95 dark:border-darkBorderSoft px-2 py-1.5 rounded-full shadow-lg">
          <input
            autoFocus
            type="text"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNote(); if (e.key === 'Escape') setIsNoteOpen(false); }}
            placeholder="Type note and press Enter..."
            className="flex-1 bg-transparent border-none text-sm text-textMain placeholder-textMuted focus:outline-none px-2"
            disabled={isSavingNote}
          />
          <button onClick={handleSaveNote} disabled={isSavingNote} className="p-1 text-green-600 hover:bg-green-50 rounded-full transition-colors">
            <Check className="w-4 h-4" />
          </button>
          <button onClick={() => setIsNoteOpen(false)} className="p-1 text-red-500 hover:bg-red-50 rounded-full transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div 
          className={`mb-2 transition-all duration-300 flex items-center gap-1.5 bg-card/95 backdrop-blur-md border border-borderSoft dark:bg-darkCard/95 dark:border-darkBorderSoft px-3 py-2 rounded-xl shadow-lg ${
            isHovered && !isRecordingVoice ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
          }`}
        >
          {Array.from({ length: 7 }).map((_, i) => {
            const count = i + 1;
            return (
              <button
                key={count}
                onClick={() => setVisibleCount(count)}
                className={`w-3 h-3 rounded-full transition-all border-2 ${
                  visibleCount === count 
                    ? 'bg-primary border-primary scale-125' 
                    : 'bg-transparent border-gray-300 hover:border-primary dark:border-gray-600'
                }`}
              />
            );
          })}
        </div>
      )}

      <div className="flex items-center bg-card/90 backdrop-blur-md dark:bg-darkCard/90 border border-borderSoft dark:border-darkBorderSoft shadow-xl rounded-full p-0.5">
        
        <div 
          onMouseDown={onDragStart}
          className="cursor-grab active:cursor-grabbing bg-gray-50 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-2 py-3 rounded-l-full flex items-center justify-center transition-colors border-r border-borderSoft dark:border-darkBorderSoft shrink-0"
        >
          <GripVertical className="w-4 h-4 text-textMuted" />
        </div>

        <div className="flex items-center px-1.5">
          <Reorder.Group axis="x" values={items} onReorder={setItems} className="flex items-center gap-1" dragListener={false}>
            {visibleItems.map((item) => (
              <Reorder.Item key={item} value={item} className="cursor-grab active:cursor-grabbing">
                {item === 'switch' && (
                  <button title="Switch Source" onClick={restartScreenShare} className="p-1.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                    <SwitchCamera className="w-4 h-4" />
                  </button>
                )}
                {item === 'pause' && (
                  <button title={isPaused ? "Resume" : "Pause"} onClick={togglePause} className={`p-1.5 rounded-full transition-colors ${isPaused ? 'bg-gray-100 text-gray-500' : 'bg-orange-50 text-orange-600'}`}>
                    {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4 fill-current" />}
                  </button>
                )}
                
                {item === 'blur' && (
                  <button 
                    title={isRedacting ? "Press Enter to confirm" : "Select area to blur"}
                    onClick={handleToggleRedact} 
                    className={`p-1.5 rounded-full transition-all border-2 flex items-center justify-center ${
                      isRedacting 
                        ? 'bg-green-600 border-white text-white shadow-md shadow-green-600/30' 
                        : 'bg-white border-green-600 text-green-600 hover:bg-green-50'
                    }`}
                  >
                    {isRedacting ? <Scissors className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                  </button>
                )}

                {item === 'note' && (
                  <button title="Type a Note" onClick={() => setIsNoteOpen(true)} className="p-1.5 rounded-full bg-background text-textMuted hover:bg-gray-200 transition-colors">
                    <Type className="w-4 h-4" />
                  </button>
                )}

                {item === 'voice' && (
                  <div className="flex items-center">
                    <button title={isRecordingVoice ? "Stop Voice Note" : "Record Voice Note"} onClick={toggleVoiceRecording} className={`p-1.5 rounded-full transition-all ${
                        isRecordingVoice 
                          ? 'bg-red-500 text-white animate-pulse shadow-md shadow-red-500/30' 
                          : 'bg-purple-50 text-purple-600 hover:bg-purple-100'
                      }`}>
                      <Mic className="w-4 h-4" />
                    </button>
                    
                    {isRecordingVoice && (
                      <canvas 
                        ref={canvasRef} 
                        width="40" 
                        height="24" 
                        className="ml-1 block"
                      />
                    )}
                  </div>
                )}

                {item === 'capture' && (
                  <button title="Capture Screen" onClick={captureMoment} className="p-1.5 rounded-full bg-primary text-white hover:bg-primaryHover shadow-sm transition-colors">
                    <Camera className="w-4 h-4" />
                  </button>
                )}
                {item === 'stop' && (
                  <button title="Stop Sharing" onClick={stopScreenShare} className="p-1.5 rounded-full bg-red-50 text-red-500 hover:bg-red-100 transition-colors">
                    <Square className="w-3 h-3 fill-current" />
                  </button>
                )}
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </div>

      </div>
    </div>
  );
}