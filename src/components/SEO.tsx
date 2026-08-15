import React from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: string;
  robots?: string;
  faqData?: Array<{ question: string, answer: string }>;
  articleData?: {
    headline: string;
    author: string;
    datePublished: string;
    image?: string;
  };
}

const SEO: React.FC<SEOProps> = ({
  title = 'Bivaax Trade | Official Trading Platform (bivaax.com & bivaax.trade)',
  description = 'Official Bivaax Trade platform operating on bivaax.com and bivaax.trade. Premier binary options trading platform with up to 95%+ payouts, instant local cash bKash, Nagad, Rocket deposits and withdrawals, and 24/7 client support.',
  keywords = 'Bivaax, bivaax.com, bivaax.trade, Bivaax Trade, bivaax login, bivaax.com login, bivaax.trade login, Bivaax binary options, Bivaax trading Bangladesh, Bivaax BD, binary trade, bivax, bivax trade, earn money online Bangladesh, bkash deposit trading, nagad trading, bivaax sign up, bivaax app, বিভাবক্স, বিভাবক্স ট্রেড, বাইনারি অপশন ট্রেডিং বাংলাদেশ, বিকাশ দিয়ে ট্রেডিং, অনলাইনে আয় করার অ্যাপ, Quotex bkash, Pocket Option bkash, IQ Option Bangladesh',
  image = 'https://i.postimg.cc/yYSDXHm2/IMG-20260421-WA0036(2).jpg',
  url,
  type = 'website',
  robots = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
  faqData,
  articleData,
}) => {
  // Dynamically resolve domain (bivaax.com vs bivaax.trade)
  const currentHost = typeof window !== 'undefined' ? window.location.host : 'bivaax.com';
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://bivaax.com';
  const effectiveUrl = url || (typeof window !== 'undefined' ? window.location.href : 'https://bivaax.com/');
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';

  // Centrally detect any private/authenticated paths to enforce noindex, nofollow
  const isPrivatePath = 
    currentPath.startsWith('/trade') ||
    currentPath.startsWith('/profile') ||
    currentPath.startsWith('/affiliate') ||
    currentPath.startsWith('/signals') ||
    currentPath.startsWith('/copytrading') ||
    currentPath.startsWith('/admin') ||
    currentPath.startsWith('/deposit') ||
    currentPath.startsWith('/crypto-deposit') ||
    currentPath.startsWith('/mfs-deposit') ||
    currentPath.startsWith('/Bivaaxpay') ||
    currentPath.startsWith('/support') ||
    currentPath.startsWith('/support-center') ||
    currentPath.startsWith('/help-center') ||
    currentPath.startsWith('/leaderboard') ||
    currentPath.startsWith('/promotions') ||
    currentPath.startsWith('/calendar') ||
    currentPath.startsWith('/tournaments') ||
    currentPath.startsWith('/education') ||
    currentPath.startsWith('/statuses');

  const effectiveRobots = isPrivatePath ? 'noindex, nofollow' : robots;

  const siteTitle = title.includes('Bivaax') ? title : `${title} | Bivaax Trade (bivaax.com & bivaax.trade)`;

  return (
    <Helmet>
      {/* Standard Metadata */}
      <title>{siteTitle}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <meta name="author" content="Bivaax Trading" />
      <meta name="robots" content={effectiveRobots} />
      <link rel="canonical" href={effectiveUrl} />

      {/* Cross Domain Alternates for Google indexing both bivaax.com and bivaax.trade */}
      <link rel="alternate" hrefLang="en" href="https://bivaax.com/" />
      <link rel="alternate" hrefLang="en" href="https://bivaax.trade/" />
      <link rel="alternate" hrefLang="x-default" href="https://bivaax.com/" />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={effectiveUrl} />
      <meta property="og:title" content={siteTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:site_name" content="Bivaax Trade" />

      {/* Twitter */}
      <meta property="twitter:card" content="summary_large_image" />
      <meta property="twitter:url" content={effectiveUrl} />
      <meta property="twitter:title" content={siteTitle} />
      <meta property="twitter:description" content={description} />
      <meta property="twitter:image" content={image} />

      {/* Mobile Apps */}
      <meta name="apple-mobile-web-app-title" content="Bivaax Trade" />
      <meta name="application-name" content="Bivaax Trade" />
      <meta name="theme-color" content="#131313" />

      {/* Dynamic JSON-LD for Google Search Results */}
      <script type="application/ld+json">
        {JSON.stringify([
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "Bivaax Trade",
            "alternateName": ["Bivaax", "Bivaax.com", "bivaax.trade", "Bivaax Trading Platform", currentHost],
            "url": currentOrigin,
            "sameAs": [
              "https://bivaax.com/",
              "https://bivaax.trade/",
              "https://www.facebook.com/Bivaaxtrade",
              "https://www.instagram.com/Bivaaxtrade",
              "https://t.me/Bivaaxtrade"
            ],
            "potentialAction": {
              "@type": "SearchAction",
              "target": `${currentOrigin}/docs?q={search_term_string}`,
              "query-input": "required name=search_term_string"
            }
          },
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "Bivaax Trade",
            "url": "https://bivaax.com",
            "logo": image,
            "contactPoint": {
              "@type": "ContactPoint",
              "telephone": "+1-000-000-0000",
              "contactType": "customer service",
              "email": "support@bivaax.com"
            }
          },
          faqData && {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": faqData.map(f => ({
              "@type": "Question",
              "name": f.question,
              "acceptedAnswer": {
                "@type": "Answer",
                "text": f.answer
              }
            }))
          },
          articleData && {
            "@context": "https://schema.org",
            "@type": "NewsArticle",
            "headline": articleData.headline,
            "image": [articleData.image || image],
            "datePublished": articleData.datePublished,
            "author": [{
              "@type": "Person",
              "name": articleData.author,
              "url": "https://bivaax.com/about-us"
            }]
          }
        ].filter(Boolean))}
      </script>
    </Helmet>
  );
};

export default SEO;
