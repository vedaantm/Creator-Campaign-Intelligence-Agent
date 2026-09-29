import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Sparkles,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  Target,
  DollarSign,
  Calendar,
  Layers,
  ShieldAlert,
  Sliders,
  AlertTriangle,
} from 'lucide-react';
import {
  Button,
  Card,
  Input,
  Badge,
  Dialog,
} from '../common/UIComponents.tsx';
import { SEO } from '../common/SEO.tsx';
import {
  useCampaign,
  useCampaignBrief,
  useBriefMutations,
} from '../../hooks/useCampaigns.ts';
import {
  CampaignBrief,
  CampaignBriefSchema,
  SAMPLE_BRIEF,
  BRIEF_TONES,
  BRIEF_GOALS,
  BriefTone,
  BriefGoal,
} from '@/shared/types.ts';
import { ZodError } from 'zod';

const CATEGORY_OPTIONS = [
  'Home & Kitchen',
  'Consumer Electronics & Tech',
  'Health, Wellness & Fitness',
  'Beauty & Personal Care',
  'Food & Beverage',
  'Outdoor, Travel & EDC',
  'Software & Apps',
  'Gaming & Entertainment',
  'Fashion & Apparel',
  'Automotive',
  'Other',
];

function createDefaultBrief(): CampaignBrief {
  return {
    brandName: '',
    productName: '',
    productCategory: 'Consumer Electronics & Tech',
    landingPageUrl: '',
    approvedFacts: [''],
    competitors: [],
    bannedTerms: [],
    nicheKeywords: [],
    targetAudience: '',
    geography: 'US',
    tones: ['authentic'],
    customTone: '',
    budgetUsd: 10000,
    goal: 'awareness',
    launchDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    requiredDisclosures: {
      descriptionText: '#ad',
      verbalText: 'This video is sponsored by {brandName}.',
    },
  };
}

function normalizeBriefForComparison(b: CampaignBrief): string {
  const normalized = {
    ...b,
    brandName: b.brandName?.trim() || '',
    productName: b.productName?.trim() || '',
    productCategory: b.productCategory || 'Consumer Electronics & Tech',
    landingPageUrl: b.landingPageUrl?.trim() || '',
    approvedFacts: (b.approvedFacts || []).map((f) => f.trim()),
    competitors: (b.competitors || []).map((c) => c.trim()).filter(Boolean),
    bannedTerms: (b.bannedTerms || []).map((t) => t.trim()).filter(Boolean),
    nicheKeywords: (b.nicheKeywords || []).map((k) => k.trim()).filter(Boolean),
    targetAudience: b.targetAudience?.trim() || '',
    geography: b.geography?.trim() || 'US',
    tones: [...(b.tones || [])].sort(),
    customTone: b.customTone?.trim() || '',
    budgetUsd: Number(b.budgetUsd) || 0,
    goal: b.goal || 'awareness',
    launchDate: b.launchDate || '',
    requiredDisclosures: {
      descriptionText: b.requiredDisclosures?.descriptionText?.trim() || '#ad',
      verbalText: b.requiredDisclosures?.verbalText?.trim() || 'This video is sponsored by {brandName}.',
    },
  };
  return JSON.stringify(normalized);
}

export function CampaignBriefPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();

  const { data: campaign, isLoading: isCampaignLoading } = useCampaign(campaignId);
  const { data: briefData, isLoading: isBriefLoading } = useCampaignBrief(campaignId);
  const { saveBriefMutation } = useBriefMutations(campaignId);

  const [formState, setFormState] = useState<CampaignBrief>(createDefaultBrief());
  const [initialData, setInitialData] = useState<CampaignBrief>(createDefaultBrief());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showConfirmSample, setShowConfirmSample] = useState(false);
  const [pendingNavigationPath, setPendingNavigationPath] = useState<string | null>(null);

  // Temporary input state for tags
  const [keywordInput, setKeywordInput] = useState('');
  const [competitorInput, setCompetitorInput] = useState('');
  const [bannedTermInput, setBannedTermInput] = useState('');

  const isInitializedRef = useRef(false);

  // Sync with fetched data
  useEffect(() => {
    if (briefData) {
      const merged: CampaignBrief = briefData.brief
        ? {
            ...createDefaultBrief(),
            ...briefData.brief,
            approvedFacts: briefData.brief.approvedFacts?.length ? [...briefData.brief.approvedFacts] : [''],
            competitors: briefData.brief.competitors ? [...briefData.brief.competitors] : [],
            bannedTerms: briefData.brief.bannedTerms ? [...briefData.brief.bannedTerms] : [],
            nicheKeywords: briefData.brief.nicheKeywords ? [...briefData.brief.nicheKeywords] : [],
            tones: briefData.brief.tones ? [...briefData.brief.tones] : ['authentic'],
            requiredDisclosures: {
              descriptionText: briefData.brief.requiredDisclosures?.descriptionText || '#ad',
              verbalText: briefData.brief.requiredDisclosures?.verbalText || 'This video is sponsored by {brandName}.',
            },
          }
        : createDefaultBrief();

      setInitialData(merged);
      if (!isInitializedRef.current) {
        setFormState(merged);
        isInitializedRef.current = true;
      }
    }
  }, [briefData]);

  // Dirty check: Compare normalized state against initial snapshot
  const isDirty = useMemo(() => {
    return normalizeBriefForComparison(formState) !== normalizeBriefForComparison(initialData);
  }, [formState, initialData]);

  // Unsaved changes browser window unload guard
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // In-app navigation click interceptor for unsaved changes
  const handleGuardedNavigation = useCallback(
    (targetPath: string) => {
      if (isDirty) {
        setPendingNavigationPath(targetPath);
      } else {
        navigate(targetPath);
      }
    },
    [isDirty, navigate]
  );

  // Intercept in-app link clicks when form is dirty
  useEffect(() => {
    if (!isDirty) return;

    const handleDocumentClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a');
      if (target && target.href) {
        const url = new URL(target.href);
        if (url.origin === window.location.origin) {
          const path = url.pathname + url.search;
          if (path !== window.location.pathname + window.location.search) {
            e.preventDefault();
            e.stopPropagation();
            setPendingNavigationPath(path);
          }
        }
      }
    };

    document.addEventListener('click', handleDocumentClick, true);
    return () => document.removeEventListener('click', handleDocumentClick, true);
  }, [isDirty]);

  // Check if form currently has non-empty values
  const hasExistingData = useMemo(() => {
    return (
      Boolean(formState.brandName.trim()) ||
      Boolean(formState.productName.trim()) ||
      Boolean(formState.landingPageUrl.trim()) ||
      formState.approvedFacts.some((f) => f.trim().length > 0)
    );
  }, [formState]);

  const handleLoadSampleClick = () => {
    if (hasExistingData && (isDirty || briefData?.isComplete)) {
      setShowConfirmSample(true);
    } else {
      loadSampleBrief();
    }
  };

  const loadSampleBrief = () => {
    const sampleCopy = JSON.parse(JSON.stringify(SAMPLE_BRIEF));
    setFormState(sampleCopy);
    setErrors({});
    setShowConfirmSample(false);
  };

  const handleDiscard = () => {
    setFormState(JSON.parse(JSON.stringify(initialData)));
    setErrors({});
  };

  // Field change helper
  const updateField = <K extends keyof CampaignBrief>(field: K, value: CampaignBrief[K]) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // Facts handlers
  const handleFactChange = (index: number, text: string) => {
    const nextFacts = [...formState.approvedFacts];
    nextFacts[index] = text;
    updateField('approvedFacts', nextFacts);
  };

  const handleAddFact = () => {
    if (formState.approvedFacts.length < 20) {
      updateField('approvedFacts', [...formState.approvedFacts, '']);
    }
  };

  const handleRemoveFact = (index: number) => {
    if (formState.approvedFacts.length > 1) {
      const next = formState.approvedFacts.filter((_, i) => i !== index);
      updateField('approvedFacts', next);
    } else {
      updateField('approvedFacts', ['']);
    }
  };

  // Tone toggle handler
  const handleToggleTone = (tone: BriefTone) => {
    const current = formState.tones;
    if (current.includes(tone)) {
      if (current.length > 1) {
        updateField(
          'tones',
          current.filter((t) => t !== tone)
        );
      }
    } else {
      updateField('tones', [...current, tone]);
    }
  };

  // Tag helpers
  const addTag = (
    key: 'nicheKeywords' | 'competitors' | 'bannedTerms',
    value: string,
    clearFn: () => void,
    maxLimit: number
  ) => {
    const clean = value.trim();
    if (!clean) return;
    const current = formState[key] || [];
    if (current.length >= maxLimit) return;
    if (!current.includes(clean)) {
      updateField(key, [...current, clean]);
    }
    clearFn();
  };

  const removeTag = (key: 'nicheKeywords' | 'competitors' | 'bannedTerms', tagToRemove: string) => {
    const current = formState[key] || [];
    updateField(
      key,
      current.filter((t) => t !== tagToRemove)
    );
  };

  // Save handler with client validation and PATCH persistence
  const handleSave = async (): Promise<boolean> => {
    setErrors({});
    const sanitizedFacts = formState.approvedFacts.map((f) => f.trim()).filter(Boolean);
    const candidate: CampaignBrief = {
      ...formState,
      approvedFacts: sanitizedFacts.length > 0 ? sanitizedFacts : formState.approvedFacts,
      customTone: formState.customTone?.trim() || '',
    };

    // Client-side validation check
    try {
      CampaignBriefSchema.parse(candidate);

      if (campaign?.status === 'draft') {
        const launch = new Date(candidate.launchDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (launch < today) {
          setErrors({ launchDate: 'Launch date cannot be in the past for a draft campaign' });
          return false;
        }
      }
    } catch (err) {
      if (err instanceof ZodError) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of err.issues) {
          const path = issue.path.join('.');
          if (!fieldErrors[path]) {
            fieldErrors[path] = issue.message;
          }
        }
        setErrors(fieldErrors);
        window.scrollTo({ top: 120, behavior: 'smooth' });
        return false;
      }
    }

    if (!campaign) return false;

    try {
      await saveBriefMutation.mutateAsync({
        brief: candidate,
        version: campaign.version,
      });
      setInitialData(candidate);
      setFormState(candidate);
      return true;
    } catch {
      return false;
    }
  };

  const handleSaveAndNavigate = async (targetPath: string) => {
    const ok = await handleSave();
    if (ok) {
      setPendingNavigationPath(null);
      navigate(targetPath);
    }
  };

  const handleDiscardAndNavigate = (targetPath: string) => {
    setFormState(JSON.parse(JSON.stringify(initialData)));
    setPendingNavigationPath(null);
    navigate(targetPath);
  };

  const isLoading = isCampaignLoading || isBriefLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-zinc-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Loading campaign brief...</p>
        </div>
      </div>
    );
  }

  const isComplete = briefData?.isComplete || false;
  const brandSubstitutedDisclosure = formState.requiredDisclosures.verbalText.replace(
    /\{brandName\}/g,
    formState.brandName.trim() || '[Brand Name]'
  );

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-32 relative">
      <SEO
        title={campaign ? `${campaign.name} — Brief (Step 1)` : 'Campaign Brief & Objectives — Step 1'}
        description="Configure target audience, budget, launch date, primary message, and required FTC disclosures."
      />

      {/* Header & Status Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-950/60 text-indigo-400 border border-indigo-800/60">
              Phase 2 • Step 1
            </span>
            {isComplete ? (
              <Badge variant="active" className="text-xs">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 inline mr-1" />
                Brief Completed
              </Badge>
            ) : (
              <Badge variant="draft" className="text-xs">
                Brief Pending Completion
              </Badge>
            )}
            {isDirty && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-950/60 text-amber-300 border border-amber-800/60 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Unsaved Edits
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-zinc-100">Campaign Brief</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Define your core product positioning, approved claims, audience targets, and required FTC disclosures.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadSampleClick}
            icon={Sparkles}
            className="border-indigo-500/40 text-indigo-300 hover:bg-indigo-950/40"
          >
            Load Sample Brief
          </Button>

          {isDirty && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDiscard}
              icon={RotateCcw}
              className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
            >
              Discard
            </Button>
          )}

          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            isLoading={saveBriefMutation.isPending}
            icon={Save}
            className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 font-semibold text-xs px-3"
          >
            Save Brief
          </Button>

          {isComplete && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleGuardedNavigation(`/campaigns/${campaignId}/guidelines`)}
              className="gap-1.5"
            >
              Next: Guidelines
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Main Sectioned Form */}
      <div className="space-y-8">
        {/* SECTION 1: Brand & Product */}
        <Card className="p-6 border-zinc-800 bg-zinc-900/50 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
            <div>
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-1">
                <Layers className="w-4 h-4" />
                Section 1
              </div>
              <h2 className="text-lg font-bold text-zinc-100">Brand & Product Details</h2>
              <p className="text-xs text-zinc-400">
                Grounding anchor for creator matching and AI compliance reviews.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isDirty && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDiscard}
                  icon={RotateCcw}
                  className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 text-xs"
                >
                  Discard
                </Button>
              )}
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleSave}
                isLoading={saveBriefMutation.isPending}
                icon={Save}
                className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 font-medium text-xs px-3"
              >
                Save Brief
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Input
                label="Brand Name *"
                placeholder="e.g. Wacaco"
                value={formState.brandName}
                onChange={(e) => updateField('brandName', e.target.value)}
                maxLength={80}
                error={errors.brandName}
              />
              <div className="flex justify-between text-[11px] text-zinc-500 mt-1">
                <span>Exact legal or trademarked brand name</span>
                <span>{formState.brandName.length}/80</span>
              </div>
            </div>

            <div>
              <Input
                label="Product Name *"
                placeholder="e.g. Picopresso Portable Espresso Machine"
                value={formState.productName}
                onChange={(e) => updateField('productName', e.target.value)}
                maxLength={80}
                error={errors.productName}
              />
              <div className="flex justify-between text-[11px] text-zinc-500 mt-1">
                <span>The specific hero SKU or product</span>
                <span>{formState.productName.length}/80</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Product Category *
              </label>
              <select
                className="flex h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors"
                value={formState.productCategory}
                onChange={(e) => updateField('productCategory', e.target.value)}
              >
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat} className="bg-zinc-900 text-zinc-100">
                    {cat}
                  </option>
                ))}
              </select>
              {errors.productCategory && (
                <p className="text-xs text-rose-400 font-medium">{errors.productCategory}</p>
              )}
            </div>

            <div>
              <Input
                label="Landing Page URL (HTTPS) *"
                placeholder="https://example.com/product"
                value={formState.landingPageUrl}
                onChange={(e) => updateField('landingPageUrl', e.target.value)}
                error={errors.landingPageUrl}
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Must start with <code className="text-zinc-400">https://</code>
              </p>
            </div>
          </div>

          {/* Approved Product Facts */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Approved Product Facts (1–20 claims) *
                </label>
                <p className="text-xs text-zinc-400 mt-0.5">
                  These are the <strong className="text-amber-300">ONLY</strong> claims creator integrations are allowed to state.
                </p>
              </div>
              <span className="text-xs text-zinc-500 font-mono">
                {formState.approvedFacts.length}/20 items
              </span>
            </div>

            {errors.approvedFacts && (
              <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errors.approvedFacts}</span>
              </div>
            )}

            <div className="space-y-2.5">
              {formState.approvedFacts.map((fact, idx) => (
                <div key={idx} className="flex items-start gap-2.5">
                  <span className="w-6 h-10 flex items-center justify-center text-xs font-mono text-zinc-500 shrink-0">
                    #{idx + 1}
                  </span>
                  <div className="flex-1 space-y-1">
                    <input
                      type="text"
                      className="flex h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors"
                      placeholder="e.g. Produces authentic cafe espresso using 18 bars of manual pressure"
                      value={fact}
                      maxLength={300}
                      onChange={(e) => handleFactChange(idx, e.target.value)}
                    />
                    <div className="flex justify-between text-[11px] text-zinc-500">
                      <span>Min 5 chars, max 300</span>
                      <span className={fact.length < 5 || fact.length > 300 ? 'text-amber-400' : ''}>
                        {fact.length}/300
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-10 text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30"
                    onClick={() => handleRemoveFact(idx)}
                    title="Remove claim"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            {formState.approvedFacts.length < 20 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddFact}
                icon={Plus}
                className="mt-2 text-xs border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200"
              >
                Add Another Approved Claim
              </Button>
            )}
          </div>
        </Card>

        {/* SECTION 2: Audience, Tone & Guardrails */}
        <Card className="p-6 border-zinc-800 bg-zinc-900/50 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
            <div>
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-1">
                <Target className="w-4 h-4" />
                Section 2
              </div>
              <h2 className="text-lg font-bold text-zinc-100">Audience, Tone & Guardrails</h2>
              <p className="text-xs text-zinc-400">
                Direct creator storytelling tone, persona boundaries, and competitor bans.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isDirty && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDiscard}
                  icon={RotateCcw}
                  className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 text-xs"
                >
                  Discard
                </Button>
              )}
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleSave}
                isLoading={saveBriefMutation.isPending}
                icon={Save}
                className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 font-medium text-xs px-3"
              >
                Save Brief
              </Button>
            </div>
          </div>

          {/* Target Audience */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Target Audience Persona (20–500 chars) *
            </label>
            <textarea
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900/60 p-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors min-h-[90px]"
              placeholder="Describe demographics, pain points, lifestyle, or passions..."
              value={formState.targetAudience}
              maxLength={500}
              onChange={(e) => updateField('targetAudience', e.target.value)}
            />
            <div className="flex justify-between text-[11px] text-zinc-500">
              {errors.targetAudience ? (
                <span className="text-rose-400 font-medium">{errors.targetAudience}</span>
              ) : (
                <span>Explain who this sponsorship should resonate with</span>
              )}
              <span className={formState.targetAudience.length < 20 ? 'text-amber-400' : ''}>
                {formState.targetAudience.length}/500
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Geography */}
            <div>
              <Input
                label="Target Geography (Country Code)"
                placeholder="US"
                value={formState.geography}
                onChange={(e) => updateField('geography', e.target.value.toUpperCase())}
                maxLength={5}
                error={errors.geography}
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                ISO 2-letter country code (default: US)
              </p>
            </div>

            {/* Tones selection */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Campaign Tones (Select at least 1) *
              </label>
              <div className="flex flex-wrap gap-2">
                {BRIEF_TONES.map((tone) => {
                  const isSelected = formState.tones.includes(tone);
                  return (
                    <button
                      type="button"
                      key={tone}
                      onClick={() => handleToggleTone(tone)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                          : 'bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:bg-zinc-800 hover:text-zinc-200'
                      }`}
                    >
                      {tone}
                    </button>
                  );
                })}
              </div>
              {errors.tones && <p className="text-xs text-rose-400 font-medium">{errors.tones}</p>}
            </div>
          </div>

          {/* Custom tone & Niche keywords */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Input
              label="Custom Tone / Flavor (Optional)"
              placeholder="e.g. dry wit, technical precision"
              value={formState.customTone || ''}
              onChange={(e) => updateField('customTone', e.target.value)}
              maxLength={80}
            />

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Niche Keywords (1–10 tags) *
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  placeholder="Type tag and press Enter"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag('nicheKeywords', keywordInput, () => setKeywordInput(''), 10);
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => addTag('nicheKeywords', keywordInput, () => setKeywordInput(''), 10)}
                >
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {formState.nicheKeywords.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-zinc-800 text-zinc-300 border border-zinc-700"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => removeTag('nicheKeywords', tag)}
                      className="text-zinc-500 hover:text-rose-400 ml-1"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              {errors.nicheKeywords && (
                <p className="text-xs text-rose-400 font-medium">{errors.nicheKeywords}</p>
              )}
            </div>
          </div>

          {/* Competitors & Banned terms */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 border-t border-zinc-800/80">
            {/* Competitors */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Competitors (0–20 names)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  placeholder="e.g. Flair GO, Nanopresso"
                  value={competitorInput}
                  onChange={(e) => setCompetitorInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag('competitors', competitorInput, () => setCompetitorInput(''), 20);
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => addTag('competitors', competitorInput, () => setCompetitorInput(''), 20)}
                >
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {formState.competitors?.map((comp) => (
                  <span
                    key={comp}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-amber-950/30 text-amber-300 border border-amber-800/50"
                  >
                    {comp}
                    <button
                      type="button"
                      onClick={() => removeTag('competitors', comp)}
                      className="text-amber-500 hover:text-rose-400 ml-1"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Banned Terms */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Banned Terms & Words (0–50)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  placeholder="e.g. cheap plastic, instant coffee"
                  value={bannedTermInput}
                  onChange={(e) => setBannedTermInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag('bannedTerms', bannedTermInput, () => setBannedTermInput(''), 50);
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => addTag('bannedTerms', bannedTermInput, () => setBannedTermInput(''), 50)}
                >
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {formState.bannedTerms?.map((term) => (
                  <span
                    key={term}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-rose-950/30 text-rose-300 border border-rose-800/50"
                  >
                    {term}
                    <button
                      type="button"
                      onClick={() => removeTag('bannedTerms', term)}
                      className="text-rose-500 hover:text-rose-300 ml-1"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* SECTION 3: Budget & Timing */}
        <Card className="p-6 border-zinc-800 bg-zinc-900/50 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
            <div>
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-1">
                <DollarSign className="w-4 h-4" />
                Section 3
              </div>
              <h2 className="text-lg font-bold text-zinc-100">Budget, Goal & Timing</h2>
              <p className="text-xs text-zinc-400">
                Set commercial parameters and execution deadlines.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isDirty && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDiscard}
                  icon={RotateCcw}
                  className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 text-xs"
                >
                  Discard
                </Button>
              )}
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleSave}
                isLoading={saveBriefMutation.isPending}
                icon={Save}
                className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 font-medium text-xs px-3"
              >
                Save Brief
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <Input
                label="Campaign Budget (USD) *"
                type="number"
                min={1}
                max={10000000}
                placeholder="25000"
                value={formState.budgetUsd}
                onChange={(e) => updateField('budgetUsd', Number(e.target.value))}
                error={errors.budgetUsd}
              />
              <p className="text-[11px] text-zinc-500 mt-1">Max $10,000,000</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Primary Campaign Goal *
              </label>
              <select
                className="flex h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 capitalize"
                value={formState.goal}
                onChange={(e) => updateField('goal', e.target.value as BriefGoal)}
              >
                {BRIEF_GOALS.map((g) => (
                  <option key={g} value={g} className="bg-zinc-900 capitalize">
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Input
                label="Target Launch Date *"
                type="date"
                min={campaign?.status === 'draft' ? new Date().toISOString().split('T')[0] : undefined}
                value={formState.launchDate}
                onChange={(e) => updateField('launchDate', e.target.value)}
                error={errors.launchDate}
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                {campaign?.status === 'draft' ? 'Must be today or in the future' : 'Planned release date'}
              </p>
            </div>
          </div>
        </Card>

        {/* SECTION 4: Mandatory FTC Disclosures */}
        <Card className="p-6 border-zinc-800 bg-zinc-900/50 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
            <div>
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-1">
                <ShieldAlert className="w-4 h-4" />
                Section 4
              </div>
              <h2 className="text-lg font-bold text-zinc-100">Mandatory FTC Disclosures</h2>
              <p className="text-xs text-zinc-400">
                Clear & conspicuous sponsor disclosures checked during Phase 6 compliance audits.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isDirty && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDiscard}
                  icon={RotateCcw}
                  className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 text-xs"
                >
                  Discard
                </Button>
              )}
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleSave}
                isLoading={saveBriefMutation.isPending}
                icon={Save}
                className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 font-medium text-xs px-3"
              >
                Save Brief
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Input
                label="Video Description Tag"
                value={formState.requiredDisclosures.descriptionText}
                onChange={(e) =>
                  updateField('requiredDisclosures', {
                    ...formState.requiredDisclosures,
                    descriptionText: e.target.value,
                  })
                }
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Required disclosure tag in YouTube description (default: #ad)
              </p>
            </div>

            <div>
              <Input
                label="Verbal Disclosure Script Pattern"
                value={formState.requiredDisclosures.verbalText}
                onChange={(e) =>
                  updateField('requiredDisclosures', {
                    ...formState.requiredDisclosures,
                    verbalText: e.target.value,
                  })
                }
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Use <code className="text-indigo-400">{'{brandName}'}</code> to auto-substitute the brand name.
              </p>
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="p-4 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Verbal Disclosure Live Script Preview:
            </div>
            <p className="text-sm font-medium text-emerald-300 italic">
              "{brandSubstitutedDisclosure}"
            </p>
          </div>
        </Card>
      </div>

      {/* Sticky Bottom Save Bar (Portaled to document.body, visible whenever isDirty is true) */}
      {isDirty &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-testid="brief-sticky-save-bar"
            data-sticky-bottom-bar="true"
            className="fixed bottom-0 inset-x-0 z-50 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-700/80 px-4 sm:px-6 py-4 shadow-2xl transition-all animate-in slide-in-from-bottom duration-200"
          >
            <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="relative flex h-3 w-3 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-100 flex items-center gap-2 flex-wrap">
                    <span>Unsaved changes to brief</span>
                    <span className="text-xs font-normal text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded">
                      Draft in memory
                    </span>
                  </p>
                  <p className="text-xs text-zinc-400 hidden sm:block truncate">
                    Click "Save Brief" to persist all modified fields to Firestore before leaving this step.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDiscard}
                  icon={RotateCcw}
                  className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                >
                  Discard
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  isLoading={saveBriefMutation.isPending}
                  icon={Save}
                  className="bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/20"
                >
                  Save Brief
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Unsaved Changes Navigation Guard Dialog */}
      <Dialog
        isOpen={Boolean(pendingNavigationPath)}
        onClose={() => setPendingNavigationPath(null)}
        title="Unsaved Changes in Brief"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-amber-950/30 border border-amber-800/40 rounded-lg text-amber-200 text-sm">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-300">You have unsaved changes.</p>
              <p className="text-xs text-amber-300/80 mt-1">
                If you leave without saving, all recent edits to your campaign brief will be discarded.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-2.5 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPendingNavigationPath(null)}
              className="text-zinc-400 border-zinc-700"
            >
              Stay on Page
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => pendingNavigationPath && handleDiscardAndNavigate(pendingNavigationPath)}
              className="text-rose-400 hover:bg-rose-950/40 hover:text-rose-300"
            >
              Discard & Leave
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => pendingNavigationPath && handleSaveAndNavigate(pendingNavigationPath)}
              isLoading={saveBriefMutation.isPending}
              icon={Save}
              className="bg-indigo-600 hover:bg-indigo-500"
            >
              Save & Continue
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Sample Overwrite Confirmation Dialog */}
      <Dialog
        isOpen={showConfirmSample}
        onClose={() => setShowConfirmSample(false)}
        title="Load Sample Brief?"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-300">
            This will overwrite your existing brief fields with real-world sample data for the{' '}
            <strong className="text-indigo-400">Picopresso Portable Espresso Machine</strong>.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowConfirmSample(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={loadSampleBrief} icon={Sparkles}>
              Yes, Load Sample
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
