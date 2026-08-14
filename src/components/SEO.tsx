import React from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: string;
}

const SEO: React.FC<SEOProps> = ({
  title = 'Bivaax Trade | Official Trading Platform (bivaax.com & bivaax.trade)',
  description = 'Official Bivaax Trade platform operating on bivaax.com and bivaax.trade. Premier binary options trading platform with high payouts, instant bKash/Nagad deposits & withdrawals, 24/7 expert support.',
  keywords = 'Bivaax, bivaax.com, bivaax.trade, Bivaax Trade, bivaax login, bivaax.com login, bivaax.trade login, Bivaax binary options, Bivaax trading Bangladesh, Bivaax BD, binary trade, bivax, bivax trade, earn money online Bangladesh, bkash deposit trading, nagad trading, bivaax sign up, bivaax app',
  image = 'https://i.postimg.cc/yYSDXHm2/IMG-20260421-WA0036(2).jpg',
  url,
  type = 'website',
}) => {
  // Dynamically resolve domain (bivaax.com vs bivaax.trade)
  const currentHost = typeof window !== 'undefined' ? window.location.host : 'bivaax.com';
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://bivaax.com';
  const effectiveUrl = url || (typeof window !== 'undefined' ? window.location.href : 'https://bivaax.com/');

  const siteTitle = title.includes('Bivaax') ? title : `${title} | Bivaax Trade (bivaax.com & bivaax.trade)`;

  return (
    <Helmet>
      {/* Standard Metadata */}
      <title>{siteTitle}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <meta name="author" content="Bivaax Trading" />
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
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          "name": "Bivaax Trade",
          "alternateName": ["Bivaax", "Bivaax.com", "bivaax.trade", "Bivaax Trading Platform", currentHost],
          "url": currentOrigin,
          "sameAs": [
            "https://bivaax.com/",
            "https://bivaax.trade/"
          ],
          "potentialAction": {
            "@type": "SearchAction",
            "target": `${currentOrigin}/?search={search_term_string}`,
            "query-input": "required name=search_term_string"
          }
        })}
      </script>
    </Helmet>
  );
};

export default SEO;
