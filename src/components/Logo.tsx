import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
  withBackground?: boolean;
  color?: string;
}

export const Logo: React.FC<LogoProps> = ({ className = '', size = 24, withBackground = false }) => {
  return (
    <div className={`relative flex items-center justify-center overflow-hidden rounded-xl shrink-0 ${className}`} style={{ width: size, height: size }}>
      <img 
        src="/logo.png" 
        alt="Bivaax Trade Logo" 
        className="w-full h-full object-cover rounded-xl"
        referrerPolicy="no-referrer"
        loading="lazy" 
      />
    </div>
  );
};
