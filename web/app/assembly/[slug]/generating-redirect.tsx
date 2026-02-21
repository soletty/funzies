"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export function GeneratingRedirect({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const generatingPath = `/assembly/${slug}/generating`;
  const isOnGenerating = pathname === generatingPath;

  useEffect(() => {
    if (!isOnGenerating) {
      router.replace(generatingPath);
    }
  }, [isOnGenerating, generatingPath, router]);

  if (!isOnGenerating) return null;

  return <>{children}</>;
}
