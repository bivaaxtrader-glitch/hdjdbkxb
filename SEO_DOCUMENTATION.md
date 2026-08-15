# SEO Documentation - Bivaax Trade

This document outlines the SEO implementation and strategy for Bivaax Trade.

## 1. Core SEO Components

The application uses a centralized SEO management system via the `src/components/SEO.tsx` component. This component leverages `react-helmet-async` for dynamic metadata management.

### Features:
- **Dynamic Meta Tags**: Automated generation of Title, Description, Keywords, and Canonical URLs.
- **Open Graph & Twitter Cards**: Full support for social sharing previews.
- **Automatic Robots Directives**:
  - Public pages (Home, Docs, About Us) are set to `index, follow`.
  - Authenticated/Private routes (Trade, Profile, Affiliate, Admin, etc.) are automatically set to `noindex, nofollow` to prevent leaking sensitive or private layouts to crawlers.
- **Structured Data (JSON-LD)**: Supports Google-compliant schemas including:
  - **WebSite**: Includes site name and internal search capabilities.
  - **Organization**: Provides business identity, logo, and social profiles.
  - **FAQPage**: Dynamically generated from page content (e.g., on the Homepage).
  - **NewsArticle**: Used for dynamic news content.

## 2. Configuration Files

- **robots.txt**: Located in `/public/robots.txt`.
  - Allows crawling of home, docs, about-us, and static pages.
  - Disallows sensitive directories like `/api/`, `/admin/`, and `/trade/`.
- **sitemap.xml**: Located in `/public/sitemap.xml`.
  - Lists all primary public routes.
  - Updated manually or via build scripts when new public pages are added.

## 3. Implementation Details

### How to add SEO to a new page:
Import and use the `SEO` component at the top of your page component:

```tsx
import SEO from '../components/SEO';

export default function MyNewPage() {
  return (
    <>
      <SEO 
        title="My Page Title"
        description="Detailed description of my page."
      />
      {/* Page Content */}
    </>
  );
}
```

### Structured Data Example:
To add FAQs to a page:

```tsx
const faqs = [
  { question: "How to deposit?", answer: "Go to the deposit section..." }
];

<SEO 
  title="FAQ"
  faqData={faqs}
/>
```

## 4. Google Crawler Compatibility
- **Client-Side Rendering**: The app uses standard React patterns. Ensure that critical content is rendered in the initial DOM or via stable state to ensure crawlers can parse it.
- **Canonical URLs**: Automatically generated based on the current window location to prevent duplicate content issues across `.com` and `.trade` domains.
- **Cross-Domain Alternates**: Specifically configured to tell Google that `bivaax.com` and `bivaax.trade` are part of the same entity.

## 5. Verification Checklist
- [x] Valid JSON-LD (Verified via Google Rich Results Test patterns).
- [x] Unique Title/Description per public page.
- [x] Canonical tags present.
- [x] Noindex on private routes.
- [x] Sitemap correctly lists public URLs.
