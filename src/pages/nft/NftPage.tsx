import { useEffect, useMemo, useState, type FormEvent } from "react"
import { createPortal } from "react-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import PageShell from "../PageShell"
import styles from "../NFT.module.css"
import { useAppChain } from "../../app/appChainContext"
import {
  DEFAULT_NFT_IMAGE,
  buildNftTransferExecuteMsg,
  buildNftImageCandidates,
  fetchNftCollection,
  fetchNftMetadata,
  fetchOwnedNfts,
  isTerraAddress,
  rememberNftCollections,
  type NftMetadata,
  type OwnedNft
} from "../../app/data/nfts"
import { getAddressExplorerUrl } from "../../app/explorer"
import { formatTxError } from "../../app/utils/txError"
import { useWallet } from "../../app/wallet/WalletContext"

const PAGE_SIZE = 24
const NFT_IMAGE_TIMEOUT_MS = 4_000

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

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const ExternalIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
    <path d="M14 5h5v5M19 5l-8 8M18 13v6H5V6h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const NftImage = ({ alt, image }: { alt: string; image?: string }) => {
  const candidates = useMemo(() => buildNftImageCandidates(image), [image])
  const [resolvedSrc, setResolvedSrc] = useState(DEFAULT_NFT_IMAGE)

  useEffect(() => {
    let cancelled = false
    let activeImage: HTMLImageElement | undefined
    let timeoutId: number | undefined

    const tryCandidate = (index: number) => {
      if (cancelled || index >= candidates.length) return
      const candidate = candidates[index]
      const preload = new Image()
      activeImage = preload
      const cleanup = () => {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId)
        preload.onload = null
        preload.onerror = null
      }
      const tryNext = () => {
        cleanup()
        tryCandidate(index + 1)
      }
      preload.referrerPolicy = "no-referrer"
      preload.onload = () => {
        cleanup()
        if (!cancelled) setResolvedSrc(candidate)
      }
      preload.onerror = tryNext
      timeoutId = window.setTimeout(tryNext, NFT_IMAGE_TIMEOUT_MS)
      preload.src = candidate
    }

    tryCandidate(0)
    return () => {
      cancelled = true
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      if (activeImage) {
        activeImage.onload = null
        activeImage.onerror = null
      }
    }
  }, [candidates])

  return <img src={resolvedSrc} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
}

const mergeItemMetadata = (item: OwnedNft, metadata?: NftMetadata): OwnedNft => ({
  ...item,
  name: item.name ?? metadata?.name,
  description: item.description ?? metadata?.description,
  image: item.image ?? metadata?.image,
  animationUrl: item.animationUrl ?? metadata?.animationUrl,
  externalUrl: item.externalUrl ?? metadata?.externalUrl,
  attributes: item.attributes.length ? item.attributes : (metadata?.attributes ?? [])
})

const NftCard = ({ item, onOpen }: { item: OwnedNft; onOpen: (item: OwnedNft) => void }) => {
  const metadataQuery = useQuery({
    queryKey: ["nft-metadata", item.contract, item.tokenId, item.tokenUri],
    queryFn: () => fetchNftMetadata(item.tokenUri ?? ""),
    enabled: Boolean(item.tokenUri),
    staleTime: 24 * 60 * 60 * 1000
  })
  const resolvedItem = mergeItemMetadata(item, metadataQuery.data)
  const name = resolvedItem.name ?? `#${item.tokenId}`

  return (
    <button type="button" className={styles.nftCard} onClick={() => onOpen(resolvedItem)} aria-label={`View ${name}`}>
      <div className={styles.media}>
        <NftImage key={resolvedItem.image ?? DEFAULT_NFT_IMAGE} alt={name} image={resolvedItem.image} />
      </div>
      <div className={styles.cardBody}>
        <div className={styles.collectionName}>{item.collectionName}</div>
        <div className={styles.tokenName}>{name}</div>
        <div className={styles.tokenId}>Token #{item.tokenId}</div>
      </div>
    </button>
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
  const {
    account,
    connectorId,
    prepareWalletForTx,
    walletPreparingForTx,
    startTx,
    finishTx,
    failTx
  } = useWallet()
  const { chain, chainKey } = useAppChain()
  const queryClient = useQueryClient()
  const accountAddress = account?.address
  const paginationKey = `${chain.chainId}:${accountAddress ?? ""}`
  const [pagination, setPagination] = useState({ key: paginationKey, count: PAGE_SIZE })
  const [selectedItem, setSelectedItem] = useState<OwnedNft>()
  const [addCollectionOpen, setAddCollectionOpen] = useState(false)
  const [collectionContract, setCollectionContract] = useState("")
  const [collectionError, setCollectionError] = useState<string>()
  const [collectionSubmitting, setCollectionSubmitting] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [recipient, setRecipient] = useState("")
  const [sendError, setSendError] = useState<string>()
  const [sendSubmitting, setSendSubmitting] = useState(false)

  const closeDetails = () => {
    setSelectedItem(undefined)
    setSendOpen(false)
    setRecipient("")
    setSendError(undefined)
  }

  const openDetails = (item: OwnedNft) => {
    setSendOpen(false)
    setRecipient("")
    setSendError(undefined)
    setSelectedItem(item)
  }

  const openAddCollection = () => {
    setCollectionError(undefined)
    setAddCollectionOpen(true)
  }

  const nftQueryKey = ["wallet", chain.chainId, "nfts", accountAddress] as const
  const nftQuery = useQuery({
    queryKey: nftQueryKey,
    queryFn: () => fetchOwnedNfts({ chainKey, lcd: chain.runtime.chain.lcd, owner: accountAddress ?? "" }),
    enabled: Boolean(accountAddress),
    staleTime: 10 * 60 * 1000
  })

  const selectedMetadataQuery = useQuery({
    queryKey: ["nft-metadata", selectedItem?.contract, selectedItem?.tokenId, selectedItem?.tokenUri],
    queryFn: () => fetchNftMetadata(selectedItem?.tokenUri ?? ""),
    enabled: Boolean(selectedItem?.tokenUri),
    staleTime: 24 * 60 * 60 * 1000
  })
  const detailedItem = selectedItem ? mergeItemMetadata(selectedItem, selectedMetadataQuery.data) : undefined

  useEffect(() => {
    setSelectedItem(undefined)
    setAddCollectionOpen(false)
    setSendOpen(false)
    setRecipient("")
  }, [chain.chainId, accountAddress])

  useEffect(() => {
    if (!selectedItem && !addCollectionOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || sendSubmitting || collectionSubmitting) return
      if (addCollectionOpen) setAddCollectionOpen(false)
      else if (sendOpen) setSendOpen(false)
      else {
        setSelectedItem(undefined)
        setRecipient("")
        setSendError(undefined)
      }
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [addCollectionOpen, collectionSubmitting, selectedItem, sendOpen, sendSubmitting])

  const items = nftQuery.data?.items ?? []
  const visibleCount = pagination.key === paginationKey ? pagination.count : PAGE_SIZE
  const visibleItems = items.slice(0, visibleCount)
  const collectionCount = new Set(items.map((item) => item.contract)).size

  const handleRefresh = () => {
    if (!accountAddress) return
    void queryClient.invalidateQueries({ queryKey: nftQueryKey })
  }

  const handleAddCollection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCollectionError(undefined)
    setCollectionSubmitting(true)
    try {
      const collection = await fetchNftCollection({ contract: collectionContract, lcd: chain.runtime.chain.lcd })
      rememberNftCollections(chainKey, [collection])
      setCollectionContract("")
      setAddCollectionOpen(false)
      await queryClient.invalidateQueries({ queryKey: nftQueryKey })
    } catch (error) {
      setCollectionError(error instanceof Error ? error.message : "Collection could not be added")
    } finally {
      setCollectionSubmitting(false)
    }
  }

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!detailedItem || !accountAddress) return
    const normalizedRecipient = recipient.trim().toLowerCase()
    if (!isTerraAddress(normalizedRecipient)) {
      setSendError(`Enter a valid ${chain.name} address.`)
      return
    }
    if (normalizedRecipient === accountAddress.toLowerCase()) {
      setSendError("The recipient is the wallet that already owns this NFT.")
      return
    }

    setSendSubmitting(true)
    setSendError(undefined)
    try {
      const walletReady = await prepareWalletForTx()
      if (!walletReady) {
        setSendError("Wallet is still syncing. Wait a moment, then submit again.")
        return
      }
      if (!connectorId) throw new Error("Wallet not connected")
      startTx("Send NFT")
      const [{ connectSigningClientForConnector, getSignerAddressForConnector }, { MsgExecuteContract }, { encodeJsonBytes }] = await Promise.all([
        import("../../app/wallet/walletAdapters"),
        import("cosmjs-types/cosmwasm/wasm/v1/tx"),
        import("../../app/wallet/walletPanelUtils")
      ])
      const signerAddress = await getSignerAddressForConnector(connectorId)
      if (signerAddress.toLowerCase() !== accountAddress.toLowerCase()) {
        throw new Error("Wallet account changed. Review this NFT again before sending.")
      }
      const client = await connectSigningClientForConnector(connectorId)
      const message = {
        typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
        value: MsgExecuteContract.fromPartial({
          sender: signerAddress,
          contract: detailedItem.contract,
          msg: encodeJsonBytes(buildNftTransferExecuteMsg({ recipient: normalizedRecipient, tokenId: detailedItem.tokenId })),
          funds: []
        })
      }
      const result = await client.signAndBroadcast(signerAddress, [message], "auto", "Burrito NFT transfer")
      if (result.code !== 0) throw new Error(result.rawLog || "NFT transfer failed")
      await queryClient.invalidateQueries({ queryKey: nftQueryKey })
      finishTx(result.transactionHash)
      closeDetails()
    } catch (error) {
      const message = formatTxError(error, "NFT transfer failed")
      setSendError(message)
      failTx(message)
    } finally {
      setSendSubmitting(false)
    }
  }

  return (
    <PageShell
      title="NFT"
      extra={accountAddress ? (
        <div className={styles.headerActions}>
          <button type="button" className={styles.addButton} onClick={openAddCollection}><PlusIcon /><span>Add collection</span></button>
          <button type="button" className={styles.refreshButton} onClick={handleRefresh} disabled={nftQuery.isFetching}><RefreshIcon /><span>Refresh</span></button>
        </div>
      ) : undefined}
    >
      {!accountAddress ? (
        <div className={styles.stateBand}>
          <img src={DEFAULT_NFT_IMAGE} alt="" aria-hidden="true" />
          <div><strong>Connect wallet to view NFTs</strong><span>Your {chain.name} NFT collection will appear here.</span></div>
        </div>
      ) : nftQuery.isLoading ? <NftLoadingGrid /> : nftQuery.isError ? (
        <div className={styles.stateBand}>
          <img src={DEFAULT_NFT_IMAGE} alt="" aria-hidden="true" />
          <div><strong>NFT data temporarily unavailable</strong><span>Please retry the on-chain collection scan.</span></div>
          <button type="button" className={styles.retryButton} onClick={handleRefresh}>Retry</button>
        </div>
      ) : (
        <>
          <div className={styles.summary}>
            <div><span>NFTs</span><strong>{items.length}</strong></div>
            <div><span>Collections</span><strong>{collectionCount}</strong></div>
            <div><span>Network</span><strong>{chain.displayDenom}</strong></div>
          </div>
          {items.length ? (
            <>
              <div className={styles.nftGrid}>{visibleItems.map((item) => <NftCard key={`${item.contract}:${item.tokenId}`} item={item} onOpen={openDetails} />)}</div>
              {visibleCount < items.length ? <button type="button" className={styles.loadMoreButton} onClick={() => setPagination({ key: paginationKey, count: visibleCount + PAGE_SIZE })}>Load more</button> : null}
              {nftQuery.data?.truncated ? <div className={styles.limitNotice}>Showing the first 400 NFTs in this wallet.</div> : null}
            </>
          ) : (
            <div className={styles.stateBand}>
              <img src={DEFAULT_NFT_IMAGE} alt="" aria-hidden="true" />
              <div><strong>No NFTs found</strong><span>Automatic discovery found no owned NFTs. Add a collection contract if an issuer is not indexed yet.</span></div>
              <button type="button" className={styles.retryButton} onClick={openAddCollection}>Add collection</button>
            </div>
          )}
        </>
      )}

      {addCollectionOpen ? createPortal(
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !collectionSubmitting) setAddCollectionOpen(false) }}>
          <section className={`${styles.modalPanel} ${styles.compactModal}`} role="dialog" aria-modal="true" aria-labelledby="add-nft-collection-title">
            <div className={styles.modalHeader}><div><span>On-chain collection</span><h2 id="add-nft-collection-title">Add CW721 collection</h2></div><button type="button" className={styles.closeButton} onClick={() => setAddCollectionOpen(false)} aria-label="Close" disabled={collectionSubmitting}><CloseIcon /></button></div>
            <form className={styles.modalForm} onSubmit={handleAddCollection}>
              <label className={styles.fieldLabel} htmlFor="nft-collection-contract">Collection contract</label>
              <input id="nft-collection-contract" className={styles.textInput} value={collectionContract} onChange={(event) => setCollectionContract(event.target.value)} placeholder="terra1..." autoComplete="off" spellCheck="false" autoFocus />
              <p className={styles.fieldHint}>The contract is verified on the selected network before it is saved.</p>
              {collectionError ? <div className={styles.formError}>{collectionError}</div> : null}
              <button type="submit" className={styles.primaryButton} disabled={collectionSubmitting || !collectionContract.trim()}>{collectionSubmitting ? "Verifying..." : "Add collection"}</button>
            </form>
          </section>
        </div>, document.body) : null}

      {detailedItem ? createPortal(
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !sendSubmitting) closeDetails() }}>
          <section className={styles.modalPanel} role="dialog" aria-modal="true" aria-labelledby="nft-detail-title">
            <div className={styles.modalHeader}><div><span>{detailedItem.collectionName}</span><h2 id="nft-detail-title">{detailedItem.name ?? `#${detailedItem.tokenId}`}</h2></div><button type="button" className={styles.closeButton} onClick={closeDetails} aria-label="Close" disabled={sendSubmitting}><CloseIcon /></button></div>
            <div className={styles.detailLayout}>
              <div className={styles.detailMedia}><NftImage key={detailedItem.image ?? `${detailedItem.contract}:${detailedItem.tokenId}`} alt={detailedItem.name ?? `NFT ${detailedItem.tokenId}`} image={detailedItem.image} /></div>
              <div className={styles.detailBody}>
                {detailedItem.description ? <p className={styles.description}>{detailedItem.description}</p> : <p className={styles.descriptionMuted}>No description was published by the collection.</p>}
                <dl className={styles.detailList}>
                  <div><dt>Token ID</dt><dd>{detailedItem.tokenId}</dd></div>
                  <div><dt>Collection</dt><dd>{detailedItem.collectionSymbol ?? detailedItem.collectionName}</dd></div>
                  <div><dt>Network</dt><dd>{chain.name}</dd></div>
                </dl>
                {detailedItem.attributes.length ? <div className={styles.attributes}>{detailedItem.attributes.map((attribute, index) => <div key={`${attribute.traitType}:${attribute.value}:${index}`}><span>{attribute.traitType}</span><strong>{attribute.value}</strong></div>)}</div> : null}
                <div className={styles.detailLinks}>
                  <a href={getAddressExplorerUrl(chainKey, detailedItem.contract)} target="_blank" rel="noreferrer">Contract <ExternalIcon /></a>
                  {detailedItem.tokenUri ? <a href={detailedItem.tokenUri} target="_blank" rel="noreferrer">Metadata <ExternalIcon /></a> : null}
                  {detailedItem.externalUrl ? <a href={detailedItem.externalUrl} target="_blank" rel="noreferrer">Website <ExternalIcon /></a> : null}
                  {detailedItem.collectionMarketplace[0] ? <a href={detailedItem.collectionMarketplace[0]} target="_blank" rel="noreferrer">Marketplace <ExternalIcon /></a> : null}
                </div>
                {!sendOpen ? <button type="button" className={styles.primaryButton} onClick={() => { setSendOpen(true); setSendError(undefined) }}>Send NFT</button> : (
                  <form className={styles.sendForm} onSubmit={handleSend}>
                    <label className={styles.fieldLabel} htmlFor="nft-recipient">Recipient</label>
                    <input id="nft-recipient" className={styles.textInput} value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="terra1..." autoComplete="off" spellCheck="false" />
                    <p className={styles.transferWarning}>NFT transfers are permanent. Verify the address and selected network.</p>
                    {sendError ? <div className={styles.formError}>{sendError}</div> : null}
                    <div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={() => setSendOpen(false)} disabled={sendSubmitting}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={sendSubmitting || walletPreparingForTx || !recipient.trim()}>{sendSubmitting || walletPreparingForTx ? "Preparing..." : "Review in wallet"}</button></div>
                  </form>
                )}
              </div>
            </div>
          </section>
        </div>, document.body) : null}
    </PageShell>
  )
}

export default NftPage
