import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { rememberReferral, deviceId } from '../lib/referral';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/** /r/<code>: remember who sent the visitor, count the visit once per device, then show the normal home page. */
export default function ReferralLanding() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [msg, setMsg] = useState('Opening Omnivest…');
  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.post(`${API}/referrals/visit`, { code, sid: deviceId() });
        if (data?.valid) { rememberReferral(code); try { sessionStorage.setItem('omnivest-ref-welcome', JSON.stringify({ name: data.referrer_first_name || '', reward: data.reward })); } catch { /* ignore */ } }
        else setMsg('That invite link is not valid, taking you to Omnivest…');
      } catch { /* still land on home */ }
      navigate('/', { replace: true });
    })();
  }, [code, navigate]);
  return <div className="container-x py-24 text-center text-[#526071]">{msg}</div>;
}
