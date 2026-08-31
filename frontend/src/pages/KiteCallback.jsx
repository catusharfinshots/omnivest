import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { getStoredUserId } from '../context/BrokerContext';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import omniMark from '../assets/omnivest-mark-white.svg';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function KiteCallback() {
  const [params] = useSearchParams();
  const [state, setState] = useState('processing'); // processing | success | error
  const [detail, setDetail] = useState('');

  useEffect(() => {
    const status = params.get('status');
    const requestToken = params.get('request_token');
    const kiteError = params.get('message') || params.get('error');
    const kiteErrorType = params.get('error_type');
    const userId = getStoredUserId();

    const notifyParent = (payload) => {
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ source: 'basketly-kite-callback', ...payload }, '*');
        }
      } catch (_) {}
    };

    if (status !== 'success' || !requestToken) {
      setState('error');
      let msg = kiteError || 'Kite did not return a request token.';
      if (kiteError && /not enabled/i.test(kiteError)) {
        msg = 'This Zerodha account is not enabled for the Kite Connect app. The app owner needs to add this user in developers.kite.trade → your app → "Add users", or subscribe to Kite Connect.';
      }
      setDetail(msg + (kiteErrorType ? ` (${kiteErrorType})` : ''));
      notifyParent({ status: 'error', detail: msg });
      return;
    }

    // Market-data (admin) flow — a single shared session, not per-user
    const flow = sessionStorage.getItem('kite_flow');
    if (flow === 'market') {
      sessionStorage.removeItem('kite_flow');
      const adminToken = localStorage.getItem('basketly-token-v1');
      axios
        .post(`${API}/admin/kite/market/exchange`, { request_token: requestToken }, { headers: { Authorization: `Bearer ${adminToken}` } })
        .then((res) => {
          setState('success');
          setDetail(res.data?.kite_user || 'Market data connected');
          notifyParent({ status: 'success', kite_user: res.data?.kite_user });
          setTimeout(() => window.close(), 1200);
        })
        .catch((err) => {
          setState('error');
          setDetail(err?.response?.data?.detail || err.message);
          notifyParent({ status: 'error', detail: err?.response?.data?.detail });
        });
      return;
    }

    if (!userId) {
      setState('error');
      setDetail('No Omnivest session found. Please open this from the Omnivest window.');
      return;
    }

    axios
      .post(`${API}/broker/kite/exchange`, { user_id: userId, request_token: requestToken })
      .then((res) => {
        setState('success');
        setDetail(res.data?.profile?.user_name || 'Connected');
        notifyParent({ status: 'success', profile: res.data.profile });
        setTimeout(() => window.close(), 1200);
      })
      .catch((err) => {
        setState('error');
        setDetail(err?.response?.data?.detail || err.message);
        notifyParent({ status: 'error', detail: err?.response?.data?.detail });
      });
  }, [params]);

  return (
    <div className="min-h-screen grad-hero grid place-items-center px-6">
      <div className="surface p-8 max-w-md w-full text-center">
        <div className="h-12 w-12 rounded-2xl grad-card text-white grid place-items-center mx-auto"><img src={omniMark} alt="" className="h-7 w-7" /></div>
        <div className="mt-4 font-[Inter] text-xl font-bold">Omnivest · Kite Connect</div>

        {state === 'processing' && (
          <div className="mt-6 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 text-[#6C2BD9] animate-spin" />
            <div className="text-sm text-[#6B6480]">Exchanging your Kite request token…</div>
          </div>
        )}
        {state === 'success' && (
          <div className="mt-6 flex flex-col items-center gap-2">
            <CheckCircle2 className="h-10 w-10 text-[#12B76A]" />
            <div className="font-semibold">Zerodha connected</div>
            <div className="text-sm text-[#6B6480]">{detail}</div>
            <div className="text-xs text-[#6B6480] mt-2">Closing this window…</div>
          </div>
        )}
        {state === 'error' && (
          <div className="mt-6 flex flex-col items-center gap-2">
            <XCircle className="h-10 w-10 text-[#F04438]" />
            <div className="font-semibold">Connection failed</div>
            <div className="text-xs text-[#6B6480] max-w-xs break-words">{detail}</div>
            <button onClick={() => window.close()} className="btn-outline mt-3">Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
