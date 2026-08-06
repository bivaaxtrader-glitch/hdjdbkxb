import React, { useRef, useState, useEffect } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';

interface Story {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  link?: string;
}

interface StoryCarouselProps {
  stories: Story[];
}

export const StoryCarousel: React.FC<StoryCarouselProps> = ({ stories }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (containerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = containerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 5);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, []);

  return (
    <div className="relative w-full overflow-hidden py-6 bg-[#1c1d22]">
      <div className="max-w-7xl mx-auto px-4 relative">
        <motion.div
          ref={containerRef}
          onScroll={checkScroll}
          className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {stories.map((story) => (
            <motion.div
              key={story.id}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => story.link && window.open(story.link, '_blank')}
              className="flex-shrink-0 w-32 h-44 rounded-2xl overflow-hidden cursor-pointer relative group border border-white/10 shadow-2xl"
            >
              <img
                src={story.imageUrl}
                alt={story.title}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />
              <div className="absolute bottom-2 left-2 right-2 text-left">
                <span className="text-[10px] font-bold text-white leading-tight tracking-tighter line-clamp-2">
                  {story.title}
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Gradient Overlays */}
        {canScrollLeft && (
          <div className="absolute left-4 top-0 bottom-0 w-12 bg-gradient-to-r from-[#1c1d22] to-transparent pointer-events-none z-10" />
        )}
        {canScrollRight && (
          <div className="absolute right-4 top-0 bottom-0 w-12 bg-gradient-to-l from-[#1c1d22] to-transparent pointer-events-none z-10" />
        )}
      </div>
    </div>
  );
};
