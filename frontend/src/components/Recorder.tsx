import { useState, useEffect, useRef } from 'react';
import { Mic, Type, Camera, Square, Pause, Play, SwitchCamera, Check, X } from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface RecorderProps {
  isSharing: boolean;
  stopScreenShare: () => void;
  restartScreenShare: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  sessionStartTime: number;
}

export default function Recorder({ 
  isSharing, 
  stopScreenShare, 
  restartScreenShare, 
  videoRef,
  sessionStartTime 
}: RecorderProps) {
  
  const [isPaused, setIsPaused] = useState(false);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const togglePause = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPaused(!isPaused);
  };

  // --- SCREEN CAPTURE LOGIC ---
  const captureMoment = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    
    setIsCapturing(true);
    
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64Image = canvas.toDataURL('image/jpeg', 0.6);
        
        const currentTime = Date.now() / 1000;
        const offset = currentTime - sessionStartTime;

        await axios.post(`${API_URL}/capture/screen`, {
          image_base64: base64Image,
          offset: offset,
          session_id: "demo_session"
        });
        console.log("Screen captured and saved!");
      }
    } catch (err) {
      console.error("Failed to capture screen:", err);
      alert("Failed to capture screen. Check the console.");
    }
    
    setIsCapturing(false);
  };

  // --- NOTE SAVE LOGIC ---
  const handleSaveNote = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!noteText.trim()) {
      setIsNoteOpen(false);
      return;
    }
    setIsSavingNote(true);
    try {
      const currentTime = Date.now() / 1000;
      const offset = currentTime - sessionStartTime;

      await axios.post(`${API_URL}/capture/note`, {
        text: noteText,
        offset: offset,
        session_id: "demo_session"
      });
      setNoteText('');
      setIsNoteOpen(false);
    } catch (err) {
      console.error("Failed to save note", err);
      alert("Failed to save note. Check the console for details.");
    }
    setIsSavingNote(false);
  };

  // --- VOICE RECORDING LOGIC ---
  const toggleVoiceRecording = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRecordingVoice) {
      mediaRecorderRef.current?.stop();
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

        const combinedStream = new MediaStream();
        micStream.getAudioTracks().forEach(track => combinedStream.addTrack(track));
        if (systemAudioTrack) combinedStream.addTrack(systemAudioTrack);
        
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        const combinedSource = audioContext.createMediaStreamSource(combinedStream);
        combinedSource.connect(analyser);
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
          
          // Calculate offset for the voice note
          const currentTime = Date.now() / 1000;
          const offset = currentTime - sessionStartTime;
          
          formData.append("offset", offset.toString());
          formData.append("session_id", "demo_session");

          setIsRecordingVoice(false);
          if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
          micStream.getTracks().forEach(track => track.stop());
          audioContext.close();

          try {
            await axios.post(`${API_URL}/capture/voice`, formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
            });
          } catch (err) {
            console.error("Failed to save voice note", err);
          }
        };

        mediaRecorder.start();
        setIsRecordingVoice(true);

        const draw = () => {
          animationFrameRef.current = requestAnimationFrame(draw);
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
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

      } catch (err) {
        console.error(err);
        alert("Microphone access denied.");
      }
    }
  };

  if (!isSharing) return null;

  const bgColor = '#111827';
  const borderColor = 'rgba(255,255,255,0.15)';
  const textColor = '#FFFFFF';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      
      {isNoteOpen && (
        <div style={{
          display: 'flex', alignItems: 'center', background: bgColor, borderRadius: '12px', border: `1px solid ${borderColor}`, padding: '4px 8px', width: 'fit-content'
        }}>
          <input
            autoFocus type="text" value={noteText} onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNote(); if (e.key === 'Escape') setIsNoteOpen(false); }}
            placeholder="Type note..."
            style={{ background: 'transparent', border: 'none', color: textColor, outline: 'none', width: '160px', fontSize: '13px' }}
            disabled={isSavingNote}
          />
          <button onClick={handleSaveNote} disabled={isSavingNote} style={{ background: 'none', border: 'none', color: '#10B981', cursor: 'pointer', padding: '2px' }}>
            <Check size={16} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setIsNoteOpen(false); }} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '2px' }}>
            <X size={16} />
          </button>
        </div>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', background: bgColor, borderRadius: '20px', border: `1px solid ${borderColor}`, padding: '6px 12px', gap: '8px'
      }}>
        <button onClick={(e) => { e.stopPropagation(); restartScreenShare(); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '50%', border: 'none', background: 'rgba(59, 130, 246, 0.15)', color: '#3B82F6', cursor: 'pointer' }}>
          <SwitchCamera size={16} />
        </button>
        <button onClick={togglePause} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '50%', border: 'none', background: isPaused ? 'rgba(107, 114, 128, 0.2)' : 'rgba(249, 115, 22, 0.15)', color: isPaused ? '#9CA3AF' : '#F97316', cursor: 'pointer' }}>
          {isPaused ? <Play size={16} /> : <Pause size={16} />}
        </button>
        <button onClick={(e) => { e.stopPropagation(); setIsNoteOpen(true); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '50%', border: 'none', background: 'rgba(107, 114, 128, 0.15)', color: '#D1D5DB', cursor: 'pointer' }}>
          <Type size={16} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button onClick={toggleVoiceRecording} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '50%', border: 'none', background: isRecordingVoice ? '#EF4444' : 'rgba(168, 85, 247, 0.15)', color: isRecordingVoice ? 'white' : '#A855F7', cursor: 'pointer' }}>
            <Mic size={16} />
          </button>
          {isRecordingVoice && <canvas ref={canvasRef} width="24" height="18" style={{ marginLeft: '4px' }} />}
        </div>
        <button onClick={captureMoment} disabled={isCapturing} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '50%', border: 'none', background: isCapturing ? 'rgba(107, 114, 128, 0.5)' : '#1A5D4A', color: 'white', cursor: 'pointer' }}>
          <Camera size={16} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); stopScreenShare(); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '50%', border: 'none', background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', cursor: 'pointer' }}>
          <Square size={14} fill="#EF4444" />
        </button>
      </div>
    </div>
  );
}