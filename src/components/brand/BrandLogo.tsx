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
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap,
        paddingLeft: gap,
        lineHeight: 1
      }}
    >
      <img
        src="/brand/icon.png"
        alt="Burrito"
        style={{
          height: iconSize,
          width: "auto",
          display: "block"
        }}
      />
      <span
        style={{
          fontSize: textSize,
          fontWeight: 650,
          letterSpacing: "-0.05em",
          color: "#FFFFFF",
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
