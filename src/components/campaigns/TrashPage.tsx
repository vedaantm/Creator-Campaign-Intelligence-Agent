import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, RotateCcw, ArrowLeft, AlertTriangle } from 'lucide-react';
import { useCampaignsTrash, useCampaignMutations } from '../../hooks/useCampaigns.ts';
import { Campaign } from '@/shared/types.ts';
import { formatRelativeTime } from '@/shared/format.ts';
import { Button, Card, Dialog, Input } from '../common/UIComponents.tsx';
import { SEO } from '../common/SEO.tsx';

export function TrashPage() {
  const { data, isLoading, isError } = useCampaignsTrash();
  const { restoreMutation, permanentDeleteMutation } = useCampaignMutations();

  const [permDeleteTarget, setPermDeleteTarget] = useState<Campaign | null>(null);
  const [confirmName, setConfirmName] = useState('');

  const handlePermanentDelete = async () => {
    if (!permDeleteTarget) return;
    if (confirmName !== permDeleteTarget.name) {
      alert('Campaign name does not match');
      return;
    }
    await permanentDeleteMutation.mutateAsync(permDeleteTarget.id);
    setPermDeleteTarget(null);
    setConfirmName('');
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <SEO
        title="Trash Bin — Campaign Workspaces"
        description="View and restore soft-deleted creator campaigns or permanently delete them."
      />
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/campaigns"
          className="p-2 border border-zinc-800 bg-zinc-900/60 rounded-lg text-zinc-400 hover:text-zinc-200 transition"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-rose-400" />
            Trash Bin
          </h1>
          <p className="text-xs text-zinc-400">
            Restore campaigns or permanently delete them with all creator subcollections.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-zinc-900/40 rounded-xl border border-zinc-800 animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && !isError && data?.items.length === 0 && (
        <Card className="text-center py-16">
          <Trash2 className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-zinc-300">Trash is empty</h3>
          <p className="text-xs text-zinc-400 mt-1">No trashed campaigns found.</p>
        </Card>
      )}

      {!isLoading && !isError && data && data.items.length > 0 && (
        <div className="border border-zinc-800 rounded-xl divide-y divide-zinc-800 overflow-hidden bg-zinc-900/30">
          {data.items.map((campaign) => (
            <div key={campaign.id} className="p-4 flex items-center justify-between hover:bg-zinc-900/60 transition">
              <div>
                <h4 className="text-sm font-medium text-zinc-200 line-through opacity-80">{campaign.name}</h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Trashed {formatRelativeTime(campaign.deletedAt)} · Version v{campaign.version}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={RotateCcw}
                  onClick={() => restoreMutation.mutate(campaign.id)}
                  isLoading={restoreMutation.isPending}
                >
                  Restore
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  icon={Trash2}
                  onClick={() => {
                    setPermDeleteTarget(campaign);
                    setConfirmName('');
                  }}
                >
                  Delete Permanently
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Permanent Delete Confirmation Dialog */}
      <Dialog
        isOpen={Boolean(permDeleteTarget)}
        onClose={() => setPermDeleteTarget(null)}
        title="Permanently Delete Campaign?"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-rose-950/30 border border-rose-800/40 rounded-lg text-xs text-rose-300">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />
            <div>
              <p className="font-semibold">Irreversible action</p>
              <p className="mt-0.5">
                This will permanently delete this campaign and purge all subcollections (creators, risk simulations, compliance briefs).
              </p>
            </div>
          </div>

          <p className="text-xs text-zinc-300">
            Please type <span className="font-mono font-bold text-white select-all">{permDeleteTarget?.name}</span> to confirm:
          </p>

          <Input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder="Type exact campaign name"
            autoFocus
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setPermDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={confirmName !== permDeleteTarget?.name}
              isLoading={permanentDeleteMutation.isPending}
              onClick={handlePermanentDelete}
            >
              Permanently Delete
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
