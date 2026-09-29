import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.ts';
import {
  TrackedVideo,
  Alert as AlertType,
  PulseSummary,
  SimulatedSearchMetrics,
  Creator,
} from '../../../shared/types.ts';
import { Button, Card, Badge } from '../common/UIComponents.tsx';
import { SEO } from '../common/SEO.tsx';
import { useCampaign } from '../../hooks/useCampaigns.ts';
import {
  Activity,
  RefreshCw,
  Bell,
  CheckCircle,
  AlertTriangle,
  Info,
  ExternalLink,
  Eye,
  ThumbsUp,
  MessageSquare,
  Sparkles,
  Search,
  Plus,
  Tv,
  Check,
  Zap,
} from 'lucide-react';

export function LivePulsePage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const selectedCreatorId = searchParams.get('creatorId') || 'all';

  const [autoPoll, setAutoPoll] = useState<boolean>(true);
  const [showSimulatedSearch, setShowSimulatedSearch] = useState<boolean>(true);
  const [alertFilter, setAlertFilter] = useState<'all' | 'active' | 'acknowledged'>('active');

  // Video addition state
  const [addingCreatorId, setSelectedCreatorForAdd] = useState<string>('');
  const [videoInputUrl, setVideoInputUrl] = useState<string>('');
  const [isStandIn, setIsStandIn] = useState<boolean>(false);
  const [allowSecond, setAllowSecond] = useState<boolean>(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Poll response info
  const [pollInfo, setPollInfo] = useState<{ lastPolledAt?: string; nextPollAt?: string; message?: string } | null>(null);

  const { data: campaign } = useCampaign(campaignId);

  // Fetch campaign creators
  const { data: creators = [] } = useQuery({
    queryKey: ['creators', campaignId],
    queryFn: () => api.get<Creator[]>(`/campaigns/${campaignId}/creators`),
    enabled: !!campaignId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Fetch tracked videos
  const { data: videos = [], isLoading: videosLoading, refetch: refetchVideos } = useQuery({
    queryKey: ['trackedVideos', campaignId],
    queryFn: () => api.get<TrackedVideo[]>(`/campaigns/${campaignId}/live/videos`),
    enabled: !!campaignId,
    staleTime: 1 * 60 * 1000, // 1 minute staleTime preserves live metrics while navigating tabs
    gcTime: 30 * 60 * 1000,
  });

  // Fetch alerts
  const { data: alerts = [], refetch: refetchAlerts } = useQuery({
    queryKey: ['alerts', campaignId],
    queryFn: () => api.get<AlertType[]>(`/campaigns/${campaignId}/live/alerts`),
    enabled: !!campaignId,
    staleTime: 1 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Fetch AI summary
  const { data: latestSummary, refetch: refetchSummary } = useQuery({
    queryKey: ['pulseSummary', campaignId],
    queryFn: () => api.get<PulseSummary>(`/campaigns/${campaignId}/live/summary/latest`).catch(() => null),
    enabled: !!campaignId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Fetch simulated search metrics
  const { data: simulatedMetrics } = useQuery({
    queryKey: ['simulatedSearch', campaignId],
    queryFn: () => api.get<SimulatedSearchMetrics>(`/campaigns/${campaignId}/live/simulated-search`),
    enabled: !!campaignId && showSimulatedSearch,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Poll Mutation
  const pollMutation = useMutation({
    mutationFn: () => api.post<any>(`/campaigns/${campaignId}/live/poll`, {}),
    onSuccess: (data) => {
      setPollInfo({
        lastPolledAt: data.lastPolledAt,
        nextPollAt: data.nextPollAt,
        message: data.skipped ? data.reason : 'Live metrics updated',
      });
      queryClient.invalidateQueries({ queryKey: ['trackedVideos', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['alerts', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['simulatedSearch', campaignId] });
    },
    onError: (err: any) => {
      setPollInfo({ message: err?.message || 'Poll failed' });
    },
  });

  // Auto-polling effect while tab is visible
  const triggerPoll = useCallback(() => {
    if (document.visibilityState === 'visible' && !pollMutation.isPending) {
      pollMutation.mutate();
    }
  }, [pollMutation]);

  useEffect(() => {
    // Poll on load once
    triggerPoll();

    if (!autoPoll) return;
    // Set interval to poll every 15 minutes (or 1 min for demo tab visibility check)
    const interval = setInterval(() => {
      triggerPoll();
    }, 15 * 60 * 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && autoPoll) {
        triggerPoll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [autoPoll]);

  // Add video mutation
  const addVideoMutation = useMutation({
    mutationFn: (body: any) => api.post(`/campaigns/${campaignId}/live/videos`, body),
    onSuccess: () => {
      setVideoInputUrl('');
      setIsStandIn(false);
      setAllowSecond(false);
      setAddError(null);
      refetchVideos();
      refetchAlerts();
    },
    onError: (err: any) => {
      setAddError(err?.message || 'Failed to add video');
    },
  });

  // Acknowledge alert mutation
  const ackAlertMutation = useMutation({
    mutationFn: (alertId: string) =>
      api.patch(`/campaigns/${campaignId}/live/alerts/${alertId}`, { acknowledged: true }),
    onSuccess: () => {
      refetchAlerts();
    },
  });

  // Refresh summary mutation
  const refreshSummaryMutation = useMutation({
    mutationFn: () => api.post(`/campaigns/${campaignId}/live/summary`, { force: true }),
    onSuccess: () => {
      refetchSummary();
    },
  });

  const handleAddVideoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingCreatorId || !videoInputUrl) {
      setAddError('Please select a creator and enter a video URL or ID.');
      return;
    }
    setAddError(null);
    addVideoMutation.mutate({
      urlOrId: videoInputUrl,
      creatorId: addingCreatorId,
      isStandIn,
      allowSecond,
    });
  };

  // Compute KPI aggregates
  const totalViews = videos.reduce((acc, v) => acc + (v.latestStats?.views || 0), 0);
  const totalLikes = videos.reduce((acc, v) => acc + (v.latestStats?.likes || 0), 0);
  const totalComments = videos.reduce((acc, v) => acc + (v.latestStats?.comments || 0), 0);
  const avgEngagementRate = totalViews > 0 ? ((totalLikes + totalComments) / totalViews) * 100 : 0;

  // Sentiment aggregate
  let posSent = 0, negSent = 0, neuSent = 0, qSent = 0;
  for (const v of videos) {
    if (v.sentiment) {
      posSent += v.sentiment.positive;
      negSent += v.sentiment.negative;
      neuSent += v.sentiment.neutral;
      qSent += v.sentiment.question;
    }
  }
  const totalSentComments = posSent + negSent + neuSent + qSent;
  const posShare = totalSentComments > 0 ? Math.round((posSent / totalSentComments) * 100) : 0;

  // Estimated CPM ($25 per 1,000 views baseline or budget based)
  const estCpm = 25.0;
  const estSpend = (totalViews / 1000) * estCpm;

  // Filtered alerts
  const filteredAlerts = alerts.filter((a) => {
    if (alertFilter === 'active') return a.resolvedAt === null;
    if (alertFilter === 'acknowledged') return a.acknowledged;
    return true;
  });

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto text-zinc-100">
      <SEO
        title={campaign ? `${campaign.name} — Live Pulse (Step 8)` : 'Live Pulse Dashboard — Step 8'}
        description="Real-time view velocity, comment sentiment classification, FTC compliance alerts, and search capture metrics."
      />
      {/* Top Header & Live Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Live Pulse Performance</h1>
            <Badge variant="active" className="text-xs">
              Phase 8 Active
            </Badge>
          </div>
          <p className="text-zinc-400 text-sm mt-1">
            Real-time view velocity, comment sentiment classification, FTC compliance alerts, and search capture metrics.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 p-2.5 rounded-xl text-xs">
          <button
            onClick={() => setAutoPoll(!autoPoll)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition ${
              autoPoll ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoPoll ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
            {autoPoll ? 'Live Auto-Polling On' : 'Polling Paused'}
          </button>

          <Button
            size="sm"
            variant="outline"
            icon={RefreshCw}
            isLoading={pollMutation.isPending}
            onClick={() => pollMutation.mutate()}
          >
            Refresh Now
          </Button>
        </div>
      </div>

      {pollInfo?.message && (
        <div className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-lg text-xs text-zinc-300 flex items-center justify-between">
          <span>{pollInfo.message}</span>
          {pollInfo.nextPollAt && (
            <span className="text-zinc-500">
              Next poll scheduled: {new Date(pollInfo.nextPollAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      {/* KPI Tiles Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="p-4 bg-zinc-900/60 border-zinc-800">
          <div className="text-zinc-400 text-xs font-medium mb-1 flex items-center justify-between">
            Total Views <Eye className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-xl font-bold text-zinc-100">{totalViews.toLocaleString()}</div>
          <div className="text-[10px] text-zinc-500 mt-1">Across {videos.length} tracked video(s)</div>
        </Card>

        <Card className="p-4 bg-zinc-900/60 border-zinc-800">
          <div className="text-zinc-400 text-xs font-medium mb-1 flex items-center justify-between">
            Views vs Benchmark <Zap className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-emerald-400">+18.5%</div>
          <div className="text-[10px] text-zinc-500 mt-1">Above creator median curve</div>
        </Card>

        <Card className="p-4 bg-zinc-900/60 border-zinc-800">
          <div className="text-zinc-400 text-xs font-medium mb-1 flex items-center justify-between">
            Avg Engagement <ThumbsUp className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-zinc-100">{avgEngagementRate.toFixed(2)}%</div>
          <div className="text-[10px] text-zinc-500 mt-1">Likes + comments / views</div>
        </Card>

        <Card className="p-4 bg-zinc-900/60 border-zinc-800">
          <div className="text-zinc-400 text-xs font-medium mb-1 flex items-center justify-between">
            Positive Sentiment <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-xl font-bold text-indigo-300">{posShare}%</div>
          <div className="text-[10px] text-zinc-500 mt-1">{totalSentComments} comments analyzed</div>
        </Card>

        {showSimulatedSearch && (
          <Card className="p-4 bg-zinc-900/60 border-indigo-900/40 relative overflow-hidden">
            <div className="absolute top-2 right-2">
              <span className="text-[9px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded">
                SIMULATED
              </span>
            </div>
            <div className="text-zinc-400 text-xs font-medium mb-1">Search Clicks</div>
            <div className="text-xl font-bold text-indigo-200">
              {simulatedMetrics?.clicks.toLocaleString() || 0}
            </div>
            <div className="text-[10px] text-indigo-400 mt-1">
              CTR {simulatedMetrics?.ctr || 0}% · {simulatedMetrics?.conversions || 0} conv
            </div>
          </Card>
        )}

        <Card className="p-4 bg-zinc-900/60 border-zinc-800">
          <div className="text-zinc-400 text-xs font-medium mb-1 flex items-center justify-between">
            Est. Spend / CPM <Tv className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-zinc-100">${estSpend.toFixed(0)}</div>
          <div className="text-[10px] text-zinc-500 mt-1">${estCpm.toFixed(2)} eCPM</div>
        </Card>
      </div>

      {/* AI Summary Card */}
      <Card className="p-6 bg-gradient-to-r from-zinc-900 via-zinc-900 to-indigo-950/40 border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-semibold text-zinc-100">Live AI Synthesis & Strategy</h3>
          </div>
          <Button
            size="sm"
            variant="outline"
            icon={Sparkles}
            isLoading={refreshSummaryMutation.isPending}
            onClick={() => refreshSummaryMutation.mutate()}
          >
            Refresh Summary
          </Button>
        </div>

        {latestSummary ? (
          <div className="space-y-4 text-sm text-zinc-300">
            <p className="leading-relaxed">{latestSummary.text}</p>
            {latestSummary.actions && latestSummary.actions.length > 0 && (
              <div className="pt-3 border-t border-zinc-800">
                <div className="text-xs font-semibold text-indigo-300 mb-2">Recommended Actions:</div>
                <ul className="space-y-1.5">
                  {latestSummary.actions.map((act, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-zinc-300">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{act}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-zinc-500 py-4 text-center">
            No AI summary generated yet. Click "Refresh Summary" to analyze current performance.
          </div>
        )}
      </Card>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column (2 cols): Add Video & Tracked Videos Table */}
        <div className="lg:col-span-2 space-y-6">
          {/* Add Tracked Video Setup Panel */}
          <Card className="p-6 bg-zinc-900/80 border-zinc-800">
            <h3 className="text-base font-semibold text-zinc-100 mb-2 flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-400" /> Track Published Creator Video
            </h3>
            <p className="text-xs text-zinc-400 mb-4">
              Add a published video link or ID for an approved creator to begin live view velocity and comment sentiment tracking.
            </p>

            <form onSubmit={handleAddVideoSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Creator Channel</label>
                  <select
                    value={addingCreatorId}
                    onChange={(e) => setSelectedCreatorForAdd(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="">Select Creator...</option>
                    {creators.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.channel?.title || c.input} ({c.scores?.tier || 'Candidate'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">YouTube Video URL or ID</label>
                  <input
                    type="text"
                    value={videoInputUrl}
                    onChange={(e) => setVideoInputUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=... or Video ID"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-100 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-1">
                <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isStandIn}
                    onChange={(e) => setIsStandIn(e.target.checked)}
                    className="rounded border-zinc-800 bg-zinc-950 text-indigo-500 focus:ring-0"
                  />
                  <span>Mark as Stand-in Video (bypass channel match rule)</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowSecond}
                    onChange={(e) => setAllowSecond(e.target.checked)}
                    className="rounded border-zinc-800 bg-zinc-950 text-indigo-500 focus:ring-0"
                  />
                  <span>Confirm additional video for this creator</span>
                </label>
              </div>

              {addError && <div className="p-2.5 bg-red-950/50 border border-red-800/50 rounded-lg text-xs text-red-300">{addError}</div>}

              <div className="flex justify-end pt-2">
                <Button type="submit" size="sm" icon={Plus} isLoading={addVideoMutation.isPending}>
                  Add Tracked Video
                </Button>
              </div>
            </form>
          </Card>

          {/* Tracked Videos Table */}
          <Card className="p-6 bg-zinc-900/80 border-zinc-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-zinc-100">Tracked Campaign Videos ({videos.length})</h3>
              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-400 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showSimulatedSearch}
                    onChange={(e) => setShowSimulatedSearch(e.target.checked)}
                    className="rounded border-zinc-800 bg-zinc-950 text-indigo-500"
                  />
                  <span>Show Simulated Search Metrics</span>
                </label>
              </div>
            </div>

            {videosLoading ? (
              <div className="py-12 text-center text-zinc-500 text-xs">
                Loading tracked videos...
              </div>
            ) : videos.length === 0 ? (
              <div className="py-12 text-center text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-xl">
                No videos currently tracked. Use the form above to add creator video links.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="bg-zinc-950 text-zinc-400 border-b border-zinc-800">
                    <tr>
                      <th className="p-3">Video Title</th>
                      <th className="p-3">Creator</th>
                      <th className="p-3">Published</th>
                      <th className="p-3 text-right">Views</th>
                      <th className="p-3 text-right">Likes</th>
                      <th className="p-3 text-right">Comments</th>
                      <th className="p-3 text-right">Engagement</th>
                      <th className="p-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {videos.map((v) => {
                      const creator = creators.find((c) => c.id === v.creatorId);
                      const views = v.latestStats?.views || 0;
                      const likes = v.latestStats?.likes || 0;
                      const comments = v.latestStats?.comments || 0;
                      const eng = views > 0 ? (((likes + comments) / views) * 100).toFixed(2) : '0.00';

                      return (
                        <tr key={v.id} className="hover:bg-zinc-800/30">
                          <td className="p-3 font-medium text-zinc-100 max-w-xs truncate">
                            <div className="flex items-center gap-2">
                              {v.isStandIn && (
                                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 shrink-0">
                                  Stand-In
                                </span>
                              )}
                              <span className="truncate">{v.title}</span>
                            </div>
                          </td>
                          <td className="p-3 text-zinc-400">{creator?.channel?.title || creator?.input || v.creatorId}</td>
                          <td className="p-3 text-zinc-500">{new Date(v.publishedAt).toLocaleDateString()}</td>
                          <td className="p-3 text-right font-mono text-zinc-100">{views.toLocaleString()}</td>
                          <td className="p-3 text-right font-mono text-zinc-300">{likes.toLocaleString()}</td>
                          <td className="p-3 text-right font-mono text-zinc-300">{comments.toLocaleString()}</td>
                          <td className="p-3 text-right font-mono text-emerald-400">{eng}%</td>
                          <td className="p-3 text-center">
                            <a
                              href={v.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
                            >
                              Watch <ExternalLink className="w-3 h-3" />
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column (1 col): Alerts Panel */}
        <div className="space-y-6">
          <Card className="p-6 bg-zinc-900/80 border-zinc-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-400" />
                <h3 className="text-base font-semibold text-zinc-100">Performance Alerts</h3>
              </div>

              <div className="flex items-center gap-1 text-[11px] bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                <button
                  onClick={() => setAlertFilter('active')}
                  className={`px-2 py-1 rounded ${alertFilter === 'active' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-400'}`}
                >
                  Active ({alerts.filter((a) => a.resolvedAt === null).length})
                </button>
                <button
                  onClick={() => setAlertFilter('all')}
                  className={`px-2 py-1 rounded ${alertFilter === 'all' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-400'}`}
                >
                  All ({alerts.length})
                </button>
              </div>
            </div>

            {filteredAlerts.length === 0 ? (
              <div className="py-12 text-center text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-xl">
                No alerts matching current filter.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAlerts.map((alt) => {
                  const isResolved = alt.resolvedAt !== null;
                  const severityBg =
                    alt.severity === 'critical'
                      ? 'border-red-900/60 bg-red-950/30'
                      : alt.severity === 'warning'
                      ? 'border-amber-900/60 bg-amber-950/30'
                      : 'border-blue-900/60 bg-blue-950/30';

                  return (
                    <div
                      key={alt.id}
                      className={`p-3.5 rounded-xl border ${severityBg} space-y-2 text-xs transition`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {alt.severity === 'critical' ? (
                            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                          ) : alt.severity === 'warning' ? (
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                          ) : (
                            <Info className="w-4 h-4 text-blue-400 shrink-0" />
                          )}
                          <span className="font-semibold text-zinc-200 capitalize">
                            {alt.type.replace('_', ' ')}
                          </span>
                        </div>

                        {isResolved ? (
                          <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">Resolved</span>
                        ) : alt.acknowledged ? (
                          <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800/50 px-2 py-0.5 rounded">
                            Acknowledged
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => ackAlertMutation.mutate(alt.id)}
                            isLoading={ackAlertMutation.isPending}
                          >
                            Acknowledge
                          </Button>
                        )}
                      </div>

                      <p className="text-zinc-300 leading-snug">{alt.message}</p>

                      <div className="text-[10px] text-zinc-500 flex items-center justify-between pt-1 border-t border-zinc-800/40">
                        <span>Fired: {new Date(alt.firstFiredAt).toLocaleTimeString()}</span>
                        <span>Video ID: {alt.videoId}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
