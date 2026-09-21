import React, { useState, useEffect, useRef } from 'react';
import { Upload, Play, Square, ChevronLeft, ChevronRight, Maximize, Mic } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

function ThumbnailPage({ slide }) {
  const [inView, setInView] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
      { rootMargin: '300px' }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="pointer-events-none flex items-center justify-center w-full h-full min-h-[50px]">
      {inView ? (
        <Page pageNumber={slide.slideNumber} width={200} renderTextLayer={false} renderAnnotationLayer={false} className="shadow-sm" />
      ) : null}
    </div>
  );
}

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
  const [latency, setLatency] = useState(null);
  const [ttsLatency, setTtsLatency] = useState(null);

  const fileInputRef = useRef(null);
  const audioRef = useRef(null);
  const abortControllerRef = useRef(null);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setSlides([]);
    setCurrentIndex(0);
    setTranscript('');
    setQaMessages([]);
    setLatency(null);
    setTtsLatency(null);
    stopNarration();

    const formData = new FormData();
    formData.append('presentation', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
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
    
    const slide = slides[index];
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const startTime = Date.now();
      let firstTokenTime = null;
      
      // 1. Stream the text
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
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        if (!firstTokenTime) {
          firstTokenTime = Date.now() - startTime;
          setTtsLatency((prev) => (prev ? prev : `First Token: ${firstTokenTime}ms`));
        }

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop(); // Keep the incomplete part
        
        for (const part of parts) {
          if (part.startsWith('data: ')) {
            try {
              const data = JSON.parse(part.slice(6));
              if (data.type === 'token') {
                fullText += data.token;
                setTranscript(fullText);
              }
            } catch (e) {
              // Parse error on incomplete chunk, ignore
            }
          }
        }
      }

      // 2. Fetch TTS Audio
      const ttsStartTime = Date.now();
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
      setTtsLatency(`API: ${firstTokenTime}ms | TTS: ${Date.now() - ttsStartTime}ms`);

      if (ttsData.audioUrl) {
        setAudioUrl(ttsData.audioUrl);
        if (audioRef.current) {
          // Play will happen automatically in useEffect when audioUrl changes
        }
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
    
    // Pause narration while answering
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
              // ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      console.error('QA Error:', err);
    } finally {
      setIsAnswering(false);
      // Resume narration if it was playing
      if (isPlaying && audioRef.current) {
        audioRef.current.play().catch(() => {});
      }
    }
  };

  return (
    <div className="min-h-screen w-full overflow-y-auto overflow-x-hidden flex flex-col p-4 bg-bg-app">
      {/* Header */}
      <header className="flex items-center gap-3 pb-3 border-b border-border-subtle mb-4">
        <span className="text-2xl drop-shadow-[0_0_10px_var(--color-accent)]">🎓</span>
        <h1 className="font-mono text-xl font-bold bg-gradient-to-r from-white to-accent-hover bg-clip-text text-transparent">
          AI Classroom Presenter
        </h1>
      </header>

      {/* Main Grid */}
      <main className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4">
        
        {/* Left Panel */}
        <section className="w-full lg:w-[240px] flex-shrink-0 bg-bg-panel backdrop-blur-xl border border-border-subtle rounded-2xl flex flex-col overflow-hidden max-h-[300px] lg:max-h-none">
          <div className="p-3 border-b border-border-subtle bg-white/5 uppercase text-xs font-mono font-bold text-accent-hover tracking-wider flex justify-between items-center">
            <span>Slide Deck</span>
            {latency && <span className="text-[10px] text-text-secondary bg-black/40 px-2 py-0.5 rounded">⚡ {latency}ms</span>}
          </div>
          
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="m-4 p-6 border-2 border-dashed border-border-subtle rounded-xl text-center cursor-pointer hover:border-accent hover:bg-accent/10 transition-colors shrink-0"
          >
            <Upload className="mx-auto text-text-secondary mb-2" />
            <p className="text-xs text-text-secondary mb-3">Upload PDF or PPTX</p>
            <button className="bg-accent hover:bg-accent-hover text-white text-xs px-4 py-1.5 rounded-md font-medium transition-colors">
              Browse
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".pdf,.pptx" 
              onChange={handleUpload}
            />
          </div>

          <div className="flex-1 overflow-y-auto p-4 pt-0 flex flex-col gap-3">
            {isUploading && (
              <div className="text-center text-sm text-text-secondary animate-pulse">Processing presentation...</div>
            )}
            
            {slides.length > 0 && slides[0].pdfUrl ? (
              <Document file={slides[0].pdfUrl}>
                {slides.map((slide, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => {
                      setCurrentIndex(idx);
                      if (isPlaying) startNarration(idx);
                    }}
                    className={`
                      rounded-lg overflow-hidden border cursor-pointer transition-all mb-3
                      ${currentIndex === idx ? 'border-accent ring-2 ring-accent/30 bg-accent/10' : 'border-border-subtle bg-bg-card hover:border-accent'}
                    `}
                  >
                    <div className="h-28 bg-black flex items-center justify-center border-b border-border-subtle relative overflow-hidden group">
                      <ThumbnailPage slide={slide} />
                      <div className="absolute top-1 left-1 bg-black/80 text-[10px] px-1.5 py-0.5 rounded text-white font-mono z-10">{slide.slideNumber}</div>
                    </div>
                    <div className="p-2">
                      <div className="font-mono text-[10px] font-bold text-accent-hover uppercase">Slide {slide.slideNumber}</div>
                    </div>
                  </div>
                ))}
              </Document>
            ) : (
              slides.map((slide, idx) => (
                <div 
                  key={idx} 
                  onClick={() => {
                    setCurrentIndex(idx);
                    if (isPlaying) startNarration(idx);
                  }}
                  className={`
                    rounded-lg overflow-hidden border cursor-pointer transition-all mb-3
                    ${currentIndex === idx ? 'border-accent ring-2 ring-accent/30 bg-accent/10' : 'border-border-subtle bg-bg-card hover:border-accent'}
                  `}
                >
                  <div className="h-24 bg-black flex items-center justify-center border-b border-border-subtle relative overflow-hidden group">
                    <div className="font-mono text-2xl font-bold text-white shadow-sm">{slide.slideNumber}</div>
                  </div>
                  <div className="p-2">
                    <div className="font-mono text-[10px] font-bold text-accent-hover uppercase">Slide {slide.slideNumber}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Center Panel */}
        <section className="flex-1 flex flex-col min-h-[400px] lg:min-h-0 bg-bg-panel backdrop-blur-xl border border-border-subtle rounded-2xl p-4">
          <div className="flex-1 min-h-0 flex flex-col bg-bg-blackboard border border-border-subtle rounded-xl relative overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,0.6)]">
            <div className="flex justify-between items-center p-2.5 bg-black/40 border-b border-border-subtle z-10">
              <div className="font-mono text-xs text-text-secondary">
                Slide {slides.length > 0 ? currentIndex + 1 : 0} of {slides.length}
              </div>
              <button className="text-text-secondary hover:text-white p-1 hover:bg-white/10 rounded transition-colors">
                <Maximize size={16} />
              </button>
            </div>
            
            <div className="flex-1 flex items-center justify-center p-4 relative bg-[radial-gradient(circle,#1a2233_0%,#0d121c_100%)] overflow-hidden">
              {slides.length === 0 ? (
                <p className="text-text-secondary font-mono text-sm">Upload a presentation to begin</p>
              ) : (
                slides[currentIndex]?.pdfUrl ? (
                  <Document file={slides[currentIndex].pdfUrl} loading="Loading slide...">
                    <Page 
                      pageNumber={slides[currentIndex].slideNumber} 
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      className="shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                    />
                  </Document>
                ) : (
                  <div className="w-full h-full p-8 overflow-y-auto text-text-blackboard text-lg leading-relaxed whitespace-pre-wrap drop-shadow-md">
                    {slides[currentIndex]?.text.replace(/--- VISUAL DESCRIPTION ---[\s\S]*/, '')}
                  </div>
                )
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-col items-center gap-3">
            <div className="flex items-center gap-3">
              <button 
                disabled={currentIndex === 0 || slides.length === 0}
                onClick={() => {
                  setCurrentIndex(prev => prev - 1);
                  if (isPlaying) startNarration(currentIndex - 1);
                }}
                className="bg-bg-card border border-border-subtle hover:border-accent hover:bg-accent/10 disabled:opacity-40 disabled:hover:border-border-subtle text-white font-mono text-sm font-bold px-4 py-2 rounded-lg transition-all flex items-center gap-1"
              >
                <ChevronLeft size={16} /> Prev
              </button>
              
              {!isPlaying ? (
                <button 
                  disabled={slides.length === 0}
                  onClick={() => startNarration(currentIndex)}
                  className="bg-accent border border-accent hover:bg-accent-hover hover:shadow-[0_0_15px_var(--color-accent-glow)] disabled:opacity-40 text-white font-mono text-sm font-bold px-5 py-2 rounded-lg transition-all flex items-center gap-2"
                >
                  <Play size={16} /> Play Lesson
                </button>
              ) : (
                <button 
                  onClick={stopNarration}
                  className="bg-bg-card border border-border-subtle hover:border-danger hover:text-danger disabled:opacity-40 text-white font-mono text-sm font-bold px-5 py-2 rounded-lg transition-all flex items-center gap-2"
                >
                  <Square size={16} /> Stop
                </button>
              )}

              <button 
                disabled={currentIndex === slides.length - 1 || slides.length === 0}
                onClick={() => {
                  setCurrentIndex(prev => prev + 1);
                  if (isPlaying) startNarration(currentIndex + 1);
                }}
                className="bg-bg-card border border-border-subtle hover:border-accent hover:bg-accent/10 disabled:opacity-40 disabled:hover:border-border-subtle text-white font-mono text-sm font-bold px-4 py-2 rounded-lg transition-all flex items-center gap-1"
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
            
            {ttsLatency && (
              <div className="text-[10px] text-text-secondary bg-black/40 px-2 py-1 rounded font-mono">
                {ttsLatency}
              </div>
            )}
            
            <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer hover:text-white transition-colors">
              <input 
                type="checkbox" 
                checked={autoAdvance} 
                onChange={(e) => setAutoAdvance(e.target.checked)}
                className="accent-accent"
              />
              Auto-advance to next slide
            </label>
          </div>
        </section>

        {/* Right Panel */}
        <section className="w-full lg:w-[320px] flex-shrink-0 flex flex-col gap-4 min-h-[500px] lg:min-h-0 lg:h-full">
          {/* Teleprompter */}
          <div className="flex-1 bg-bg-panel backdrop-blur-xl border border-border-subtle rounded-2xl flex flex-col overflow-hidden max-h-[300px]">
            <div className="p-3 border-b border-border-subtle bg-white/5 uppercase text-xs font-mono font-bold text-accent-hover tracking-wider">
              Lesson Transcription
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-black/15">
              <div className="font-mono text-sm leading-relaxed text-emerald-400 whitespace-pre-wrap drop-shadow-[0_0_1px_rgba(16,185,129,0.4)]">
                {transcript || (isPlaying ? "Thinking..." : "Start the narration to see the live teacher script...")}
              </div>
            </div>
          </div>

          {/* Q&A */}
          <div className="flex-[1.5] bg-bg-panel backdrop-blur-xl border border-border-subtle rounded-2xl flex flex-col overflow-hidden min-h-0">
            <div className="p-3 border-b border-border-subtle bg-white/5 uppercase text-xs font-mono font-bold text-accent-hover tracking-wider">
              Classroom Q&A
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {qaMessages.length === 0 ? (
                <div className="text-center text-xs text-text-secondary py-8">
                  Ask your AI teacher questions about the presentation.
                </div>
              ) : (
                qaMessages.map((msg, i) => (
                  <div key={i} className={`p-3 rounded-xl text-sm leading-relaxed max-w-[90%] shadow-md ${
                    msg.role === 'user' 
                      ? 'bg-bg-card self-end border-r-4 border-accent' 
                      : 'bg-accent/10 self-start border-l-4 border-accent-hover'
                  }`}>
                    {msg.role === 'user' && <div className="font-mono text-[10px] text-accent-hover mb-1">YOU</div>}
                    <div className="text-white">{msg.content || (isAnswering && i === qaMessages.length - 1 ? 'Thinking...' : '')}</div>
                    
                    {msg.confidence && (
                      <div className={`mt-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase
                        ${msg.confidence === 'high' ? 'bg-emerald-500/15 text-emerald-500' : 
                          msg.confidence === 'medium' ? 'bg-amber-500/15 text-amber-500' : 
                          'bg-red-500/15 text-red-500'}`}
                      >
                        {msg.confidence} CONFIDENCE
                      </div>
                    )}
                    {msg.disclaimer && (
                      <div className="mt-1.5 text-[11px] text-amber-500 italic">{msg.disclaimer}</div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="p-3 border-t border-border-subtle bg-black/10 flex items-center gap-2">
              <button className="w-10 h-10 rounded-full bg-bg-card border border-border-subtle flex items-center justify-center flex-shrink-0 hover:border-accent hover:text-accent-hover transition-colors shadow-sm text-text-primary">
                <Mic size={18} />
              </button>
              <input 
                type="text" 
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAskQuestion()}
                placeholder="Ask a question..."
                className="flex-1 bg-black/20 text-sm text-white border border-border-subtle rounded-lg px-3 py-2 outline-none focus:border-border-focus focus:bg-black/30 transition-colors"
                disabled={isAnswering}
              />
              <button 
                onClick={handleAskQuestion}
                disabled={!question.trim() || isAnswering}
                className="bg-accent hover:bg-accent-hover text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                Ask
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Hidden audio element */}
      <audio 
        ref={audioRef} 
        onEnded={handleAudioEnded}
        className="hidden" 
      />
    </div>
  );
}

export default App;
