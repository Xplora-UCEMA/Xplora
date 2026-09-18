import { useEffect, useState } from "react";
import { memberFetch } from "../../lib/memberAuth";
import {
  parseRewardDelivery,
  rewardQrFileName,
  type RewardQrDelivery,
} from "../../lib/rewardDelivery";

const MAX_QR_BYTES = 2 * 1024 * 1024;
const qrMime = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
} as const;

type QrState =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "error" };

function PrivateQrDelivery({
  redemptionId,
  rewardTitle,
  value,
}: {
  redemptionId: string;
  rewardTitle: string;
  value: RewardQrDelivery;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<QrState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    setState({ status: "loading" });
    void memberFetch(
      `/api/member/points/redemptions/${encodeURIComponent(redemptionId)}/qr`,
      {
        cache: "no-store",
        headers: { Accept: qrMime[value.format] },
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("QR unavailable");
        const blob = await response.blob();
        if (blob.type !== qrMime[value.format] || blob.size < 1 || blob.size > MAX_QR_BYTES) {
          throw new Error("Invalid QR image");
        }
        const nextUrl = URL.createObjectURL(blob);
        if (controller.signal.aborted) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        objectUrl = nextUrl;
        setState({ status: "ready", url: objectUrl });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attempt, redemptionId, value.format, value.imageSha256]);

  const fileName = rewardQrFileName(value);
  return (
    <div className="xp-ticket">
      <div className="xp-ticket__intro">
        <span>Entrada digital</span>
        <strong>{value.eventTitle}</strong>
        <p>Presentá este QR desde tu celular al ingresar.</p>
      </div>
      <div className="xp-ticket__qr">
        {state.status === "ready" ? (
          <img
            src={state.url}
            alt={`Código QR de tu entrada para ${value.eventTitle}`}
            width="280"
            height="280"
            decoding="async"
            onError={() => setState({ status: "error" })}
          />
        ) : null}
        {state.status === "loading" ? (
          <div className="xp-ticket__state" role="status">
            <span className="xp-ticket__loader" aria-hidden="true" />
            <strong>Preparando tu QR…</strong>
            <small>Se carga de forma privada desde tu cuenta.</small>
          </div>
        ) : null}
        {state.status === "error" ? (
          <div className="xp-ticket__state" role="status">
            <strong>No pudimos mostrar el QR.</strong>
            <small>Tu entrada sigue guardada. Revisá tu conexión y volvé a intentar.</small>
            <button type="button" onClick={() => setAttempt((value) => value + 1)}>
              Reintentar
            </button>
          </div>
        ) : null}
      </div>
      {state.status === "ready" ? (
        <div className="xp-ticket__actions">
          <a
            className="xp-ticket__open"
            href={state.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Abrir en grande el QR de ${rewardTitle}`}
          >
            Abrir QR
          </a>
          <a
            href={state.url}
            download={fileName}
            aria-label={`Descargar el QR de ${rewardTitle}`}
          >
            Descargar QR
          </a>
        </div>
      ) : null}
      <p className="xp-ticket__help">No lo compartas: este QR identifica tu entrada.</p>
    </div>
  );
}

export function RedemptionDelivery({
  redemptionId,
  rewardTitle,
  delivery,
}: {
  redemptionId: string;
  rewardTitle: string;
  delivery: string;
}) {
  const parsed = parseRewardDelivery(delivery);
  if (parsed.kind === "legacy") {
    return <p className="xp-delivery">{parsed.text}</p>;
  }
  if (parsed.kind === "invalid") {
    return (
      <div className="xp-delivery xp-delivery--unavailable" role="status">
        <strong>No pudimos abrir este beneficio.</strong>
        <span>Tu canje sigue guardado. Contactá a Xplora para recibirlo.</span>
      </div>
    );
  }
  return (
    <ExpandableQrDelivery
      redemptionId={redemptionId}
      rewardTitle={rewardTitle}
      value={parsed.value}
    />
  );
}

function ExpandableQrDelivery({
  redemptionId,
  rewardTitle,
  value,
}: {
  redemptionId: string;
  rewardTitle: string;
  value: RewardQrDelivery;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="xp-ticket-disclosure"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>{open ? "Cerrar entrada" : "Abrir entrada"}</span>
        <small>{value.eventTitle}</small>
      </summary>
      {open ? (
        <PrivateQrDelivery
          redemptionId={redemptionId}
          rewardTitle={rewardTitle}
          value={value}
        />
      ) : null}
    </details>
  );
}
