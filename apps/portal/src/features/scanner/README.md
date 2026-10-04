# Feature `scanner` — Scan du QR

**Lot L5**

Lecture du QR par la caméra du navigateur, code de secours, appel de /shares/claim.

## Tickets
- **L5-10** — Portail : scanner QR dans le navigateur + code de secours

## Fichiers prévus
- `QrScanner.tsx` (html5-qrcode)
- `BackupCodeForm.tsx`
- `useClaimShare.ts`

## Règle importante
Un QR est à usage unique et dure 60 s : afficher un message clair en cas d'échec, sans détailler la cause exacte.
