import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Sparkles, Shield, ArrowRight, UserCheck, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Button, Card } from '../common/UIComponents.tsx';

export function LoginPage() {
  const { user, signInWithGoogle, signInAsDemo } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const returnTo = searchParams.get('returnTo') || '/campaigns';

  // If already logged in, redirect
  React.useEffect(() => {
    if (user) {
      navigate(returnTo, { replace: true });
    }
  }, [user, navigate, returnTo]);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      await signInWithGoogle();
      navigate(returnTo, { replace: true });
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Failed to sign in with Google');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = (role: 'owner' | 'member') => {
    signInAsDemo(role);
    navigate(returnTo, { replace: true });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-center items-center px-4 py-12">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white mx-auto shadow-lg shadow-indigo-500/25">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Creator Campaign AI</h1>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            End-to-end intelligence agent for YouTube creator campaigns: ranking, pre-mortem simulation, search capture, and live pulse.
          </p>
        </div>

        <Card className="p-6 border-zinc-800 bg-zinc-900/60 shadow-xl space-y-6">
          {errorMsg && (
            <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 rounded-lg text-xs">
              {errorMsg}
            </div>
          )}

          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 text-center">
              Sign In with Google
            </h2>
            <Button
              variant="primary"
              className="w-full py-2.5 bg-white text-zinc-900 hover:bg-zinc-100 font-semibold shadow"
              onClick={handleGoogleLogin}
              isLoading={isLoading}
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.05h3.9c2.27-2.1 3.65-5.2 3.65-9.14z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.9-3.05c-1.08.72-2.45 1.16-4.03 1.16-3.1 0-5.72-2.1-6.66-4.93H1.28v3.13C3.25 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.34 14.27A7.17 7.17 0 0 1 4.95 12c0-.79.14-1.57.39-2.27V6.6H1.28A11.97 11.97 0 0 0 0 12c0 1.92.45 3.74 1.28 5.4l4.06-3.13z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.28 6.6l4.06 3.13c.94-2.83 3.56-4.96 6.66-4.96z"
                />
              </svg>
              Continue with Google Account
            </Button>
          </div>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-zinc-800"></div>
            <span className="flex-shrink mx-4 text-[11px] uppercase font-semibold text-zinc-600">
              Or Hackathon Demo Mode
            </span>
            <div className="flex-grow border-t border-zinc-800"></div>
          </div>

          {/* Quick Demo Access buttons */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleDemoLogin('owner')}
              className="w-full flex items-center justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-950/40 hover:bg-zinc-800/60 hover:border-zinc-700 transition text-left text-xs"
            >
              <div className="flex items-center gap-2.5">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <div>
                  <div className="font-semibold text-zinc-200">Demo Campaign Owner</div>
                  <div className="text-[11px] text-zinc-500">Full CRUD, trash, restore, and duplicate permissions</div>
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-zinc-500" />
            </button>

            <button
              type="button"
              onClick={() => handleDemoLogin('member')}
              className="w-full flex items-center justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-950/40 hover:bg-zinc-800/60 hover:border-zinc-700 transition text-left text-xs"
            >
              <div className="flex items-center gap-2.5">
                <Shield className="w-4 h-4 text-indigo-400" />
                <div>
                  <div className="font-semibold text-zinc-200">Demo Member / Reviewer</div>
                  <div className="text-[11px] text-zinc-500">Collaborator role with read & update rights</div>
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-zinc-500" />
            </button>
          </div>
        </Card>

        {/* Feature Highlights */}
        <div className="grid grid-cols-2 gap-3 text-[11px] text-zinc-500">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
            Cloud Firestore persistence
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
            Optimistic concurrency v409
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
            Gemini structured reasoning
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
            Prompt injection security
          </div>
        </div>
      </div>
    </div>
  );
}
