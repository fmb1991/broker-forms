"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Question = {
  code: string;
  type: string;
  label: string;
  help?: string;
  config?: any;
  options?: { value: string; label: string; order: number }[];
  answer: any;
  table_rows?: { row_index: number; row: any }[];
};

type Payload = {
  form: { id: string; status: string; company?: string; contact?: any };
  questions: Question[];
};

export default function FormPage({ params, searchParams }: any) {
  const formUUID = useMemo(() => params.formId as string, [params]);
  const lang = (searchParams?.lang as string) || "pt-BR";

  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!formUUID) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_form_payload", {
        p_form_id: formUUID,
        p_lang: lang,
      });
      if (error) setError(error.message);
      else setPayload(data as Payload);
      setLoading(false);
    })();
  }, [formUUID, lang]);

  async function upsertAnswer(code: string, value: any) {
    const { error } = await supabase.rpc("upsert_answer", {
      p_form_id: formUUID,
      p_question_code: code,
      p_value_json: value,
    });
    if (error) throw error;
  }

  async function upsertTableRow(code: string, rowIndex: number, row: any) {
    const { error } = await supabase.rpc("upsert_table_row", {
      p_form_id: formUUID,
      p_question_code: code,
      p_row_index: rowIndex,
      p_row_json: row,
    });
    if (error) throw error;
  }

  async function handleSubmit() {
    setSubmitting(true);
    const { data, error } = await supabase.rpc("submit_form", {
      p_form_id: formUUID,
    });
    setSubmitting(false);
    if (error) return alert("Erro: " + error.message);
    if (data?.ok) {
      alert("Formulário enviado!");
      const res = await supabase.rpc("get_form_payload", {
        p_form_id: formUUID,
        p_lang: lang,
      });
      if (!res.error) setPayload(res.data as Payload);
    } else {
      alert(`Campos obrigatórios faltando: ${data?.missing_required ?? "?"}`);
    }
  }

  function mutateAnswer(code: string, next: any) {
    setPayload((prev) => {
      if (!prev) return prev;
      const i = prev.questions.findIndex((q) => q.code === code);
      if (i === -1) return prev;
      const copy = structuredClone(prev);
      copy.questions[i].answer = next;
      return copy;
    });
  }

  function renderQuestion(q: Question) {
    const label = (
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontWeight: 600 }}>{q.label}</div>
        {q.help && <div style={{ color: "#6b7280", fontSize: 13 }}>{q.help}</div>}
      </div>
    );

    switch (q.type) {
      case "boolean":
        return (
          <div key={q.code} className="border rounded p-4 mb-3">
            {label}
            <label className="mr-4">
              <input
                type="radio"
                checked={q.answer === true}
                onChange={async () => {
                  await upsertAnswer(q.code, true);
                  mutateAnswer(q.code, true);
                }}
              />{" "}
              Sim
            </label>
            <label>
              <input
                type="radio"
                checked={q.answer === false}
                onChange={async () => {
                  await upsertAnswer(q.code, false);
                  mutateAnswer(q.code, false);
                }}
              />{" "}
              Não
            </label>
          </div>
        );

      case "single_select":
        return (
          <div key={q.code} className="border rounded p-4 mb-3">
            {label}
            <select
              className="border rounded p-2 w-full"
              value={q.answer ?? ""}
              onChange={async (e) => {
                await upsertAnswer(q.code, e.target.value);
                mutateAnswer(q.code, e.target.value);
              }}
            >
              <option value="" disabled>Selecione</option>
              {(q.options || []).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        );

      case "multi_select":
        return (
          <div key={q.code} className="border rounded p-4 mb-3">
            {label}
            <div className="flex flex-wrap gap-4">
              {(q.options || []).map((o) => {
                const checked = Array.isArray(q.answer) && q.answer.includes(o.value);
                return (
                  <label key={o.value}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={async (e) => {
                        const next = new Set(Array.isArray(q.answer) ? q.answer : []);
                        if (e.target.checked) next.add(o.value); else next.delete(o.value);
                        const arr = Array.from(next);
                        await upsertAnswer(q.code, arr);
                        mutateAnswer(q.code, arr);
                      }}
                    />{" "}
                    {o.label}
                  </label>
                );
              })}
            </div>
          </div>
        );

      case "date":
        return (
          <div key={q.code} className="border rounded p-4 mb-3">
            {label}
            <input
              type="date"
              className="border rounded p-2"
              value={(q.answer as string) || ""}
              onChange={async (e) => {
                await upsertAnswer(q.code, e.target.value);
                mutateAnswer(q.code, e.target.value);
              }}
            />
          </div>
        );

      case "currency": {
        const amt = (q.answer && q.answer.amount_cents)
          ? (q.answer.amount_cents / 100).toFixed(2)
          : "";
        return (
          <div key={q.code} className="border rounded p-4 mb-3">
            {label}
            <div className="flex items-center gap-2">
              <span>R$</span>
              <input
                className="border rounded p-2"
                placeholder="0,00"
                value={amt}
                onChange={async (e) => {
                  const clean = e.target.value.replace(/\./g, "").replace(",", ".");
                  const num = Number(clean || 0);
                  const payload = {
                    amount_cents: Math.round(num * 100),
                    currency: q.config?.currency || "BRL",
                  };
                  await upsertAnswer(q.code, payload);
                  mutateAnswer(q.code, payload);
                }}
              />
            </div>
          </div>
        );
      }

      case "text":
        return (
          <div key={q.code} className="border rounded p-4 mb-3">
            {label}
            <textarea
              className="border rounded p-2 w-full"
              value={(q.answer as string) || ""}
              onChange={async (e) => {
                await upsertAnswer(q.code, e.target.value);
                mutateAnswer(q.code, e.target.value);
              }}
            />
          </div>
        );

      case "number":
        return (
          <div key={q.code} className="border rounded p-4 mb-3">
            {label}
            <input
              className="border rounded p-2"
              type="number"
              value={q.answer ?? ""}
              onChange={async (e) => {
                const n = e.target.value === "" ? null : Number(e.target.value);
                await upsertAnswer(q.code, n);
                mutateAnswer(q.code, n);
              }}
            />
          </div>
        );

      case "attachment":
        return (
          <div key={q.code} className="border rounded p-4 mb-3">
            {label}
            <div className="text-sm text-gray-600">
              Upload será adicionado depois (via URL assinada de Supabase Storage).
            </div>
          </div>
        );

      case "table":
        return (
          <div key={q.code} className="border rounded p-4 mb-3">
            {label}
            <TableEditor
              code={q.code}
              rows={q.table_rows || []}
              onSave={upsertTableRow}
            />
          </div>
        );

      default:
        return (
          <div key={q.code} className="border rounded p-4 mb-3">
            {label}
            <div>Tipo não suportado: {q.type}</div>
          </div>
        );
    }
  }

  if (loading) return <div className="p-6">Carregando…</div>;
  if (error) return <div className="p-6 text-red-600">Erro: {error}</div>;
  if (!payload) return <div className="p-6">Sem dados.</div>;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Questionário</h1>
      <div className="text-gray-600 mb-6">Empresa: {payload.form.company || ""}</div>

      {payload.questions.map((q) => renderQuestion(q))}

      <div className="flex justify-end mt-6">
        <button
          className="px-3 py-2 rounded border"
          disabled={submitting || payload.form.status === "submitted"}
          onClick={handleSubmit}
        >
          {payload.form.status === "submitted" ? "Enviado" : submitting ? "Enviando…" : "Enviar"}
        </button>
      </div>
    </div>
  );
}

function TableEditor({
  code,
  rows,
  onSave,
}: {
  code: string;
  rows: { row_index: number; row: any }[];
  onSave: (code: string, rowIndex: number, row: any) => Promise<void>;
}) {
  const [localRows, setLocalRows] = useState(rows);

  useEffect(() => setLocalRows(rows), [rows]);

  function updateRow(idx: number, key: string, val: any) {
    setLocalRows((prev) => {
      const copy = prev.map((r) => ({ ...r }));
      const target = copy.find((r) => r.row_index === idx);
      if (target) target.row = { ...target.row, [key]: val };
      return copy;
    });
  }

  async function addRow() {
    const idx = localRows.length ? Math.max(...localRows.map((r) => r.row_index)) + 1 : 0;
    const newRow = { row_index: idx, row: {} };
    await onSave(code, idx, newRow.row);
    setLocalRows((prev) => [...prev, newRow]);
  }

  async function saveRow(idx: number) {
    const target = localRows.find((r) => r.row_index === idx);
    if (!target) return;
    await onSave(code, idx, target.row);
    alert("Linha salva");
  }

  return (
    <div>
      <div className="space-y-4">
        {localRows.map((r) => (
          <div key={r.row_index} className="grid grid-cols-3 gap-3 items-end border rounded p-3">
            <div>
              <label className="text-sm text-gray-600">Nome</label>
              <input
                className="border rounded p-2 w-full"
                value={r.row.name || ""}
                onChange={(e) => updateRow(r.row_index, "name", e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-gray-600">Serviço</label>
              <input
                className="border rounded p-2 w-full"
                value={r.row.service || ""}
                onChange={(e) => updateRow(r.row_index, "service", e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!r.row.has_baa}
                onChange={(e) => updateRow(r.row_index, "has_baa", e.target.checked)}
              />
              BAA
            </label>
            <div className="col-span-3 flex justify-end">
              <button className="px-3 py-2 rounded border" onClick={() => saveRow(r.row_index)}>
                Salvar linha
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <button className="px-3 py-2 rounded border" onClick={addRow}>Adicionar linha</button>
      </div>
    </div>
  );
}
