import React from 'react';
import './App.css';
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { Toaster } from './components/ui/sonner';

import Layout from './components/Layout';
import Home from './pages/Home';
import Explore from './pages/Explore';
import ModelPortfolios from './pages/ModelPortfolios';
import ModelPortfolioDetail from './pages/ModelPortfolioDetail';
import BasketDetail from './pages/BasketDetail';
import MutualFunds from './pages/MutualFunds';
import FixedDepositsPage from './pages/FixedDepositsPage';
import CollectionsPage from './pages/CollectionsPage';
import StocksPage from './pages/StocksPage';
import ManagersPage from './pages/ManagersPage';
import ManagerDetail from './pages/ManagerDetail';
import Calculators from './pages/Calculators';
import SIPCalculator from './pages/SIPCalculator';
import LearnPage from './pages/LearnPage';
import LearnPost from './pages/LearnPost';
import DashboardPage from './pages/DashboardPage';
import BusinessPage from './pages/BusinessPage';
import AdminPage from './pages/AdminPage';
import BecomePartner from './pages/BecomePartner';
import FAQPage from './pages/FAQPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import AIFPage from './pages/AIFPage';
import AdvisoryPage from './pages/AdvisoryPage';
import AboutPage from './pages/AboutPage';
import PersonDetail from './pages/PersonDetail';
import NotFound from './pages/NotFound';
import BrokerConnectPage from './pages/BrokerConnectPage';
import KiteCallback from './pages/KiteCallback';
import { PortfolioProvider } from './context/PortfolioContext';
import { BrokerProvider } from './context/BrokerContext';
import { AuthProvider } from './context/AuthContext';
import PhoneAuthModal from './components/PhoneAuthModal';

function RedirectDetail() {
  const { id } = useParams();
  return <Navigate to={`/model-portfolios/${id}`} replace />;
}

// Reset scroll position to the top on every route change (fixes detail pages
// opening mid-page when navigating from a long page like Home).
function ScrollToTop() {
  const { pathname } = useLocation();
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
      <BrokerProvider>
      <PortfolioProvider>
        <BrowserRouter>
          <ScrollToTop />
          <PhoneAuthModal />
          <Routes>
            <Route element={<Layout />}> 
              <Route path="/" element={<Home />} />

              {/* New primary routes */}
              <Route path="/model-portfolios" element={<ModelPortfolios />} />
              <Route path="/model-portfolios/:id" element={<ModelPortfolioDetail />} />
              <Route path="/aif" element={<AIFPage />} />
              <Route path="/advisory" element={<AdvisoryPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/founders/:slug" element={<PersonDetail kind="founders" />} />
              <Route path="/team/:slug" element={<PersonDetail kind="team" />} />

              {/* Legacy redirects */}
              <Route path="/explore/smallcases" element={<Navigate to="/model-portfolios" replace />} />
              <Route path="/discover/all" element={<Navigate to="/model-portfolios" replace />} />
              <Route path="/smallcase/:id" element={<RedirectDetail />} />

              {/* Kept as-is (still reachable directly) */}
              <Route path="/explore/legacy" element={<Explore />} />
              <Route path="/smallcase-legacy/:id" element={<BasketDetail />} />

              <Route path="/mutual-funds" element={<MutualFunds />} />
              <Route path="/mutual-funds/:category" element={<MutualFunds />} />
              <Route path="/fixed-deposits" element={<FixedDepositsPage />} />
              <Route path="/collections" element={<CollectionsPage />} />
              <Route path="/collections/:slug" element={<CollectionsPage />} />
              <Route path="/stocks" element={<StocksPage />} />
              <Route path="/managers" element={<ManagersPage />} />
              <Route path="/manager/:id" element={<ManagerDetail />} />
              <Route path="/calculators" element={<Calculators />} />
              <Route path="/calculators/sip" element={<SIPCalculator />} />
              <Route path="/learn" element={<LearnPage />} />
              <Route path="/learn/:slug" element={<LearnPost />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/business" element={<BusinessPage />} />
              <Route path="/faq" element={<FAQPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/brokers/connect" element={<BrokerConnectPage />} />
            </Route>
            <Route path="/broker/kite/callback" element={<KiteCallback />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/partner" element={<BecomePartner />} />
            <Route path="/analyst" element={<Navigate to="/partner" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </PortfolioProvider>
      </BrokerProvider>
      </AuthProvider>
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}

export default App;
