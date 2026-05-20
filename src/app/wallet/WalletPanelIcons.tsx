import type { SVGProps } from "react"

type IconProps = SVGProps<SVGSVGElement>

export const WalletCloseIcon = (props: IconProps) => (
  <svg viewBox="0 0 8 20" width="18" height="18" aria-hidden="true" {...props}>
    <path
      d="M1.99984 0L0.589844 2.35L5.16984 10L0.589844 17.65L1.99984 20L7.99984 10L1.99984 0Z"
      fill="currentColor"
    />
  </svg>
)

export const WalletCloseIconMobile = (props: IconProps) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
    <path
      d="M6 6l12 12M18 6L6 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const WalletIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}>
    <path
      d="M21 18v1c0 1.1-.9 2-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14c1.1 0 2 .9 2 2v1h-9a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h9Zm-9-2h10V8H12v8Zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5Z"
      fill="currentColor"
    />
  </svg>
)

export const BackIcon = (props: IconProps) => (
  <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" {...props}>
    <path d="M11.7 3.6L6.3 9l5.4 5.4L10.5 15.6 3.9 9l6.6-6.6 1.2 1.2Z" />
  </svg>
)

export const SendIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...props}>
    <path
      d="M4 12h12M12 4l8 8-8 8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const ReceiveIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...props}>
    <path
      d="M20 12H8M12 20l-8-8 8-8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const ManageIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}>
    <path
      d="M4 7h10M4 12h16M4 17h8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
)

export const BuyIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
    <path
      d="M12 5v14M5 12h14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
)

export const PriceUpIcon = (props: IconProps) => (
  <svg viewBox="0 0 14 8" width="14" height="8" aria-hidden="true" {...props}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M8.60011 1.6C8.15828 1.6 7.80011 1.24183 7.80011 0.8C7.80011 0.358172 8.15828 0 8.60011 0H12.6001C13.0419 0 13.4001 0.358172 13.4001 0.8V4.8C13.4001 5.24183 13.0419 5.6 12.6001 5.6C12.1583 5.6 11.8001 5.24183 11.8001 4.8V2.73137L8.36579 6.16569C8.05337 6.47811 7.54684 6.47811 7.23442 6.16569L5.4001 4.33137L1.96578 7.76569C1.65336 8.0781 1.14683 8.0781 0.834412 7.76569C0.521993 7.45327 0.521993 6.94673 0.834412 6.63432L4.83442 2.63431C5.14684 2.3219 5.65337 2.3219 5.96579 2.63431L7.80011 4.46863L10.6687 1.6H8.60011Z"
      fill="currentColor"
    />
  </svg>
)

export const PriceDownIcon = (props: IconProps) => (
  <svg viewBox="0 0 14 8" width="14" height="8" aria-hidden="true" {...props}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M8.60011 6.4C8.15828 6.4 7.80011 6.75817 7.80011 7.2C7.80011 7.64183 8.15828 8 8.60011 8H12.6001C13.0419 8 13.4001 7.64183 13.4001 7.2V3.2C13.4001 2.75817 13.0419 2.4 12.6001 2.4C12.1583 2.4 11.8001 2.75817 11.8001 3.2V5.26863L8.36579 1.83431C8.05337 1.52189 7.54684 1.52189 7.23442 1.83431L5.4001 3.66863L1.96578 0.234314C1.65336 -0.078105 1.14683 -0.078105 0.834412 0.234314C0.521993 0.546734 0.521993 1.05327 0.834412 1.36568L4.83442 5.36569C5.14684 5.6781 5.65337 5.6781 5.96579 5.36569L7.80011 3.53137L10.6687 6.4H8.60011Z"
      fill="currentColor"
    />
  </svg>
)
