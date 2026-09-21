import React, { useState, useEffect, useRef } from 'react';
import { Upload, Play, Square, ChevronLeft, ChevronRight, Maximize, Mic, Clock, Zap } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

function App() {
  const [slides, setSlides] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [qaMessages, setQaMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [isAnswering, setIsAnswering] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [uploadLatency, setUploadLatency] = useState(null);
  const [streamLatency, setStreamLatency] = useState(null);
  const [ttsLatency, setTtsLatency] = useState(null);
  const [pdfNumPages, setPdfNumPages] = useState(null);

  const fileInputRef = useRef(null);
  const audioRef = useRef(null);
  const abortControllerRef = useRef(null);
  const mainViewRef = useRef(null);

  // Get current pdfUrl
  const currentPdfUrl = slides.length > 0 ? slides[0].pdfUrl : null;

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setSlides([]);
    setCurrentIndex(0);
    setTranscript('');
    setQaMessages([]);
    setUploadLatency(null);
    setStreamLatency(null);
    setTtsLatency(null);
    setPdfNumPages(null);
    stopNarration();

    const formData = new FormData();
    formData.append('presentation', file);

    try {
      const t0 = Date.now();
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      const elapsed = Date.now() - t0;
      setUploadLatency(elapsed);

      if (data.error) throw new Error(data.error);
      setSlides(data.slides || []);
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const stopNarration = () => {
    setIsPlaying(false);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const startNarration = async (index) => {
    stopNarration();
    if (index >= slides.length) return;
    
    setIsPlaying(true);
    setCurrentIndex(index);
    setTranscript('');
    setStreamLatency(null);
    setTtsLatency(null);
    
    const slide = slides[index];
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const t0 = Date.now();

      // 1. Stream the narration text
      const response = await fetch(`/api/narrate/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slideText: slide.text,
          slideNumber: slide.slideNumber,
          totalSlides: slides.length
        }),
        signal: abortController.signal
      });
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';
      let firstTokenMs = null;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (firstTokenMs === null) {
          firstTokenMs = Date.now() - t0;
        }
        
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop();
        
        for (const part of parts) {
          if (part.startsWith('data: ')) {
            try {
              const data = JSON.parse(part.slice(6));
              if (data.type === 'token') {
                fullText += data.token;
                setTranscript(fullText);
              }
            } catch (e) {
              // ignore
            }
          }
        }
      }

      setStreamLatency(firstTokenMs);

      // 2. Fetch TTS Audio
      const ttsT0 = Date.now();
      const ttsRes = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slideText: slide.text,
          slideNumber: slide.slideNumber,
          totalSlides: slides.length
        }),
        signal: abortController.signal
      });
      
      const ttsData = await ttsRes.json();
      setTtsLatency(Date.now() - ttsT0);

      if (ttsData.audioUrl) {
        setAudioUrl(ttsData.audioUrl);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Narration error:', err);
        setIsPlaying(false);
      }
    }
  };

  useEffect(() => {
    if (audioUrl && audioRef.current && isPlaying) {
      audioRef.current.src = audioUrl;
      audioRef.current.play().catch(e => console.error('Audio play error:', e));
    }
  }, [audioUrl]);

  const handleAudioEnded = () => {
    if (autoAdvance && currentIndex < slides.length - 1) {
      startNarration(currentIndex + 1);
    } else {
      setIsPlaying(false);
    }
  };

  const handleAskQuestion = async () => {
    if (!question.trim() || isAnswering) return;

    const newMsgs = [...qaMessages, { role: 'user', content: question }];
    setQaMessages(newMsgs);
    setQuestion('');
    setIsAnswering(true);

    const currentSlide = slides[currentIndex];
    
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
    }

    try {
      const response = await fetch(`/api/qa/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: newMsgs[newMsgs.length-1].content,
          currentSlide: currentSlide ? currentSlide.text : '',
          allSlides: slides.map(s => ({ slideNumber: s.slideNumber, text: s.text }))
        })
      });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let answerText = '';
      let buffer = '';
      setQaMessages([...newMsgs, { role: 'agent', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop();
        
        for (const part of parts) {
          if (part.startsWith('data: ')) {
            try {
              const data = JSON.parse(part.slice(6));
              if (data.type === 'token') {
                answerText += data.token;
                setQaMessages(prev => {
                  const copy = [...prev];
                  copy[copy.length - 1].content = answerText;
                  return copy;
                });
              } else if (data.type === 'done') {
                setQaMessages(prev => {
                  const copy = [...prev];
                  copy[copy.length - 1] = {
                    role: 'agent',
                    content: data.answer || answerText,
                    confidence: data.confidence,
                    disclaimer: data.disclaimer
                  };
                  return copy;
                });
              }
            } catch (e) {
              // ignore
            }
          }
        }
      }
    } catch (err) {
      console.error('QA Error:', err);
    } finally {
      setIsAnswering(false);
      if (isPlaying && audioRef.current) {
        audioRef.current.play().catch(() => {});
      }
    }
  };

  return (
    <div style={{ minHeight: '100vh', minWidth: '320px', padding: '16px', boxSizing: 'border-box' }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid rgba(99,102,241,0.15)', marginBottom: '16px' }}>
        <span style={{ fontSize: '24px', filter: 'drop-shadow(0 0 10px rgba(99,102,241,0.4))' }}>🎓</span>
        <h1 className="font-mono" style={{ fontSize: '20px', fontWeight: 700, background: 'linear-gradient(to right, #f8fafc, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
          AI Classroom Presenter
        </h1>
        {/* Latency badges */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {uploadLatency && (
            <span className="font-mono" style={{ fontSize: '11px', background: 'rgba(0,0,0,0.4)', color: '#94a3b8', padding: '2px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Zap size={10} /> Upload: {(uploadLatency/1000).toFixed(1)}s
            </span>
          )}
          {streamLatency && (
            <span className="font-mono" style={{ fontSize: '11px', background: 'rgba(0,0,0,0.4)', color: '#10b981', padding: '2px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={10} /> First Token: {streamLatency}ms
            </span>
          )}
          {ttsLatency && (
            <span className="font-mono" style={{ fontSize: '11px', background: 'rgba(0,0,0,0.4)', color: '#f59e0b', padding: '2px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={10} /> TTS: {(ttsLatency/1000).toFixed(1)}s
            </span>
          )}
        </div>
      </header>

      {/* Three-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 280px', gap: '12px', height: 'calc(100vh - 80px)', overflow: 'hidden' }}>
        
        {/* ═══ LEFT PANEL: Slide Deck ═══ */}
        <div style={{ background: 'rgba(15,18,28,0.75)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="font-mono" style={{ padding: '10px 12px', borderBottom: '1px solid rgba(99,102,241,0.15)', background: 'rgba(255,255,255,0.03)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#818cf8' }}>
            Slide Deck ({slides.length})
          </div>
          
          {/* Upload area */}
          <div 
            onClick={() => fileInputRef.current?.click()}
            style={{ margin: '8px', padding: '14px 8px', border: '2px dashed rgba(99,102,241,0.2)', borderRadius: '12px', textAlign: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <Upload style={{ margin: '0 auto 6px', color: '#94a3b8' }} size={18} />
            <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0 0 6px' }}>Upload PDF or PPTX</p>
            <span style={{ background: '#6366f1', color: '#fff', fontSize: '11px', padding: '3px 14px', borderRadius: '6px', fontWeight: 500 }}>Browse</span>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }}
              accept=".pdf,.pptx" 
              onChange={handleUpload}
            />
          </div>

          {/* Thumbnail list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {isUploading && (
              <div style={{ textAlign: 'center', fontSize: '12px', color: '#94a3b8', padding: '16px 0' }}>Processing...</div>
            )}
            
            {currentPdfUrl && slides.length > 0 && (
              <Document 
                file={currentPdfUrl} 
                onLoadSuccess={({ numPages }) => setPdfNumPages(numPages)}
                loading={<div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '11px', padding: '12px' }}>Loading PDF...</div>}
                error={<div style={{ textAlign: 'center', color: '#ef4444', fontSize: '11px', padding: '12px' }}>PDF load error</div>}
              >
                {slides.map((slide, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => {
                      setCurrentIndex(idx);
                      if (isPlaying) startNarration(idx);
                    }}
                    style={{
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: currentIndex === idx ? '2px solid #6366f1' : '1px solid rgba(99,102,241,0.15)',
                      cursor: 'pointer',
                      background: currentIndex === idx ? 'rgba(99,102,241,0.1)' : 'rgba(22,26,38,0.6)',
                      boxShadow: currentIndex === idx ? '0 0 12px rgba(99,102,241,0.2)' : 'none',
                      transition: 'all 0.2s',
                      marginBottom: '4px',
                    }}
                  >
                    <div style={{ height: '100px', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                      <Page 
                        pageNumber={slide.slideNumber} 
                        width={170} 
                        renderTextLayer={false} 
                        renderAnnotationLayer={false} 
                      />
                      <div className="font-mono" style={{ position: 'absolute', top: '3px', left: '3px', background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: '9px', padding: '1px 4px', borderRadius: '3px' }}>
                        {slide.slideNumber}
                      </div>
                    </div>
                    <div style={{ padding: '4px 6px' }}>
                      <div className="font-mono" style={{ fontSize: '9px', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase' }}>Slide {slide.slideNumber}</div>
                    </div>
                  </div>
                ))}
              </Document>
            )}

            {/* Fallback: no PDF available */}
            {!currentPdfUrl && slides.length > 0 && slides.map((slide, idx) => (
              <div 
                key={idx} 
                onClick={() => {
                  setCurrentIndex(idx);
                  if (isPlaying) startNarration(idx);
                }}
                style={{
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: currentIndex === idx ? '2px solid #6366f1' : '1px solid rgba(99,102,241,0.15)',
                  cursor: 'pointer',
                  background: currentIndex === idx ? 'rgba(99,102,241,0.1)' : 'rgba(22,26,38,0.6)',
                  transition: 'all 0.2s',
                  marginBottom: '4px',
                }}
              >
                <div style={{ height: '60px', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="font-mono" style={{ fontSize: '20px', fontWeight: 700, color: '#fff' }}>{slide.slideNumber}</span>
                </div>
                <div style={{ padding: '4px 6px' }}>
                  <div className="font-mono" style={{ fontSize: '9px', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase' }}>Slide {slide.slideNumber}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ CENTER PANEL: Main Slide View ═══ */}
        <div style={{ background: 'rgba(15,18,28,0.75)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Slide viewer */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#111520', borderRadius: '12px', margin: '8px', overflow: 'hidden', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.6)', border: '1px solid rgba(99,102,241,0.15)' }}>
            {/* Top bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid rgba(99,102,241,0.15)', flexShrink: 0 }}>
              <span className="font-mono" style={{ fontSize: '11px', color: '#94a3b8' }}>
                Slide {slides.length > 0 ? currentIndex + 1 : 0} of {slides.length}
              </span>
              <button style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <Maximize size={14} />
              </button>
            </div>
            
            {/* Slide content - FIXED: use overflow:auto so the slide scrolls within this box */}
            <div ref={mainViewRef} style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, #1a2233 0%, #0d121c 100%)' }}>
              {slides.length === 0 ? (
                <p className="font-mono" style={{ color: '#94a3b8', fontSize: '14px' }}>Upload a presentation to begin</p>
              ) : (
                currentPdfUrl ? (
                  <Document 
                    file={currentPdfUrl} 
                    loading={<p style={{ color: '#94a3b8' }}>Loading...</p>}
                  >
                    <Page 
                      pageNumber={slides[currentIndex]?.slideNumber || 1} 
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                  </Document>
                ) : (
                  <div style={{ width: '100%', padding: '32px', overflowY: 'auto', color: '#e2e8f0', fontSize: '16px', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {slides[currentIndex]?.text.replace(/--- VISUAL DESCRIPTION ---[\s\S]*/, '')}
                  </div>
                )
              )}
            </div>
          </div>

          {/* Controls */}
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button 
                disabled={currentIndex === 0 || slides.length === 0}
                onClick={() => {
                  setCurrentIndex(prev => prev - 1);
                  if (isPlaying) startNarration(currentIndex - 1);
                }}
                className="font-mono"
                style={{ background: 'rgba(22,26,38,0.6)', border: '1px solid rgba(99,102,241,0.15)', color: '#fff', fontSize: '13px', fontWeight: 700, padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', opacity: (currentIndex === 0 || slides.length === 0) ? 0.4 : 1 }}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              
              {!isPlaying ? (
                <button 
                  disabled={slides.length === 0}
                  onClick={() => startNarration(currentIndex)}
                  className="font-mono"
                  style={{ background: '#6366f1', border: '1px solid #6366f1', color: '#fff', fontSize: '13px', fontWeight: 700, padding: '8px 18px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: slides.length === 0 ? 0.4 : 1 }}
                >
                  <Play size={14} /> Play Lesson
                </button>
              ) : (
                <button 
                  onClick={stopNarration}
                  className="font-mono"
                  style={{ background: 'rgba(22,26,38,0.6)', border: '1px solid rgba(99,102,241,0.15)', color: '#fff', fontSize: '13px', fontWeight: 700, padding: '8px 18px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Square size={14} /> Stop
                </button>
              )}

              <button 
                disabled={currentIndex === slides.length - 1 || slides.length === 0}
                onClick={() => {
                  setCurrentIndex(prev => prev + 1);
                  if (isPlaying) startNarration(currentIndex + 1);
                }}
                className="font-mono"
                style={{ background: 'rgba(22,26,38,0.6)', border: '1px solid rgba(99,102,241,0.15)', color: '#fff', fontSize: '13px', fontWeight: 700, padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', opacity: (currentIndex === slides.length - 1 || slides.length === 0) ? 0.4 : 1 }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#94a3b8', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={autoAdvance} 
                onChange={(e) => setAutoAdvance(e.target.checked)}
                style={{ accentColor: '#6366f1' }}
              />
              Auto-advance to next slide
            </label>
          </div>
        </div>

        {/* ═══ RIGHT PANEL: Transcription + Q&A ═══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'hidden' }}>
          
          {/* Teleprompter */}
          <div style={{ flex: 1, background: 'rgba(15,18,28,0.75)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            <div className="font-mono" style={{ padding: '10px 12px', borderBottom: '1px solid rgba(99,102,241,0.15)', background: 'rgba(255,255,255,0.03)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#818cf8', flexShrink: 0 }}>
              Lesson Transcription
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', background: 'rgba(0,0,0,0.1)' }}>
              <div className="font-mono" style={{ fontSize: '13px', lineHeight: 1.6, color: '#10b981', whiteSpace: 'pre-wrap', textShadow: '0 0 1px rgba(16,185,129,0.4)' }}>
                {transcript || (isPlaying ? "Thinking..." : "Start the narration to see the live teacher script...")}
              </div>
            </div>
          </div>

          {/* Q&A */}
          <div style={{ flex: 1.5, background: 'rgba(15,18,28,0.75)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            <div className="font-mono" style={{ padding: '10px 12px', borderBottom: '1px solid rgba(99,102,241,0.15)', background: 'rgba(255,255,255,0.03)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#818cf8', flexShrink: 0 }}>
              Classroom Q&A
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {qaMessages.length === 0 ? (
                <div style={{ textAlign: 'center', fontSize: '12px', color: '#94a3b8', padding: '32px 0' }}>
                  Ask your AI teacher questions about the presentation.
                </div>
              ) : (
                qaMessages.map((msg, i) => (
                  <div key={i} style={{
                    padding: '10px 12px',
                    borderRadius: '12px',
                    fontSize: '13px',
                    lineHeight: 1.5,
                    maxWidth: '90%',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    ...(msg.role === 'user' 
                      ? { background: 'rgba(22,26,38,0.6)', alignSelf: 'flex-end', borderRight: '3px solid #6366f1' }
                      : { background: 'rgba(99,102,241,0.08)', alignSelf: 'flex-start', borderLeft: '3px solid #818cf8' }
                    )
                  }}>
                    {msg.role === 'user' && <div className="font-mono" style={{ fontSize: '10px', color: '#818cf8', marginBottom: '4px' }}>YOU</div>}
                    <div style={{ color: '#f8fafc' }}>{msg.content || (isAnswering && i === qaMessages.length - 1 ? 'Thinking...' : '')}</div>
                    
                    {msg.confidence && (
                      <div className="font-mono" style={{
                        marginTop: '8px',
                        display: 'inline-flex',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        ...(msg.confidence === 'high' ? { background: 'rgba(16,185,129,0.15)', color: '#10b981' } :
                            msg.confidence === 'medium' ? { background: 'rgba(245,158,11,0.15)', color: '#f59e0b' } :
                            { background: 'rgba(239,68,68,0.15)', color: '#ef4444' })
                      }}>
                        {msg.confidence} CONFIDENCE
                      </div>
                    )}
                    {msg.disclaimer && (
                      <div style={{ marginTop: '6px', fontSize: '11px', color: '#f59e0b', fontStyle: 'italic' }}>{msg.disclaimer}</div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(99,102,241,0.15)', background: 'rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(22,26,38,0.6)', border: '1px solid rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#94a3b8', flexShrink: 0 }}>
                <Mic size={16} />
              </button>
              <input 
                type="text" 
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAskQuestion()}
                placeholder="Ask a question..."
                style={{ flex: 1, background: 'rgba(0,0,0,0.2)', fontSize: '13px', color: '#fff', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '8px', padding: '8px 12px', outline: 'none' }}
                disabled={isAnswering}
              />
              <button 
                onClick={handleAskQuestion}
                disabled={!question.trim() || isAnswering}
                style={{ background: '#6366f1', color: '#fff', fontSize: '13px', fontWeight: 600, padding: '8px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', opacity: (!question.trim() || isAnswering) ? 0.5 : 1 }}
              >
                Ask
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden audio */}
      <audio ref={audioRef} onEnded={handleAudioEnded} style={{ display: 'none' }} />
    </div>
  );
}

export default App;
