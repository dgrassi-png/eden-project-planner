"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { Issue } from "@/domain/result";

import type { ApiResult } from "./apiClient";

/** Runs an API mutation, tracks pending/error state and refreshes server data on success. */
export function useMutation() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<{ message: string; issues: Issue[] } | null>(null);

  async function run<T>(request: () => Promise<ApiResult<T>>, onSuccess?: (data: T) => void): Promise<boolean> {
    setRunning(true);
    setError(null);
    const result = await request();
    setRunning(false);
    if (!result.ok) {
      setError({ message: result.message, issues: result.issues });
      return false;
    }
    onSuccess?.(result.data);
    startTransition(() => router.refresh());
    return true;
  }

  return { run, busy: running || pending, error, clearError: () => setError(null) };
}
