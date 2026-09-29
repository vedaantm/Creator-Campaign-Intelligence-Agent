import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './UIComponents.tsx';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error inside ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center p-8 text-center bg-zinc-950/50 rounded-xl border border-zinc-800 m-6">
          <div className="w-12 h-12 rounded-full bg-rose-950/50 border border-rose-800/80 flex items-center justify-center text-rose-400 mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-zinc-100 mb-2">Something went wrong</h2>
          <p className="text-sm text-zinc-400 max-w-md mb-6">
            An unexpected error occurred while rendering this section. You can try refreshing or returning to the dashboard.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={this.handleReset} icon={RefreshCw}>
              Reload Application
            </Button>
            <Button variant="primary" onClick={() => (window.location.href = '/campaigns')}>
              Back to Campaigns
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
