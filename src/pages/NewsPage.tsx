import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Calendar, Tag, Share2, Bookmark } from 'lucide-react';
import { NEWS_DATA } from '../data/news';
import SEO from '../components/SEO';

export default function NewsPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const news = slug ? NEWS_DATA[slug] : null;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  if (!news) {
    return (
      <div className="min-h-screen bg-[#101115] flex flex-col items-center justify-center text-white p-4">
        <h1 className="text-4xl font-black mb-4">404</h1>
        <p className="text-gray-400 mb-8">Article not found.</p>
        <button 
          onClick={() => navigate('/')}
          className="px-8 py-3 bg-[#FFE24C] text-black font-bold rounded-xl hover:bg-[#F0D544] transition-all"
        >
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#101115] text-white selection:bg-[#FFE24C] selection:text-black">
      <SEO 
        title={news.title}
        description={news.subtitle}
        image={news.imageUrl}
        type="article"
      />

      {/* Dynamic NewsArticle Schema.org Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "NewsArticle",
          "headline": news.title,
          "description": news.subtitle,
          "image": [news.imageUrl],
          "datePublished": "2026-08-03T00:00:00+06:00", // matching the date in news.ts
          "dateModified": "2026-08-03T00:00:00+06:00",
          "author": {
            "@type": "Organization",
            "name": "Bivaax Trading",
            "url": "https://bivaax.com"
          },
          "publisher": {
            "@type": "Organization",
            "name": "Bivaax",
            "logo": {
              "@type": "ImageObject",
              "url": "https://i.postimg.cc/sXX8XQDV/file-000000005f788211bd6a5c656938f636.png"
            }
          },
          "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": typeof window !== "undefined" ? window.location.href : `https://bivaax.com/news/${slug}`
          }
        })}
      </script>

      {/* Breadcrumb Schema */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            {
              "@type": "ListItem",
              "position": 1,
              "name": "Home",
              "item": "https://bivaax.com"
            },
            {
              "@type": "ListItem",
              "position": 2,
              "name": "News",
              "item": "https://bivaax.com/#news"
            },
            {
              "@type": "ListItem",
              "position": 3,
              "name": news.title,
              "item": typeof window !== "undefined" ? window.location.href : `https://bivaax.com/news/${slug}`
            }
          ]
        })}
      </script>
      {/* Hero Header */}
      <div className="relative h-[60vh] min-h-[400px] w-full overflow-hidden">
        <motion.img 
          initial={{ scale: 1.1 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.8 }}
          src={news.imageUrl} 
          className="w-full h-full object-cover opacity-60"
          alt={news.title}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#101115] via-[#101115]/40 to-transparent" />
        
        {/* Back Button */}
        <button 
          onClick={() => navigate(-1)}
          className="absolute top-8 left-8 p-3 bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl hover:bg-black/60 transition-all z-20 group"
        >
          <ArrowLeft size={24} className="group-hover:-translate-x-1 transition-transform" />
        </button>

        <div className="absolute bottom-0 left-0 right-0 max-w-4xl mx-auto px-6 pb-12 z-10">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-4 mb-6"
          >
            <div className="px-3 py-1 bg-[#FFE24C] text-black text-[11px] font-black uppercase tracking-wider rounded-md">
              {news.category}
            </div>
            <div className="flex items-center gap-2 text-gray-400 text-sm font-medium">
              <Calendar size={14} />
              {news.date}
            </div>
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-4xl md:text-6xl font-black mb-6 tracking-tight leading-tight"
          >
            {news.title}
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-xl md:text-2xl text-gray-300 font-medium max-w-2xl leading-relaxed"
          >
            {news.subtitle}
          </motion.p>
        </div>
      </div>

      {/* Content Section */}
      <main className="max-w-4xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_200px] gap-16">
          <motion.article 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="prose prose-invert prose-lg max-w-none 
              prose-headings:font-black prose-headings:tracking-tight prose-headings:mb-4
              prose-h2:text-3xl prose-h2:mt-12
              prose-h3:text-2xl prose-h3:mt-8
              prose-p:text-gray-400 prose-p:leading-relaxed prose-p:mb-6
              prose-li:text-gray-400 prose-li:mb-2
              prose-strong:text-white prose-strong:font-bold
              prose-ul:list-disc prose-ul:pl-6
            "
            dangerouslySetInnerHTML={{ __html: news.content }}
          />

          {/* Sidebar / Tools */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-8">
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-4">Actions</h4>
                <div className="flex flex-col gap-3">
                  <button className="flex items-center gap-3 w-full p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 transition-all font-bold text-sm">
                    <Share2 size={18} className="text-[#FFE24C]" />
                    Share
                  </button>
                  <button className="flex items-center gap-3 w-full p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 transition-all font-bold text-sm">
                    <Bookmark size={18} className="text-[#FFE24C]" />
                    Save
                  </button>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-4">Tags</h4>
                <div className="flex flex-wrap gap-2">
                  {['Trading', 'Education', 'Platform', news.category].map(tag => (
                    <span key={tag} className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-medium text-gray-400">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* Footer CTA */}
      <section className="max-w-4xl mx-auto px-6 pb-24">
        <div className="p-12 rounded-[2rem] bg-gradient-to-br from-[#FFE24C] to-[#F0D544] text-black relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-black/5 blur-[80px] rounded-full translate-x-1/2 -translate-y-1/2 group-hover:scale-110 transition-transform duration-700" />
          
          <div className="relative z-10">
            <h2 className="text-3xl md:text-4xl font-black mb-4 tracking-tight">Ready to apply what you've learned?</h2>
            <p className="text-black/70 text-lg font-bold mb-8 max-w-md">Join thousands of traders who are already mastering the markets on Bivaax.</p>
            <button 
              onClick={() => navigate('/trade')}
              className="px-10 py-5 bg-black text-white font-black rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-2xl"
            >
              Start Trading Now
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
