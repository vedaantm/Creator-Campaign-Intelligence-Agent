import React from 'react';
import { useParams, Link, useOutletContext } from 'react-router-dom';
import { Sparkles, ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Card, Button } from '../common/UIComponents.tsx';
import { Campaign } from '@/shared/types.ts';
import { CONFIG } from '@/shared/config.ts';

interface StepPlaceholderProps {
  stepNumber: number;
  title: string;
  description: string;
  phase: number;
  prevStepPath?: string;
  nextStepPath?: string;
}

export function StepPlaceholder({
  stepNumber,
  title,
  description,
  phase,
  prevStepPath,
  nextStepPath,
}: StepPlaceholderProps) {
  const { campaignId } = useParams<{ campaignId: string }>();
  const { campaign } = useOutletContext<{ campaign: Campaign }>();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card className="text-center py-16 px-6 border-zinc-800 bg-zinc-900/30">
        <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-7 h-7" />
        </div>

        <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 mb-3">
          Step {stepNumber} · Coming in Phase {phase}
        </div>

        <h1 className="text-2xl font-bold text-zinc-100 mb-2">{title}</h1>
        <p className="text-sm text-zinc-400 max-w-lg mx-auto mb-8">{description}</p>

        <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 max-w-md mx-auto text-left text-xs text-zinc-400 space-y-2 mb-8">
          <div className="font-semibold text-zinc-300 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Phase 1 Foundation Ready
          </div>
          <p>
            Campaign workspace <span className="text-white font-medium">"{campaign?.name}"</span> is provisioned with Cloud Firestore persistence, job runner, optimistic concurrency, and Gemini services ready to power this stage.
          </p>
        </div>

        {/* Previous & Next Stepper Buttons */}
        <div className="flex items-center justify-center gap-4 pt-4 border-t border-zinc-800/80">
          {prevStepPath && (
            <Link to={`/campaigns/${campaignId}/${prevStepPath}`}>
              <Button variant="outline" size="sm" icon={ArrowLeft}>
                Previous Step
              </Button>
            </Link>
          )}

          <Link to={`/campaigns/${campaignId}/overview`}>
            <Button variant="secondary" size="sm">
              Campaign Overview
            </Button>
          </Link>

          {nextStepPath && (
            <Link to={`/campaigns/${campaignId}/${nextStepPath}`}>
              <Button variant="primary" size="sm">
                Next Step
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
          )}
        </div>
      </Card>
    </div>
  );
}
