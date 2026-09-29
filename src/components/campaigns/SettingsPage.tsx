import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { Shield, Users, Key, AlertTriangle } from 'lucide-react';
import { Campaign } from '@/shared/types.ts';
import { Card, Button, Input, Badge } from '../common/UIComponents.tsx';
import { SEO } from '../common/SEO.tsx';
import { useCampaignMutations } from '../../hooks/useCampaigns.ts';

export function SettingsPage() {
  const { campaign } = useOutletContext<{ campaign: Campaign }>();
  const { updateMutation } = useCampaignMutations();
  const [memberEmailInput, setMemberEmailInput] = React.useState('');

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberEmailInput.trim()) return;
    const current = campaign.memberEmails || [];
    if (current.includes(memberEmailInput.trim().toLowerCase())) return;

    await updateMutation.mutateAsync({
      id: campaign.id,
      data: {
        memberEmails: [...current, memberEmailInput.trim().toLowerCase()],
        version: campaign.version,
      },
    });
    setMemberEmailInput('');
  };

  const handleRemoveMember = async (emailToRemove: string) => {
    const current = campaign.memberEmails || [];
    await updateMutation.mutateAsync({
      id: campaign.id,
      data: {
        memberEmails: current.filter((m) => m !== emailToRemove),
        version: campaign.version,
      },
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <SEO
        title={campaign ? `${campaign.name} — Settings` : 'Workspace Settings'}
        description="Manage workspace team members, campaign permissions, and settings."
      />
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Campaign Settings & Access Control</h1>
        <p className="text-xs text-zinc-400 mt-1">
          Manage team member collaboration, owner permissions, and campaign metadata.
        </p>
      </div>

      {/* Role & Owner Info Card */}
      <Card className="space-y-4">
        <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <Shield className="w-4 h-4 text-indigo-400" />
          Campaign Ownership
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-3 bg-zinc-950/60 rounded-lg border border-zinc-800">
            <span className="text-zinc-500 block mb-1">Owner Email</span>
            <span className="font-mono text-zinc-200 font-semibold">{campaign.ownerEmail}</span>
          </div>
          <div className="p-3 bg-zinc-950/60 rounded-lg border border-zinc-800">
            <span className="text-zinc-500 block mb-1">Campaign ID</span>
            <span className="font-mono text-zinc-200">{campaign.id}</span>
          </div>
        </div>
      </Card>

      {/* Member Access Management */}
      <Card className="space-y-4">
        <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-400" />
          Team Members
        </h3>
        <p className="text-xs text-zinc-400">
          Members can view, edit briefs, run simulations, and review creator compliance. Only owners can trash or permanently delete campaigns.
        </p>

        <form onSubmit={handleAddMember} className="flex gap-2">
          <Input
            type="email"
            placeholder="colleague@company.com"
            value={memberEmailInput}
            onChange={(e) => setMemberEmailInput(e.target.value)}
          />
          <Button type="submit" variant="primary" disabled={!memberEmailInput.trim()}>
            Add Member
          </Button>
        </form>

        <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950/40">
          <div className="p-3 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="font-medium text-zinc-200">{campaign.ownerEmail}</span>
              <Badge variant="active">Owner</Badge>
            </div>
            <span className="text-zinc-500">Full Access</span>
          </div>

          {campaign.memberEmails && campaign.memberEmails.length > 0 ? (
            campaign.memberEmails.map((email) => (
              <div key={email} className="p-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-300">{email}</span>
                  <Badge variant="default">Editor</Badge>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveMember(email)}
                  className="text-rose-400 hover:text-rose-300 transition"
                >
                  Remove
                </button>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-xs text-zinc-500">
              No team members added yet.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
