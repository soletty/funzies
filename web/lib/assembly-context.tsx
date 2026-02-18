"use client";

import { createContext, useContext } from "react";
import type { Topic } from "@/lib/types";

const AssemblyContext = createContext<Topic | null>(null);

export function AssemblyProvider({
  topic,
  children,
}: {
  topic: Topic;
  children: React.ReactNode;
}) {
  return (
    <AssemblyContext.Provider value={topic}>
      {children}
    </AssemblyContext.Provider>
  );
}

export function useAssembly(): Topic {
  const topic = useContext(AssemblyContext);
  if (!topic) {
    throw new Error("useAssembly must be used within an AssemblyProvider");
  }
  return topic;
}
