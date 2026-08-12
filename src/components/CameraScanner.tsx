import React, { useRef, useEffect, useState } from 'react';
import { Camera, X, Check, RefreshCw, UploadCloud, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth, doc, updateDoc, serverTimestamp } from '../firebase';

interface CameraScannerProps {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
  title: string;
}

const CameraScanner: React.FC<CameraScannerProps> = ({ onCapture, onClose, title }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    setIsInitializing(true);
    setError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not supported in this browser context.');
      }

      // Stop any existing tracks
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      // Primary attempt: High-quality environment camera
      const primaryConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      };
      
      let newStream;
      try {
        newStream = await navigator.mediaDevices.getUserMedia(primaryConstraints);
      } catch (e) {
        console.warn('Environment camera failed, trying fallback constraints...');
        newStream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } 
        }).catch(() => navigator.mediaDevices.getUserMedia({ video: true }));
      }

      setStream(newStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        
        // Force play with multiple event listeners
        const playVideo = async () => {
          try {
            if (videoRef.current) {
              await videoRef.current.play();
              console.log("Camera playing successfully");
            }
          } catch (e) {
            console.error("Auto-play failed:", e);
          }
        };

        videoRef.current.onloadedmetadata = playVideo;
        videoRef.current.onloadeddata = playVideo;
        
        // Final fallback play
        setTimeout(playVideo, 1000);
      }
      setIsInitializing(false);
    } catch (err: any) {
      console.error('Error accessing camera:', err);
      let errorMsg = 'Could not access camera.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'Camera permission denied. Please allow camera access in your browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'No camera found on this device.';
      }
      setError(errorMsg);
      setIsInitializing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCapturedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const capturePhoto = async () => {
    if (videoRef.current && canvasRef.current) {
      setIsProcessing(true);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        
        // Simulate auto-scan delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        setCapturedImage(dataUrl);
        setIsProcessing(false);
      }
    }
  };

  const handleConfirm = async () => {
    if (capturedImage && canvasRef.current) {
      setIsProcessing(true);
      try {
        const user = auth.currentUser;
        if (user) {
          // In a real app, we'd upload to Storage and get a URL.
          // Here we simulate the process and update Firestore.
          const userRef = doc(db, 'users', user.uid);
          
          await updateDoc(userRef, {
            verificationStatus: 'pending',
            verificationSubmittedAt: serverTimestamp(),
            lastKycStep: title,
            // We store the base64 as a placeholder since Storage isn't available via tools
            kycPreview: capturedImage.substring(0, 5000) // Small preview
          });
        }
        
        canvasRef.current.toBlob((blob) => {
          if (blob) {
            onCapture(blob);
            onClose();
          }
        }, 'image/jpeg', 0.9);
      } catch (err) {
        console.error("KYC Submission Error:", err);
        setError("Failed to submit verification. Please try again.");
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1000] bg-black flex flex-col items-center justify-center overflow-hidden"
    >
      <div className="absolute top-0 left-0 right-0 p-6 flex items-center justify-between z-20">
        <button onClick={onClose} className="p-2 bg-white/10 rounded-full text-white backdrop-blur-md">
          <X size={24} />
        </button>
        <h3 className="text-white font-bold tracking-tight text-sm uppercase">{title}</h3>
        <div className="w-10" /> {/* Spacer */}
      </div>

      <div className="relative w-full h-full flex flex-col items-center justify-center">
        {isInitializing && (
          <div className="flex flex-col items-center gap-4 text-white">
            <RefreshCw className="animate-spin text-yellow-500" size={40} />
            <p className="text-sm font-medium animate-pulse">Initializing Lens...</p>
          </div>
        )}

        {isProcessing && (
          <div className="absolute inset-0 z-30 bg-black/80 flex flex-col items-center justify-center gap-6">
             <div className="relative w-24 h-24">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 border-4 border-yellow-500/20 border-t-yellow-500 rounded-full"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Camera size={32} className="text-yellow-500" />
                </div>
             </div>
             <div className="text-center space-y-2">
                <h4 className="text-xl font-bold text-white tracking-tight">Auto-Scanning Document</h4>
                <p className="text-gray-400 text-xs font-medium uppercase tracking-widest">Identifying security features...</p>
             </div>
          </div>
        )}

        {error && (
          <div className="p-8 text-center text-white space-y-6">
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
              <p className="text-red-400 font-bold mb-2">Camera Error</p>
              <p className="text-gray-400 text-sm">{error}</p>
            </div>
            
            <div className="flex flex-col gap-3">
              <button 
                onClick={startCamera}
                className="w-full py-4 bg-yellow-500 text-black font-black uppercase tracking-widest rounded-2xl shadow-lg active:scale-[0.98] transition-all"
              >
                Retry Camera
              </button>
              
              <div className="relative">
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <button className="w-full py-4 bg-white/5 border border-white/10 text-white font-black uppercase tracking-widest rounded-2xl active:scale-[0.98] transition-all">
                  Upload Manually
                </button>
              </div>
            </div>

            <p className="text-gray-500 text-[10px] leading-relaxed">
              If the camera screen remains black, it may be blocked by your phone's privacy settings. Manual upload is allowed for NID verification.
            </p>
          </div>
        )}

        {!isInitializing && !error && (
          <>
            <div className="relative w-full max-w-[90vw] aspect-[3/4] md:aspect-[4/3] max-h-[60vh] overflow-hidden rounded-[32px] border-2 border-white/10 shadow-2xl">
              {capturedImage ? (
                <img src={capturedImage} className="w-full h-full object-cover" alt="Captured"  loading="lazy" />
              ) : (
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted
                  className="w-full h-full object-cover"
                />
              )}

              {/* ID FRAME OVERLAY */}
              {!capturedImage && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="relative w-[85%] aspect-[1.58/1] border-2 border-white/40 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]">
                    {/* Corners */}
                    <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-yellow-500 rounded-tl-xl" />
                    <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-yellow-500 rounded-tr-xl" />
                    <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-yellow-500 rounded-bl-xl" />
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-yellow-500 rounded-br-xl" />
                    
                    {/* Scanning Line Animation */}
                    <motion.div 
                      animate={{ top: ['0%', '100%'] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                      className="absolute left-0 right-0 h-1 bg-yellow-500/60 shadow-[0_0_20px_rgba(234,179,8,0.9)] z-10"
                    >
                       <div className="w-full h-full bg-gradient-to-b from-transparent via-yellow-500/40 to-transparent" />
                    </motion.div>
                    
                    {/* Visual hints */}
                    <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none" />
                  </div>
                  <div className="mt-8 flex flex-col items-center gap-2">
                    <p className="text-white/90 text-[11px] font-black uppercase tracking-[0.3em] animate-pulse">
                      Processing security features
                    </p>
                    <div className="flex gap-1">
                       <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1, delay: 0 }} className="w-1 h-1 bg-yellow-500 rounded-full" />
                       <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1 h-1 bg-yellow-500 rounded-full" />
                       <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1 h-1 bg-yellow-500 rounded-full" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-6 px-6">
              {!capturedImage && (
                <div className="relative">
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <button className="text-yellow-500 text-[10px] font-black uppercase tracking-widest border-b border-yellow-500/30 pb-1">
                    Camera not working? Click here to upload photo
                  </button>
                </div>
              )}

              <div className="flex items-center justify-center gap-8">
                {capturedImage ? (
                  <>
                    <button 
                      onClick={handleRetake}
                      className="flex flex-col items-center gap-2 group"
                    >
                      <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white border border-white/10 group-active:scale-90 transition-all">
                        <RefreshCw size={28} />
                      </div>
                      <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Retake</span>
                    </button>
                    
                    <button 
                      onClick={handleConfirm}
                      className="flex flex-col items-center gap-2 group"
                    >
                      <div className="w-20 h-20 rounded-full bg-yellow-500 flex items-center justify-center text-black shadow-lg shadow-yellow-500/20 group-active:scale-95 transition-all">
                        <Check size={40} strokeWidth={3} />
                      </div>
                      <span className="text-[10px] text-yellow-500 font-black uppercase tracking-widest">Confirm & Save</span>
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={capturePhoto}
                    className="relative group flex items-center justify-center"
                  >
                    <div className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center group-active:scale-90 transition-all">
                      <div className="w-16 h-16 rounded-full bg-white shadow-xl" />
                    </div>
                    <div className="absolute -top-12 px-4 py-2 bg-yellow-500 text-black text-[10px] font-black uppercase tracking-widest rounded-lg shadow-lg">
                      Tap to Capture
                    </div>
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </motion.div>
  );
};

export default CameraScanner;
