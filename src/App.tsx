import React from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LoginPage } from './components/auth/LoginPage.tsx';
import { DemoPage } from './components/demo/DemoPage.tsx';
import { RequireAuth } from './components/auth/RequireAuth.tsx';
import { CampaignListPage } from './components/campaigns/CampaignListPage.tsx';
import { TrashPage } from './components/campaigns/TrashPage.tsx';
import { CampaignLayout } from './components/layout/CampaignLayout.tsx';
import { CampaignOverviewPage } from './components/campaigns/CampaignOverviewPage.tsx';
import { SettingsPage } from './components/campaigns/SettingsPage.tsx';
import { CampaignBriefPage } from './components/campaigns/CampaignBriefPage.tsx';
import { GuidelinesPage } from './components/campaigns/GuidelinesPage.tsx';
import { CreatorsPage } from './components/campaigns/CreatorsPage.tsx';
import { CreatorDetailPage } from './components/campaigns/CreatorDetailPage.tsx';
import { PremortemPage } from './components/campaigns/PremortemPage.tsx';
import { BriefsListPage } from './components/campaigns/BriefsListPage.tsx';
import { BriefEditorPage } from './components/campaigns/BriefEditorPage.tsx';
import { CompliancePage } from './components/campaigns/CompliancePage.tsx';
import { SearchCapturePage } from './components/campaigns/SearchCapturePage.tsx';
import { LivePulsePage } from './components/campaigns/LivePulsePage.tsx';
import { CampaignReportPage } from './components/campaigns/CampaignReportPage.tsx';
import { Header } from './components/layout/Header.tsx';
import { Button } from './components/common/UIComponents.tsx';
import { CommandPalette } from './components/common/CommandPalette.tsx';
import { useAuth } from './context/AuthContext.tsx';
import { Home } from 'lucide-react';

// Scroll to top on route navigation
function ScrollToTop() {
  const { pathname } = useLocation();
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <CommandPalette />
      <Routes>
        {/* Public Login */}
        <Route path="/login" element={<LoginPage />} />

        {/* Dedicated Public Demo Route */}
        <Route path="/demo" element={<DemoPage />} />

        {/* Redirect root to campaigns */}
        <Route path="/" element={<Navigate to="/campaigns" replace />} />

        {/* Protected Campaign List & Trash */}
        <Route
          path="/campaigns"
          element={
            <RequireAuth>
              <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
                <Header />
                <main className="flex-1">
                  <CampaignListPage />
                </main>
              </div>
            </RequireAuth>
          }
        />

        <Route
          path="/campaigns/trash"
          element={
            <RequireAuth>
              <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
                <Header />
                <main className="flex-1">
                  <TrashPage />
                </main>
              </div>
            </RequireAuth>
          }
        />

        {/* Protected Campaign Workflow Stepper Routes */}
        <Route
          path="/campaigns/:campaignId"
          element={
            <RequireAuth>
              <CampaignLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<CampaignOverviewPage />} />

          {/* Step 1: Brief (Phase 2) */}
          <Route path="brief" element={<CampaignBriefPage />} />

          {/* Step 2: Guidelines (Phase 2) */}
          <Route path="guidelines" element={<GuidelinesPage />} />

          {/* Step 3: Creators (Phase 3) */}
          <Route path="creators" element={<CreatorsPage />} />
          <Route path="creators/:creatorId" element={<CreatorDetailPage />} />

          {/* Step 4: Pre-Mortem (Phase 4) */}
          <Route path="premortem" element={<PremortemPage />} />
          <Route path="premortem/runs/:runId" element={<PremortemPage />} />

          {/* Step 5: Creator Briefs (Phase 5) */}
          <Route path="briefs" element={<BriefsListPage />} />
          <Route path="briefs/:creatorId" element={<BriefEditorPage />} />

          {/* Step 6: Compliance (Phase 6) */}
          <Route path="compliance" element={<CompliancePage />} />
          <Route path="compliance/new" element={<CompliancePage />} />
          <Route path="compliance/:submissionId" element={<CompliancePage />} />

          {/* Step 7: Search Capture (Phase 7) */}
          <Route path="search-capture" element={<SearchCapturePage />} />

          {/* Step 8: Live Pulse (Phase 8) */}
          <Route path="live" element={<LivePulsePage />} />

          {/* Step 9: Report (Phase 9) */}
          <Route path="report" element={<CampaignReportPage />} />

          {/* Campaign Settings (Phase 1) */}
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* 404 Route */}
        <Route
          path="*"
          element={
            <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
              <Header />
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="text-6xl font-extrabold text-zinc-800 mb-2">404</div>
                <h2 className="text-xl font-bold mb-2">Page Not Found</h2>
                <p className="text-zinc-400 text-xs max-w-sm mb-6">
                  The page you are looking for does not exist or has been moved.
                </p>
                <Button onClick={() => (window.location.href = '/campaigns')} icon={Home}>
                  Return to Dashboard
                </Button>
              </div>
            </div>
          }
        />
      </Routes>
    </>
  );
}
