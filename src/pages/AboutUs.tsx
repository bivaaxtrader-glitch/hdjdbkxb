import React from 'react';
import { Logo } from '../components/Logo';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SEO from '../components/SEO';
import { useI18n } from '../context/I18nContext';

const aboutTranslations: Record<string, any> = {
  en: {
    back: "Back",
    title: "About Bivaax",
    intro: "Bivaax is a client-oriented company, creating new possibilities in the market of leading trading technologies.",
    p1: "At Bivaax, we've thought of everything down to the smallest detail. On the road to creating a world-class trading platform, we feel that it is our priority to offer the highest quality services and support, including professional level tutorials, analytical services, and client support.",
    p2: "We know how important the quality of the trading platform is to a trader's success. That's precisely why Bivaax places such emphasis on a high level of service and a wide spectrum of intellectual offers. In addition, the broker dedicates a huge amount of attention to the professional preparation of beginner traders, while at the same time providing for the highest level needs of the most sophisticated traders in the market.",
    p3: "Bivaax works with clients all over the world, guaranteeing the most advantageous terms and providing high quality access to the world's financial markets. We build our collaboration with our clients in the form of a conversation: we want to find out your needs and comments, and what you would like to get from working with Bivaax, and we want to hear it directly from you.",
    p4: "Our collaboration with our clients is completely transparent, while our high-tech service allows traders to see the actual picture of the world's financial markets, and to evaluate your risk objectively. Bivaax is certified by the IFC and all of the risks of our clients are insured in accordance with the current laws, which makes us one of the safest trading platforms in the world. All of this gives us and our clients the highest level of mutual trust and makes for a pleasant investing climate at Bivaax.",
    advantages: "Our Advantages",
    adv1: "High-end trading platform with a wide range of financial assets.",
    adv2: "Some of the most advantageous trading terms and investment opportunities on the market.",
    adv3: "Analytical trading services.",
    adv4: "Convenient for both experienced and novice traders.",
    adv5: "Helpful high quality tutorials.",
    adv6: "Efficient and highly professional client support staff.",
    adv7: "Quotes from leading world news agencies.",
    adv8: "Credit Cards accepted",
    contacts: "Contacts"
  },
  bn: {
    back: "Back",
    title: "About Bivaax",
    intro: "Bivaax is a client-oriented company, creating new possibilities in the market of leading trading technologies.",
    p1: "At Bivaax, we've thought of everything down to the smallest detail. On the road to creating a world-class trading platform, we feel that it is our priority to offer the highest quality services and support, including professional level tutorials, analytical services, and client support.",
    p2: "We know how important the quality of the trading platform is to a trader's success. That's precisely why Bivaax places such emphasis on a high level of service and a wide spectrum of intellectual offers. In addition, the broker dedicates a huge amount of attention to the professional preparation of beginner traders, while at the same time providing for the highest level needs of the most sophisticated traders in the market.",
    p3: "Bivaax works with clients all over the world, guaranteeing the most advantageous terms and providing high quality access to the world's financial markets. We build our collaboration with our clients in the form of a conversation: we want to find out your needs and comments, and what you would like to get from working with Bivaax, and we want to hear it directly from you.",
    p4: "Our collaboration with our clients is completely transparent, while our high-tech service allows traders to see the actual picture of the world's financial markets, and to evaluate your risk objectively. Bivaax is certified by the IFC and all of the risks of our clients are insured in accordance with the current laws, which makes us one of the safest trading platforms in the world. All of this gives us and our clients the highest level of mutual trust and makes for a pleasant investing climate at Bivaax.",
    advantages: "Our Advantages",
    adv1: "High-end trading platform with a wide range of financial assets.",
    adv2: "Some of the most advantageous trading terms and investment opportunities on the market.",
    adv3: "Analytical trading services.",
    adv4: "Convenient for both experienced and novice traders.",
    adv5: "Helpful high quality tutorials.",
    adv6: "Efficient and highly professional client support staff.",
    adv7: "Quotes from leading world news agencies.",
    adv8: "Credit Cards accepted",
    contacts: "Contacts"
  }
};

export default function AboutUs() {
  const navigate = useNavigate();
  const { language } = useI18n();
  const activeLang = aboutTranslations[language] ? language : 'en';
  const tr = aboutTranslations[activeLang];

  return (
    <div className="min-h-screen bg-[#121316] text-gray-300 font-sans p-6 md:p-12">
      <SEO 
        title={tr.title}
        description="Learn more about Bivaax Trading, a world-class binary options platform. Discover our mission, values, and commitment to providing high-quality trading services."
        keywords="about Bivaax, Bivaax mission, Bivaax trading history, binary options broker info"
      />

      {/* Dynamic AboutPage Schema.org Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "AboutPage",
          "name": tr.title,
          "description": "Learn more about Bivaax Trading, a world-class binary options platform. Discover our mission, values, and commitment to providing high-quality trading services.",
          "url": typeof window !== "undefined" ? window.location.href : "https://bivaax.com/about-us",
          "publisher": {
            "@type": "Organization",
            "name": "Bivaax"
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
              "name": "About Us",
              "item": "https://bivaax.com/about-us"
            }
          ]
        })}
      </script>

      <button 
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
      >
        <ArrowLeft size={20} /> {tr.back}
      </button>
 
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex items-center gap-4 mb-12">
          <Logo size={48} />
          <h1 className="text-4xl font-black text-white tracking-tight">{tr.title}</h1>
        </header>
 
        <section className="prose prose-invert prose-lg max-w-none">
          <p className="text-xl text-white">
            {tr.intro}
          </p>
          <p>
            {tr.p1}
          </p>
          <p>
            {tr.p2}
          </p>
          <p>
            {tr.p3}
          </p>
          <p>
            {tr.p4}
          </p>
        </section>
 
        <section className="bg-[#1a1b1f] p-8 rounded-2xl border border-white/5">
          <h2 className="text-2xl font-bold text-white mb-6">{tr.advantages}</h2>
          <ul className="grid md:grid-cols-2 gap-4 text-gray-300">
            {[
              tr.adv1,
              tr.adv2,
              tr.adv3,
              tr.adv4,
              tr.adv5,
              tr.adv6,
              tr.adv7,
              tr.adv8
            ].map((adv, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-yellow-500">•</span> {adv}
              </li>
            ))}
          </ul>
        </section>
 
        <section className="border-t border-white/10 pt-8">
            <h2 className="text-2xl font-bold text-white mb-4">{tr.contacts}</h2>
            <div className="text-gray-400">
                <p><strong>Dolphin Corp LLC</strong></p>
                <p>Euro House, Richmond Hill Road, Kingstown, St. Vincent and Grenadines</p>
                <p className="mt-2 text-yellow-500">support@Bivaax.trade</p>
            </div>
        </section>
      </div>
    </div>
  );
}
