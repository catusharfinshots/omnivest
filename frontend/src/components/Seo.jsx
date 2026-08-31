import React from 'react';
import { Helmet } from 'react-helmet-async';

const DEFAULT_TITLE = 'Omnivest — All your investing, in one place';
const DEFAULT_DESC = 'Expert-managed model portfolios, AIFs and advisory — invested from your own broker account. Soch samajh kar invest kar.';

export default function Seo({ title, description }) {
  const full = title ? `${title} | Omnivest` : DEFAULT_TITLE;
  const desc = description || DEFAULT_DESC;
  return (
    <Helmet prioritizeSeoTags>
      <title>{full}</title>
      <meta name="description" content={desc} />
      <meta property="og:title" content={full} />
      <meta property="og:description" content={desc} />
      <meta name="twitter:title" content={full} />
      <meta name="twitter:description" content={desc} />
    </Helmet>
  );
}
