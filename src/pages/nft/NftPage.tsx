import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import PageShell from "../PageShell"
import styles from "../NFT.module.css"
import { useAppChain } from "../../app/appChainContext"
import {
  DEFAULT_NFT_IMAGE,
  fetchNftMetadata,
  fetchOwnedNfts,
  type OwnedNft
} from "../../app/data/nfts"
import { useWallet } from "../../app/wallet/WalletContext"

const PAGE_SIZE = 24

const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path
      d="M20 6v5h-5M4 18v-5h5M18.4 9A7 7 0 0 0 6.2 6.2L4 9m16 6-2.2 2.8A7 7 0 0 1 5.6 15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const NftImage = ({
  alt,
  collectionIcon,
  image
}: {
  alt: string
  collectionIcon?: string
  image?: string
}) => {
  const candidates = useMemo(
    () => Array.from(new Set([image, collectionIcon, DEFAULT_NFT_IMAGE].filter(Boolean))),
    [collectionIcon, image]
  )
  const [candidateIndex, setCandidateIndex] = useState(0)

  return (
    <img
      src={candidates[candidateIndex] ?? DEFAULT_NFT_IMAGE}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() =>
        setCandidateIndex((current) =>
          Math.min(current + 1, Math.max(candidates.length - 1, 0))
        )
      }
    />
  )
}

const NftCard = ({ item }: { item: OwnedNft }) => {
  const metadataQuery = useQuery({
    queryKey: ["nft-metadata", item.contract, item.tokenId, item.tokenUri],
    queryFn: () => fetchNftMetadata(item.tokenUri ?? ""),
    enabled: Boolean(item.tokenUri),
    staleTime: 24 * 60 * 60 * 1000
  })
  const metadata = metadataQuery.data
  const name = item.name ?? metadata?.name ?? `#${item.tokenId}`
  const image = item.image ?? metadata?.image

  return (
    <article className={styles.nftCard}>
      <div className={styles.media}>
        <NftImage
          key={`${image ?? ""}:${item.collectionIcon ?? ""}`}
          alt={name}
          collectionIcon={item.collectionIcon}
          image={image}
        />
      </div>
      <div className={styles.cardBody}>
        <div className={styles.collectionName}>{item.collectionName}</div>
        <div className={styles.tokenName}>{name}</div>
        <div className={styles.tokenId}>Token #{item.tokenId}</div>
      </div>
    </article>
  )
}

const NftLoadingGrid = () => (
  <div className={styles.nftGrid} aria-label="Loading NFTs">
    {Array.from({ length: 8 }, (_, index) => (
      <div className={styles.loadingCard} key={index}>
        <div className={styles.loadingMedia} />
        <div className={styles.loadingLine} />
        <div className={`${styles.loadingLine} ${styles.loadingLineShort}`} />
      </div>
    ))}
  </div>
)

const NftPage = () => {
  const { account } = useWallet()
  const { chain, chainKey } = useAppChain()
  const queryClient = useQueryClient()
  const accountAddress = account?.address
  const paginationKey = `${chain.chainId}:${accountAddress ?? ""}`
  const [pagination, setPagination] = useState({
    key: paginationKey,
    count: PAGE_SIZE
  })

  const nftQuery = useQuery({
    queryKey: ["wallet", chain.chainId, "nfts", accountAddress],
    queryFn: () =>
      fetchOwnedNfts({
        chainKey,
        lcd: chain.runtime.chain.lcd,
        owner: accountAddress ?? ""
      }),
    enabled: Boolean(accountAddress),
    staleTime: 10 * 60 * 1000
  })

  const items = nftQuery.data?.items ?? []
  const visibleCount =
    pagination.key === paginationKey ? pagination.count : PAGE_SIZE
  const visibleItems = items.slice(0, visibleCount)
  const collectionCount = new Set(items.map((item) => item.contract)).size

  const handleRefresh = () => {
    if (!accountAddress) return
    void queryClient.invalidateQueries({
      queryKey: ["wallet", chain.chainId, "nfts", accountAddress]
    })
  }

  return (
    <PageShell
      title="NFT"
      extra={
        accountAddress ? (
          <button
            type="button"
            className={styles.refreshButton}
            onClick={handleRefresh}
            disabled={nftQuery.isFetching}
          >
            <RefreshIcon />
            <span>Refresh</span>
          </button>
        ) : undefined
      }
    >
      {!accountAddress ? (
        <div className={styles.stateBand}>
          <img src={DEFAULT_NFT_IMAGE} alt="" aria-hidden="true" />
          <div>
            <strong>Connect wallet to view NFTs</strong>
            <span>Your {chain.name} NFT collection will appear here.</span>
          </div>
        </div>
      ) : nftQuery.isLoading ? (
        <NftLoadingGrid />
      ) : nftQuery.isError ? (
        <div className={styles.stateBand}>
          <img src={DEFAULT_NFT_IMAGE} alt="" aria-hidden="true" />
          <div>
            <strong>NFT data temporarily unavailable</strong>
            <span>Please retry the on-chain collection scan.</span>
          </div>
          <button type="button" className={styles.retryButton} onClick={handleRefresh}>
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className={styles.summary}>
            <div>
              <span>NFTs</span>
              <strong>{items.length}</strong>
            </div>
            <div>
              <span>Collections</span>
              <strong>{collectionCount}</strong>
            </div>
            <div>
              <span>Network</span>
              <strong>{chain.displayDenom}</strong>
            </div>
          </div>

          {items.length ? (
            <>
              <div className={styles.nftGrid}>
                {visibleItems.map((item) => (
                  <NftCard
                    key={`${item.contract}:${item.tokenId}`}
                    item={item}
                  />
                ))}
              </div>
              {visibleCount < items.length ? (
                <button
                  type="button"
                  className={styles.loadMoreButton}
                  onClick={() =>
                    setPagination({
                      key: paginationKey,
                      count: visibleCount + PAGE_SIZE
                    })
                  }
                >
                  Load more
                </button>
              ) : null}
              {nftQuery.data?.truncated ? (
                <div className={styles.limitNotice}>
                  Showing the first 400 NFTs in this wallet.
                </div>
              ) : null}
            </>
          ) : (
            <div className={styles.stateBand}>
              <img src={DEFAULT_NFT_IMAGE} alt="" aria-hidden="true" />
              <div>
                <strong>No NFTs found</strong>
                <span>
                  No NFTs were found in registered {chain.name} collections.
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </PageShell>
  )
}

export default NftPage
