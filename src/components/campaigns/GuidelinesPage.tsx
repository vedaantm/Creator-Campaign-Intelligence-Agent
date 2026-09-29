import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCampaign, updateCampaignBrief } from '../../lib/api.ts';
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
} from '../common/UIComponents.tsx';
import { SEO } from '../common/SEO.tsx';
import {
  ShieldAlert,
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  FileCheck,
  AlertTriangle,
  Lock,
} from 'lucide-react';

export function GuidelinesPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const isDemoMode = campaignId === 'cmp_demo_cci' || window.location.pathname.startsWith('/demo');

  const { data: campaign, isLoading } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => getCampaign(campaignId!),
    enabled: !!campaignId,
  });

  const brief = (campaign?.brief as Record<string, unknown>) || {};
  const disclosures = (brief.requiredDisclosures as { descriptionText?: string; verbalText?: string }) || {
    descriptionText: '#ad #sponsored',
    verbalText: 'This video is sponsored by {brandName}.',
  };

  const [descText, setDescText] = useState<string>('');
  const [verbText, setVerbText] = useState<string>('');
  const [bannedTermInput, setBannedTermInput] = useState('');
  const [bannedTerms, setBannedTerms] = useState<string[]>([]);
  const [competitorInput, setCompetitorInput] = useState('');
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  React.useEffect(() => {
    if (brief && !isInitialized) {
      setDescText(disclosures.descriptionText || '#ad #sponsored');
      setVerbText(disclosures.verbalText || 'This video is sponsored by {brandName}.');
      setBannedTerms((brief.bannedTerms as string[]) || ['cheap plastic', 'instant coffee', 'steamer pod']);
      setCompetitors((brief.competitors as string[]) || ['Flair GO', 'Nanopresso', 'Bialetti Moka']);
      setIsInitialized(true);
    }
  }, [brief, disclosures, isInitialized]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (isDemoMode) {
        toast.showToast('Notice: Edits disabled in Demo Mode.', 'info');
        return;
      }
      const updatedBrief = {
        ...brief,
        bannedTerms,
        competitors,
        requiredDisclosures: {
          descriptionText: descText,
          verbalText: verbText,
        },
      };
      await updateCampaignBrief(campaignId!, updatedBrief, campaign?.version || 1);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      toast.showToast('Brand guidelines updated successfully!', 'success');
    },
    onError: (err) => {
      toast.showToast((err as Error).message || 'Failed to update guidelines', 'error');
    },
  });

  const addBannedTerm = () => {
    if (!bannedTermInput.trim()) return;
    if (!bannedTerms.includes(bannedTermInput.trim())) {
      setBannedTerms([...bannedTerms, bannedTermInput.trim()]);
    }
    setBannedTermInput('');
  };

  const removeBannedTerm = (term: string) => {
    setBannedTerms(bannedTerms.filter((t) => t !== term));
  };

  const addCompetitor = () => {
    if (!competitorInput.trim()) return;
    if (!competitors.includes(competitorInput.trim())) {
      setCompetitors([...competitors, competitorInput.trim()]);
    }
    setCompetitorInput('');
  };

  const removeCompetitor = (comp: string) => {
    setCompetitors(competitors.filter((c) => c !== comp));
  };

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <div className="h-8 bg-zinc-800 rounded w-1/3 animate-pulse" />
        <div className="h-64 bg-zinc-900 rounded border border-zinc-800 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <SEO
        title={campaign ? `${campaign.name} — Guidelines (Step 2)` : 'Brand Guidelines — Step 2'}
        description="Define mandatory FTC disclosures, prohibited claims, competitor filters, and brand safety parameters."
      />
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="neutral">Step 2 of 9</Badge>
            <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-indigo-400" />
              Brand & Compliance Guidelines
            </h1>
          </div>
          <p className="text-zinc-400 text-sm">
            Define mandatory FTC disclosures, prohibited claims, competitor filters, and brand safety parameters.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate(`/campaigns/${campaignId}/brief`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Previous: Brief
          </Button>

          <Button
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending || isDemoMode}
            title={isDemoMode ? 'Disabled in Demo Mode' : undefined}
          >
            {isDemoMode ? (
              <>
                <Lock className="w-4 h-4 mr-2 text-amber-400" />
                Demo Mode (Read Only)
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Guidelines
              </>
            )}
          </Button>

          <Button variant="primary" onClick={() => navigate(`/campaigns/${campaignId}/creators`)}>
            Next: Creators
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* FTC Mandatory Disclosures */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-400">
              <FileCheck className="w-5 h-5" />
              Mandatory FTC Disclosures
            </CardTitle>
            <CardDescription>
              Programmatically injected into all generated creator briefs and verified during draft compliance audits.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Description Hashtags / Text (Line 1–3)
              </label>
              <Input
                value={descText}
                onChange={(e) => setDescText(e.target.value)}
                placeholder="#ad #sponsored"
                disabled={isDemoMode}
              />
              <p className="text-xs text-zinc-500 mt-1">
                Must be placed above the fold in YouTube description before 'Show More'.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Verbal Audio Disclosure Script
              </label>
              <Input
                value={verbText}
                onChange={(e) => setVerbText(e.target.value)}
                placeholder="This video is sponsored by {brandName}."
                disabled={isDemoMode}
              />
              <p className="text-xs text-zinc-500 mt-1">
                Must be spoken clearly in the first 60 seconds of the video integration.
              </p>
            </div>

            <div className="p-3 bg-emerald-950/40 border border-emerald-800/50 rounded-lg text-xs text-emerald-300 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              <div>
                <strong>Deterministic Rule Active:</strong> CCIA automatically checks description lines during Phase 6 and Phase 8 polls for exact disclosure adherence.
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Prohibited Terms & Banned Language */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              Banned Terms & Restricted Claims
            </CardTitle>
            <CardDescription>
              Words or phrases creators are strictly forbidden from saying or writing in descriptions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={bannedTermInput}
                onChange={(e) => setBannedTermInput(e.target.value)}
                placeholder="Add banned term (e.g. cheap plastic)"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addBannedTerm())}
                disabled={isDemoMode}
              />
              <Button variant="outline" onClick={addBannedTerm} disabled={isDemoMode}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 min-h-[80px] p-3 bg-zinc-900 rounded-lg border border-zinc-800">
              {bannedTerms.length === 0 ? (
                <span className="text-xs text-zinc-500 italic">No banned terms added yet.</span>
              ) : (
                bannedTerms.map((term) => (
                  <Badge key={term} variant="warning" className="flex items-center gap-1.5 px-2.5 py-1 text-xs">
                    {term}
                    {!isDemoMode && (
                      <button onClick={() => removeBannedTerm(term)} className="hover:text-red-400">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </Badge>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Competitor Exclusion Filter */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-indigo-400">
              <ShieldAlert className="w-5 h-5" />
              Direct Competitor Exclusions
            </CardTitle>
            <CardDescription>
              Creators who recently promoted these brands will be flagged for conflict during Pre-Mortem checks.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={competitorInput}
                onChange={(e) => setCompetitorInput(e.target.value)}
                placeholder="Add competitor brand name"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCompetitor())}
                disabled={isDemoMode}
              />
              <Button variant="outline" onClick={addCompetitor} disabled={isDemoMode}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 min-h-[80px] p-3 bg-zinc-900 rounded-lg border border-zinc-800">
              {competitors.length === 0 ? (
                <span className="text-xs text-zinc-500 italic">No competitors added yet.</span>
              ) : (
                competitors.map((comp) => (
                  <Badge key={comp} variant="info" className="flex items-center gap-1.5 px-2.5 py-1 text-xs">
                    {comp}
                    {!isDemoMode && (
                      <button onClick={() => removeCompetitor(comp)} className="hover:text-red-400">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </Badge>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Automated Guardrails Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-zinc-100">Automated System Guardrails</CardTitle>
            <CardDescription>System enforcement rules active across all workflow engines.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-2.5 bg-zinc-900 rounded border border-zinc-800">
              <span className="text-zinc-300 font-medium">Brand Safety Filter Threshold</span>
              <Badge variant="success">90 / 100 Minimum</Badge>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-zinc-900 rounded border border-zinc-800">
              <span className="text-zinc-300 font-medium">Recent Competitor Cooldown</span>
              <Badge variant="info">60 Days Window</Badge>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-zinc-900 rounded border border-zinc-800">
              <span className="text-zinc-300 font-medium">Lineup Audience Overlap Cap</span>
              <Badge variant="warning">Max 25% Pairwise</Badge>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-zinc-900 rounded border border-zinc-800">
              <span className="text-zinc-300 font-medium">Embedding Vector Index</span>
              <Badge variant="neutral">Active (Cosine Similarity)</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
