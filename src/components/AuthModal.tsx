import React, { useState } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, googleProvider, signInWithPopup, sendPasswordResetEmail, sendEmailVerification, signOut } from '../firebase';
import { doc, setDoc, getDoc, updateDoc, increment } from '../firebase';
import { getNextAffiliateId, getUserByAffiliateId } from '../lib/affiliate';
import { motion, AnimatePresence } from 'motion/react';
import { currencies } from '../lib/currencies';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: 'login' | 'register';
  onSuccess: () => void;
}

export function AuthModal({ isOpen, onClose, initialView = 'login', onSuccess }: AuthModalProps) {
  const [view, setView] = useState<'login' | 'register' | 'forgot_password' | 'verify_otp' | 'reset_password'>(initialView);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [currency, setCurrency] = useState('BDT');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [characterState, setCharacterState] = useState<'idle' | 'success' | 'error' | 'thinking'>('idle');
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // New states for custom 6-digit OTP password reset workflow
  const [otpCode, setOtpCode] = useState<string[]>(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleOtpChange = (index: number, val: string) => {
    const cleaned = val.replace(/[^0-9]/g, '');
    const newOtp = [...otpCode];
    newOtp[index] = cleaned.substring(cleaned.length - 1);
    setOtpCode(newOtp);

    // Auto-focus next input if a number is typed
    if (cleaned && index < 5) {
      const nextInput = document.getElementById(`modal-otp-input-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      const prevInput = document.getElementById(`modal-otp-input-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim().replace(/[^0-9]/g, '');
    if (pastedData.length >= 6) {
      const newOtp = [pastedData[0], pastedData[1], pastedData[2], pastedData[3], pastedData[4], pastedData[5]];
      setOtpCode(newOtp);
      document.getElementById('modal-otp-input-5')?.focus();
    }
  };

  // Sync state if initialView changes when opening modal
  React.useEffect(() => {
    if (isOpen) {
      setView(initialView);
      setError(null);
      setSuccessMsg(null);
      setCharacterState('idle');
    }
  }, [isOpen, initialView]);

  // Update character state based on error/loading
  React.useEffect(() => {
    if (loading) {
      setCharacterState('thinking');
    } else if (error) {
      setCharacterState('error');
    } else if (successMsg) {
      setCharacterState('success');
    } else {
      setCharacterState('idle');
    }
  }, [loading, error, successMsg]);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    try {
      setError(null);
      setLoading(true);
      const result = await signInWithPopup(auth, googleProvider);
      const token = await result.user.getIdToken();
      
      // Sync with backend
      const response = await fetch('/api/auth/firebase-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Backend sync failed');
      
      // Store token
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      onSuccess();
      onClose();
    } catch (err: any) {
      if (err.code === 'auth/popup-blocked') {
        setError('Popup blocked by browser. Please allow popups.');
      } else {
        setError(err.message || 'Failed to sign in with Google');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFacebookSignIn = async () => {
    // Placeholder for FB auth
    setError("Facebook login is not configured yet.");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (view === 'register' && !agreed) {
        setError("Please agree to the Service agreement.");
        return;
    }
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
        if (view === 'forgot_password') {
            const response = await fetch('/api/auth/forgot-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to request OTP');
            
            setSuccessMsg("A 6-digit OTP code has been sent to your email!");
            setView('verify_otp');
        } else if (view === 'verify_otp') {
            const otpStr = otpCode.join('');
            if (otpStr.length < 6) throw new Error('Please enter the full 6-digit OTP code');
            
            const response = await fetch('/api/auth/verify-reset-otp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, otp: otpStr })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Invalid or expired OTP code');
            
            setSuccessMsg("OTP verified successfully! Please choose a new password.");
            setView('reset_password');
        } else if (view === 'reset_password') {
            if (!newPassword || newPassword.length < 6) {
              throw new Error('Password must be at least 6 characters');
            }
            if (newPassword !== confirmPassword) {
              throw new Error('Passwords do not match');
            }
            
            const otpStr = otpCode.join('');
            const response = await fetch('/api/auth/reset-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, token: otpStr, password: newPassword })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to reset password');
            
            setSuccessMsg("Password reset successful! Please log in.");
            
            // Reset states
            setPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setOtpCode(['', '', '', '']);
            setView('login');
        } else if (view === 'register') {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            
            // Send email verification
            sendEmailVerification(userCredential.user).catch(console.error);
            
            // Sync with backend to create SQL user and get JWT
            const idToken = await userCredential.user.getIdToken();
            const referralCode = localStorage.getItem('referralCode') || localStorage.getItem('referral_code');
            const referralSubId = localStorage.getItem('referralSub') || localStorage.getItem('referral_sub_id');
            const referralType = localStorage.getItem('referralType') || localStorage.getItem('referral_type');

            const response = await fetch('/api/auth/firebase-google', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                token: idToken,
                referralCode,
                referralSubId,
                referralType
              })
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Backend registration failed');
            
            // Store JWT and User
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            localStorage.setItem('device_registered', 'true');
            
            // Clear used referral code
            localStorage.removeItem('referralCode');
            localStorage.removeItem('referral_code');
            localStorage.removeItem('referralSub');
            localStorage.removeItem('referral_sub_id');
            localStorage.removeItem('referralType');
            localStorage.removeItem('referral_type');
            
            onSuccess();
            onClose();
        } else {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            
            // Sync with backend to get JWT
            const idToken = await userCredential.user.getIdToken();
            const response = await fetch('/api/auth/firebase-google', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: idToken })
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Backend login failed');
            
            // Store JWT and User
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            onSuccess();
            onClose();
        }
    } catch (err: any) {
        let msg = err.message;
        if (msg.includes('auth/invalid-credential')) msg = 'Incorrect email or password.';
        if (msg.includes('auth/email-already-in-use')) msg = 'This email is already registered.';
        if (msg.includes('auth/weak-password')) msg = 'Password should be at least 6 characters.';
        if (msg.includes('auth/invalid-email')) msg = 'Please enter a valid email address.';
        if (msg.includes('auth/user-not-found')) msg = 'No user found with this email.';
        setError(msg);
    } finally {
        setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm shadow-lg p-0 m-0 w-full h-full sm:p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full h-full sm:h-auto sm:max-w-[420px] bg-[#2a2c31]/90 backdrop-blur-xl border border-white/10 sm:rounded-[24px] relative flex flex-col pt-0 overflow-y-auto shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="shrink-0 relative py-6 text-center border-b border-white/5 bg-white/5">
            <motion.h2 
              key={characterState}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-white font-black text-2xl"
            >
              {view === 'login' 
                ? 'Login' 
                : view === 'register' 
                ? 'Sign Up' 
                : view === 'verify_otp'
                ? 'Verify OTP'
                : view === 'reset_password'
                ? 'New Password'
                : 'Reset Password'}
            </motion.h2>
          </div>

          {/* Close Button Desktop (inside panel top right, absolute) */}
        <button 
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-white transition-colors z-20 hidden sm:block"
        >
          <X size={24} />
        </button>

        {/* Close Button Mobile */}
        <button 
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-white transition-colors z-20 sm:hidden"
        >
          <X size={24} />
        </button>

        {/* Tabs */}
        {(view === 'login' || view === 'register') && (
          <div className="flex w-full pt-6 px-6 border-b border-[#3a3c42] relative bg-[#2a2c31] z-10 sticky top-0">
            <button
              onClick={() => { setView('register'); setError(null); setSuccessMsg(null); }}
              className={`flex-1 pb-4 text-[16px] font-medium transition-all duration-200 relative ${
                view === 'register' 
                  ? 'text-white' 
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Registration
              {view === 'register' && (
                <div className="absolute bottom-0 left-0 w-full h-[2px] bg-white"></div>
              )}
            </button>
            <button
              onClick={() => { setView('login'); setError(null); setSuccessMsg(null); }}
              className={`flex-1 pb-4 text-[16px] font-medium transition-all duration-200 relative ${
                view === 'login' 
                  ? 'text-white' 
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Login
              {view === 'login' && (
                <div className="absolute bottom-0 left-0 w-full h-[2px] bg-white"></div>
              )}
            </button>
          </div>
        )}

        <div className="p-6 pt-6">

          {/* ISLAMIC ACCOUNT BANNER */}
          {view === 'register' && (
            <div className="mb-6 bg-[#213f31] border border-[#2c5441] rounded-[8px] p-4 flex items-center justify-center gap-3 shadow-inner">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L14.4 9.6H22L15.8 14.4L18.2 22L12 17.2L5.8 22L8.2 14.4L2 9.6H9.6L12 2Z" fill="#2bb871"/>
              </svg>
              <span className="text-[#2bb871] font-bold text-[13px] tracking-wide uppercase">Islamic account is available</span>
            </div>
          )}

          {/* Social Auth Buttons */}
          {(view === 'login' || view === 'register') && (
            <div className="flex gap-4 mb-6">
              <button 
                type="button" 
                onClick={handleFacebookSignIn} 
                className="flex-1 h-[48px] bg-[#1877f2] rounded-[8px] flex items-center justify-center hover:bg-[#166fe5] transition-colors"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M24 12.073C24 5.405 18.627 0 12 0C5.373 0 0 5.405 0 12.073C0 18.102 4.411 23.094 10.125 24V15.56H7.078V12.073H10.125V9.414C10.125 6.388 11.916 4.717 14.657 4.717C15.97 4.717 17.344 4.952 17.344 4.952V7.925H15.831C14.34 7.925 13.875 8.855 13.875 9.81V12.073H17.203L16.671 15.56H13.875V24C19.589 23.094 24 18.102 24 12.073Z" fill="white"/>
                </svg>
              </button>
              <button 
                type="button" 
                onClick={handleGoogleSignIn} 
                className="flex-1 h-[48px] bg-white rounded-[8px] flex items-center justify-center hover:bg-gray-100 transition-colors shadow-sm"
              >
                <svg width="22" height="22" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92(3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              </button>
            </div>
          )}

          {error && (
              <div className="mb-4 text-red-500 text-[13px] bg-red-500/10 p-3 rounded-lg border border-red-500/20 font-medium">
                  {error}
              </div>
          )}

          {successMsg && (
              <div className="mb-4 text-green-500 text-[13px] bg-green-500/10 p-3 rounded-lg border border-green-500/20 font-medium">
                  {successMsg}
              </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {(view === 'login' || view === 'register' || view === 'forgot_password') && (
              <>
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="relative border border-[#4a4c52] rounded-[8px] bg-[#323339] focus-within:border-[#ffcf00] transition-colors overflow-hidden"
                >
                  <input
                    type="email"
                    value={email}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    required
                    className="w-full bg-transparent px-4 py-4 text-white placeholder-gray-500 focus:outline-none text-[15px]"
                  />
                </motion.div>
                
                {view !== 'forgot_password' && (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="relative border border-[#4a4c52] rounded-[8px] bg-[#323339] focus-within:border-[#ffcf00] transition-colors overflow-hidden flex items-center pr-3"
                  >
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      required
                      minLength={6}
                      className="w-full bg-transparent px-4 py-4 text-white placeholder-gray-500 focus:outline-none text-[15px]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-gray-400 hover:text-white transition-colors focus:outline-none"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </motion.div>
                )}

                {view === 'register' && (
                  <p className="text-[13px] text-gray-400 leading-snug">
                    8-64 characters. Latin letters, numbers or special symbols. Ensure you don't use this password anywhere else
                  </p>
                )}

                {view === 'register' && (
                  <div className="flex gap-3 mt-1">
                    {['USDT', 'USD', 'BDT'].map(code => {
                      const cur = currencies.find(c => c.code === code);
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => setCurrency(code)}
                          className={`flex-1 h-[48px] rounded-[8px] border-[1.5px] font-bold text-[18px] transition-colors flex items-center justify-center ${
                            currency === code 
                              ? 'border-[#ffcf00] text-[#ffcf00] bg-transparent' 
                              : 'border-[#4a4c52] text-white bg-transparent hover:border-gray-500'
                          }`}
                        >
                          {cur?.symbol || '$'}
                        </button>
                      );
                    })}
                  </div>
                )}

                {view === 'login' && (
                  <div className="flex justify-start">
                    <button 
                      type="button"
                      onClick={() => setView('forgot_password')} 
                      className="text-gray-400 text-[13px] hover:text-white transition-colors underline decoration-gray-600 underline-offset-4"
                    >
                      Forgot my password
                    </button>
                  </div>
                )}

                {view === 'forgot_password' && (
                  <div className="flex justify-start">
                    <button 
                      type="button"
                      onClick={() => setView('login')} 
                      className="text-gray-400 text-[13px] hover:text-white transition-colors underline decoration-gray-600 underline-offset-4"
                    >
                      Back to login
                    </button>
                  </div>
                )}

                {view === 'register' && (
                  <label className="flex items-start gap-3 mt-2 cursor-pointer group select-none">
                    <div className="relative flex items-center justify-center mt-0.5 shrink-0">
                      <input 
                        type="checkbox" 
                        checked={agreed}
                        onChange={(e) => setAgreed(e.target.checked)}
                        className="appearance-none w-5 h-5 border-[1.5px] border-[#ffcf00] rounded-[4px] bg-transparent checked:bg-[#ffcf00] transition-colors cursor-pointer"
                      />
                      {agreed && (
                        <svg className="absolute w-3 h-3 text-black pointer-events-none" viewBox="0 0 12 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M1 5L4.5 8.5L11 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <span className="text-[14px] text-gray-300 leading-snug transition-colors">
                      I accept the terms of the <span className="underline decoration-gray-500 underline-offset-2 hover:text-white">Client Agreement</span> and <span className="underline decoration-gray-500 underline-offset-2 hover:text-white">Privacy Policy</span> and confirm being adult
                    </span>
                  </label>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#ffcf00] hover:bg-[#e6bb00] disabled:opacity-50 active:scale-[0.98] text-[#1c1d22] font-semibold text-[16px] py-4 rounded-[8px] mt-2 transition-all flex items-center justify-center"
                >
                  {loading ? <span className="w-5 h-5 border-2 border-[#1c1d22] border-t-transparent inset-0 rounded-full animate-spin"></span> : (view === 'login' ? 'Log in' : view === 'register' ? 'Register' : 'Reset password')}
                </button>
                
                {view === 'login' && (
                  <div className="flex items-center justify-end mt-4 gap-3 text-[14px]">
                    <span className="text-gray-400">No account?</span>
                    <button 
                      type="button"
                      onClick={() => { setView('register'); setError(null); }}
                      className="bg-[#3a3c42] hover:bg-[#4a4c52] text-white px-5 py-2.5 rounded-[8px] transition-colors font-medium text-[14px]"
                    >
                      Register
                    </button>
                  </div>
                )}
              </>
            )}

            {/* NEUMORPHIC 6-DIGIT OTP UI inside Modal */}
            {view === 'verify_otp' && (
              <div className="flex flex-col items-center">
                <p className="text-gray-400 text-[14px] text-center mb-6">Enter the 6-digit security code</p>
                
                <div className="flex gap-2.5 justify-center mb-8">
                  {otpCode.map((digit, idx) => (
                    <input
                      key={idx}
                      id={`modal-otp-input-${idx}`}
                      type="text"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      onPaste={handleOtpPaste}
                      className="w-[48px] h-[48px] bg-[#22242c] border border-white/5 rounded-xl text-center text-white text-[22px] font-black focus:outline-none focus:ring-2 focus:ring-[#ffcf00] focus:border-transparent transition-all shadow-[inset_3px_3px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.05),0_4px_8px_rgba(0,0,0,0.4)]"
                    />
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#ffcf00] hover:bg-[#e6bb00] disabled:opacity-50 active:scale-[0.98] text-[#1c1d22] font-black text-[16px] py-4 rounded-[8px] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#ffcf00]/20"
                >
                  {loading ? (
                    <span className="w-5 h-5 border-2 border-[#1c1d22] border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    'Verify Now'
                  )}
                </button>

                <div className="flex justify-between w-full mt-6 text-[13px]">
                  <button
                    type="button"
                    onClick={() => {
                      setOtpCode(['', '', '', '']);
                      setView('forgot_password');
                      setError(null);
                      setSuccessMsg(null);
                    }}
                    className="text-gray-400 hover:text-white transition-colors underline decoration-gray-600 hover:decoration-white underline-offset-4 font-semibold"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setError(null);
                      setSuccessMsg(null);
                      setLoading(true);
                      try {
                        const response = await fetch('/api/auth/forgot-password', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ email })
                        });
                        const data = await response.json();
                        if (!response.ok) throw new Error(data.error || 'Failed to resend OTP');
                        setSuccessMsg("A new 6-digit OTP code has been sent!");
                      } catch (err: any) {
                        setError(err.message || "Failed to resend code");
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className="text-[#ffcf00] hover:text-[#e6bb00] transition-colors font-semibold"
                  >
                    Resend Code
                  </button>
                </div>
              </div>
            )}

            {/* NEW PASSWORD CREATION VIEW inside Modal */}
            {view === 'reset_password' && (
              <div className="flex flex-col gap-4">
                <p className="text-gray-400 text-[13px] text-center mb-2 font-medium">Enter and confirm your new account password</p>

                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="relative border border-[#4a4c52] rounded-[8px] bg-[#323339] focus-within:border-[#ffcf00] transition-colors overflow-hidden flex items-center pr-3"
                >
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New Password"
                    required
                    minLength={6}
                    className="w-full bg-transparent px-4 py-4 text-white placeholder-gray-500 focus:outline-none text-[15px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-gray-400 hover:text-white transition-colors focus:outline-none"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="relative border border-[#4a4c52] rounded-[8px] bg-[#323339] focus-within:border-[#ffcf00] transition-colors overflow-hidden flex items-center pr-3"
                >
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm New Password"
                    required
                    minLength={6}
                    className="w-full bg-transparent px-4 py-4 text-white placeholder-gray-500 focus:outline-none text-[15px]"
                  />
                </motion.div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#ffcf00] hover:bg-[#e6bb00] disabled:opacity-50 active:scale-[0.98] text-[#1c1d22] font-black text-[16px] py-4 rounded-[8px] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#ffcf00]/20"
                >
                  {loading ? (
                    <span className="w-5 h-5 border-2 border-[#1c1d22] border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    'Reset Password'
                  )}
                </button>

                <div className="flex justify-start">
                  <button
                    type="button"
                    onClick={() => {
                      setView('login');
                      setError(null);
                      setSuccessMsg(null);
                    }}
                    className="text-gray-400 text-[13px] hover:text-white transition-colors underline decoration-gray-600 hover:decoration-white underline-offset-4 font-semibold"
                  >
                    Back to login
                  </button>
                </div>
              </div>
            )}
          </form>

        </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
