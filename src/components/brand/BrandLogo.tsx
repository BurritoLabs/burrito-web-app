import { BurritoBrandLockup } from "@burritolabs/ui"

type BrandLogoProps = {
  textSize?: number
  iconSize?: number
  gap?: number
}

export default function BrandLogo({ iconSize = 24 }: BrandLogoProps) {
  return <BurritoBrandLockup iconSrc="/brand/icon-192.png" iconSize={iconSize} />
}
