use cosmwasm_schema::cw_serde;
use cosmwasm_std::{
    entry_point, from_json, to_json_binary, Addr, Binary, Deps, DepsMut, Env, MessageInfo, Order,
    Response, StdError, StdResult, WasmMsg,
};
use cw2::set_contract_version;
use cw20::{Cw20ExecuteMsg, Cw20QueryMsg, Cw20ReceiveMsg, TokenInfoResponse};

use crate::error::ContractError;
use crate::msg::{
    ConfigResponse, Cw20HookMsg, ExecuteMsg, InstantiateMsg, LockResponse, LocksResponse,
    MigrateMsg, MigrationStatusResponse, QueryMsg,
};
use crate::state::{
    Config, Lock, CONFIG, DEFAULT_QUERY_LIMIT, DEFAULT_REINDEX_LIMIT, INDEX_MIGRATION_COMPLETE,
    INDEX_MIGRATION_CURSOR, LOCKS, LOCK_IDS_BY_LP_TOKEN, LOCK_IDS_BY_OWNER, MAX_LOCK_SECONDS,
    MAX_QUERY_LIMIT, MAX_REINDEX_LIMIT, MIN_LOCK_SECONDS, NEXT_LOCK_ID,
};

const CONTRACT_NAME: &str = "crates.io:burrito-lp-locker";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[cw_serde]
enum PairQueryMsg {
    Pair {},
}

#[cw_serde]
struct PairInfoResponse {
    liquidity_token: String,
}

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    let owner = match msg.owner {
        Some(owner) => deps.api.addr_validate(&owner)?,
        None => info.sender,
    };

    CONFIG.save(
        deps.storage,
        &Config {
            owner: owner.clone(),
        },
    )?;
    NEXT_LOCK_ID.save(deps.storage, &1)?;
    INDEX_MIGRATION_CURSOR.save(deps.storage, &None)?;
    INDEX_MIGRATION_COMPLETE.save(deps.storage, &true)?;
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("owner", owner.to_string()))
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::Receive(receive_msg) => execute_receive(deps, env, info, receive_msg),
        ExecuteMsg::Withdraw { lock_id } => execute_withdraw(deps, env, info, lock_id),
        ExecuteMsg::UpdateConfig { owner } => execute_update_config(deps, info, owner),
        ExecuteMsg::ReindexLocks { limit } => execute_reindex_locks(deps, info, limit),
    }
}

#[entry_point]
pub fn migrate(mut deps: DepsMut, _env: Env, msg: MigrateMsg) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
    if INDEX_MIGRATION_COMPLETE.may_load(deps.storage)?.is_none() {
        INDEX_MIGRATION_CURSOR.save(deps.storage, &None)?;
        INDEX_MIGRATION_COMPLETE.save(deps.storage, &false)?;
    }

    let result = reindex_locks_batch(deps.branch(), msg.limit)?;
    Ok(reindex_response("migrate", result))
}

struct ReindexResult {
    indexed: usize,
    cursor: Option<u64>,
    complete: bool,
}

fn reindex_locks_batch(deps: DepsMut, limit: Option<u32>) -> Result<ReindexResult, ContractError> {
    let limit = limit.unwrap_or(DEFAULT_REINDEX_LIMIT);
    if limit == 0 || limit > MAX_REINDEX_LIMIT {
        return Err(ContractError::InvalidReindexLimit {
            max: MAX_REINDEX_LIMIT,
        });
    }

    if INDEX_MIGRATION_COMPLETE
        .may_load(deps.storage)?
        .unwrap_or(false)
    {
        return Ok(ReindexResult {
            indexed: 0,
            cursor: INDEX_MIGRATION_CURSOR.may_load(deps.storage)?.flatten(),
            complete: true,
        });
    }

    let cursor = INDEX_MIGRATION_CURSOR.may_load(deps.storage)?.flatten();
    let start = cursor.map(cw_storage_plus::Bound::exclusive);
    let rows = LOCKS
        .range(deps.storage, start, None, Order::Ascending)
        .take(limit as usize + 1)
        .collect::<StdResult<Vec<_>>>()?;
    let has_more = rows.len() > limit as usize;
    let batch = &rows[..rows.len().min(limit as usize)];

    for (lock_id, lock) in batch {
        LOCK_IDS_BY_OWNER.save(deps.storage, (&lock.owner, *lock_id), &true)?;
        LOCK_IDS_BY_LP_TOKEN.save(deps.storage, (&lock.lp_token, *lock_id), &true)?;
    }

    let next_cursor = batch.last().map(|(lock_id, _)| *lock_id).or(cursor);
    let complete = !has_more;
    INDEX_MIGRATION_CURSOR.save(deps.storage, &next_cursor)?;
    INDEX_MIGRATION_COMPLETE.save(deps.storage, &complete)?;

    Ok(ReindexResult {
        indexed: batch.len(),
        cursor: next_cursor,
        complete,
    })
}

fn reindex_response(action: &str, result: ReindexResult) -> Response {
    Response::new()
        .add_attribute("action", action)
        .add_attribute("indexed", result.indexed.to_string())
        .add_attribute(
            "cursor",
            result
                .cursor
                .map(|cursor| cursor.to_string())
                .unwrap_or_else(|| "none".to_string()),
        )
        .add_attribute("complete", result.complete.to_string())
}

fn execute_reindex_locks(
    mut deps: DepsMut,
    info: MessageInfo,
    limit: Option<u32>,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.owner {
        return Err(ContractError::Unauthorized {});
    }
    let result = reindex_locks_batch(deps.branch(), limit)?;
    Ok(reindex_response("reindex_locks", result))
}

fn execute_update_config(
    deps: DepsMut,
    info: MessageInfo,
    owner: String,
) -> Result<Response, ContractError> {
    CONFIG.update(deps.storage, |mut config| -> Result<_, ContractError> {
        if info.sender != config.owner {
            return Err(ContractError::Unauthorized {});
        }
        config.owner = deps.api.addr_validate(&owner)?;
        Ok(config)
    })?;

    Ok(Response::new()
        .add_attribute("action", "update_config")
        .add_attribute("owner", owner))
}

fn execute_receive(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    receive_msg: Cw20ReceiveMsg,
) -> Result<Response, ContractError> {
    if receive_msg.amount.is_zero() {
        return Err(ContractError::InvalidAmount {});
    }
    if receive_msg.msg.is_empty() {
        return Err(ContractError::MissingHook {
            amount: receive_msg.amount,
        });
    }

    let hook: Cw20HookMsg = from_json(&receive_msg.msg)?;
    match hook {
        Cw20HookMsg::Lock {
            owner,
            pair_contract,
            unlock_time,
        } => execute_lock(
            deps,
            env,
            info.sender,
            receive_msg,
            owner,
            pair_contract,
            unlock_time,
        ),
    }
}

fn execute_lock(
    deps: DepsMut,
    env: Env,
    lp_token: Addr,
    receive_msg: Cw20ReceiveMsg,
    owner: Option<String>,
    pair_contract: String,
    unlock_time: u64,
) -> Result<Response, ContractError> {
    let now = env.block.time.seconds();
    let min_unlock = now + MIN_LOCK_SECONDS;
    let max_unlock = now + MAX_LOCK_SECONDS;
    if unlock_time < min_unlock || unlock_time > max_unlock {
        return Err(ContractError::InvalidUnlockTime {
            min_seconds: MIN_LOCK_SECONDS,
            max_seconds: MAX_LOCK_SECONDS,
        });
    }

    let lock_owner = match owner {
        Some(owner) => deps.api.addr_validate(&owner)?,
        None => deps.api.addr_validate(&receive_msg.sender)?,
    };
    let pair_contract = deps.api.addr_validate(&pair_contract)?;
    let pair: PairInfoResponse = deps
        .querier
        .query_wasm_smart(pair_contract.to_string(), &PairQueryMsg::Pair {})?;
    if pair.liquidity_token != lp_token.as_str() {
        return Err(ContractError::InvalidLpToken {
            reason: "pair liquidity token mismatch",
        });
    }
    let _: TokenInfoResponse = deps
        .querier
        .query_wasm_smart(lp_token.to_string(), &Cw20QueryMsg::TokenInfo {})?;
    let lock_id = NEXT_LOCK_ID.load(deps.storage)?;

    let lock = Lock {
        id: lock_id,
        owner: lock_owner.clone(),
        lp_token: lp_token.clone(),
        pair_contract: pair_contract.clone(),
        amount: receive_msg.amount,
        unlock_time,
        created_at: now,
        withdrawn: false,
    };
    LOCKS.save(deps.storage, lock_id, &lock)?;
    LOCK_IDS_BY_OWNER.save(deps.storage, (&lock_owner, lock_id), &true)?;
    LOCK_IDS_BY_LP_TOKEN.save(deps.storage, (&lp_token, lock_id), &true)?;
    NEXT_LOCK_ID.save(deps.storage, &(lock_id + 1))?;

    Ok(Response::new()
        .add_attribute("action", "lock_lp")
        .add_attribute("lock_id", lock_id.to_string())
        .add_attribute("owner", lock_owner.to_string())
        .add_attribute("lp_token", lp_token.to_string())
        .add_attribute("pair_contract", pair_contract.to_string())
        .add_attribute("amount", receive_msg.amount.to_string())
        .add_attribute("unlock_time", unlock_time.to_string()))
}

fn execute_withdraw(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    lock_id: u64,
) -> Result<Response, ContractError> {
    let mut lock = LOCKS
        .may_load(deps.storage, lock_id)?
        .ok_or(ContractError::LockNotFound { lock_id })?;
    if info.sender != lock.owner {
        return Err(ContractError::Unauthorized {});
    }
    if lock.withdrawn {
        return Err(ContractError::LockAlreadyWithdrawn { lock_id });
    }
    if env.block.time.seconds() < lock.unlock_time {
        return Err(ContractError::LockStillActive {
            lock_id,
            unlock_time: lock.unlock_time,
        });
    }
    if lock.amount.is_zero() {
        return Err(ContractError::EmptyWithdraw { lock_id });
    }

    lock.withdrawn = true;
    LOCKS.save(deps.storage, lock_id, &lock)?;

    let transfer = WasmMsg::Execute {
        contract_addr: lock.lp_token.to_string(),
        msg: to_json_binary(&Cw20ExecuteMsg::Transfer {
            recipient: lock.owner.to_string(),
            amount: lock.amount,
        })?,
        funds: vec![],
    };

    Ok(Response::new()
        .add_message(transfer)
        .add_attribute("action", "withdraw_lp")
        .add_attribute("lock_id", lock_id.to_string())
        .add_attribute("owner", lock.owner.to_string())
        .add_attribute("lp_token", lock.lp_token.to_string())
        .add_attribute("amount", lock.amount.to_string()))
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config {} => to_json_binary(&query_config(deps)?),
        QueryMsg::Lock { lock_id } => to_json_binary(&query_lock(deps, lock_id)?),
        QueryMsg::LocksByOwner {
            owner,
            start_after,
            limit,
        } => to_json_binary(&query_locks_by_owner(deps, owner, start_after, limit)?),
        QueryMsg::LocksByLpToken {
            lp_token,
            start_after,
            limit,
        } => to_json_binary(&query_locks_by_lp_token(
            deps,
            lp_token,
            start_after,
            limit,
        )?),
        QueryMsg::MigrationStatus {} => to_json_binary(&query_migration_status(deps)?),
    }
}

fn query_migration_status(deps: Deps) -> StdResult<MigrationStatusResponse> {
    Ok(MigrationStatusResponse {
        complete: INDEX_MIGRATION_COMPLETE
            .may_load(deps.storage)?
            .unwrap_or(false),
        cursor: INDEX_MIGRATION_CURSOR.may_load(deps.storage)?.flatten(),
    })
}

fn ensure_indexes_ready(deps: Deps) -> StdResult<()> {
    if INDEX_MIGRATION_COMPLETE
        .may_load(deps.storage)?
        .unwrap_or(false)
    {
        Ok(())
    } else {
        Err(StdError::generic_err(
            "lock index migration is still in progress",
        ))
    }
}

fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
    let config = CONFIG.load(deps.storage)?;
    Ok(ConfigResponse {
        owner: config.owner.to_string(),
        min_lock_seconds: MIN_LOCK_SECONDS,
        max_lock_seconds: MAX_LOCK_SECONDS,
    })
}

fn query_lock(deps: Deps, lock_id: u64) -> StdResult<LockResponse> {
    let lock = LOCKS.load(deps.storage, lock_id)?;
    Ok(lock_response(lock))
}

fn query_locks_by_owner(
    deps: Deps,
    owner: String,
    start_after: Option<u64>,
    limit: Option<u32>,
) -> StdResult<LocksResponse> {
    ensure_indexes_ready(deps)?;
    let owner = deps.api.addr_validate(&owner)?;
    let limit = limit.unwrap_or(DEFAULT_QUERY_LIMIT).min(MAX_QUERY_LIMIT) as usize;
    let start = start_after.map(cw_storage_plus::Bound::exclusive);
    let locks = LOCK_IDS_BY_OWNER
        .prefix(&owner)
        .range(deps.storage, start, None, Order::Ascending)
        .take(limit)
        .map(|item| {
            let (lock_id, _) = item?;
            LOCKS.load(deps.storage, lock_id).map(lock_response)
        })
        .collect::<StdResult<Vec<_>>>()?;
    Ok(LocksResponse { locks })
}

fn query_locks_by_lp_token(
    deps: Deps,
    lp_token: String,
    start_after: Option<u64>,
    limit: Option<u32>,
) -> StdResult<LocksResponse> {
    ensure_indexes_ready(deps)?;
    let lp_token = deps.api.addr_validate(&lp_token)?;
    let limit = limit.unwrap_or(DEFAULT_QUERY_LIMIT).min(MAX_QUERY_LIMIT) as usize;
    let start = start_after.map(cw_storage_plus::Bound::exclusive);
    let locks = LOCK_IDS_BY_LP_TOKEN
        .prefix(&lp_token)
        .range(deps.storage, start, None, Order::Ascending)
        .take(limit)
        .map(|item| {
            let (lock_id, _) = item?;
            LOCKS.load(deps.storage, lock_id).map(lock_response)
        })
        .collect::<StdResult<Vec<_>>>()?;
    Ok(LocksResponse { locks })
}

fn lock_response(lock: Lock) -> LockResponse {
    LockResponse {
        id: lock.id,
        owner: lock.owner.to_string(),
        lp_token: lock.lp_token.to_string(),
        pair_contract: lock.pair_contract.to_string(),
        amount: lock.amount,
        unlock_time: lock.unlock_time,
        created_at: lock.created_at,
        withdrawn: lock.withdrawn,
    }
}

#[cfg(test)]
mod tests {
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use cosmwasm_std::{
        attr, from_json, to_json_binary, ContractResult, SystemResult, Uint128, WasmQuery,
    };

    use super::*;
    use crate::msg::LocksResponse;

    const CREATOR: &str = "terra1creator000000000000000000000000000000000";
    const OWNER: &str = "terra1owner00000000000000000000000000000000000";
    const LP_TOKEN: &str = "terra1lp0000000000000000000000000000000000000";
    const PAIR: &str = "terra1pair000000000000000000000000000000000000";

    fn configure_pair_queries(
        deps: &mut cosmwasm_std::OwnedDeps<
            cosmwasm_std::MemoryStorage,
            cosmwasm_std::testing::MockApi,
            cosmwasm_std::testing::MockQuerier,
        >,
    ) {
        deps.querier.update_wasm(|query| match query {
            WasmQuery::Smart { contract_addr, msg } if contract_addr == PAIR => {
                let _: PairQueryMsg = from_json(msg).unwrap();
                SystemResult::Ok(ContractResult::Ok(
                    to_json_binary(&PairInfoResponse {
                        liquidity_token: LP_TOKEN.to_string(),
                    })
                    .unwrap(),
                ))
            }
            WasmQuery::Smart { contract_addr, msg } if contract_addr == LP_TOKEN => {
                let _: Cw20QueryMsg = from_json(msg).unwrap();
                SystemResult::Ok(ContractResult::Ok(
                    to_json_binary(&TokenInfoResponse {
                        name: "LP".to_string(),
                        symbol: "LP".to_string(),
                        decimals: 6,
                        total_supply: Uint128::new(1_000_000),
                    })
                    .unwrap(),
                ))
            }
            _ => SystemResult::Ok(ContractResult::Err("unsupported query".to_string())),
        });
    }

    #[test]
    fn locks_lp_from_cw20_receive() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        instantiate(
            deps.as_mut(),
            env.clone(),
            mock_info(CREATOR, &[]),
            InstantiateMsg { owner: None },
        )
        .unwrap();
        configure_pair_queries(&mut deps);

        let unlock_time = env.block.time.seconds() + MIN_LOCK_SECONDS + 1;
        let receive_msg = Cw20ReceiveMsg {
            sender: OWNER.to_string(),
            amount: Uint128::new(123),
            msg: to_json_binary(&Cw20HookMsg::Lock {
                owner: Some(OWNER.to_string()),
                pair_contract: PAIR.to_string(),
                unlock_time,
            })
            .unwrap(),
        };
        let response = execute(
            deps.as_mut(),
            env,
            mock_info(LP_TOKEN, &[]),
            ExecuteMsg::Receive(receive_msg),
        )
        .unwrap();

        assert_eq!(
            response.attributes,
            vec![
                attr("action", "lock_lp"),
                attr("lock_id", "1"),
                attr("owner", OWNER),
                attr("lp_token", LP_TOKEN),
                attr("pair_contract", PAIR),
                attr("amount", "123"),
                attr("unlock_time", unlock_time.to_string())
            ]
        );

        let query = query(
            deps.as_ref(),
            mock_env(),
            QueryMsg::LocksByOwner {
                owner: OWNER.to_string(),
                start_after: None,
                limit: None,
            },
        )
        .unwrap();
        let locks: LocksResponse = from_json(query).unwrap();
        assert_eq!(locks.locks.len(), 1);
        assert_eq!(locks.locks[0].amount, Uint128::new(123));
    }

    #[test]
    fn withdraw_requires_unlock_time() {
        let mut deps = mock_dependencies();
        let mut env = mock_env();
        instantiate(
            deps.as_mut(),
            env.clone(),
            mock_info(CREATOR, &[]),
            InstantiateMsg { owner: None },
        )
        .unwrap();
        configure_pair_queries(&mut deps);

        let unlock_time = env.block.time.seconds() + MIN_LOCK_SECONDS + 1;
        let receive_msg = Cw20ReceiveMsg {
            sender: OWNER.to_string(),
            amount: Uint128::new(123),
            msg: to_json_binary(&Cw20HookMsg::Lock {
                owner: Some(OWNER.to_string()),
                pair_contract: PAIR.to_string(),
                unlock_time,
            })
            .unwrap(),
        };
        execute(
            deps.as_mut(),
            env.clone(),
            mock_info(LP_TOKEN, &[]),
            ExecuteMsg::Receive(receive_msg),
        )
        .unwrap();

        let error = execute(
            deps.as_mut(),
            env.clone(),
            mock_info(OWNER, &[]),
            ExecuteMsg::Withdraw { lock_id: 1 },
        )
        .unwrap_err();
        match error {
            ContractError::LockStillActive {
                lock_id: 1,
                unlock_time: got_unlock_time,
            } if got_unlock_time == unlock_time => {}
            other => panic!("unexpected error: {other:?}"),
        }

        env.block.time = env.block.time.plus_seconds(MIN_LOCK_SECONDS + 2);
        let response = execute(
            deps.as_mut(),
            env,
            mock_info(OWNER, &[]),
            ExecuteMsg::Withdraw { lock_id: 1 },
        )
        .unwrap();
        assert_eq!(response.messages.len(), 1);
    }

    #[test]
    fn migration_rebuilds_legacy_indexes_in_bounded_batches() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        instantiate(
            deps.as_mut(),
            env.clone(),
            mock_info(CREATOR, &[]),
            InstantiateMsg { owner: None },
        )
        .unwrap();

        INDEX_MIGRATION_COMPLETE.remove(deps.as_mut().storage);
        INDEX_MIGRATION_CURSOR.remove(deps.as_mut().storage);
        for lock_id in 1..=2 {
            LOCKS
                .save(
                    deps.as_mut().storage,
                    lock_id,
                    &Lock {
                        id: lock_id,
                        owner: Addr::unchecked(OWNER),
                        lp_token: Addr::unchecked(LP_TOKEN),
                        pair_contract: Addr::unchecked(PAIR),
                        amount: Uint128::new(lock_id as u128),
                        unlock_time: env.block.time.seconds() + MIN_LOCK_SECONDS,
                        created_at: env.block.time.seconds(),
                        withdrawn: false,
                    },
                )
                .unwrap();
        }

        let first = migrate(deps.as_mut(), env.clone(), MigrateMsg { limit: Some(1) }).unwrap();
        assert_eq!(first.attributes.last(), Some(&attr("complete", "false")));
        assert!(query(
            deps.as_ref(),
            env.clone(),
            QueryMsg::LocksByOwner {
                owner: OWNER.to_string(),
                start_after: None,
                limit: None,
            },
        )
        .is_err());

        let second = execute(
            deps.as_mut(),
            env.clone(),
            mock_info(CREATOR, &[]),
            ExecuteMsg::ReindexLocks { limit: Some(1) },
        )
        .unwrap();
        assert_eq!(second.attributes.last(), Some(&attr("complete", "true")));

        let status: MigrationStatusResponse =
            from_json(query(deps.as_ref(), env.clone(), QueryMsg::MigrationStatus {}).unwrap())
                .unwrap();
        assert!(status.complete);
        assert_eq!(status.cursor, Some(2));

        let locks: LocksResponse = from_json(
            query(
                deps.as_ref(),
                env,
                QueryMsg::LocksByOwner {
                    owner: OWNER.to_string(),
                    start_after: None,
                    limit: None,
                },
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(locks.locks.len(), 2);
    }

    #[test]
    fn only_owner_can_continue_reindexing() {
        let mut deps = mock_dependencies();
        instantiate(
            deps.as_mut(),
            mock_env(),
            mock_info(CREATOR, &[]),
            InstantiateMsg { owner: None },
        )
        .unwrap();
        INDEX_MIGRATION_COMPLETE
            .save(deps.as_mut().storage, &false)
            .unwrap();

        let error = execute(
            deps.as_mut(),
            mock_env(),
            mock_info(OWNER, &[]),
            ExecuteMsg::ReindexLocks { limit: Some(1) },
        )
        .unwrap_err();
        assert!(matches!(error, ContractError::Unauthorized {}));
    }
}
