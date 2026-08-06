import "./BrandLogo.css"

type BrandLogoProps = {
  textSize?: number
  iconSize?: number
  gap?: number
}

export default function BrandLogo({
  textSize = 20,
  iconSize = 24,
  gap = 8
}: BrandLogoProps) {
  return (
    <span
      aria-label="Burrito"
      className="burrito-responsive-brand"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap,
        paddingLeft: gap,
        lineHeight: 1
      }}
    >
      <img
        className="burrito-responsive-brand__icon"
        src="/brand/icon-192.png"
        alt="Burrito"
        style={{
          height: iconSize,
          width: "auto",
          display: "block"
        }}
      />
      <span
        className="burrito-responsive-brand__wordmark"
        style={{
          fontSize: textSize,
          fontWeight: 650,
          letterSpacing: "-0.05em",
          color: "var(--bui-color-text)",
          lineHeight: "1em",
          display: "block",
          fontFamily: "var(--font-montserrat), var(--font-ui)"
        }}
      >
        Burrito
      </span>
    </span>
  )
}
import "./BrandLogo.css"
