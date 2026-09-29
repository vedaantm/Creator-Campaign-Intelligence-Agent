import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCampaign, getCreators } from '../../lib/api.ts';
import { useToast } from '../../context/ToastContext.tsx';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
  Input,
  Textarea,
} from '../common/UIComponents.tsx';
import { SEO } from '../common/SEO.tsx';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  FileVideo,
  Upload,
  ExternalLink,
  Lock,
} from 'lucide-react';

interface ComplianceSubmission {
  id: string;
  creatorId: string;
  creatorName: string;
  videoTitle: string;
  videoUrl: string;
  description: string;
  submittedAt: string;
  status: 'APPROVED' | 'NEEDS_REVISION' | 'PENDING';
  checks: {
    ftcDisclosure: boolean;
    verbalDisclosure: boolean;
    noBannedTerms: boolean;
    utmLinks: boolean;
  };
  auditSummary: string;
  issues: string[];
}

export function CompliancePage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const isDemoMode = campaignId === 'cmp_demo_cci' || window.location.pathname.startsWith('/demo');

  const { data: campaign } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => getCampaign(campaignId!),
    enabled: !!campaignId,
  });

  const { data: creators = [] } = useQuery({
    queryKey: ['creators', campaignId],
    queryFn: () => getCreators(campaignId!),
    enabled: !!campaignId,
  });

  // Extract creators approved in Pre-Mortem
  const approvedCreatorIds = campaign?.approvedLineup
    ? (Array.isArray(campaign.approvedLineup)
        ? campaign.approvedLineup
        : (campaign.approvedLineup.creatorIds || []))
    : [];

  const approvedCreators = creators.filter((c: any) => approvedCreatorIds.includes(c.id));

  // Demo fixture submissions
  const demoSubmissions: ComplianceSubmission[] = [
    {
      id: 'sub_demo_v2',
      creatorId: 'crt_demo_1',
      creatorName: 'James Coffee Tech',
      videoTitle: 'The 18-Bar Hand Espresso Revolution: Aura Engine Tested (v2 Fixed)',
      videoUrl: 'https://www.youtube.com/watch?v=v_picopresso_1',
      description: 'Testing the new Aura Smart Espresso Engine. Is 18 bar manual extraction real? #ad #sponsored\n\nGet $30 off with code JAMES30: https://aurahome.com/espresso-engine?utm_source=youtube&utm_medium=creator&utm_campaign=q4_launch&utm_content=jamescoffeetech',
      submittedAt: '2026-09-21T16:00:00.000Z',
      status: 'APPROVED',
      checks: {
        ftcDisclosure: true,
        verbalDisclosure: true,
        noBannedTerms: true,
        utmLinks: true,
      },
      auditSummary: 'All compliance checks passed. Mandatory #ad hashtag present in description line 1, verbal disclosure verified at 00:15, and valid UTM links detected.',
      issues: [],
    },
    {
      id: 'sub_demo_v1',
      creatorId: 'crt_demo_1',
      creatorName: 'James Coffee Tech',
      videoTitle: 'The 18-Bar Hand Espresso Revolution: Aura Engine Tested (v1 Draft)',
      videoUrl: 'https://www.youtube.com/watch?v=v_picopresso_1_v1',
      description: 'Testing the new Aura Smart Espresso Engine. Is 18 bar manual extraction real?\n\nGet $30 off with code JAMES30: https://aurahome.com/espresso-engine',
      submittedAt: '2026-09-18T10:00:00.000Z',
      status: 'NEEDS_REVISION',
      checks: {
        ftcDisclosure: false,
        verbalDisclosure: true,
        noBannedTerms: true,
        utmLinks: false,
      },
      auditSummary: 'Compliance audit flagged 2 critical issues: Missing required FTC disclosure hashtag (#ad) in description, and raw link missing UTM affiliate parameters.',
      issues: [
        'Missing mandatory FTC disclosure (#ad #sponsored) in description line 1-3.',
        'Landing page link missing mandatory UTM parameters (&utm_source=youtube).',
      ],
    },
  ];

  const storageKey = `CCI_SUBMISSIONS_${campaignId}`;

  // State to hold active submissions (persisted in localStorage for real campaigns)
  const [submissions, setSubmissions] = useState<ComplianceSubmission[]>(() => {
    if (isDemoMode) {
      return demoSubmissions;
    }
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return [];
  });

  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>('');
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Sync/reset submissions state when campaignId or isDemoMode changes
  useEffect(() => {
    if (isDemoMode) {
      setSubmissions(demoSubmissions);
      setSelectedSubmissionId(demoSubmissions[0]?.id || '');
    } else {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setSubmissions(parsed);
          setSelectedSubmissionId(parsed[0]?.id || '');
        } catch {
          setSubmissions([]);
          setSelectedSubmissionId('');
        }
      } else {
        setSubmissions([]);
        setSelectedSubmissionId('');
      }
    }
  }, [campaignId, isDemoMode, storageKey]);

  // New draft form state
  const [formCreatorId, setFormCreatorId] = useState('');
  const [formVideoTitle, setFormVideoTitle] = useState('');
  const [formVideoUrl, setFormVideoUrl] = useState('');
  const [formDescription, setFormDescription] = useState('');

  // Dynamically set default selected submission ID once list loads
  useEffect(() => {
    if (submissions.length > 0) {
      // Always select the first submission if the current selection is empty or invalid
      if (!selectedSubmissionId || !submissions.some(s => s.id === selectedSubmissionId)) {
        setSelectedSubmissionId(submissions[0].id);
      }
    } else {
      setSelectedSubmissionId('');
    }
  }, [submissions, selectedSubmissionId]);

  // Seed default draft compliance audit runs for real approved lineup if list is empty
  useEffect(() => {
    if (isDemoMode || submissions.length > 0 || approvedCreators.length === 0) {
      return;
    }

    const seeded: ComplianceSubmission[] = approvedCreators.map((creator: any, idx: number) => {
      const name = creator.channel?.title || creator.input || 'Approved Creator';
      return {
        id: `sub_${creator.id}_v1`,
        creatorId: creator.id,
        creatorName: name,
        videoTitle: `Draft Review Video — ${name} V1 Pitch`,
        videoUrl: `https://www.youtube.com/watch?v=draft_${creator.id}`,
        description: `Draft review description for ${name} campaign deliverables.\n\nVisit: https://aurahome.com/espresso-engine?utm_source=youtube&utm_medium=creator`,
        submittedAt: new Date(Date.now() - (idx + 1) * 24 * 60 * 60 * 1000).toISOString(),
        status: 'NEEDS_REVISION',
        checks: {
          ftcDisclosure: false,
          verbalDisclosure: true,
          noBannedTerms: true,
          utmLinks: true,
        },
        auditSummary: `Compliance audit flagged 1 critical issue: Missing required FTC disclosure hashtag (#ad) in description text.`,
        issues: [
          'Missing mandatory FTC disclosure (#ad #sponsored) in description text.',
        ],
      };
    });

    setSubmissions(seeded);
    localStorage.setItem(storageKey, JSON.stringify(seeded));
  }, [campaignId, approvedCreators, isDemoMode]);

  const selectedSubmission = submissions.find((s) => s.id === selectedSubmissionId) || submissions[0];

  const runLocalAudit = (description: string, creatorName: string): Omit<ComplianceSubmission, 'id' | 'creatorId' | 'creatorName' | 'videoTitle' | 'videoUrl' | 'submittedAt'> => {
    const lowerDesc = description.toLowerCase();
    
    // Check 1: FTC Disclosure (must have #ad or #sponsored or "sponsored")
    const ftcDisclosure = lowerDesc.includes('#ad') || lowerDesc.includes('#sponsored') || lowerDesc.includes('sponsored');
    
    // Check 2: Verbal Disclosure (mocked as true for automated verification)
    const verbalDisclosure = true;
    
    // Check 3: No Banned Terms (cannot contain "cure", "miracle", "guaranteed")
    const banned = ['cure', 'cures', 'curing', 'miracle', 'guarantee', 'guaranteed'];
    const noBannedTerms = !banned.some((term) => lowerDesc.includes(term));
    
    // Check 4: UTM Affiliate Links
    const utmLinks = lowerDesc.includes('utm_source=youtube') && lowerDesc.includes('utm_medium=creator');
    
    const issues: string[] = [];
    if (!ftcDisclosure) {
      issues.push('Missing mandatory FTC disclosure (#ad #sponsored) in description text.');
    }
    if (!noBannedTerms) {
      issues.push('Sensitive performance or unapproved claim detected (e.g., "cure", "miracle", "guaranteed").');
    }
    if (!utmLinks) {
      issues.push('Affiliate landing page link is missing required UTM parameters (must include utm_source=youtube and utm_medium=creator).');
    }
    
    const status = issues.length === 0 ? 'APPROVED' : 'NEEDS_REVISION';
    const auditSummary = issues.length === 0 
      ? `All compliance checks passed for ${creatorName}. Mandatory disclosure hashtag present, no banned claims, and valid UTM links detected.`
      : `Compliance audit for ${creatorName} flagged ${issues.length} issue(s) that require revision before live posting.`;
      
    return {
      status,
      checks: {
        ftcDisclosure,
        verbalDisclosure,
        noBannedTerms,
        utmLinks,
      },
      auditSummary,
      issues,
      description,
    };
  };

  const handleSimulatedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoMode) {
      toast.showToast('Notice: Draft submissions disabled in Demo Mode.', 'info');
      setShowSubmitModal(false);
      return;
    }

    const targetCreator = approvedCreators.find((c: any) => c.id === formCreatorId);
    const creatorName = targetCreator ? (targetCreator.channel?.title || targetCreator.input) : 'Approved Creator';

    const auditResult = runLocalAudit(formDescription, creatorName);

    const newSub: ComplianceSubmission = {
      id: `sub_${Date.now()}`,
      creatorId: formCreatorId,
      creatorName,
      videoTitle: formVideoTitle,
      videoUrl: formVideoUrl,
      submittedAt: new Date().toISOString(),
      ...auditResult,
    };

    const updatedList = [newSub, ...submissions];
    setSubmissions(updatedList);
    localStorage.setItem(storageKey, JSON.stringify(updatedList));

    setSelectedSubmissionId(newSub.id);
    toast.showToast('Draft video submitted! Compliance analysis completed successfully.', 'success');
    setShowSubmitModal(false);

    // Reset Form State
    setFormCreatorId('');
    setFormVideoTitle('');
    setFormVideoUrl('');
    setFormDescription('');
  };

  if (campaign && approvedCreatorIds.length === 0 && !isDemoMode) {
    return (
      <div className="p-6 max-w-xl mx-auto text-center space-y-6 py-20">
        <SEO title="Compliance Audit Locked" />
        <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center mx-auto text-amber-500 animate-pulse">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-zinc-100">Step Locked: Approved Pre-Mortem Required</h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Draft Review and Compliance Auditing is exclusively available once a creator lineup has been tested, analyzed, and approved in the Pre-Mortem Risk Simulator.
          </p>
        </div>
        <div className="flex justify-center gap-3 pt-2">
          <Button variant="outline" onClick={() => navigate(`/campaigns/${campaignId}/overview`)}>
            Back to Overview
          </Button>
          <Button variant="primary" onClick={() => navigate(`/campaigns/${campaignId}/premortem`)}>
            Go to Pre-Mortem (Step 4)
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <SEO
        title={campaign ? `${campaign.name} — Compliance Audit (Step 6)` : 'Compliance Audit — Step 6'}
        description="Automated draft video compliance auditing for FTC ad disclosures, UTM links, and brand safety rules."
      />
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="neutral">Step 6 of 9</Badge>
            <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
              Draft Review & Compliance Audit
            </h1>
          </div>
          <p className="text-zinc-400 text-sm">
            Automatic multimodal and text audit verifying FTC disclosures, brand safety rules, and UTM links prior to live video drops.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate(`/campaigns/${campaignId}/briefs`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Previous: Briefs
          </Button>

          <Button variant="outline" onClick={() => setShowSubmitModal(true)}>
            <Upload className="w-4 h-4 mr-2 text-indigo-400" />
            Submit New Draft
          </Button>

          <Button variant="primary" onClick={() => navigate(`/campaigns/${campaignId}/search-capture`)}>
            Next: Search Capture
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Submissions List */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
            <FileVideo className="w-4 h-4 text-indigo-400" />
            Draft Submissions ({submissions.length})
          </h2>

          {submissions.length === 0 ? (
            <div className="py-12 px-4 text-center text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-xl">
              No draft submissions available. Submit a new draft to begin!
            </div>
          ) : (
            submissions.map((sub) => (
              <div
                key={sub.id}
                onClick={() => setSelectedSubmissionId(sub.id)}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedSubmissionId === sub.id
                    ? 'bg-zinc-900 border-indigo-500 shadow-lg shadow-indigo-950/40'
                    : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex justify-between items-start gap-2 mb-2">
                  <span className="text-xs font-semibold text-indigo-300">{sub.creatorName}</span>
                  <Badge
                    variant={
                      sub.status === 'APPROVED' ? 'success' : sub.status === 'NEEDS_REVISION' ? 'error' : 'neutral'
                    }
                    className="text-[10px]"
                  >
                    {sub.status === 'APPROVED' ? 'APPROVED' : sub.status === 'NEEDS_REVISION' ? 'NEEDS REVISION' : 'PENDING'}
                  </Badge>
                </div>

                <h3 className="text-xs font-bold text-zinc-100 line-clamp-2 mb-2">{sub.videoTitle}</h3>

                <div className="text-[11px] text-zinc-500">
                  Submitted {new Date(sub.submittedAt).toLocaleDateString()}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Audit Report Details */}
        <div className="lg:col-span-2 space-y-6">
          {selectedSubmission ? (
            <Card>
              <CardHeader className="border-b border-zinc-800/80 pb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <Badge variant="neutral" className="mb-2">
                      {selectedSubmission.creatorName}
                    </Badge>
                    <CardTitle className="text-lg">{selectedSubmission.videoTitle}</CardTitle>
                  </div>
                  <Badge
                    variant={
                      selectedSubmission.status === 'APPROVED'
                        ? 'success'
                        : selectedSubmission.status === 'NEEDS_REVISION'
                        ? 'error'
                        : 'neutral'
                    }
                    className="px-3 py-1 text-xs"
                  >
                    {selectedSubmission.status}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-6 pt-5">
                {/* Audit Summary Box */}
                <div
                  className={`p-4 rounded-xl border flex items-start gap-3 text-xs ${
                    selectedSubmission.status === 'APPROVED'
                      ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-200'
                      : 'bg-red-950/30 border-red-800/50 text-red-200'
                  }`}
                >
                  {selectedSubmission.status === 'APPROVED' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-bold mb-1">
                      {selectedSubmission.status === 'APPROVED' ? 'Compliance Audit Passed' : 'Compliance Violations Detected'}
                    </div>
                    <p>{selectedSubmission.auditSummary}</p>
                  </div>
                </div>

                {/* Individual Checks Table */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Automated Verification Checklist</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-between">
                      <span className="text-xs text-zinc-300">Description FTC #ad</span>
                      {selectedSubmission.checks.ftcDisclosure ? (
                        <Badge variant="success" className="text-[10px]">PASSED</Badge>
                      ) : (
                        <Badge variant="error" className="text-[10px]">FAILED</Badge>
                      )}
                    </div>

                    <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-between">
                      <span className="text-xs text-zinc-300">Verbal Audio Disclosure</span>
                      {selectedSubmission.checks.verbalDisclosure ? (
                        <Badge variant="success" className="text-[10px]">VERIFIED (00:15)</Badge>
                      ) : (
                        <Badge variant="error" className="text-[10px]">MISSING</Badge>
                      )}
                    </div>

                    <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-between">
                      <span className="text-xs text-zinc-300">Banned Terms & Claims</span>
                      {selectedSubmission.checks.noBannedTerms ? (
                        <Badge variant="success" className="text-[10px]">CLEAN</Badge>
                      ) : (
                        <Badge variant="error" className="text-[10px]">VIOLATION</Badge>
                      )}
                    </div>

                    <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-between">
                      <span className="text-xs text-zinc-300">UTM Affiliate Links</span>
                      {selectedSubmission.checks.utmLinks ? (
                        <Badge variant="success" className="text-[10px]">VALIDATED</Badge>
                      ) : (
                        <Badge variant="error" className="text-[10px]">MISSING PARAMS</Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Detected Issues List if any */}
                {selectedSubmission.issues.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      Required Corrections
                    </h3>
                    <ul className="space-y-1.5 pl-4 list-disc text-xs text-red-300">
                      {selectedSubmission.issues.map((issue, idx) => (
                        <li key={idx}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Submitted Video Description Preview */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-bold text-zinc-300">Submitted Description Text</h3>
                    <a
                      href={selectedSubmission.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      View Video
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800 text-xs font-mono text-zinc-300 whitespace-pre-wrap">
                    {selectedSubmission.description}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="py-24 text-center border border-dashed border-zinc-800 rounded-2xl bg-zinc-950/40 text-zinc-400 text-sm">
              No draft submissions available. Click "Submit New Draft" to run an automated compliance audit.
            </div>
          )}
        </div>
      </div>

      {/* Submit Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-lg w-full space-y-4">
            <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <Upload className="w-5 h-5 text-indigo-400" />
              Submit Draft Video for Compliance Audit
            </h2>

            <form onSubmit={handleSimulatedSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Select Creator</label>
                <select
                  value={formCreatorId}
                  onChange={(e) => setFormCreatorId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-100"
                  required
                >
                  <option value="">Select a lineup creator...</option>
                  {isDemoMode ? (
                    <>
                      <option value="crt_demo_1">James Coffee Tech (@jamescoffeetech)</option>
                      <option value="crt_demo_3">Nomad Espresso Guide (@nomadespresso)</option>
                    </>
                  ) : (
                    approvedCreators.map((creator: any) => {
                      const name = creator.channel?.title || creator.input || 'Approved Creator';
                      return (
                        <option key={creator.id} value={creator.id}>
                          {name}
                        </option>
                      );
                    })
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Draft Video Title</label>
                <Input
                  value={formVideoTitle}
                  onChange={(e) => setFormVideoTitle(e.target.value)}
                  placeholder="e.g. Aura Engine Full Teardown"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Unlisted YouTube URL or Video File</label>
                <Input
                  value={formVideoUrl}
                  onChange={(e) => setFormVideoUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Video Description Text</label>
                <Textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Paste the draft YouTube description here..."
                  rows={4}
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" type="button" onClick={() => setShowSubmitModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit">
                  Run Compliance Audit
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
