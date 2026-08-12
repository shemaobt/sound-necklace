import { colors, iconColorways, scenePalette, type IconColorway } from './tokens';

/** as contas pequenas: o verde-água da paleta de cenas */
const BEAD_SMALL = scenePalette[6]!.base;

/**
 * Marca do site — o colar desenhado (`docs/design/website-icon.svg`): cordão em
 * arco, contas crescendo das pontas para o meio. Ao contrário do `ShemaIcon`,
 * NÃO tem colorway: cada conta é um token da paleta da casa, e pintar tudo de
 * uma cor só achataria o desenho inteiro.
 *
 * O que se adapta ao chrome escuro é só o que some nele — o cordão e as duas
 * contas das pontas, que são oliva. As contas guardam a paleta nos dois fundos.
 *
 * `onDark` serve a quem SABE em React que o fundo é escuro (o painel do login,
 * oliva sempre). Onde só o CSS sabe — o cabeçalho do shell escurece por
 * `:has()`, o dashboard pelo tema —, as classes `cds-mark-cord`/`cds-mark-end`
 * são o gancho para repintar essas mesmas partes, e só elas.
 *
 * O viewBox recorta o quadrado 120×120 do arquivo na altura do desenho (o colar
 * ocupa só a faixa central): sem o recorte, `size` mediria o vazio em volta e a
 * marca sairia com um terço do tamanho pedido.
 */
export function ColarIcon({
  onDark = false,
  size = 24,
  title = 'Colar de Sons',
}: {
  /** chrome escuro: cordão e pontas viram creme para não sumirem no fundo */
  onDark?: boolean;
  size?: number;
  title?: string;
}) {
  const cord = onDark ? colors.cream : colors.olive;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="10 39 100 40"
      height={size}
      role="img"
      aria-label={title}
    >
      <path
        className="cds-mark-cord"
        d="M15 45 Q60 87 105 45"
        fill="none"
        stroke={cord}
        strokeWidth={3.5}
        strokeLinecap="round"
      />
      <circle className="cds-mark-end" cx="15" cy="44.8" r="3.5" fill={cord} />
      <circle className="cds-mark-end" cx="105" cy="44.8" r="3.5" fill={cord} />
      <circle cx="27" cy="54.1" r="5.5" fill={BEAD_SMALL} />
      <circle cx="93" cy="54.1" r="5.5" fill={BEAD_SMALL} />
      <circle cx="42" cy="61.8" r="8" fill={colors.confidenceFilled} />
      <circle cx="78" cy="61.8" r="8" fill={colors.confidenceFilled} />
      <circle cx="60" cy="65" r="12" fill={colors.telha} />
    </svg>
  );
}

/**
 * Ícone Shemá — geometria oficial dos assets do design
 * (docs/design/assets/icon-*.svg). Colorways: branco em fundos escuros,
 * telha no creme, verde para marcas quietas (§4.4).
 */
export function ShemaIcon({
  colorway,
  size = 24,
  title = 'Shemá',
}: {
  colorway: IconColorway;
  size?: number;
  title?: string;
}) {
  const fill = iconColorways[colorway];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="280 230 620 270"
      height={size}
      role="img"
      aria-label={title}
    >
      <path
        fill={fill}
        d="M659.67,369.42V248.87H579.45A111.89,111.89,0,0,0,545.83,254c-28.48,8.95-46.6,36.88-46.6,36.88h0s-18.06-27.91-46.6-36.88A112,112,0,0,0,419,248.87H338.78V488.69H419a111.69,111.69,0,0,1,33.63,5.08c28.54,9,46.6,35,46.6,35h0s15.93-22.92,41.38-33.16q-.2-3.45-.2-6.94A119.4,119.4,0,0,1,659.67,369.42Z"
      />
      <path fill={fill} d="M630.44,488.69h29.23V459.26A29.36,29.36,0,0,0,630.44,488.69Z" />
      <path
        fill={fill}
        d="M593.31,488.69h21.35a45.16,45.16,0,0,1,45-45.21V422.33A66.44,66.44,0,0,0,593.31,488.69Z"
      />
      <path
        fill={fill}
        d="M556.19,488.69c0,.8,0,1.59,0,2.39a112.11,112.11,0,0,1,21.31-2.35v0a82.24,82.24,0,0,1,82.14-82.14V385.2A103.6,103.6,0,0,0,556.19,488.69Z"
      />
    </svg>
  );
}
