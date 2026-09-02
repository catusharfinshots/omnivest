import React from 'react';
import { Link } from 'react-router-dom';

export default function PartnerFooter() {
  return (
    <footer data-testid="partner-footer" className="border-t border-[#E6E8F0] bg-white">
      <div className="container-x py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-[#64748B]">
        <div>© {new Date().getFullYear()} Omnivest · Partner program</div>
        <div className="flex items-center gap-5">
          <a href="mailto:support@omnivest.in" className="hover:text-[#6C2BD9]">support@omnivest.in</a>
          <Link to="/" className="hover:text-[#6C2BD9]">Back to omnivest.in →</Link>
        </div>
      </div>
    </footer>
  );
}
