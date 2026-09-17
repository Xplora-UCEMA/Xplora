/**
 * Pestaña **Database**: sub-vistas y tabla de miembros (`usuarios`) con estadísticas de asistencia.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useStaffPermissions } from "../../context/StaffPermissionsContext";
import { hasPermission, hasAnyPermission } from "../../lib/crmPermissions";
import type {
  AdminMemberRow,
  AdminEmailCampaignListItem,
  AdminCampaignAudienceMember,
  AdminCampaignAudienceResponse,
  AdminEventoInscripcionRow,
  AdminEventoInscripcionesResponse,
  DbEvento,
} from "../../types";
import { authFetch, readApiError } from "../../lib/serverApi";
import { fetchAdminEventos } from "../../lib/db";
import {
  applyMemberFilters,
  buildFilterSnapshot,
  parseOptionalPct,
} from "../../lib/memberListFilters";
import ContactListsPanel from "./ContactListsPanel";
import {
  CrmSection,
  Spinner,
  Empty,
  Field,
  Sel,
  TwoCol,
} from "./crm/CrmUi";
import { crm } from "./crm/crmTheme";
import { useToast, useConfirm } from "../../context/FeedbackContext";

type DatabaseSubView = "members" | "overview" | "tools";

type SendFilter = "all" | "sent" | "not_sent";

type AsistenciaFilter = "all" | "yes" | "no";

/** Filas visibles al inicio; cada «Ver más» suma el mismo salto (sin scroll infinito). */
const MEMBERS_PAGE_STEP = 100;

const SUB_TABS: { id: DatabaseSubView; label: string; title: string }[] = [
  { id: "members", label: "Miembros", title: "Filtrar y explorar miembros" },
  {
    id: "overview",
    label: "Listas guardadas",
    title: "Segmentos con snapshot completo",
  },
  {
    id: "tools",
    label: "Herramientas",
    title: "Exportar, importar CSV y consultas SQL (read-only)",
  },
];

const SEND_FILTER_OPTIONS: { value: SendFilter; label: string }[] = [
  { value: "all", label: "Todos los miembros" },
  { value: "sent", label: "Solo quienes recibieron el mail" },
  { value: "not_sent", label: "Solo quienes no recibieron" },
];

const ASISTENCIA_FILTER_OPTIONS: { value: AsistenciaFilter; label: string }[] = [
  { value: "all", label: "Todos los inscriptos" },
  { value: "yes", label: "Solo con check-in (asistieron)" },
  { value: "no", label: "Solo sin check-in" },
];

export default function DatabasePanel() {
  const { permissions } = useStaffPermissions();

  const visibleSubTabs = useMemo(() => {
    return SUB_TABS.filter((tab) => {
      if (tab.id === "members") {
        return hasAnyPermission(permissions, ["database_full", "database_members_only"]);
      }
      if (tab.id === "overview") {
        return hasAnyPermission(permissions, ["database_full", "contact_lists_manage"]);
      }
      if (tab.id === "tools") {
        return hasAnyPermission(permissions, ["database_full", "database_export", "database_import", "database_sql_read"]);
      }
      return false;
    });
  }, [permissions]);

  const [subView, setSubView] = useState<DatabaseSubView>("members");

  useEffect(() => {
    const ids = visibleSubTabs.map((t) => t.id) as DatabaseSubView[];
    if (ids.length && !ids.includes(subView)) {
      setSubView(ids[0]!);
    }
  }, [visibleSubTabs, subView]);

  if (visibleSubTabs.length === 0) {
    return (
      <CrmSection
        kicker="Datos"
        title="Miembros"
        subtitle="No tenés permisos para ninguna vista de esta sección."
        onNew={() => {}}
        showNew={false}
      >
        <p style={{ ...crm.pageSubtitle, marginTop: 8 }}>Pedí acceso a quien administra el equipo CRM.</p>
      </CrmSection>
    );
  }

  return (
      <CrmSection
      kicker="Base"
      title="Comunidad"
      subtitle="Miembros, filtros y listas de contacto. Campañas en Email; inscriptos por evento en Archivo."
      onNew={() => {}}
      showNew={false}
    >
      <nav style={subNavWrap} aria-label="Vistas de miembros">
        <div style={crm.segmentRail}>
          <div className="xplora-admin-segment-scroll">
            <div
              className="xplora-admin-segment-track"
              style={crm.segmentTrack}
              role="tablist"
            >
              {visibleSubTabs.map((tab) => {
                const active = subView === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    title={tab.title}
                    className={`xplora-admin-seg${active ? " is-active" : ""}`}
                    style={crm.segmentBtn(active)}
                    onClick={() => setSubView(tab.id)}
                  >
                    <span style={crm.segmentLabel}>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </nav>

      {subView === "members" && <MembersTable />}
      {subView === "overview" && <ContactListsPanel />}
      {subView === "tools" && <DatabaseToolsPanel />}
    </CrmSection>
  );
}

/** Misma vista que **Email → Quién recibió el mail**. */
export function CampaignAudiencePanel() {
  return <CampaignAudienceTable />;
}

/** Misma vista que **Archivo → Inscriptos por evento**. */
export function EventAudiencePanel() {
  return <EventAudienceTable />;
}

function campaignSelectLabel(c: AdminEmailCampaignListItem): string {
  const t = c.titulo_interno?.trim() || c.asunto?.trim();
  const base = t ? t : `Campaña ${c.id.slice(0, 8)}…`;
  const tid = c.template_id?.trim();
  return tid ? `${base} · ${tid}` : base;
}

function eventSelectLabel(e: DbEvento): string {
  const title = e.title?.trim();
  const date = e.date_display?.trim();
  if (title && date) return `${title} · ${date}`;
  if (title) return title;
  if (date) return date;
  return `Evento ${e.id.slice(0, 8)}…`;
}

function formatEventTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

function CampaignAudienceTable() {
  const { permissions } = useStaffPermissions();
  const canDeleteMembers = hasPermission(permissions, "members_data_delete");
  const toast = useToast();
  const confirm = useConfirm();
  const topRef = useRef<HTMLDivElement>(null);
  const [campaigns, setCampaigns] = useState<AdminEmailCampaignListItem[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [rows, setRows] = useState<AdminCampaignAudienceMember[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingAudience, setLoadingAudience] = useState(false);
  const [visibleCount, setVisibleCount] = useState(MEMBERS_PAGE_STEP);
  const [sendFilter, setSendFilter] = useState<SendFilter>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingList(true);
      const res = await authFetch("/api/admin/email-campaigns");
      if (cancelled) return;
      if (!res.ok) {
        toast.error(await readApiError(res));
        setCampaigns([]);
      } else {
        setCampaigns((await res.json()) as AdminEmailCampaignListItem[]);
      }
      setLoadingList(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const loadAudience = useCallback(async () => {
    if (!campaignId) {
      setRows([]);
      return;
    }
    setLoadingAudience(true);
    const res = await authFetch(`/api/admin/email-campaigns/${campaignId}/audience`);
    if (!res.ok) {
      toast.error(await readApiError(res));
      setRows([]);
      setLoadingAudience(false);
      return;
    }
    const data = (await res.json()) as AdminCampaignAudienceResponse;
    setRows(data.rows);
    setLoadingAudience(false);
  }, [campaignId, toast]);

  useEffect(() => {
    loadAudience();
  }, [loadAudience]);

  useEffect(() => {
    setVisibleCount(MEMBERS_PAGE_STEP);
  }, [rows, sendFilter]);

  const filtered = useMemo(() => {
    if (sendFilter === "sent") return rows.filter((r) => r.enviado);
    if (sendFilter === "not_sent") return rows.filter((r) => !r.enviado);
    return rows;
  }, [rows, sendFilter]);

  const campaignOptions = useMemo(
    () => [
      { value: "", label: "— Elegí una campaña —" },
      ...campaigns.map((c) => ({
        value: c.id,
        label: campaignSelectLabel(c),
      })),
    ],
    [campaigns],
  );

  const remove = async (row: AdminCampaignAudienceMember) => {
    const ok = await confirm({
      title: "Eliminar miembro",
      message: `¿Eliminar a ${row.nombre || row.email || "este miembro"} de la base? También se borran sus inscripciones a eventos. No podés deshacer.`,
      confirmLabel: "Eliminar",
      cancelLabel: "Cancelar",
      danger: true,
    });
    if (!ok) return;
    const res = await authFetch(`/api/admin/members/${row.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(await readApiError(res));
      return;
    }
    toast.success("Miembro eliminado.");
    await loadAudience();
  };

  const scrollToTop = () => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loadingList) {
    return (
      <div style={{ padding: "32px 0" }}>
        <Spinner />
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <Empty
        title="No hay campañas"
        text="Creá filas en la tabla campanias_email en Supabase para verlas acá."
      />
    );
  }

  const sentCount = rows.filter((r) => r.enviado).length;
  const notSentCount = rows.length - sentCount;

  const visible = filtered.slice(0, visibleCount);
  const total = filtered.length;
  const showing = visible.length;
  const hasMore = visibleCount < total;

  const showMore = () => {
    setVisibleCount((c) => Math.min(c + MEMBERS_PAGE_STEP, total));
  };

  return (
    <div ref={topRef} style={{ marginTop: 8 }}>
      <TwoCol>
        <Sel
          label="Campaña de email"
          hint="Basado en registros en campanias_email."
          value={campaignId}
          onChange={setCampaignId}
          options={campaignOptions}
        />
        <Sel
          label="Filtrar por envío"
          hint="Compará con la tabla campanias_envios para esta campaña."
          value={sendFilter}
          onChange={(v) => setSendFilter(v as SendFilter)}
          options={SEND_FILTER_OPTIONS}
        />
      </TwoCol>

      {!campaignId ? (
        <p
          style={{
            ...crm.pageSubtitle,
            marginTop: 16,
            maxWidth: "none",
            color: "var(--ink-muted)",
          }}
        >
          Elegí una campaña para ver todos los miembros y si cada uno recibió ese envío.
        </p>
      ) : loadingAudience ? (
        <div style={{ padding: "28px 0" }}>
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <p
          style={{
            ...crm.pageSubtitle,
            marginTop: 16,
            maxWidth: "none",
            color: "var(--ink-muted)",
          }}
        >
          No hay filas con este filtro de envío. Probá «Todos los miembros» o otra campaña.
        </p>
      ) : (
        <>
          <p style={{ ...crm.pageSubtitle, marginTop: 18, marginBottom: 14, maxWidth: "none" }}>
            <strong>{rows.length.toLocaleString("es-AR")}</strong> miembros ·{" "}
            <strong>{sentCount.toLocaleString("es-AR")}</strong> con envío registrado ·{" "}
            <strong>{notSentCount.toLocaleString("es-AR")}</strong> sin envío. Mostrando{" "}
            <strong>{showing.toLocaleString("es-AR")}</strong>
            {sendFilter !== "all" ? ` de ${total.toLocaleString("es-AR")} con este filtro` : ""}.
          </p>
          <div className="xplora-admin-table-scroll">
            <table style={{ ...table, minWidth: 600 }}>
              <thead>
                <tr>
                  <th scope="col" style={{ ...th, width: 56, textAlign: "right" }}>
                    #
                  </th>
                  <th scope="col" style={th}>
                    Nombre
                  </th>
                  <th scope="col" style={th}>
                    Email
                  </th>
                  <th scope="col" style={{ ...th, width: 110, textAlign: "right" }}>
                    % asistencia
                  </th>
                  <th scope="col" style={th}>
                    Carrera
                  </th>
                  <th scope="col" style={{ ...th, width: 120 }}>
                    Recibió mail
                  </th>
                  {canDeleteMembers ? (
                    <th scope="col" style={{ ...th, width: 52 }} aria-label="Eliminar" />
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {visible.map((row, index) => {
                  const num = index + 1;
                  return (
                    <tr key={row.id}>
                      <td
                        style={{
                          ...td,
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          color: "var(--ink-muted)",
                        }}
                      >
                        {num.toLocaleString("es-AR")}
                      </td>
                      <td style={td}>{row.nombre || "—"}</td>
                      <td style={{ ...td, wordBreak: "break-all" as const }}>
                        {row.email || "—"}
                      </td>
                      <td
                        style={{
                          ...td,
                          textAlign: "right" as const,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {formatPct(row)}
                      </td>
                      <td style={td}>{row.carrera?.trim() ? row.carrera : "—"}</td>
                      <td style={td}>
                        <span style={row.enviado ? badgeSi : badgeNo}>
                          {row.enviado ? "Sí" : "No"}
                        </span>
                      </td>
                      {canDeleteMembers ? (
                        <td style={{ ...td, textAlign: "center", verticalAlign: "middle" }}>
                          <button
                            type="button"
                            aria-label={`Eliminar miembro ${row.nombre || row.email}`}
                            title="Eliminar de la base"
                            onClick={() => remove(row)}
                            style={delBtn}
                          >
                            ×
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasMore ? (
            <div style={{ marginTop: 20, display: "flex", justifyContent: "center" }}>
              <button
                type="button"
                className="xplora-admin-primary"
                style={crm.primaryBtn}
                onClick={showMore}
              >
                Ver más ({(total - showing).toLocaleString("es-AR")} restantes)
              </button>
            </div>
          ) : (
            <p
              style={{
                marginTop: 16,
                textAlign: "center",
                fontSize: 13,
                color: "var(--ink-muted)",
              }}
            >
              Listado completo: {total.toLocaleString("es-AR")} fila{total === 1 ? "" : "s"}.
            </p>
          )}

          <div
            style={{
              marginTop: 28,
              paddingBottom: 8,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <button type="button" style={backToTopBtn} onClick={scrollToTop}>
              ↑ Volver arriba
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function EventAudienceTable() {
  const { permissions } = useStaffPermissions();
  const canDeleteMembers = hasPermission(permissions, "members_data_delete");
  const toast = useToast();
  const confirm = useConfirm();
  const topRef = useRef<HTMLDivElement>(null);
  const [eventos, setEventos] = useState<DbEvento[]>([]);
  const [eventoId, setEventoId] = useState("");
  const [eventoMeta, setEventoMeta] = useState<AdminEventoInscripcionesResponse["evento"] | null>(
    null,
  );
  const [rows, setRows] = useState<AdminEventoInscripcionRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [asistenciaFilter, setAsistenciaFilter] = useState<AsistenciaFilter>("all");
  const [visibleCount, setVisibleCount] = useState(MEMBERS_PAGE_STEP);

  const pastEventos = useMemo(
    () => eventos.filter((e) => e.realizado === true),
    [eventos],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingList(true);
      try {
        const list = await fetchAdminEventos();
        if (!cancelled) setEventos(list);
      } catch {
        if (!cancelled) toast.error("No se pudieron cargar los eventos.");
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const loadInscripciones = useCallback(async () => {
    if (!eventoId) {
      setRows([]);
      setEventoMeta(null);
      return;
    }
    setLoadingRows(true);
    const res = await authFetch(
      `/api/admin/eventos/${encodeURIComponent(eventoId)}/inscripciones`,
    );
    if (!res.ok) {
      toast.error(await readApiError(res));
      setRows([]);
      setEventoMeta(null);
      setLoadingRows(false);
      return;
    }
    const data = (await res.json()) as AdminEventoInscripcionesResponse;
    setRows(data.rows);
    setEventoMeta(data.evento);
    setLoadingRows(false);
  }, [eventoId, toast]);

  useEffect(() => {
    loadInscripciones();
  }, [loadInscripciones]);

  useEffect(() => {
    setVisibleCount(MEMBERS_PAGE_STEP);
  }, [rows, asistenciaFilter]);

  const filtered = useMemo(() => {
    if (asistenciaFilter === "yes") return rows.filter((r) => r.asistio);
    if (asistenciaFilter === "no") return rows.filter((r) => !r.asistio);
    return rows;
  }, [rows, asistenciaFilter]);

  const eventOptions = useMemo(
    () => [
      { value: "", label: "— Elegí un evento del Archivo —" },
      ...pastEventos.map((e) => ({
        value: e.id,
        label: eventSelectLabel(e),
      })),
    ],
    [pastEventos],
  );

  const remove = async (row: AdminEventoInscripcionRow) => {
    const ok = await confirm({
      title: "Eliminar miembro",
      message: `¿Eliminar a ${row.nombre || row.email || "este miembro"} de la base? También se borran sus inscripciones a eventos. No podés deshacer.`,
      confirmLabel: "Eliminar",
      cancelLabel: "Cancelar",
      danger: true,
    });
    if (!ok) return;
    const res = await authFetch(`/api/admin/members/${row.usuario_id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error(await readApiError(res));
      return;
    }
    toast.success("Miembro eliminado.");
    await loadInscripciones();
  };

  const scrollToTop = () => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loadingList) {
    return (
      <div style={{ padding: "32px 0" }}>
        <Spinner />
      </div>
    );
  }

  if (pastEventos.length === 0) {
    return (
      <Empty
        title="No hay eventos en Archivo"
        text="Marcá eventos como realizados en el panel de eventos para listarlos acá junto con sus inscriptos."
      />
    );
  }

  const checkInCount = rows.filter((r) => r.asistio).length;
  const noCheckInCount = rows.length - checkInCount;

  const visible = filtered.slice(0, visibleCount);
  const total = filtered.length;
  const showing = visible.length;
  const hasMore = visibleCount < total;

  const showMore = () => {
    setVisibleCount((c) => Math.min(c + MEMBERS_PAGE_STEP, total));
  };

  return (
    <div ref={topRef} style={{ marginTop: 8 }}>
      <TwoCol>
        <Sel
          label="Evento (Archivo)"
          hint="Solo eventos marcados como realizados."
          value={eventoId}
          onChange={setEventoId}
          options={eventOptions}
        />
        <Sel
          label="Filtrar por asistencia"
          hint="Según check-in en inscripciones_evento."
          value={asistenciaFilter}
          onChange={(v) => setAsistenciaFilter(v as AsistenciaFilter)}
          options={ASISTENCIA_FILTER_OPTIONS}
        />
      </TwoCol>

      {!eventoId ? (
        <p
          style={{
            ...crm.pageSubtitle,
            marginTop: 16,
            maxWidth: "none",
            color: "var(--ink-muted)",
          }}
        >
          Elegí un evento para ver todos los usuarios inscriptos y si hicieron check-in.
        </p>
      ) : loadingRows ? (
        <div style={{ padding: "28px 0" }}>
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <p
          style={{
            ...crm.pageSubtitle,
            marginTop: 16,
            maxWidth: "none",
            color: "var(--ink-muted)",
          }}
        >
          No hay filas con este filtro. Probá «Todos los inscriptos» o revisá si hay inscripciones para «
          {eventoMeta?.title?.trim() || "este evento"}».
        </p>
      ) : (
        <>
          <p style={{ ...crm.pageSubtitle, marginTop: 18, marginBottom: 14, maxWidth: "none" }}>
            <strong>{rows.length.toLocaleString("es-AR")}</strong> inscriptos ·{" "}
            <strong>{checkInCount.toLocaleString("es-AR")}</strong> con check-in ·{" "}
            <strong>{noCheckInCount.toLocaleString("es-AR")}</strong> sin check-in. Mostrando{" "}
            <strong>{showing.toLocaleString("es-AR")}</strong>
            {asistenciaFilter !== "all" ? ` de ${total.toLocaleString("es-AR")} con este filtro` : ""}.
          </p>
          <div className="xplora-admin-table-scroll">
            <table style={{ ...table, minWidth: 720 }}>
              <thead>
                <tr>
                  <th scope="col" style={{ ...th, width: 56, textAlign: "right" }}>
                    #
                  </th>
                  <th scope="col" style={th}>
                    Nombre
                  </th>
                  <th scope="col" style={th}>
                    Email
                  </th>
                  <th scope="col" style={th}>
                    Carrera
                  </th>
                  <th scope="col" style={{ ...th, width: 130 }}>
                    Check-in
                  </th>
                  <th scope="col" style={{ ...th, width: 140 }}>
                    Inscripto
                  </th>
                  <th scope="col" style={{ ...th, width: 140 }}>
                    Check-in (hora)
                  </th>
                  {canDeleteMembers ? (
                    <th scope="col" style={{ ...th, width: 52 }} aria-label="Eliminar" />
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {visible.map((row, index) => {
                  const num = index + 1;
                  return (
                    <tr key={row.usuario_id}>
                      <td
                        style={{
                          ...td,
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          color: "var(--ink-muted)",
                        }}
                      >
                        {num.toLocaleString("es-AR")}
                      </td>
                      <td style={td}>{row.nombre || "—"}</td>
                      <td style={{ ...td, wordBreak: "break-all" as const }}>
                        {row.email || "—"}
                      </td>
                      <td style={td}>{row.carrera?.trim() ? row.carrera : "—"}</td>
                      <td style={td}>
                        <span style={row.asistio ? badgeSi : badgeNo}>
                          {row.asistio ? "Sí" : "No"}
                        </span>
                      </td>
                      <td style={{ ...td, fontSize: 12 }}>{formatEventTimestamp(row.registered_at)}</td>
                      <td style={{ ...td, fontSize: 12 }}>{formatEventTimestamp(row.asistio_at)}</td>
                      {canDeleteMembers ? (
                        <td style={{ ...td, textAlign: "center", verticalAlign: "middle" }}>
                          <button
                            type="button"
                            aria-label={`Eliminar miembro ${row.nombre || row.email}`}
                            title="Eliminar de la base"
                            onClick={() => remove(row)}
                            style={delBtn}
                          >
                            ×
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasMore ? (
            <div style={{ marginTop: 20, display: "flex", justifyContent: "center" }}>
              <button
                type="button"
                className="xplora-admin-primary"
                style={crm.primaryBtn}
                onClick={showMore}
              >
                Ver más ({(total - showing).toLocaleString("es-AR")} restantes)
              </button>
            </div>
          ) : (
            <p
              style={{
                marginTop: 16,
                textAlign: "center",
                fontSize: 13,
                color: "var(--ink-muted)",
              }}
            >
              Listado completo: {total.toLocaleString("es-AR")} fila{total === 1 ? "" : "s"}.
            </p>
          )}

          <div
            style={{
              marginTop: 28,
              paddingBottom: 8,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <button type="button" style={backToTopBtn} onClick={scrollToTop}>
              ↑ Volver arriba
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const badgeSi: CSSProperties = {
  display: "inline-block",
  fontSize: 12,
  fontWeight: 700,
  padding: "4px 10px",
  borderRadius: 8,
  background: "rgba(45, 106, 79, 0.12)",
  color: "#1f5c44",
};

const badgeNo: CSSProperties = {
  display: "inline-block",
  fontSize: 12,
  fontWeight: 600,
  padding: "4px 10px",
  borderRadius: 8,
  background: "rgba(26,16,40,0.06)",
  color: "var(--ink-muted)",
};

function MembersTable() {
  const { permissions } = useStaffPermissions();
  const canDeleteMembers = hasPermission(permissions, "members_data_delete");
  const toast = useToast();
  const confirm = useConfirm();
  const topRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<AdminMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(MEMBERS_PAGE_STEP);
  const [emailQuery, setEmailQuery] = useState("");
  const [carreraFilter, setCarreraFilter] = useState("");
  const [pctMin, setPctMin] = useState("");
  const [pctMax, setPctMax] = useState("");
  const [esAlumnoCema, setEsAlumnoCema] = useState<"" | "yes" | "no">("");

  const carreraOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const c = (r.carrera || "").trim();
      if (c) set.add(c);
    }
    const sorted = [...set].sort((a, b) => a.localeCompare(b, "es"));
    return [
      { value: "", label: "Todas las carreras" },
      { value: "__NONE__", label: "(Sin carrera)" },
      ...sorted.map((c) => ({ value: c, label: c })),
    ];
  }, [rows]);

  const filtered = useMemo(() => {
    return applyMemberFilters(
      rows,
      buildFilterSnapshot(emailQuery, carreraFilter, pctMin, pctMax, esAlumnoCema),
    );
  }, [rows, emailQuery, carreraFilter, pctMin, pctMax, esAlumnoCema]);

  const filtersActive =
    emailQuery.trim().length > 0 ||
    carreraFilter.length > 0 ||
    pctMin.trim().length > 0 ||
    pctMax.trim().length > 0 ||
    esAlumnoCema !== "";

  const clearFilters = () => {
    setEmailQuery("");
    setCarreraFilter("");
    setPctMin("");
    setPctMax("");
    setEsAlumnoCema("");
  };

  const load = useCallback(async () => {
    setLoading(true);
    const res = await authFetch("/api/admin/members");
    if (!res.ok) {
      toast.error(await readApiError(res));
      setRows([]);
      setLoading(false);
      return;
    }
    const data = (await res.json()) as AdminMemberRow[];
    setRows(data);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setVisibleCount(MEMBERS_PAGE_STEP);
  }, [rows, emailQuery, carreraFilter, pctMin, pctMax, esAlumnoCema]);

  const remove = async (row: AdminMemberRow) => {
    const ok = await confirm({
      title: "Eliminar miembro",
      message: `¿Eliminar a ${row.nombre || row.email || "este miembro"} de la base? También se borran sus inscripciones a eventos. No podés deshacer.`,
      confirmLabel: "Eliminar",
      cancelLabel: "Cancelar",
      danger: true,
    });
    if (!ok) return;
    const res = await authFetch(`/api/admin/members/${row.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error(await readApiError(res));
      return;
    }
    toast.success("Miembro eliminado.");
    load();
  };

  if (loading) {
    return (
      <div style={{ padding: "32px 0" }}>
        <Spinner />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Empty
        title="No hay miembros"
        text="Cuando haya filas en usuarios, aparecerán acá."
      />
    );
  }

  const scrollToTop = () => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const visible = filtered.slice(0, visibleCount);
  const totalInDb = rows.length;
  const total = filtered.length;
  const showing = visible.length;
  const hasMore = visibleCount < total;

  const showMore = () => {
    setVisibleCount((c) => Math.min(c + MEMBERS_PAGE_STEP, total));
  };

  const pctInvalid =
    pctMin.trim() !== "" &&
    pctMax.trim() !== "" &&
    parseOptionalPct(pctMin) != null &&
    parseOptionalPct(pctMax) != null &&
    parseOptionalPct(pctMin)! > parseOptionalPct(pctMax)!;

  return (
    <div ref={topRef} style={{ marginTop: 8 }}>
      <div style={{ marginBottom: 22 }}>
        <TwoCol>
          <Field
            label="Buscar por email"
            hint="Texto dentro del correo; sin distinguir mayúsculas."
            value={emailQuery}
            onChange={setEmailQuery}
            placeholder="ej. pedrochiesa@gmail.com"
          />
          <Sel
            label="Carrera"
            hint="Filtrá por carrera declarada en la base."
            value={carreraFilter}
            onChange={setCarreraFilter}
            options={carreraOptions}
          />
        </TwoCol>
        <TwoCol>
          <Sel
            label="Alumno UCEMA"
            hint="Según el formulario de alta."
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
        <TwoCol>
          <Field
            label="% asistencia — desde"
            hint="Solo filas con % calculado (con inscripciones). Vacío = sin límite inferior."
            value={pctMin}
            onChange={setPctMin}
            placeholder="0–100"
          />
          <Field
            label="% asistencia — hasta"
            hint="Vacío = sin límite superior."
            value={pctMax}
            onChange={setPctMax}
            placeholder="0–100"
          />
        </TwoCol>
        {pctInvalid ? (
          <p style={{ ...crm.hint, marginTop: 8, color: "#9b2c20" }}>
            El valor «desde» es mayor que «hasta»; se interpretan invertidos al filtrar.
          </p>
        ) : null}
        <div style={presetRow}>
          <span style={presetLabel}>Accesos rápidos %:</span>
          <button
            type="button"
            style={presetBtn}
            onClick={() => {
              setPctMin("75");
              setPctMax("");
            }}
          >
            &gt; 75%
          </button>
          <button
            type="button"
            style={presetBtn}
            onClick={() => {
              setPctMin("50");
              setPctMax("");
            }}
          >
            &gt; 50%
          </button>
          <button
            type="button"
            style={presetBtn}
            onClick={() => {
              setPctMin("25");
              setPctMax("");
            }}
          >
            &gt; 25%
          </button>
          <button
            type="button"
            style={presetBtn}
            onClick={() => {
              setPctMin("");
              setPctMax("50");
            }}
          >
            &lt; 50%
          </button>
          <button
            type="button"
            style={presetBtn}
            onClick={() => {
              setPctMin("");
              setPctMax("25");
            }}
          >
            &lt; 25%
          </button>
          <button
            type="button"
            style={presetBtn}
            onClick={() => {
              setPctMin("40");
              setPctMax("60");
            }}
          >
            40–60%
          </button>
          <button
            type="button"
            style={presetBtn}
            onClick={() => {
              setPctMin("100");
              setPctMax("");
            }}
          >
            100%
          </button>
          <button
            type="button"
            style={presetBtnMuted}
            onClick={() => {
              setPctMin("");
              setPctMax("");
            }}
          >
            Quitar límites %
          </button>
        </div>
        {filtersActive ? (
          <div style={{ marginTop: 14 }}>
            <button type="button" style={crm.secondaryBtn} onClick={clearFilters}>
              Limpiar todos los filtros
            </button>
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <p
          style={{
            ...crm.pageSubtitle,
            marginTop: 8,
            maxWidth: "none",
            color: "var(--ink-muted)",
          }}
        >
          Ningún miembro coincide con los filtros actuales. Cambiá carrera, % o email,
          o usá «Limpiar todos los filtros».
        </p>
      ) : (
        <>
          <p style={{ ...crm.pageSubtitle, marginBottom: 14, maxWidth: "none" }}>
            <strong>{totalInDb.toLocaleString("es-AR")}</strong> en la base
            {filtersActive ? (
              <>
                {" "}
                · <strong>{total.toLocaleString("es-AR")}</strong> tras filtros
              </>
            ) : null}
            . Mostrando <strong>{showing.toLocaleString("es-AR")}</strong>
            {filtersActive ? ` de ${total.toLocaleString("es-AR")}` : ""}. Deslizá
            horizontalmente en pantallas chicas si hace falta.
          </p>
          <div className="xplora-admin-table-scroll">
            <table style={{ ...table, minWidth: 640 }}>
              <thead>
                <tr>
                  <th scope="col" style={{ ...th, width: 56, textAlign: "right" }}>
                    #
                  </th>
                  <th scope="col" style={th}>
                    Nombre
                  </th>
                  <th scope="col" style={th}>
                    Email
                  </th>
                  <th scope="col" style={th}>
                    Carrera
                  </th>
                  <th
                    scope="col"
                    style={{ ...th, width: 130, textAlign: "right" }}
                    title="Inscriptos / con check-in"
                  >
                    Inscripto / asistió
                  </th>
                  <th scope="col" style={{ ...th, width: 88, textAlign: "right" }}>
                    % asist.
                  </th>
                  {canDeleteMembers ? (
                    <th
                      scope="col"
                      style={{ ...th, width: 52 }}
                      aria-label="Eliminar"
                    >
                      {/* header vacío para columna acción */}
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {visible.map((row, index) => {
                  const num = index + 1;
                  return (
                    <tr key={row.id}>
                      <td
                        style={{
                          ...td,
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          color: "var(--ink-muted)",
                        }}
                      >
                        {num.toLocaleString("es-AR")}
                      </td>
                      <td style={td}>{row.nombre || "—"}</td>
                      <td style={{ ...td, wordBreak: "break-all" as const }}>
                        {row.email || "—"}
                      </td>
                      <td style={td}>{row.carrera?.trim() ? row.carrera : "—"}</td>
                      <td
                        style={{
                          ...td,
                          textAlign: "right" as const,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {row.eventos_inscripto === 0
                          ? "—"
                          : `${row.eventos_inscripto.toLocaleString("es-AR")} / ${row.eventos_asistio.toLocaleString("es-AR")}`}
                      </td>
                      <td
                        style={{
                          ...td,
                          textAlign: "right" as const,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {formatPct(row)}
                      </td>
                      {canDeleteMembers ? (
                        <td
                          style={{
                            ...td,
                            textAlign: "center",
                            verticalAlign: "middle",
                          }}
                        >
                          <button
                            type="button"
                            aria-label={`Eliminar miembro ${row.nombre || row.email}`}
                            title="Eliminar de la base"
                            onClick={() => remove(row)}
                            style={delBtn}
                          >
                            ×
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasMore ? (
            <div
              style={{ marginTop: 20, display: "flex", justifyContent: "center" }}
            >
              <button
                type="button"
                className="xplora-admin-primary"
                style={crm.primaryBtn}
                onClick={showMore}
              >
                Ver más ({(total - showing).toLocaleString("es-AR")} restantes)
              </button>
            </div>
          ) : (
            <p
              style={{
                marginTop: 16,
                textAlign: "center",
                fontSize: 13,
                color: "var(--ink-muted)",
              }}
            >
              {filtersActive
                ? "Resultado del filtro mostrado por completo"
                : "Listado completo"}
              : {total.toLocaleString("es-AR")} fila{total === 1 ? "" : "s"}.
            </p>
          )}

          <div
            style={{
              marginTop: 28,
              paddingBottom: 8,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <button type="button" style={backToTopBtn} onClick={scrollToTop}>
              ↑ Volver arriba
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function formatPct(row: AdminMemberRow): string {
  if (row.eventos_inscripto === 0) return "—";
  const pct =
    Math.round((1000 * row.eventos_asistio) / row.eventos_inscripto) / 10;
  return `${pct}%`;
}

function DatabaseToolsPanel() {
  const { permissions } = useStaffPermissions();
  const toast = useToast();

  const canExport = hasAnyPermission(permissions, ["database_full", "database_export"]);
  const canImport = hasAnyPermission(permissions, ["database_full", "database_import"]);
  const canSql = hasAnyPermission(permissions, ["database_full", "database_sql_read"]);

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string>("");
  const importInputRef = useRef<HTMLInputElement>(null);

  const [sql, setSql] = useState<string>("select id, email, nombre from usuarios order by created_at desc");
  const [sqlLoading, setSqlLoading] = useState(false);
  const [sqlRows, setSqlRows] = useState<Record<string, unknown>[] | null>(null);

  const [exporting, setExporting] = useState<"csv" | "json" | null>(null);
  const [exportJsonPreview, setExportJsonPreview] = useState<string>("");

  const runSql = async () => {
    if (!canSql) return;
    setSqlLoading(true);
    setSqlRows(null);
    const res = await authFetch("/api/admin/db/sql/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql }),
    });
    setSqlLoading(false);
    if (!res.ok) {
      toast.error(await readApiError(res));
      return;
    }
    const data = (await res.json()) as { rows: unknown };
    const arr = Array.isArray(data.rows) ? (data.rows as Record<string, unknown>[]) : [];
    setSqlRows(arr);
    toast.success(`Consulta OK · ${arr.length} fila${arr.length === 1 ? "" : "s"}.`);
  };

  const onImportCsv = async (file: File | null) => {
    if (!file || !canImport) return;
    setImporting(true);
    setImportResult("");
    try {
      const fd = new FormData();
      fd.append("csv", file);
      const res = await authFetch("/api/admin/db/import/usuarios-csv", { method: "POST", body: fd });
      if (!res.ok) {
        toast.error(await readApiError(res));
        return;
      }
      const j = (await res.json()) as {
        filas_leidas?: number;
        upserted?: number;
        inserted?: number;
        updated?: number;
        warnings?: string[];
      };
      const nuevos = j.inserted ?? 0;
      const actualizados = j.updated ?? 0;
      const leidas = j.filas_leidas ?? 0;
      const msg = `Import OK: ${j.upserted ?? 0} procesados (${nuevos} nuevos, ${actualizados} actualizados) · ${leidas} fila${leidas === 1 ? "" : "s"} leída${leidas === 1 ? "" : "s"}.`;
      setImportResult([msg, ...(j.warnings?.slice(0, 8) ?? []).map((w) => `- ${w}`)].join("\n"));
      if (leidas === 0) {
        toast.error("El archivo no tenía filas válidas. Revisá que la columna email exista (también aceptamos CSV con ; de Excel).");
      } else if (nuevos === 0 && actualizados === 0) {
        toast.error("No se importó ningún usuario. Revisá el formato del archivo.");
      } else {
        toast.success(
          nuevos > 0
            ? `Import listo: ${nuevos} usuario${nuevos === 1 ? "" : "s"} nuevo${nuevos === 1 ? "" : "s"}${actualizados > 0 ? `, ${actualizados} actualizado${actualizados === 1 ? "" : "s"}` : ""}.`
            : `Import listo: ${actualizados} usuario${actualizados === 1 ? "" : "s"} actualizado${actualizados === 1 ? "" : "s"}.`,
        );
      }
    } catch {
      toast.error("No se pudo conectar con el servidor. ¿Está corriendo el API?");
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const exportUsuariosCsv = async () => {
    if (!canExport) return;
    setExporting("csv");
    setExportJsonPreview("");
    const res = await authFetch("/api/admin/db/export/usuarios?format=csv");
    setExporting(null);
    if (!res.ok) {
      toast.error(await readApiError(res));
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `xplora_usuarios_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV descargado.");
  };

  const exportUsuariosJson = async () => {
    if (!canExport) return;
    setExporting("json");
    setExportJsonPreview("");
    const res = await authFetch("/api/admin/db/export/usuarios?format=json");
    setExporting(null);
    if (!res.ok) {
      toast.error(await readApiError(res));
      return;
    }
    const data = (await res.json()) as { rows?: unknown };
    const pretty = JSON.stringify(data?.rows ?? [], null, 2);
    setExportJsonPreview(pretty.length > 120_000 ? `${pretty.slice(0, 120_000)}\n…` : pretty);
    toast.success("JSON cargado.");
  };

  const sqlCols = useMemo(() => {
    if (!sqlRows || sqlRows.length === 0) return [];
    const keys = new Set<string>();
    for (const r of sqlRows.slice(0, 50)) {
      for (const k of Object.keys(r)) keys.add(k);
    }
    return [...keys];
  }, [sqlRows]);

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ ...crm.listCard, marginBottom: 18 }}>
        <p style={{ ...crm.pageSubtitle, margin: 0, maxWidth: "none" }}>
          Herramientas avanzadas para la base: exportar miembros, importar CSV (normaliza y hace upsert por email) y correr consultas SQL de solo lectura.
        </p>
      </div>

      {canExport ? (
        <div style={{ ...crm.listCard, marginBottom: 18 }}>
          <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>1) Exportar base (usuarios)</h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="xplora-admin-primary"
              style={{ ...crm.primaryBtn, opacity: exporting ? 0.75 : 1 }}
              disabled={exporting !== null}
              onClick={() => void exportUsuariosCsv()}
            >
              Descargar CSV
            </button>
            <button
              type="button"
              style={{ ...crm.secondaryBtn, opacity: exporting ? 0.75 : 1 }}
              disabled={exporting !== null}
              onClick={() => void exportUsuariosJson()}
            >
              {exporting === "json" ? "Cargando JSON…" : "Ver JSON"}
            </button>
          </div>
          {exportJsonPreview ? (
            <pre style={{ marginTop: 12, whiteSpace: "pre-wrap", fontSize: 12, color: "var(--ink-muted)" }}>
              {exportJsonPreview}
            </pre>
          ) : null}
        </div>
      ) : null}

      {canImport ? (
        <div style={{ ...crm.listCard, marginBottom: 18 }}>
          <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>2) Importar usuarios desde CSV o Excel</h3>
          <p style={{ ...crm.hint, marginTop: 0 }}>
            Columnas aceptadas: <code>email</code> (obligatoria), <code>nombre</code>, <code>carrera</code>, <code>es_alumno_cema</code>, <code>suscrito_newsletter</code>.
            Acepta XLSX, XLS y CSV con coma o punto y coma. También reconoce Correo electrónico, Nombre y Apellido.
          </p>
          <input
            ref={importInputRef}
            type="file"
            aria-label="Archivo de usuarios"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            disabled={importing}
            onChange={(e) => void onImportCsv(e.target.files?.[0] ?? null)}
          />
          {importing ? (
            <p style={{ ...crm.hint, marginTop: 10 }}>Importando…</p>
          ) : null}
          {importResult ? (
            <pre style={{ marginTop: 12, whiteSpace: "pre-wrap", fontSize: 12, color: "var(--ink-muted)" }}>
              {importResult}
            </pre>
          ) : null}
        </div>
      ) : null}

      {canSql ? (
        <div style={{ ...crm.listCard }}>
          <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>3) Consultas SQL (solo SELECT)</h3>
          <p style={{ ...crm.hint, marginTop: 0 }}>
            Seguridad: se bloquean escrituras y se limita a 300 filas.
          </p>
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            rows={6}
            style={{
              width: "100%",
              boxSizing: "border-box",
              borderRadius: 12,
              border: "1px solid rgba(26,16,40,0.12)",
              padding: 12,
              fontSize: 13,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="xplora-admin-primary" style={{ ...crm.primaryBtn, opacity: sqlLoading ? 0.7 : 1 }} disabled={sqlLoading} onClick={() => void runSql()}>
              {sqlLoading ? "Ejecutando…" : "Ejecutar SELECT"}
            </button>
            {sqlRows ? (
              <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>
                {sqlRows.length} fila{sqlRows.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>

          {sqlRows && sqlRows.length > 0 ? (
            <div className="xplora-admin-table-scroll" style={{ marginTop: 14 }}>
              <table style={{ ...table, minWidth: 720 }}>
                <thead>
                  <tr>
                    {sqlCols.map((c) => (
                      <th key={c} style={th}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sqlRows.slice(0, 50).map((r, idx) => (
                    <tr key={idx}>
                      {sqlCols.map((c) => (
                        <td key={c} style={{ ...td, fontSize: 12, color: "var(--ink-muted)" }}>
                          {r[c] == null ? "—" : typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : sqlRows && sqlRows.length === 0 ? (
            <p style={{ ...crm.hint, marginTop: 12 }}>La consulta devolvió 0 filas.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const presetRow: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
  marginTop: 16,
};

const presetLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--ink-muted)",
  marginRight: 4,
};

const presetBtn: CSSProperties = {
  ...crm.chipBtn,
  fontSize: 12,
  padding: "6px 10px",
};

const presetBtnMuted: CSSProperties = {
  ...crm.chipBtn,
  fontSize: 12,
  padding: "6px 10px",
  borderStyle: "dashed",
};

const subNavWrap: CSSProperties = { marginBottom: 20 };

const table: CSSProperties = {
  width: "100%",
  minWidth: 520,
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
  color: "var(--ink)",
  verticalAlign: "top",
};

const delBtn: CSSProperties = {
  width: 40,
  height: 40,
  margin: "-8px auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid rgba(192,57,43,0.35)",
  borderRadius: 10,
  background: "#fff8f7",
  color: "#9b2c20",
  fontSize: 22,
  lineHeight: 1,
  cursor: "pointer",
  fontWeight: 600,
};

const backToTopBtn: CSSProperties = {
  ...crm.secondaryBtn,
  fontSize: 14,
  fontWeight: 600,
  padding: "12px 22px",
  borderRadius: 10,
  cursor: "pointer",
};
