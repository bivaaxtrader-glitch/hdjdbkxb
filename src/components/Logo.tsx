import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
  withBackground?: boolean;
  color?: string;
}

export const Logo: React.FC<LogoProps> = ({ className = '', size = 24, withBackground = false }) => {
  return (
    <div 
      className={`relative flex items-center justify-center overflow-hidden rounded-xl shrink-0 bg-[#121316] ${className}`} 
      style={{ width: size, height: size }}
    >
      <img 
        src="https://i.postimg.cc/sXX8XQDV/file-000000005f788211bd6a5c656938f636.png" 
        alt="Bivaax Trade Logo" 
        className="w-full h-full object-cover scale-[1.36] rounded-xl select-none pointer-events-none"
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        loading="eager"
        onError={(e) => {
          // Fallback to local copy if network fails
          e.currentTarget.src = "/logo.png";
        }}
      />
    </div>
  );
};


