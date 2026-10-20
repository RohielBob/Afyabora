// Caméra du navigateur (L5-10) : lit le QR du patient avec html5-qrcode (déjà installé). La caméra ne
// s'allume que sur demande du médecin (« Activer la caméra ») et s'éteint dès qu'un QR est lu, à la
// fermeture de la page ou au clic sur « Arrêter » : un QR n'est jamais lu deux fois par erreur, et le
// voyant de la caméra ne reste pas allumé. Les images ne quittent pas le navigateur.
// html5-qrcode est chargé seulement quand on s'en sert (import dynamique) : les autres pages du portail ne
// téléchargent pas ce lecteur de QR (plus de 300 Ko).
import type { Html5Qrcode } from 'html5-qrcode';
import { useEffect, useId, useRef, useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { texts } from '@/i18n';
import { cameraProblem, type CameraProblem } from './claim';

type CameraState = 'off' | 'starting' | 'on';

export function QrScanner({
  onDecoded,
  disabled,
}: {
  onDecoded: (text: string) => void;
  disabled: boolean;
}) {
  const id = `qr-camera-${useId().replace(/:/g, '')}`;
  const reader = useRef<Html5Qrcode | null>(null);
  const [state, setState] = useState<CameraState>('off');
  const [problem, setProblem] = useState<CameraProblem | null>(null);
  const decoded = useRef(onDecoded);
  decoded.current = onDecoded;

  const stop = async () => {
    const current = reader.current;
    reader.current = null;
    setState('off');
    if (current?.isScanning) await current.stop().catch(() => undefined);
    current?.clear();
  };

  const start = async () => {
    setProblem(null);
    if (!window.isSecureContext) {
      setProblem(cameraProblem(null, false));
      return;
    }
    setState('starting');
    const { Html5Qrcode: Reader } = await import('html5-qrcode');
    const created = new Reader(id, false);
    reader.current = created;
    try {
      await created.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: (w, h) => ({ width: Math.min(w, h) * 0.7, height: Math.min(w, h) * 0.7 }),
        },
        (text) => {
          void stop(); // un seul QR par lecture
          decoded.current(text);
        },
        () => undefined, // aucune image lisible pour l'instant : on continue
      );
      if (reader.current === created) setState('on');
    } catch (error) {
      reader.current = null;
      setState('off');
      setProblem(cameraProblem(error));
    }
  };

  // Page quittée : la caméra s'éteint.
  useEffect(
    () => () => {
      const current = reader.current;
      reader.current = null;
      if (current?.isScanning) void current.stop().catch(() => undefined);
    },
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* La zone de la caméra reste TOUJOURS dans la page (jamais `display: none`) : html5-qrcode mesure
          sa taille pour calculer la zone de lecture ; mesurée cachée, elle vaudrait 0 et aucun QR ne
          serait lu (échec vu une fois en vérification réelle). Caméra éteinte : un message la recouvre. */}
      <div
        className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-line bg-surface-muted"
        aria-label={texts.scan.camera.viewA11y}
        role="region"
      >
        <div
          id={id}
          className="absolute inset-0 [&_video]:!h-full [&_video]:!w-full [&_video]:object-cover"
        />
        {state === 'off' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface-muted p-6 text-center">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-10 text-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 8V6a2 2 0 0 1 2-2h2M17 4h2a2 2 0 0 1 2 2v2M21 16v2a2 2 0 0 1-2 2h-2M7 20H5a2 2 0 0 1-2-2v-2" />
              <rect x="7.5" y="7.5" width="9" height="9" rx="1.5" />
            </svg>
            <p className="max-w-xs text-[14px] text-muted">{texts.scan.camera.idle}</p>
          </div>
        ) : null}
      </div>
      {problem ? (
        <Alert tone="warning" title={texts.scan.camera.problem[problem].title}>
          {texts.scan.camera.problem[problem].text}
        </Alert>
      ) : null}
      {state === 'off' ? (
        <Button onClick={() => void start()} disabled={disabled}>
          {texts.scan.camera.start}
        </Button>
      ) : (
        <Button variant="outline" loading={state === 'starting'} onClick={() => void stop()}>
          {texts.scan.camera.stop}
        </Button>
      )}
    </div>
  );
}

/**
 * Lit le QR d'une PHOTO (fichier image choisi par le médecin) : utile sans caméra, ou si le patient a
 * envoyé une capture. La photo est lue dans le navigateur, jamais envoyée.
 */
export async function readQrFromImage(file: File, hostId: string): Promise<string> {
  const { Html5Qrcode: Reader } = await import('html5-qrcode');
  const reader = new Reader(hostId, false);
  try {
    return await reader.scanFile(file, false);
  } finally {
    reader.clear();
  }
}
