"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAssembly } from "@/lib/assembly-context";

export default function AssemblyOverview() {
  const topic = useAssembly();
  const router = useRouter();

  useEffect(() => {
    const base = `/assembly/${topic.slug}`;
    if (topic.synthesis) {
      router.replace(`${base}/synthesis`);
    } else if (topic.characters.length > 0) {
      router.replace(`${base}/characters`);
    } else {
      router.replace(`${base}/synthesis`);
    }
  }, [router, topic.slug, topic.synthesis, topic.characters.length]);

  return null;
}
