"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import FormInput from "@/components/ui/FormInput";
import Modal from "@/components/ui/Modal";
import ContainerSpecFormFields from "@/components/containers/SpecFormFields";
import {
  defaultSpecForm,
  specFormToInput,
  type SpecFormState,
  type SpecFormErrors,
} from "@/lib/containers/spec-form";
import type { ContainerTemplate } from "@/lib/db/schema";

export default function CreateContainerPage() {
  const router = useRouter();
  const [form, setForm] = useState<SpecFormState>(defaultSpecForm);
  const [errors, setErrors] = useState<SpecFormErrors & { submit?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templates, setTemplates] = useState<ContainerTemplate[]>([]);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);

  const updateField = <K extends keyof SpecFormState>(
    key: K,
    value: SpecFormState[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = specFormToInput(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/containers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.input),
      });
      if (res.ok) {
        const { id } = await res.json();
        router.push(`/containers/${id}`);
      } else {
        const data = await res.json();
        setErrors({ submit: data.error || "Failed to create container" });
      }
    } catch {
      setErrors({ submit: "Failed to create container" });
    } finally {
      setSubmitting(false);
    }
  };

  const loadTemplates = async () => {
    const res = await fetch("/api/templates");
    if (res.ok) setTemplates(await res.json());
    setTemplateModalOpen(true);
  };

  const applyTemplate = (template: ContainerTemplate) => {
    try {
      const parsed = JSON.parse(template.config) as Partial<SpecFormState>;
      setForm({
        ...defaultSpecForm,
        ...parsed,
        _passthrough: parsed._passthrough ?? {},
      });
    } catch {
      // Invalid template config
    }
    setTemplateModalOpen(false);
  };

  const saveTemplate = async () => {
    if (!saveTemplateName.trim()) return;
    await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: saveTemplateName.trim(), config: form }),
    });
    setSaveTemplateOpen(false);
    setSaveTemplateName("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PageHeader
        title="Create Container"
        actions={
          <>
            <Button type="button" variant="secondary" onClick={loadTemplates}>
              Load Template
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSaveTemplateOpen(true)}
            >
              Save Template
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Create
            </Button>
          </>
        }
      />

      {errors.submit && (
        <div
          data-testid="error-message"
          className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-300"
        >
          {errors.submit}
        </div>
      )}

      <ContainerSpecFormFields
        form={form}
        errors={errors}
        onChange={updateField}
        placeholders
      />

      <Modal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        title="Load Template"
      >
        {templates.length === 0 ? (
          <p className="text-gray-400 text-sm">No templates saved yet</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => applyTemplate(t)}
                className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <span className="text-white font-medium">{t.name}</span>
              </button>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={saveTemplateOpen}
        onClose={() => setSaveTemplateOpen(false)}
        title="Save Template"
      >
        <div className="space-y-4">
          <FormInput
            label="Template Name"
            value={saveTemplateName}
            onChange={(e) => setSaveTemplateName(e.target.value)}
            placeholder="My Template"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setSaveTemplateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={saveTemplate}
              disabled={!saveTemplateName.trim()}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </form>
  );
}
