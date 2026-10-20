// Image du QR d'urgence (L6-06, CDC F10) : ce que le patient voit à l'écran est EXACTEMENT l'image qu'il
// exporte (fond d'écran, impression). Dessinée en SVG (react-native-svg, déjà installé) et convertie en PNG
// par `toPng()` : aucune dépendance de capture d'écran.
//  - Contenu : « CARTE D'URGENCE », la consigne pour le secouriste, le QR, « Afyabora ». AUCUN nom ni aucune
//    donnée de santé : l'image peut rester visible sur un écran verrouillé ou une feuille imprimée.
//  - Toujours noir sur blanc (même en mode sombre) : un QR se lit mieux ainsi, et l'image est la même partout.
//  - Couleurs et polices viennent des jetons de marque (@glyka/ui-tokens), pas du thème : l'image ne change
//    pas avec le thème de l'application.
import { brand, fontFiles, ink } from '@glyka/ui-tokens';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Platform, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Svg, { G, Rect, Text as SvgText, TSpan } from 'react-native-svg';
import { CHAR_WIDTH, fitFontSize } from '../image-text';

/** Taille de l'image dessinée (3:4, se lit en fond d'écran comme sur papier). */
export const IMAGE_WIDTH = 360;
/** Largeur utile d'une ligne de texte (marges de 24 px de chaque côté). */
const TEXT_WIDTH = IMAGE_WIDTH - 48;
export const IMAGE_HEIGHT = 480;
/** Taille du PNG exporté (×3 : net à l'impression et sur un grand écran). */
export const EXPORT_SCALE = 3;
/** Au-delà, la conversion est tenue pour échouée : l'écran le dit au lieu d'attendre sans fin. */
export const EXPORT_TIMEOUT_MS = 10_000;
const QR_SIZE = 236;

/**
 * Police d'un texte de l'image. Sur le web, l'image exportée est autonome et n'a pas accès aux polices de la
 * page : sans police de secours, le navigateur prendrait une police à empattements (vu en vérification).
 * Pas de guillemets ni d'apostrophe dans ce texte : la conversion en PNG les transformerait et casserait l'image.
 */
const font = (name: string) =>
  Platform.OS === 'web' ? `${name}, Helvetica, Arial, sans-serif` : name;
const QR_TOP = 150;

export interface EmergencyQrImageHandle {
  /** L'image en PNG (base64, sans préfixe). */
  toPng: () => Promise<string>;
}

interface SvgWithDataUrl {
  toDataURL: (callback: (base64: string) => void, options?: object) => void;
}

export const EmergencyQrImage = forwardRef<
  EmergencyQrImageHandle,
  {
    /** Adresse encodée dans le QR (page publique du portail). */
    url: string;
    title: string;
    instruction: string;
    audience: string;
    /** Largeur affichée à l'écran (l'image garde ses proportions). */
    width: number;
    accessibilityLabel: string;
  }
>(function EmergencyQrImage({ url, title, instruction, audience, width, accessibilityLabel }, ref) {
  const svg = useRef<SvgWithDataUrl | null>(null);

  useImperativeHandle(ref, () => ({
    toPng: () =>
      new Promise<string>((resolve, reject) => {
        const target = svg.current;
        if (!target) {
          reject(new Error('Image pas encore affichée'));
          return;
        }
        // Sur le web, une image qui ne se charge pas ne rappelle jamais : sans ce délai, l'attente serait infinie.
        const timer = setTimeout(
          () => reject(new Error('Conversion trop longue')),
          EXPORT_TIMEOUT_MS,
        );
        target.toDataURL(
          (base64) => {
            clearTimeout(timer);
            if (base64) resolve(base64);
            else reject(new Error('Image vide'));
          },
          { width: IMAGE_WIDTH * EXPORT_SCALE, height: IMAGE_HEIGHT * EXPORT_SCALE },
        );
      }),
  }));

  // La description accessible est sur le conteneur, PAS sur le dessin : sur le web, la conversion en PNG
  // remplace les guillemets par des apostrophes, et une apostrophe dans un attribut (« d'urgence ») casserait
  // l'image (défaut trouvé en vérification réelle).
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Svg
        ref={(node) => {
          svg.current = node as unknown as SvgWithDataUrl | null;
        }}
        width={width}
        height={(width * IMAGE_HEIGHT) / IMAGE_WIDTH}
        viewBox={`0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}`}
      >
        <Rect x={0} y={0} width={IMAGE_WIDTH} height={IMAGE_HEIGHT} rx={24} fill={ink[0]} />
        <Rect x={0} y={0} width={IMAGE_WIDTH} height={10} fill={brand.red} />
        <SvgText
          x={IMAGE_WIDTH / 2}
          y={58}
          textAnchor="middle"
          fontFamily={font(fontFiles.extrabold)}
          fontWeight="800"
          fontSize={fitFontSize(title, 24, TEXT_WIDTH, CHAR_WIDTH.upperExtraBold, 1.5)}
          letterSpacing={1.5}
          fill={brand.red}
        >
          {title}
        </SvgText>
        <SvgText
          x={IMAGE_WIDTH / 2}
          y={96}
          textAnchor="middle"
          fontFamily={font(fontFiles.bold)}
          fontWeight="700"
          fontSize={fitFontSize(instruction, 17, TEXT_WIDTH, CHAR_WIDTH.bold)}
          fill={ink[900]}
        >
          {instruction}
        </SvgText>
        <SvgText
          x={IMAGE_WIDTH / 2}
          y={122}
          textAnchor="middle"
          fontFamily={font(fontFiles.medium)}
          fontWeight="500"
          fontSize={fitFontSize(audience, 13, TEXT_WIDTH, CHAR_WIDTH.medium)}
          fill={ink[600]}
        >
          {audience}
        </SvgText>
        <G x={(IMAGE_WIDTH - QR_SIZE) / 2} y={QR_TOP}>
          <QRCode
            value={url}
            size={QR_SIZE}
            color={ink[950]}
            backgroundColor={ink[0]}
            ecl="M"
            quietZone={0}
          />
        </G>
        <SvgText
          x={IMAGE_WIDTH / 2}
          y={IMAGE_HEIGHT - 34}
          textAnchor="middle"
          fontFamily={font(fontFiles.extrabold)}
          fontWeight="800"
          fontSize={18}
        >
          <TSpan fill={brand.navy}>Afya</TSpan>
          <TSpan fill={brand.coral}>bora</TSpan>
        </SvgText>
      </Svg>
    </View>
  );
});
