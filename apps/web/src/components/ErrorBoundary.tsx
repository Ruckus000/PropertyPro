'use client';

/**
 * React Error Boundary — catches render-time errors in child components.
 *
 * Error Boundaries must be class components (React does not support
 * function component error boundaries as of React 19).
 *
 * Reports caught errors to Sentry for monitoring.
 */
import React from 'react';
import * as Sentry from '@sentry/nextjs';

interface ErrorBoundaryProps {
  /** Optional custom fallback UI to show when an error occurs. */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log to console for development
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Report to Sentry
    Sentry.captureException(error, {
      contexts: {
        react: { componentStack: errorInfo.componentStack ?? undefined },
      },
    });
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          style={{
            padding: '2rem',
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h2 style={{ marginBottom: '1rem' }}>Something went wrong</h2>
          <p style={{ color: '#666', marginBottom: '1.5rem' }}>
            An unexpected error occurred. Please try again.
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              padding: '0.5rem 1.5rem',
              borderRadius: '0.375rem',
              border: '1px solid #d1d5db',
              backgroundColor: '#fff',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
