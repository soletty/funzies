"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAssembly } from "@/lib/assembly-context";

export default function AssemblyOverview() {
  const topic = useAssembly();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/assembly/${topic.slug}/synthesis`);
  }, [router, topic.slug]);

  return null;
}
