import React from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOMetaProps {
  title?: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
  ogType?: string;
  noindex?: boolean;
}

const SEOMeta: React.FC<SEOMetaProps> = ({
  title = 'Bivaax Trade - Professional Trading Terminal',
  description = 'Experience professional trading with Bivaax Trade. Advanced charts, instant execution, and high security.',
  canonical,
  ogImage = 'https://bivaax.com/og-image.jpg',
  ogType = 'website',
  noindex = false,
}) => {
  const fullTitle = title.includes('Bivaax') ? title : `${title} | Bivaax Trade`;
  const url = canonical || window.location.origin + window.location.pathname;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      {!noindex && <meta name="robots" content="index, follow" />}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content="Bivaax Trade" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
    </Helmet>
  );
};

export default SEOMeta;
