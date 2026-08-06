import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

type CharacterState = 'idle' | 'success' | 'error' | 'thinking';

interface AnimatedCharacterProps {
  state: CharacterState;
  focusedField: string | null;
}

const IMAGES = {
  idle: '/images/animated_character_idle_1785350452806.jpg',
  success: '/images/animated_character_success_1785350469482.jpg',
  error: '/images/animated_character_error_1785350502917.jpg',
  thinking: '/images/animated_character_thinking_1785350491283.jpg',
};

export function AnimatedCharacter({ state, focusedField }: AnimatedCharacterProps) {
  const [currentImage, setCurrentImage] = useState(IMAGES[state]);

  useEffect(() => {
    setCurrentImage(IMAGES[state]);
  }, [state]);

  return (
    <div className="relative w-full aspect-video max-h-[320px] flex items-center justify-center overflow-hidden rounded-t-3xl bg-[#fbbd8d] perspective-1000">
      {/* Dynamic Background Patterns - High Quality Video Feel */}
      <div className="absolute inset-0">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, 5, 0],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_center,_#fff_0%,_transparent_70%)]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#fbbd8d]/50 to-[#fbbd8d]" />
        
        {/* Animated Grid for 3D Depth */}
        <div 
          className="absolute inset-0 opacity-10"
          style={{ 
            backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', 
            backgroundSize: '24px 24px',
            maskImage: 'linear-gradient(to bottom, black, transparent)'
          }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={state}
          initial={{ opacity: 0, scale: 0.8, y: 40 }}
          animate={{ 
            opacity: 1, 
            scale: 1, 
            y: 0,
            rotateY: focusedField === 'email' ? -15 : focusedField === 'password' ? 15 : 0
          }}
          exit={{ opacity: 0, scale: 1.1, y: -40 }}
          transition={{ 
            type: "spring",
            stiffness: 260,
            damping: 20
          }}
          className="relative w-full h-full flex flex-col items-center justify-end pb-8 z-10"
        >
          {/* Character Reflection */}
          <motion.img
            src={currentImage}
            alt="Reflection"
            className="absolute bottom-[-10%] h-[40%] w-auto opacity-10 blur-sm scale-y-[-1]"
            animate={{
              opacity: [0.05, 0.1, 0.05],
            }}
            transition={{ duration: 4, repeat: Infinity }}
          />

          {/* Main Character */}
          <motion.img
            src={currentImage}
            alt="Character"
            className="h-[85%] w-auto object-contain drop-shadow-[0_20px_30px_rgba(0,0,0,0.3)]"
            animate={{
              y: [0, -8, 0],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          
          {/* 3D Pedestal / Platform */}
          <div className="absolute bottom-4 w-48 h-8">
            <div className="absolute inset-0 bg-black/20 rounded-[100%] blur-xl transform translate-y-4" />
            <div className="absolute inset-0 bg-[#e6a87c] rounded-[100%] border border-white/20 shadow-lg" />
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent rounded-[100%]" />
          </div>
        </motion.div>
      </AnimatePresence>
      
      {/* Interactive Thinking Bubbles */}
      {state === 'thinking' && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute top-8 right-8 flex gap-2"
        >
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="w-3 h-3 bg-white/80 rounded-full shadow-lg"
              animate={{ 
                y: [0, -10, 0],
                scale: [1, 1.2, 1],
                opacity: [0.5, 1, 0.5]
              }}
              transition={{ 
                duration: 1, 
                repeat: Infinity, 
                delay: i * 0.2,
                ease: "easeInOut"
              }}
            />
          ))}
        </motion.div>
      )}

      {/* Success Particle Effect Overlay */}
      {state === 'success' && (
        <motion.div 
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 bg-white rounded-full"
              initial={{ 
                x: "50%", 
                y: "50%",
                scale: 0
              }}
              animate={{ 
                x: `${50 + (Math.random() - 0.5) * 100}%`,
                y: `${50 + (Math.random() - 0.5) * 100}%`,
                scale: [0, 1.5, 0],
                opacity: [0, 1, 0]
              }}
              transition={{ 
                duration: 1.5, 
                repeat: Infinity,
                delay: Math.random() * 2
              }}
            />
          ))}
        </motion.div>
      )}
    </div>
  );
}
