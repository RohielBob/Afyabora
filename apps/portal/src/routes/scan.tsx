// « Scanner un QR patient » (L5-10, CDC F8) : le médecin lit le QR affiché par l'application du patient,
// ce qui ouvre l'accès (POST /shares/claim, L5-03), puis arrive sur le dossier partagé (L5-12).
// Trois façons de lire le QR, la même suite :
//  1. la caméra du navigateur (QrScanner) ;
//  2. une PHOTO du QR (fichier image), lue dans le navigateur ;
//  3. le CODE DE SECOURS : le code du QR collé ou recopié (espaces ignorés).
// Le texte lu est contrôlé avant tout envoi (claim.ts) ; un QR refusé donne toujours le même message
// (« QR invalide ou expiré »), sans préciser pourquoi. Un seul envoi à la fois.
import { useId, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, TextField } from '@/components/ui';
import { QrScanner, readQrFromImage } from '@/features/scanner/QrScanner';
import { scannerApi } from '@/features/scanner/api';
import { claimProblem, readShareToken, type ClaimProblem } from '@/features/scanner/claim';
import { fill, texts } from '@/i18n';

export default function ScanRoute() {
  const navigate = useNavigate();
  const [claiming, setClaiming] = useState(false);
  const [problem, setProblem] = useState<ClaimProblem | null>(null);
  const [code, setCode] = useState('');
  const [reading, setReading] = useState(false);
  const busy = useRef(false);
  const imageHost = `qr-image-${useId().replace(/:/g, '')}`;
  const fileInput = useRef<HTMLInputElement>(null);

  /** Texte lu ou saisi ⇒ accès ouvert, ou message. */
  const claim = async (text: string) => {
    if (busy.current) return;
    setProblem(null);
    const token = readShareToken(text);
    if (!token) {
      setProblem({ kind: 'notAfyabora' });
      return;
    }
    busy.current = true;
    setClaiming(true);
    try {
      const opened = await scannerApi.claim(token);
      navigate(`/patients/${opened.sessionId}`, { state: { claim: opened } });
    } catch (error) {
      setProblem(claimProblem(error));
    } finally {
      busy.current = false;
      setClaiming(false);
    }
  };

  const fromImage = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    setReading(true);
    try {
      const text = await readQrFromImage(file, imageHost);
      await claim(text);
    } catch {
      setProblem({ kind: 'notAfyabora' });
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = ''; // la même photo peut être choisie de nouveau
    }
  };

  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    void claim(code);
  };

  const message = problem ? problemMessage(problem) : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <header className="animate-enter flex flex-col gap-3">
        <p className="text-[11px] font-bold tracking-[1.2px] text-primary-text uppercase">
          {texts.scan.overline}
        </p>
        <h1 className="text-[30px] leading-[1.2] font-bold tracking-[-0.6px] text-ink">
          {texts.scan.title}
        </h1>
        <p className="max-w-2xl text-[16px] text-muted">{texts.scan.intro}</p>
      </header>

      {message ? (
        <Alert
          tone={
            problem?.kind === 'invalid' || problem?.kind === 'notAfyabora' ? 'warning' : 'danger'
          }
          title={message.title}
        >
          {message.text}
        </Alert>
      ) : null}
      {claiming ? (
        <Alert tone="info" title={texts.scan.claiming}>
          {texts.scan.claimingText}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section
          aria-labelledby="scan-camera"
          className="animate-enter flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 [animation-delay:60ms]"
        >
          <h2 id="scan-camera" className="text-[18px] font-bold text-ink">
            {texts.scan.camera.title}
          </h2>
          <QrScanner onDecoded={(text) => void claim(text)} disabled={claiming} />
          <ul className="flex flex-col gap-2 text-[13px] text-muted">
            {texts.scan.tips.map((tip) => (
              <li key={tip} className="flex gap-2">
                <span aria-hidden="true" className="text-primary-text">
                  •
                </span>
                {tip}
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="scan-backup"
          className="animate-enter flex flex-col gap-6 rounded-2xl border border-line bg-surface p-6 [animation-delay:120ms]"
        >
          <div className="flex flex-col gap-1">
            <h2 id="scan-backup" className="text-[18px] font-bold text-ink">
              {texts.scan.backup.title}
            </h2>
            <p className="text-[14px] text-muted">{texts.scan.backup.intro}</p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[14px] font-semibold text-ink">{texts.scan.photo.title}</p>
            <p className="text-[13px] text-muted">{texts.scan.photo.text}</p>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="sr-only"
              id={`${imageHost}-input`}
              onChange={(event) => void fromImage(event.target.files?.[0])}
            />
            <Button
              variant="outline"
              loading={reading}
              disabled={claiming}
              onClick={() => fileInput.current?.click()}
            >
              {texts.scan.photo.action}
            </Button>
            {/* Zone de travail invisible exigée par html5-qrcode pour lire une image. */}
            <div id={imageHost} className="hidden" aria-hidden="true" />
          </div>

          <form onSubmit={submitCode} className="flex flex-col gap-3" noValidate>
            <TextField
              label={texts.scan.code.label}
              hint={texts.scan.code.hint}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="[&_input]:font-mono [&_input]:text-[14px]"
            />
            <Button type="submit" loading={claiming} disabled={code.trim().length === 0}>
              {texts.scan.code.submit}
            </Button>
          </form>
        </section>
      </div>

      <p className="text-[13px] text-muted">{texts.brand.disclaimer}</p>
    </div>
  );
}

function problemMessage(problem: ClaimProblem): { title: string; text: string } {
  switch (problem.kind) {
    case 'blocked':
      return {
        title: texts.scan.problem.blocked.title,
        text: fill(texts.scan.problem.blocked.text, { seconds: problem.seconds }),
      };
    default:
      return texts.scan.problem[problem.kind];
  }
}
