"use client";

import { createContext, useContext } from "react";
import type { Topic } from "@/lib/types";

interface AssemblyContextValue {
  topic: Topic;
  assemblyId: string;
}

const AssemblyContext = createContext<AssemblyContextValue | null>(null);

export function AssemblyProvider({
  topic,
  assemblyId,
  children,
}: {
  topic: Topic;
  assemblyId: string;
  children: React.ReactNode;
}) {
  return (
    <AssemblyContext.Provider value={{ topic, assemblyId }}>
      {children}
    </AssemblyContext.Provider>
  );
}

export function useAssembly(): Topic {
  const ctx = useContext(AssemblyContext);
  if (!ctx) {
    throw new Error("useAssembly must be used within an AssemblyProvider");
  }
  return ctx.topic;
}

export function useAssemblyId(): string {
  const ctx = useContext(AssemblyContext);
  if (!ctx) {
    throw new Error("useAssemblyId must be used within an AssemblyProvider");
  }
  return ctx.assemblyId;
}
