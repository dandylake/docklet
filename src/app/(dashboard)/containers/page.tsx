"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { HiOutlinePlus, HiOutlineArrowPath } from "react-icons/hi2";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import { useDockerEvents } from "@/hooks/useDockerEvents";
import type { ContainerSummary } from "@/lib/docker/types";

export default function ContainersPage() {
  const [containers, setContainers] = useState<ContainerSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchContainers = useCallback(async () => {
    try {
      const res = await fetch("/api/containers");
      if (res.ok) {
        setContainers(await res.json());
      }
    } catch {
      // Silently fail, user can retry
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    await fetchContainers();
  }, [fetchContainers]);

  useDockerEvents(
    useCallback(() => {
      fetchContainers();
    }, [fetchContainers])
  );

  useEffect(() => {
    fetchContainers();
  }, [fetchContainers]);

  return (
    <div>
      <PageHeader
        title="Containers"
        actions={
          <>
            <Link href="/containers/create">
              <Button variant="primary" icon={<HiOutlinePlus className="w-4 h-4" />}>
                Create
              </Button>
            </Link>
            <Button
              variant="icon"
              aria-label="Refresh"
              onClick={handleRefresh}
              disabled={loading}
              icon={
                <HiOutlineArrowPath
                  className={`w-5 h-5 ${loading ? "animate-spin" : ""}`}
                />
              }
            />
          </>
        }
      />

      {loading && containers.length === 0 ? (
        <div className="flex justify-center py-12">
          <div className="spinner" />
        </div>
      ) : containers.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400 mb-4">No containers found</p>
          <Link href="/containers/create">
            <Button variant="primary" icon={<HiOutlinePlus className="w-4 h-4" />}>
              Create Container
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {containers.map((container) => (
            <ContainerCard key={container.id} container={container} />
          ))}
        </div>
      )}
    </div>
  );
}

function ContainerCard({ container }: { container: ContainerSummary }) {
  return (
    <Link href={`/containers/${container.id}`} data-testid="container-card">
      <div className="card hover:bg-gray-700 transition-colors duration-200 cursor-pointer">
        <div className="flex items-center justify-between gap-4 mb-2">
          <span className="text-blue-300 font-medium text-lg truncate">
            {container.name}
          </span>
          <StatusBadge status={container.state} />
        </div>
        <div className="space-y-1">
          <p className="text-sm text-gray-400 break-all">{container.image}</p>
          <p className="text-xs text-gray-500">
            {container.status.replace(/\s*\([^)]*\)/, "")}
          </p>
        </div>
      </div>
    </Link>
  );
}
