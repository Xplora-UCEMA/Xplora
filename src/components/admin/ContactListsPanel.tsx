/**
 * Database → Listas de contactos: filtros como «Ver miembros», guardado con snapshot completo por usuario.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import type {
  AdminMemberRow,
  ContactListMemberSnapshotV1,
  ContactListSummary,
  ContactListFilterSnapshot,
} from "../../types";
import { authFetch, readApiError } from "../../lib/serverApi";
import {
  applyMemberFilters,
  buildFilterSnapshot,
  normalizePctBounds,
  parseOptionalPct,
} from "../../lib/memberListFilters";
import {
  Field,
  Sel,
  TwoCol,
  Spinner,
  Empty,
} from "./crm/CrmUi";
import { crm } from "./crm/crmTheme";
import { useToast, useConfirm } from "../../context/FeedbackContext";

type InnerTab = "create" | "manage";

const INNER_TABS: { id: InnerTab; label: string; title: string }[] = [
  {
    id: "create",
    label: "Crear lista",
    title: "Filtrar miembros y guardar con todos los datos",
  },
  {
    id: "manage",
    label: "Administrar listas",
    title: "Ver contactos, exportar CSV, editar nombre o borrar",
  },
];

type DetailSnapshotRow = {
  id: string;
  usuario_id: string | null;
  snapshot: ContactListMemberSnapshotV1;
};

function isSnapshotV1(raw: unknown): raw is ContactListMemberSnapshotV1 {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return Boolean(
    o.v === 1 &&
      typeof o.captured_at === "string" &&
      o.row !== null &&
      typeof o.row === "object",
  );
}

function csvEscapeCell(v: string): string {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function exportSnapshotsCsv(
  members: { snapshot: unknown }[],
  listNombre: string,
): void {
  const headers = [
    "id",
    "nombre",
    "email",
    "carrera",
    "es_alumno_cema",
    "created_at_usuario",
    "updated_at_usuario",
    "usuario_eventos_anotado",
    "usuario_eventos_asistio",
    "eventos_inscripto",
    "eventos_asistio_calc",
    "pct_asistencia",
    "inscripciones_json",
    "snapshot_captured_at",
  ];

  const lines: string[] = [headers.join(",")];
  for (const m of members) {
    if (!isSnapshotV1(m.snapshot)) continue;
    const r = m.snapshot.row;
    const insJson = JSON.stringify(r.inscripciones ?? []);
    const vals = [
      r.id,
      r.nombre ?? "",
      r.email ?? "",
      r.carrera ?? "",
      String(r.es_alumno_cema ?? ""),
      r.created_at ?? "",
      r.updated_at ?? "",
      String(r.usuario_eventos_anotado ?? ""),
      String(r.usuario_eventos_asistio ?? ""),
      String(r.eventos_inscripto ?? ""),
      String(r.eventos_asistio ?? ""),
      r.pct_asistencia == null ? "" : String(r.pct_asistencia),
      insJson,
      m.snapshot.captured_at,
    ];
    lines.push(vals.map((x) => csvEscapeCell(String(x))).join(","));
  }
  if (lines.length <= 1) return;

  const blob = new Blob(["\ufeff" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = listNombre.replace(/[^\w\s\-áéíóúñÁÉÍÓÚÑ]/gi, "_").slice(0, 80);
  a.href = url;
  a.download = `lista_${safeName}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ContactListsPanel() {
  const toast = useToast();
  const confirm = useConfirm();

  const [membersLoading, setMembersLoading] = useState(true);
  const [allMembers, setAllMembers] = useState<AdminMemberRow[]>([]);

  const [listsLoading, setListsLoading] = useState(true);
  const [lists, setLists] = useState<ContactListSummary[]>([]);

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [emailQuery, setEmailQuery] = useState("");
  const [attendeeEventId, setAttendeeEventId] = useState("");
  const [carreraFilter, setCarreraFilter] = useState("");
  const [pctMin, setPctMin] = useState("");
  const [pctMax, setPctMax] = useState("");
  const [esAlumnoCema, setEsAlumnoCema] = useState<"" | "yes" | "no">("");
  const [saving, setSaving] = useState(false);

  /** Agregados uno a uno (además de los que entren por filtros). */
  const [manualMembers, setManualMembers] = useState<AdminMemberRow[]>([]);
  const [pickerQuery, setPickerQuery] = useState("");
  const [managePickerQuery, setManagePickerQuery] = useState("");
  const [appendBusy, setAppendBusy] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailMembers, setDetailMembers] = useState<DetailSnapshotRow[]>([]);
  const [detailTitle, setDetailTitle] = useState("");
  const [editingName, setEditingName] = useState("");
  const [editingDesc, setEditingDesc] = useState("");
  const [patching, setPatching] = useState(false);

  const [innerTab, setInnerTab] = useState<InnerTab>("create");

  const filterSnap: ContactListFilterSnapshot = useMemo(
    () =>
      buildFilterSnapshot(emailQuery, carreraFilter, pctMin, pctMax, esAlumnoCema, attendeeEventId),
    [emailQuery, carreraFilter, pctMin, pctMax, esAlumnoCema, attendeeEventId],
  );

  const filtered = useMemo(
    () => applyMemberFilters(allMembers, filterSnap),
    [allMembers, filterSnap],
  );

  const filtersActive =
    attendeeEventId !== "" ||
    emailQuery.trim().length > 0 ||
    carreraFilter.length > 0 ||
    pctMin.trim().length > 0 ||
    pctMax.trim().length > 0 ||
    esAlumnoCema !== "";

  const manualIdSet = useMemo(() => new Set(manualMembers.map((m) => m.id)), [manualMembers]);

  /** Sin filtros activos no incluimos «toda la base» por defecto: solo quien sumaste a mano (podés combinar con filtros). */
  const combinedMemberIds = useMemo(() => {
    const ids = new Set<string>();
    const ordered: string[] = [];
    for (const r of manualMembers) {
      if (!ids.has(r.id)) {
        ids.add(r.id);
        ordered.push(r.id);
      }
    }
    if (filtersActive) {
      for (const r of filtered) {
        if (!ids.has(r.id)) {
          ids.add(r.id);
          ordered.push(r.id);
        }
      }
    }
    return ordered;
  }, [manualMembers, filtered, filtersActive]);

  const combinedMembers = useMemo(
    () =>
      combinedMemberIds
        .map((id) => allMembers.find((m) => m.id === id))
        .filter((m): m is AdminMemberRow => Boolean(m)),
    [combinedMemberIds, allMembers],
  );

  const combinedRows = useMemo(
    () =>
      combinedMembers.map((row) => ({
        row,
        source: manualIdSet.has(row.id) ? ("Manual" as const) : ("Filtro" as const),
      })),
    [combinedMembers, manualIdSet],
  );

  const pickerHitsCreate = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return allMembers
      .filter((m) => {
        const mail = (m.email || "").toLowerCase();
        const nom = (m.nombre || "").toLowerCase();
        return mail.includes(q) || nom.includes(q);
      })
      .slice(0, 25);
  }, [pickerQuery, allMembers]);

  const filteredIdSet = useMemo(() => new Set(filtered.map((r) => r.id)), [filtered]);

  /** Ya está en el borrador de esta lista nueva: manual o (si hay filtros) coincide con el filtro. No mira otras listas guardadas. */
  const createPickerAlreadyInDraft = useMemo(() => {
    const s = new Set(manualMembers.map((m) => m.id));
    if (filtersActive) {
      for (const id of filteredIdSet) s.add(id);
    }
    return s;
  }, [manualMembers, filteredIdSet, filtersActive]);

  const detailMemberUserIds = useMemo(() => {
    const s = new Set<string>();
    for (const m of detailMembers) {
      s.add(m.snapshot.row.id);
      if (m.usuario_id) s.add(m.usuario_id);
    }
    return s;
  }, [detailMembers]);

  const pickerHitsManage = useMemo(() => {
    const q = managePickerQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return allMembers
      .filter((m) => {
        const mail = (m.email || "").toLowerCase();
        const nom = (m.nombre || "").toLowerCase();
        return mail.includes(q) || nom.includes(q);
      })
      .slice(0, 25);
  }, [managePickerQuery, allMembers]);

  const carreraOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of allMembers) {
      const c = (r.carrera || "").trim();
      if (c) set.add(c);
    }
    const sorted = [...set].sort((a, b) => a.localeCompare(b, "es"));
    return [
      { value: "", label: "Todas las carreras" },
      { value: "__NONE__", label: "(Sin carrera)" },
      ...sorted.map((c) => ({ value: c, label: c })),
    ];
  }, [allMembers]);

  const clearFilters = () => {
    setAttendeeEventId("");
    setEmailQuery("");
    setCarreraFilter("");
    setPctMin("");
    setPctMax("");
    setEsAlumnoCema("");
  };

  const pctBounds = useMemo(() => normalizePctBounds(pctMin, pctMax), [pctMin, pctMax]);
  const attendeeEventOptions = useMemo(() => {
    const events = new Map<string, { title: string; attendees: Set<string> }>();
    for (const member of allMembers) {
      for (const registration of member.inscripciones ?? []) {
        let event = events.get(registration.evento_id);
        if (!event) {
          event = { title: registration.title, attendees: new Set() };
          events.set(registration.evento_id, event);
        }
        if (registration.asistio) event.attendees.add(member.id);
      }
    }
    return [
      { value: "", label: "Sin filtro por evento" },
      ...[...events].sort((a, b) => a[1].title.localeCompare(b[1].title, "es")).map(([id, event]) => ({
        value: id, label: `${event.title} · ${event.attendees.size} ${event.attendees.size === 1 ? 'asistente' : 'asistentes'}`,
      })),
    ];
  }, [allMembers]);
  const pctInvalid =
    pctMin.trim() !== "" &&
    pctMax.trim() !== "" &&
    parseOptionalPct(pctMin) != null &&
    parseOptionalPct(pctMax) != null &&
    parseOptionalPct(pctMin)! > parseOptionalPct(pctMax)!;

  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    const res = await authFetch("/api/admin/members");
    if (!res.ok) {
      toast.error(await readApiError(res));
      setAllMembers([]);
      setMembersLoading(false);
      return;
    }
    const data = (await res.json()) as AdminMemberRow[];
    setAllMembers(data);
    setMembersLoading(false);
  }, [toast]);

  const loadLists = useCallback(async () => {
    setListsLoading(true);
    const res = await authFetch("/api/admin/contact-lists");
    if (!res.ok) {
      toast.error(await readApiError(res));
      setLists([]);
      setListsLoading(false);
      return;
    }
    const data = (await res.json()) as { lists: ContactListSummary[] };
    setLists(data.lists ?? []);
    setListsLoading(false);
  }, [toast]);

  useEffect(() => {
    void loadMembers();
    void loadLists();
  }, [loadMembers, loadLists]);

  const openDetail = async (id: string, titleFallback?: string) => {
    setInnerTab("manage");
    setSelectedId(id);
    setDetailLoading(true);
    setDetailMembers([]);
    const res = await authFetch(`/api/admin/contact-lists/${id}`);
    if (!res.ok) {
      toast.error(await readApiError(res));
      setDetailLoading(false);
      return;
    }
    const data = (await res.json()) as {
      list?: { nombre: string; descripcion: string | null };
      members: { id: string; usuario_id: string | null; snapshot: unknown }[];
    };
    const meta = data.list;
    const title = meta?.nombre ?? titleFallback ?? id;
    setDetailTitle(title);
    setEditingName(title);
    setEditingDesc(meta?.descripcion ?? "");
    setDetailMembers(
      (data.members ?? [])
        .filter((m) => isSnapshotV1(m.snapshot))
        .map((m) => ({
          id: m.id,
          usuario_id: m.usuario_id,
          snapshot: m.snapshot as ContactListMemberSnapshotV1,
        })),
    );
    setDetailLoading(false);
  };

  const saveNewList = async () => {
    const n = nombre.trim();
    if (!n) {
      toast.error("Poné un nombre para la lista.");
      return;
    }
    if (combinedMembers.length === 0) {
      toast.error("No hay contactos: usá filtros, la búsqueda para agregar de a uno, o ambos.");
      return;
    }
    setSaving(true);
    const res = await authFetch("/api/admin/contact-lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: n,
        descripcion: descripcion.trim() || null,
        member_ids: combinedMembers.map((r) => r.id),
        filter_snapshot: filterSnap,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(await readApiError(res));
      return;
    }
    toast.success(`Lista guardada (${combinedMembers.length} contactos).`);
    setNombre("");
    setDescripcion("");
    setManualMembers([]);
    setPickerQuery("");
    await loadLists();
    setInnerTab("manage");
  };

  const removeList = async (id: string, title: string) => {
    const ok = await confirm({
      title: "Eliminar lista",
      message: `¿Eliminar «${title}»? Los snapshots guardados se pierden. No afecta a los usuarios en la base.`,
      confirmLabel: "Eliminar",
      cancelLabel: "Cancelar",
      danger: true,
    });
    if (!ok) return;
    const res = await authFetch(`/api/admin/contact-lists/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(await readApiError(res));
      return;
    }
    toast.success("Lista eliminada.");
    if (selectedId === id) {
      setSelectedId(null);
      setDetailMembers([]);
    }
    await loadLists();
  };

  const saveMeta = async () => {
    if (!selectedId) return;
    const n = editingName.trim();
    if (!n) {
      toast.error("El nombre no puede quedar vacío.");
      return;
    }
    setPatching(true);
    const res = await authFetch(`/api/admin/contact-lists/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: n,
        descripcion: editingDesc.trim() || null,
      }),
    });
    setPatching(false);
    if (!res.ok) {
      toast.error(await readApiError(res));
      return;
    }
    toast.success("Lista actualizada.");
    setDetailTitle(n);
    await loadLists();
  };

  const appendToOpenList = async (memberId: string) => {
    if (!selectedId) return;
    if (detailMemberUserIds.has(memberId)) {
      toast.info("Ese contacto ya está en la lista.");
      return;
    }
    setAppendBusy(true);
    const res = await authFetch(`/api/admin/contact-lists/${selectedId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_ids: [memberId] }),
    });
    setAppendBusy(false);
    if (!res.ok) {
      toast.error(await readApiError(res));
      return;
    }
    const data = (await res.json()) as { added: number };
    if (data.added === 0) toast.info("Ese contacto ya estaba en la lista.");
    else toast.success("Contacto agregado.");
    setManagePickerQuery("");
    await loadLists();
    await openDetail(selectedId, detailTitle);
  };

  if (membersLoading && allMembers.length === 0) {
    return (
      <div style={{ padding: "32px 0" }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8 }}>
      <p style={{ ...crm.pageSubtitle, marginBottom: 16, maxWidth: "none" }}>
        Cada contacto se guarda con <strong>todos los datos</strong> del momento (perfil, inscripciones, %, fechas).
        Usá el selector para pasar entre armar una lista nueva y revisar las que ya guardaste.
      </p>

      <nav style={subNavWrap} aria-label="Modo listas de contacto">
        <div style={crm.segmentRail}>
          <div className="xplora-admin-segment-scroll">
            <div
              className="xplora-admin-segment-track"
              style={crm.segmentTrack}
              role="tablist"
            >
              {INNER_TABS.map((tab) => {
                const active = innerTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    title={tab.title}
                    className={`xplora-admin-seg${active ? " is-active" : ""}`}
                    style={crm.segmentBtn(active)}
                    onClick={() => setInnerTab(tab.id)}
                  >
                    <span style={crm.segmentLabel}>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </nav>

      {innerTab === "create" ? (
        <>
          <p style={{ ...crm.hint, marginBottom: 18, maxWidth: "none", fontSize: 13 }}>
            Podés armar la lista con <strong>filtros</strong>, con <strong>búsqueda de a uno</strong>, o ambos. Sin filtros,
            solo se guardan los que agregás manualmente (no se asume «toda la base»). Un mismo usuario puede figurar en
            varias listas.
          </p>
          <div style={{ ...card, width: "100%", boxSizing: "border-box" }}>
            <h3 style={cardTitle}>Nueva lista</h3>
            <Field
              label="Nombre de la lista"
              hint="Ej. Leads carrera X — mayo"
              value={nombre}
              onChange={setNombre}
              placeholder="Nombre obligatorio"
            />
            <Field
              label="Descripción (opcional)"
              hint="Nota interna para el equipo."
              value={descripcion}
              onChange={setDescripcion}
              placeholder=""
            />

            <div style={{ marginTop: 18 }}>
              <Sel
                label="Asistentes a un evento"
                hint="Incluye solo asistencia confirmada. Podés combinarlo con los otros filtros."
                value={attendeeEventId}
                onChange={setAttendeeEventId}
                options={attendeeEventOptions}
              />
              <TwoCol>
                <Field
                  label="Buscar por email"
                  hint="Texto dentro del correo."
                  value={emailQuery}
                  onChange={setEmailQuery}
                  placeholder="ej. @gmail.com"
                />
                <Sel
                  label="Carrera"
                  hint="Filtrá por carrera declarada."
                  value={carreraFilter}
                  onChange={setCarreraFilter}
                  options={carreraOptions}
                />
              </TwoCol>
              <TwoCol>
                <Field
                  label="% asistencia — desde"
                  value={pctMin}
                  onChange={setPctMin}
                  placeholder="0–100"
                />
                <Field
                  label="% asistencia — hasta"
                  value={pctMax}
                  onChange={setPctMax}
                  placeholder="0–100"
                />
              </TwoCol>
              <TwoCol>
                <Sel
                  label="Alumno UCEMA"
                  hint="Según dato del formulario de alta."
                  value={esAlumnoCema}
                  onChange={(v) => setEsAlumnoCema(v as "" | "yes" | "no")}
                  options={[
                    { value: "", label: "Todos" },
                    { value: "yes", label: "Sí (UCEMA)" },
                    { value: "no", label: "No" },
                  ]}
                />
                <div aria-hidden />
              </TwoCol>
              {pctInvalid ? (
                <p style={{ ...crm.hint, marginTop: 8, color: "#9b2c20" }}>
                  El valor «desde» es mayor que «hasta»; se invierten al filtrar.
                </p>
              ) : null}
              {filtersActive ? (
                <div style={{ marginTop: 12 }}>
                  <button type="button" style={crm.secondaryBtn} onClick={clearFilters}>
                    Limpiar filtros
                  </button>
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid rgba(26,16,40,0.08)" }}>
              <h4 style={{ ...cardTitle, fontSize: 14, marginBottom: 10 }}>Agregar personas puntuales</h4>
              <Field
                label="Buscar por email o nombre"
                hint="Mínimo 2 caracteres. Sumá de a uno al borrador de esta lista nueva; no importa si ya está en otra lista guardada. Si tenés filtros activos, quien ya entre por filtro aparece como «Incluido por filtro»."
                value={pickerQuery}
                onChange={setPickerQuery}
                placeholder="ej. maría o @ucema"
              />
              {pickerHitsCreate.length > 0 ? (
                <div
                  style={{
                    marginTop: 10,
                    maxHeight: 240,
                    overflow: "auto",
                    border: "1px solid rgba(26,16,40,0.1)",
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.5)",
                  }}
                >
                  {pickerHitsCreate.map((m) => {
                    const inList = createPickerAlreadyInDraft.has(m.id);
                    return (
                      <div
                        key={m.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          padding: "10px 12px",
                          borderBottom: "1px solid rgba(26,16,40,0.06)",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>{m.nombre || "—"}</div>
                          <div style={{ fontSize: 12, color: "var(--ink-muted)", wordBreak: "break-all" }}>{m.email || "—"}</div>
                        </div>
                        <button
                          type="button"
                          style={miniBtn}
                          disabled={inList}
                          onClick={() => {
                            if (inList) return;
                            setManualMembers((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
                            toast.success("Agregado a la lista previa.");
                          }}
                        >
                          {inList ? (manualIdSet.has(m.id) ? "Ya agregado" : "Incluido por filtro") : "Agregar"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : pickerQuery.trim().length >= 2 ? (
                <p style={{ ...crm.hint, marginTop: 8, fontSize: 12 }}>Sin coincidencias en la base.</p>
              ) : null}
              {manualMembers.length > 0 ? (
                <div style={{ marginTop: 14 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-muted)", marginBottom: 8 }}>
                    Agregados manualmente ({manualMembers.length})
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {manualMembers.map((m) => (
                      <span
                        key={m.id}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: "1px solid rgba(26,16,40,0.12)",
                          fontSize: 12,
                          background: "var(--cream)",
                        }}
                      >
                        <span style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {m.nombre || m.email}
                        </span>
                        <button
                          type="button"
                          style={{
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            fontWeight: 800,
                            color: "#9b2c20",
                            padding: 0,
                            lineHeight: 1,
                          }}
                          title="Quitar"
                          onClick={() => setManualMembers((prev) => prev.filter((x) => x.id !== m.id))}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <button type="button" style={{ ...crm.secondaryBtn, marginTop: 10 }} onClick={() => setManualMembers([])}>
                    Quitar todos los manuales
                  </button>
                </div>
              ) : null}
            </div>

            <p style={{ ...crm.pageSubtitle, marginTop: 18, marginBottom: 10 }}>
              <strong>{combinedMembers.length.toLocaleString("es-AR")}</strong> contactos en la lista previa
              {manualMembers.length > 0 && filtersActive
                ? ` (${manualMembers.length} manual · ${filtered.length} por filtros; sin duplicar)`
                : manualMembers.length > 0 && !filtersActive
                  ? ` (${manualMembers.length} por búsqueda manual; sin filtros no se suma nadie más automático)`
                  : filtersActive
                    ? ` (${filtered.length} por filtros)`
                    : ""}
              {filtersActive && (pctBounds.lo != null || pctBounds.hi != null)
                ? ` · % asistencia filtrado: ${pctBounds.lo ?? "—"}–${pctBounds.hi ?? "—"}`
                : ""}
              .
            </p>

            {combinedMembers.length === 0 ? (
              <p style={{ ...crm.hint, marginBottom: 16, fontSize: 13 }}>
                {filtersActive || manualMembers.length > 0
                  ? "Todavía no hay nadie en la lista previa: ajustá filtros o agregá personas con la búsqueda."
                  : "Sin filtros, la lista nueva queda vacía hasta que busques y agregues personas (o activés filtros). El mismo contacto puede estar en varias listas distintas."}
              </p>
            ) : (
              <>
                <p style={{ ...crm.hint, marginBottom: 8, fontSize: 12, color: "var(--ink-muted)" }}>
                  Vista previa (se guardan con snapshot; columna «Origen» no se persiste).
                  {combinedRows.length > 500 ? (
                    <span>
                      {" "}
                      Mostrando <strong>500</strong> de {combinedRows.length.toLocaleString("es-AR")}.
                    </span>
                  ) : null}
                </p>
                <div
                  className="xplora-admin-table-scroll"
                  style={{ maxHeight: 420, marginBottom: 18, border: "1px solid rgba(26,16,40,0.1)", borderRadius: 12 }}
                >
                  <table style={{ ...table, minWidth: 780, width: "100%" }}>
                    <thead>
                      <tr>
                        <th style={th}>Origen</th>
                        <th style={th}>Nombre</th>
                        <th style={th}>Email</th>
                        <th style={th}>Carrera</th>
                        <th style={th}>Alumno UCEMA</th>
                        <th style={{ ...th, textAlign: "right" }}>Insc. / asist.</th>
                        <th style={{ ...th, textAlign: "right" }}>%</th>
                        <th style={th}>Inscripciones (eventos)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {combinedRows.slice(0, 500).map(({ row: r, source }) => {
                        const ins = r.inscripciones ?? [];
                        return (
                          <tr key={r.id}>
                            <td style={{ ...td, fontSize: 12, fontWeight: 700, color: "var(--purple)" }}>{source}</td>
                            <td style={td}>{r.nombre?.trim() || "—"}</td>
                            <td style={{ ...td, wordBreak: "break-all" }}>{r.email?.trim() || "—"}</td>
                            <td style={td}>{r.carrera?.trim() ? r.carrera : "—"}</td>
                            <td style={td}>{r.es_alumno_cema ? "Sí" : "No"}</td>
                            <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                              {r.eventos_inscripto === 0
                                ? "—"
                                : `${r.eventos_inscripto} / ${r.eventos_asistio}`}
                            </td>
                            <td style={{ ...td, textAlign: "right" }}>
                              {r.pct_asistencia == null ? "—" : `${r.pct_asistencia}%`}
                            </td>
                            <td style={{ ...td, fontSize: 12, maxWidth: 280 }}>
                              {ins.length === 0
                                ? "—"
                                : ins
                                    .slice(0, 4)
                                    .map((x) => `${x.title}${x.asistio ? " ✓" : ""}`)
                                    .join(" · ")}
                              {ins.length > 4 ? ` +${ins.length - 4}` : ""}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <button
              type="button"
              className="xplora-admin-primary"
              style={{ ...crm.primaryBtn, opacity: saving ? 0.7 : 1 }}
              disabled={saving}
              onClick={() => void saveNewList()}
            >
              {saving ? "Guardando…" : "Guardar lista con snapshots"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={{ ...crm.hint, marginBottom: 18, maxWidth: "none", fontSize: 13 }}>
            Abrí una lista para ver los contactos congelados, exportar CSV o editar el título. Borrar solo elimina la lista
            guardada, no a los usuarios en la base.
          </p>

          <div style={{ ...card, width: "100%", boxSizing: "border-box" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
              <h3 style={{ ...cardTitle, marginBottom: 0 }}>Listas guardadas</h3>
              {!listsLoading ? (
                <span style={{ fontSize: 13, color: "var(--ink-muted)", fontWeight: 600 }}>
                  {lists.length.toLocaleString("es-AR")}{" "}
                  {lists.length === 1 ? "lista" : "listas"}
                </span>
              ) : null}
            </div>
            {listsLoading ? (
              <div style={{ padding: "24px 0" }}>
                <Spinner />
              </div>
            ) : lists.length === 0 ? (
              <Empty
                title="Todavía no hay listas"
                text="Pasá a «Crear lista», aplicá filtros y guardá la primera."
              />
            ) : (
              <div className="xplora-admin-table-scroll">
                <table style={{ ...table, minWidth: "min(100%, 920px)", width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={th}>Nombre</th>
                      <th style={{ ...th, width: 96, textAlign: "right" }}>Contactos</th>
                      <th style={{ ...th, width: 130 }}>Actualizada</th>
                      <th style={{ ...th, width: 180 }} aria-label="Acciones" />
                    </tr>
                  </thead>
                  <tbody>
                    {lists.map((L) => (
                      <tr key={L.id}>
                        <td style={td}>
                          <strong>{L.nombre}</strong>
                          {L.descripcion ? (
                            <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 6, lineHeight: 1.45 }}>
                              {L.descripcion}
                            </div>
                          ) : null}
                        </td>
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {L.member_count.toLocaleString("es-AR")}
                        </td>
                        <td style={{ ...td, fontSize: 13, color: "var(--ink-muted)" }}>
                          {new Date(L.updated_at).toLocaleString("es-AR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </td>
                        <td style={td}>
                          <button type="button" style={miniBtn} onClick={() => void openDetail(L.id, L.nombre)}>
                            Ver contactos
                          </button>
                          <button
                            type="button"
                            style={{
                              ...miniBtn,
                              marginLeft: 10,
                              color: "#9b2c20",
                              borderColor: "rgba(192,57,43,0.35)",
                            }}
                            onClick={() => void removeList(L.id, L.nombre)}
                          >
                            Borrar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {innerTab === "manage" && selectedId ? (
        <div style={{ ...card, marginTop: 24, width: "100%", boxSizing: "border-box" }}>
          <h3 style={cardTitle}>Lista: {detailTitle}</h3>
          <TwoCol>
            <Field label="Nombre" value={editingName} onChange={setEditingName} />
            <Field label="Descripción" value={editingDesc} onChange={setEditingDesc} />
          </TwoCol>
          <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              style={crm.secondaryBtn}
              disabled={patching}
              onClick={() => void saveMeta()}
            >
              {patching ? "Guardando…" : "Guardar nombre / descripción"}
            </button>
            <button
              type="button"
              style={crm.secondaryBtn}
              onClick={() =>
                exportSnapshotsCsv(
                  detailMembers.map((m) => ({ snapshot: m.snapshot })),
                  detailTitle,
                )
              }
              disabled={detailLoading || detailMembers.length === 0}
            >
              Descargar CSV
            </button>
            <button
              type="button"
              style={crm.secondaryBtn}
              onClick={() => {
                setSelectedId(null);
                setDetailMembers([]);
                setManagePickerQuery("");
              }}
            >
              Cerrar vista
            </button>
          </div>

          {detailLoading ? (
            <div style={{ padding: 24 }}>
              <Spinner />
            </div>
          ) : (
            <>
              <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid rgba(26,16,40,0.08)" }}>
                <h4 style={{ ...cardTitle, fontSize: 14, marginBottom: 10 }}>Agregar contactos a esta lista</h4>
                <Field
                  label="Buscar por email o nombre"
                  hint="Mínimo 2 caracteres. Cada «Agregar» congela el perfil actual del miembro en la lista."
                  value={managePickerQuery}
                  onChange={setManagePickerQuery}
                  placeholder="ej. juan o @gmail"
                />
                {pickerHitsManage.length > 0 ? (
                  <div
                    style={{
                      marginTop: 10,
                      maxHeight: 240,
                      overflow: "auto",
                      border: "1px solid rgba(26,16,40,0.1)",
                      borderRadius: 12,
                      background: "rgba(255,255,255,0.5)",
                    }}
                  >
                    {pickerHitsManage.map((m) => {
                      const inList = detailMemberUserIds.has(m.id);
                      return (
                        <div
                          key={m.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            padding: "10px 12px",
                            borderBottom: "1px solid rgba(26,16,40,0.06)",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>{m.nombre || "—"}</div>
                            <div style={{ fontSize: 12, color: "var(--ink-muted)", wordBreak: "break-all" }}>
                              {m.email || "—"}
                            </div>
                          </div>
                          <button
                            type="button"
                            style={miniBtn}
                            disabled={appendBusy || inList}
                            onClick={() => void appendToOpenList(m.id)}
                          >
                            {inList ? "En lista" : appendBusy ? "…" : "Agregar"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : managePickerQuery.trim().length >= 2 ? (
                  <p style={{ ...crm.hint, marginTop: 8, fontSize: 12 }}>Sin coincidencias en la base.</p>
                ) : null}
              </div>

              {detailMembers.length === 0 ? (
                <p style={{ ...crm.hint, marginTop: 16 }}>
                  Esta lista no tiene contactos todavía. Usá la búsqueda de arriba para sumar de a uno.
                </p>
              ) : (
                <>
                  <p style={{ ...crm.pageSubtitle, marginTop: 16, marginBottom: 12 }}>
                    {detailMembers.length.toLocaleString("es-AR")} contactos (datos congelados al guardar).
                  </p>
                  <div className="xplora-admin-table-scroll">
                    <table style={{ ...table, minWidth: 720 }}>
                      <thead>
                        <tr>
                          <th style={th}>Nombre</th>
                          <th style={th}>Email</th>
                          <th style={th}>Carrera</th>
                          <th style={th}>Alumno UCEMA</th>
                          <th style={{ ...th, textAlign: "right" }}>Insc. / asist.</th>
                          <th style={{ ...th, textAlign: "right" }}>%</th>
                          <th style={th}>Inscripciones (eventos)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailMembers.map((m) => {
                          const r = m.snapshot.row;
                          const ins = r.inscripciones ?? [];
                          return (
                            <tr key={m.id}>
                              <td style={td}>{r.nombre || "—"}</td>
                              <td style={{ ...td, wordBreak: "break-all" }}>{r.email || "—"}</td>
                              <td style={td}>{r.carrera?.trim() ? r.carrera : "—"}</td>
                              <td style={td}>{r.es_alumno_cema ? "Sí" : "No"}</td>
                              <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                                {r.eventos_inscripto === 0
                                  ? "—"
                                  : `${r.eventos_inscripto} / ${r.eventos_asistio}`}
                              </td>
                              <td style={{ ...td, textAlign: "right" }}>
                                {r.pct_asistencia == null ? "—" : `${r.pct_asistencia}%`}
                              </td>
                              <td style={{ ...td, fontSize: 12, maxWidth: 280 }}>
                                {ins.length === 0
                                  ? "—"
                                  : ins
                                      .slice(0, 4)
                                      .map((x) => `${x.title}${x.asistio ? " ✓" : ""}`)
                                      .join(" · ")}
                                {ins.length > 4 ? ` +${ins.length - 4}` : ""}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

const card: CSSProperties = {
  border: "1px solid rgba(26,16,40,0.1)",
  borderRadius: 16,
  padding: "20px 22px",
  background: "rgba(255,255,255,0.72)",
};

const cardTitle: CSSProperties = {
  fontFamily: "'Instrument Sans', sans-serif",
  fontSize: 15,
  fontWeight: 700,
  marginBottom: 16,
  color: "var(--ink)",
};

const table: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 14,
};

const th: CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "2px solid rgba(26,16,40,0.12)",
  color: "var(--ink-muted)",
  fontWeight: 600,
  fontSize: 11,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const td: CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid rgba(26,16,40,0.08)",
  verticalAlign: "top",
};

const miniBtn: CSSProperties = {
  ...crm.chipBtn,
  fontSize: 12,
  padding: "6px 12px",
};

const subNavWrap: CSSProperties = { marginBottom: 18 };
