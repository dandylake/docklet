"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import ContainerSpecFormFields from "@/components/containers/SpecFormFields";
import {
  specFormFromInput,
  specFormToInput,
  type SpecFormState,
  type SpecFormErrors,
} from "@/lib/containers/spec-form";
import type { CreateContainerInput } from "@/lib/docker/types";

export default function EditContainerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [form, setForm] = useState<SpecFormState | null>(null);
  const [errors, setErrors] = useState<SpecFormErrors & { submit?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/containers/${id}/spec`);
        if (res.ok) {
          const spec: CreateContainerInput = await res.json();
          setForm(specFormFromInput(spec));
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading || !form) {
    return (
      <div className="flex justify-center py-12">
        <div className="spinner" />
      </div>
    );
  }

  const updateField = <K extends keyof SpecFormState>(
    key: K,
    value: SpecFormState[K]
  ) => {
    setForm((prev) => prev && { ...prev, [key]: value });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const result = specFormToInput(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/containers/${id}/update`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.input),
      });
      if (res.ok) {
        const { id: newId } = await res.json();
        router.push(`/containers/${newId}`);
      } else {
        const data = await res.json();
        setErrors({ submit: data.error || "Failed to update container" });
      }
    } catch {
      setErrors({ submit: "Failed to update container" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PageHeader
        title="Edit Container"
        actions={
          <Button type="submit" variant="primary" loading={submitting}>
            Save Changes
          </Button>
        }
      />

      <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-4 text-yellow-300 text-sm">
        Editing a container will recreate it. Data in non-mounted paths will be
        lost.
      </div>

      {errors.submit && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-300">
          {errors.submit}
        </div>
      )}

      <ContainerSpecFormFields form={form} errors={errors} onChange={updateField} />
    </form>
  );
}
