/* Helloinsa Design System — components (window.HelloinsaDS) */

const T = {
  font: "var(--hi-font)",
};

function Eyebrow({ children, tone = "blue", style = {} }) {
  const color = tone === "light" ? "rgba(255,255,255,0.72)" : "var(--hi-blue-600)";
  return (
    <div style={{
      font: `600 var(--hi-eyebrow)/1.25 ${T.font}`,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color,
      ...style,
    }}>{children}</div>
  );
}

function SectionHead({ eyebrow, title, lead, tone = "dark", align = "left", style = {} }) {
  const light = tone === "light";
  return (
    <div style={{ textAlign: align, maxWidth: 760, ...style }}>
      {eyebrow && <Eyebrow tone={light ? "light" : "blue"} style={{ marginBottom: 16 }}>{eyebrow}</Eyebrow>}
      <h2 style={{
        margin: 0,
        font: `700 var(--hi-heading-1)/1.3 ${T.font}`,
        letterSpacing: "-0.02em",
        color: light ? "#fff" : "var(--hi-ink)",
        textWrap: "pretty",
      }}>{title}</h2>
      {lead && <p style={{
        margin: "16px 0 0",
        font: `500 var(--hi-body-1)/1.75 ${T.font}`,
        color: light ? "rgba(255,255,255,0.78)" : "var(--hi-ink-3)",
        textWrap: "pretty",
      }}>{lead}</p>}
    </div>
  );
}

const BTN_VARIANTS = {
  primary: { bg: "var(--hi-blue-600)", fg: "#fff", bd: "transparent", hover: "var(--hi-blue-500)" },
  navy: { bg: "var(--hi-navy-900)", fg: "#fff", bd: "transparent", hover: "var(--hi-navy-700)" },
  outline: { bg: "transparent", fg: "var(--hi-ink)", bd: "var(--hi-line)", hover: "var(--hi-surface-2)" },
  onDark: { bg: "#fff", fg: "var(--hi-navy-900)", bd: "transparent", hover: "var(--hi-blue-50)" },
  ghostOnDark: { bg: "transparent", fg: "#fff", bd: "rgba(255,255,255,0.38)", hover: "rgba(255,255,255,0.10)" },
};
const BTN_SIZES = {
  sm: { h: 38, px: 16, fs: 14 },
  md: { h: 46, px: 20, fs: 15 },
  lg: { h: 56, px: 28, fs: 16 },
};

function Button({ children, variant = "primary", size = "md", href, arrow = false, style = {}, ...rest }) {
  const v = BTN_VARIANTS[variant] || BTN_VARIANTS.primary;
  const s = BTN_SIZES[size] || BTN_SIZES.md;
  const [hover, setHover] = React.useState(false);
  const Tag = href ? "a" : "button";
  return (
    <Tag
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
        height: s.h, padding: `0 ${s.px}px`,
        font: `600 ${s.fs}px/1.2 ${T.font}`,
        color: v.fg,
        background: hover ? v.hover : v.bg,
        border: `1px solid ${v.bd}`,
        borderRadius: "var(--hi-r-md)",
        textDecoration: "none", cursor: "pointer", whiteSpace: "nowrap",
        boxSizing: "border-box",
        transition: `background var(--hi-fast) var(--hi-ease)`,
        ...style,
      }}
      {...rest}
    >
      {children}
      {arrow && <span style={{ fontSize: "1.05em", lineHeight: 1 }}>→</span>}
    </Tag>
  );
}

const TAG_TONES = {
  blue: { bg: "var(--hi-blue-50)", fg: "var(--hi-blue-600)" },
  gold: { bg: "var(--hi-gold-50)", fg: "var(--hi-gold-500)" },
  neutral: { bg: "var(--hi-surface-2)", fg: "var(--hi-ink-3)" },
  onDark: { bg: "rgba(255,255,255,0.12)", fg: "#fff" },
};

/** Small pill used for keyword chips (사이트의 키워드 칩과 동일 역할) */
function Tag({ children, tone = "blue", style = {} }) {
  const t = TAG_TONES[tone] || TAG_TONES.blue;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", height: 28, padding: "0 12px",
      background: t.bg, color: t.fg,
      font: `600 var(--hi-detail)/1 ${T.font}`,
      borderRadius: "var(--hi-r-full)", whiteSpace: "nowrap",
      ...style,
    }}>{children}</span>
  );
}

function Card({ children, padding = 32, tone = "surface", hoverable = false, style = {} }) {
  const [hover, setHover] = React.useState(false);
  const dark = tone === "navy";
  return (
    <div
      onMouseEnter={() => hoverable && setHover(true)}
      onMouseLeave={() => hoverable && setHover(false)}
      style={{
        background: dark ? "var(--hi-navy-800)" : tone === "muted" ? "var(--hi-surface-2)" : "var(--hi-surface)",
        border: `1px solid ${dark ? "rgba(255,255,255,0.10)" : "var(--hi-line)"}`,
        borderRadius: "var(--hi-r-lg)",
        padding,
        boxShadow: hover ? "var(--hi-shadow-md)" : "none",
        transform: hover ? "translateY(-2px)" : "none",
        transition: `box-shadow var(--hi-fast) var(--hi-ease), transform var(--hi-fast) var(--hi-ease)`,
        boxSizing: "border-box",
        ...style,
      }}
    >{children}</div>
  );
}

/** Big number + label, the site's core trust device */
function Stat({ value, label, tone = "dark", style = {} }) {
  const light = tone === "light";
  return (
    <div style={style}>
      <div style={{
        font: `600 var(--hi-display-2)/1.1 var(--hi-font-num)`,
        letterSpacing: "-0.03em",
        color: light ? "#fff" : "var(--hi-ink)",
      }}>{value}</div>
      <div style={{
        marginTop: 10,
        font: `500 var(--hi-body-2)/1.5 ${T.font}`,
        color: light ? "rgba(255,255,255,0.68)" : "var(--hi-ink-3)",
      }}>{label}</div>
    </div>
  );
}

/** label / value row used in spec lists and tables */
function InfoRow({ label, value, labelWidth = 104, style = {} }) {
  return (
    <div style={{
      display: "flex", gap: 24, padding: "16px 0",
      borderBottom: "1px solid var(--hi-line-soft)",
      font: `500 var(--hi-body-2)/1.75 ${T.font}`,
      ...style,
    }}>
      <div style={{ flex: "none", width: labelWidth, color: "var(--hi-ink-4)" }}>{label}</div>
      <div style={{ color: "var(--hi-ink)" }}>{value}</div>
    </div>
  );
}

/** Numbered step row (밀착케어팀 / 진행 방식 패턴) */
function StepRow({ index, term, title, detail, style = {} }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "56px minmax(120px,180px) minmax(200px,1fr)",
      gap: 24, alignItems: "baseline",
      padding: "24px 0", borderTop: "1px solid var(--hi-line-soft)",
      ...style,
    }}>
      <div style={{ font: `600 var(--hi-body-2)/1 var(--hi-font-num)`, color: "var(--hi-blue-600)" }}>{index}</div>
      <div>
        <div style={{ font: `600 var(--hi-heading-3)/1.4 ${T.font}`, color: "var(--hi-ink)" }}>{title}</div>
        <div style={{ marginTop: 6, font: `500 var(--hi-detail)/1.5 ${T.font}`, color: "var(--hi-ink-4)" }}>{term}</div>
      </div>
      <div style={{ font: `500 var(--hi-body-2)/1.75 ${T.font}`, color: "var(--hi-ink-3)" }}>{detail}</div>
    </div>
  );
}

function Divider({ style = {} }) {
  return <div style={{ height: 1, background: "var(--hi-line-soft)", ...style }} />;
}

window.HelloinsaDS = { Eyebrow, SectionHead, Button, Tag, Card, Stat, InfoRow, StepRow, Divider };
