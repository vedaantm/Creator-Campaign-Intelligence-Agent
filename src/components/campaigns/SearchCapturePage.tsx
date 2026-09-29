import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSearchPack, generateSearchPack } from '../../lib/api.ts';
import { useToast } from '../../context/ToastContext.tsx';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
} from '../common/UIComponents.tsx';
import { SEO } from '../common/SEO.tsx';
import { useCampaign } from '../../hooks/useCampaigns.ts';
import {
  Search,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Tag,
  FileText,
  TrendingUp,
  Target,
  Lock,
} from 'lucide-react';

export function SearchCapturePage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const isDemoMode = campaignId === 'cmp_demo_cci' || window.location.pathname.startsWith('/demo');

  const { data: campaign } = useCampaign(campaignId);

  const { data: searchPack, isLoading } = useQuery({
    queryKey: ['searchPack', campaignId],
    queryFn: () => getSearchPack(campaignId!),
    enabled: !!campaignId,
  });

  const content = searchPack?.content || {
    highIntentQueries: [
      {
        id: 'q1',
        query: 'aura smart espresso engine review',
        intent: 'product_comparison',
        priority: 'high',
        rationale: 'Primary branded search query triggered by creator video drops.',
        targetCreatorIds: ['crt_demo_1'],
      },
      {
        id: 'q2',
        query: 'best portable espresso machine 2026',
        intent: 'review_recommendation',
        priority: 'high',
        rationale: 'Category level query harvesting active espresso buyers.',
        targetCreatorIds: ['crt_demo_1', 'crt_demo_3'],
      },
      {
        id: 'q3',
        query: '18 bar hand espresso machine vs flair go',
        intent: 'product_comparison',
        priority: 'high',
        rationale: 'Captures switchers comparing against direct competitor Flair GO.',
        targetCreatorIds: ['crt_demo_3'],
      },
    ],
    titleFormulas: [
      {
        formula: '{Product Name} Review: Is {Key Feature} Worth It in {Year}?',
        exampleTitle: 'Aura Smart Espresso Engine Review: Is 18-Bar Manual Extraction Worth It in 2026?',
        searchIntent: 'product_comparison',
      },
      {
        formula: '{Competitor Name} vs {Product Name}: {Key Benefit} Tested',
        exampleTitle: 'Flair GO vs Aura Espresso Engine: Real 18-Bar Extraction Tested',
        searchIntent: 'product_comparison',
      },
    ],
    thumbnailHooks: [
      'Split Screen: Commercial Espresso Machine vs 350g Aura Engine',
      'Macro Crema Shot with Pressure Gauge at 18 BAR',
      'Off-Grid Mountain Espresso brewing with snow backdrop',
    ],
    searchDescriptionTemplate:
      'Testing the new Aura Smart Espresso Engine (18-Bar Manual Portable Espresso). Learn how to pull commercial cafe-quality shots off-grid without electricity. Full specs & discount link inside! #ad #espresso #aurahome',
    recommendedTags: [
      'aura smart espresso engine',
      'portable espresso machine',
      '18 bar hand espresso maker',
      'camping coffee gear',
      'espresso teardown',
      'wacaco picopresso comparison',
      'flair go competitor',
    ],
    creatorGuidelines:
      'Instruct all creators to put "Aura Smart Espresso Engine Review" in the first line of video title, and copy the search description template into description line 1-3.',
  };

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (isDemoMode) {
        toast.showToast('Notice: Generation disabled in Demo Mode.', 'info');
        return;
      }
      await generateSearchPack(campaignId!, { force: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['searchPack', campaignId] });
      toast.showToast('Search demand capture pack generated!', 'success');
    },
    onError: (err) => {
      toast.showToast((err as Error).message || 'Failed to generate search pack', 'error');
    },
  });

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
        title={campaign ? `${campaign.name} — Search Capture (Step 7)` : 'Google AI Max Search Capture — Step 7'}
        description="Google AI Max search campaign packs mapped to YouTube creator video drop windows to capture organic search demand."
      />
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="neutral">Step 7 of 9</Badge>
            <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
              <Search className="w-6 h-6 text-indigo-400" />
              Google AI Max for Search Demand Capture
            </h1>
          </div>
          <p className="text-zinc-400 text-sm">
            Harvest the organic search spikes created by video drops by generating optimized Google Search & YouTube Search ad clusters.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate(`/campaigns/${campaignId}/compliance`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Previous: Compliance
          </Button>

          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || isDemoMode}
          >
            {isDemoMode ? (
              <>
                <Lock className="w-4 h-4 mr-2 text-amber-400" />
                Demo Mode
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2 text-amber-400" />
                Regenerate Search Pack
              </>
            )}
          </Button>

          <Button variant="primary" onClick={() => navigate(`/campaigns/${campaignId}/live`)}>
            Next: Live Pulse
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* High Intent Search Queries */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2 text-indigo-400">
                  <Target className="w-5 h-5" />
                  High-Intent Search Queries ({content.highIntentQueries?.length || 0})
                </CardTitle>
                <Badge variant="info">Validated Cluster</Badge>
              </div>
              <CardDescription>
                Search queries automatically mapped to capture user intent during creator launch windows.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-zinc-400 border-b border-zinc-800 bg-zinc-900/50">
                    <tr>
                      <th className="py-2.5 px-3">Search Query</th>
                      <th className="py-2.5 px-3">Intent</th>
                      <th className="py-2.5 px-3">Priority</th>
                      <th className="py-2.5 px-3">Rationale</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                    {content.highIntentQueries?.map((q: { query: string; intent: string; priority: string; rationale: string }, idx: number) => (
                      <tr key={idx} className="hover:bg-zinc-900/40">
                        <td className="py-3 px-3 font-semibold text-zinc-100 font-mono">{q.query}</td>
                        <td className="py-3 px-3">
                          <Badge variant="neutral" className="capitalize text-[10px]">
                            {q.intent.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="py-3 px-3">
                          <Badge
                            variant={q.priority === 'high' ? 'error' : q.priority === 'medium' ? 'warning' : 'neutral'}
                            className="text-[10px] uppercase"
                          >
                            {q.priority}
                          </Badge>
                        </td>
                        <td className="py-3 px-3 text-zinc-400 text-[11px] max-w-xs">{q.rationale}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Title Formulas & Thumbnail Hooks */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-400">
                <FileText className="w-5 h-5" />
                SEO Title Formulas & Thumbnail Hooks
              </CardTitle>
              <CardDescription>SEO formulas for creators to rank organically in YouTube search results.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Recommended Title Formulas</h3>
                {content.titleFormulas?.map((f: { formula: string; exampleTitle: string }, idx: number) => (
                  <div key={idx} className="p-3 bg-zinc-900 rounded-lg border border-zinc-800 space-y-1">
                    <div className="text-xs font-semibold text-amber-300 font-mono">{f.formula}</div>
                    <div className="text-xs text-zinc-400">Example: "{f.exampleTitle}"</div>
                  </div>
                ))}
              </div>

              <div className="space-y-2 pt-2">
                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Thumbnail Hook Recommendations</h3>
                <ul className="space-y-1.5 pl-4 list-disc text-xs text-zinc-300">
                  {content.thumbnailHooks?.map((hook: string, idx: number) => (
                    <li key={idx}>{hook}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar: AI Max Strategy & Tags */}
        <div className="space-y-6">
          <Card className="border-indigo-800/40 bg-indigo-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-indigo-300">
                <TrendingUp className="w-5 h-5" />
                Google AI Max Strategy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="p-3 bg-indigo-900/40 rounded-lg border border-indigo-700/50 space-y-2">
                <div className="flex justify-between items-center text-indigo-200">
                  <span>Recommended Daily Budget</span>
                  <span className="font-bold text-sm text-indigo-100">$250 / day</span>
                </div>
                <div className="flex justify-between items-center text-indigo-200">
                  <span>Target CPA</span>
                  <span className="font-bold text-indigo-100">$22.50</span>
                </div>
                <div className="flex justify-between items-center text-indigo-200">
                  <span>Ad Match Type</span>
                  <span className="font-bold text-indigo-100">Broad + Broad Match Keywords</span>
                </div>
              </div>

              <p className="text-zinc-400 text-[11px]">
                Google AI Max automatically syncs with video publish timestamps to scale search budget by +150% during peak 72-hour viral windows.
              </p>
            </CardContent>
          </Card>

          {/* Recommended Tags */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-zinc-100">
                <Tag className="w-4 h-4 text-emerald-400" />
                Recommended Video Tags
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {content.recommendedTags?.map((tag: string, idx: number) => (
                  <Badge key={idx} variant="neutral" className="text-xs font-mono">
                    #{tag}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Search Description Template */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                Search Description Template
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800 text-xs font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {content.searchDescriptionTemplate}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
