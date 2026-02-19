"use client";

import ErrorBoundary from "./ErrorBoundary";

export default function AssemblyErrorBoundary({ children }: { children: React.ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
