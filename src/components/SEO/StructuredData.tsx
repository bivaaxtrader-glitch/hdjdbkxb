import React from 'react';
import { Helmet } from 'react-helmet-async';

interface StructuredDataProps {
  data: object;
}

const StructuredData: React.FC<StructuredDataProps> = ({ data }) => {
  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(data)}
      </script>
    </Helmet>
  );
};

export default StructuredData;

// Helper to generate Organization Schema
export const getOrganizationSchema = () => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Bivaax Trade",
  "url": "https://bivaax.com",
  "logo": "https://bivaax.com/logo.png",
  "sameAs": [
    "https://twitter.com/bivaaxtrade",
    "https://facebook.com/bivaaxtrade"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "+1-000-000-0000",
    "contactType": "customer service",
    "email": "support@bivaax.com"
  }
});

// Helper to generate Website Schema
export const getWebsiteSchema = () => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Bivaax Trade",
  "url": "https://bivaax.com",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://bivaax.com/docs?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
});
