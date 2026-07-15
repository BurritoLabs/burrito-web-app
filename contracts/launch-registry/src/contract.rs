use cosmwasm_schema::cw_serde;
use cosmwasm_std::{
    entry_point, to_json_binary, Addr, Binary, Deps, DepsMut, Env, MessageInfo, Order, Response,
    StdResult, Uint128,
};

use crate::error::ContractError;
use crate::msg::{
    ConfigResponse, ExecuteMsg, InstantiateMsg, LaunchMetadata, LaunchResponse, LaunchStatus,
    LaunchesResponse, QueryMsg,
};
use crate::state::{
    Config, Launch, CONFIG, DEFAULT_QUERY_LIMIT, LAUNCHES, LAUNCH_INDEX, MAX_QUERY_LIMIT, NEXT_ID,
};

const NAME_MAX: usize = 80;
const SYMBOL_MAX: usize = 20;
const URL_MAX: usize = 180;
const DESCRIPTION_MAX: usize = 500;
const LOCK_ID_MAX: usize = 64;

#[cw_serde]
enum LockerQueryMsg {
    Lock { lock_id: u64 },
}

#[cw_serde]
enum Cw20QueryMsg {
    TokenInfo {},
}

#[cw_serde]
enum PairQueryMsg {
    Pair {},
}

#[cw_serde]
enum PairAssetInfo {
    NativeToken { denom: String },
    Token { contract_addr: String },
}

#[cw_serde]
struct PairInfoResponse {
    asset_infos: Vec<PairAssetInfo>,
    liquidity_token: String,
}

#[cw_serde]
struct LockerLockResponse {
    id: u64,
    owner: String,
    lp_token: String,
    pair_contract: String,
    amount: Uint128,
    unlock_time: u64,
    created_at: u64,
    withdrawn: bool,
}

#[cw_serde]
struct Cw20TokenInfoResponse {
    name: String,
    symbol: String,
    decimals: u8,
    total_supply: Uint128,
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
    let locker_contract = deps.api.addr_validate(&msg.locker_contract)?;

    CONFIG.save(
        deps.storage,
        &Config {
            owner: owner.clone(),
            locker_contract: locker_contract.clone(),
        },
    )?;
    NEXT_ID.save(deps.storage, &1)?;

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("owner", owner.to_string())
        .add_attribute("locker_contract", locker_contract.to_string()))
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::RegisterLaunch {
            token_contract,
            pair_contract,
            lp_token,
            locker_contract,
            lp_lock_id,
            lp_unlock_time,
            metadata,
        } => execute_register_launch(
            deps,
            env,
            info,
            token_contract,
            pair_contract,
            lp_token,
            locker_contract,
            lp_lock_id,
            lp_unlock_time,
            metadata,
        ),
        ExecuteMsg::UpdateLaunch {
            token_contract,
            metadata,
            status,
            lp_lock_id,
            lp_unlock_time,
        } => execute_update_launch(
            deps,
            env,
            info,
            token_contract,
            metadata,
            status,
            lp_lock_id,
            lp_unlock_time,
        ),
        ExecuteMsg::UpdateConfig {
            owner,
            locker_contract,
        } => execute_update_config(deps, info, owner, locker_contract),
    }
}

#[allow(clippy::too_many_arguments)]
fn execute_register_launch(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    token_contract: String,
    pair_contract: String,
    lp_token: String,
    locker_contract: String,
    lp_lock_id: String,
    lp_unlock_time: u64,
    metadata: LaunchMetadata,
) -> Result<Response, ContractError> {
    if lp_unlock_time <= env.block.time.seconds() {
        return Err(ContractError::InvalidUnlockTime {});
    }

    let token_contract = deps.api.addr_validate(&token_contract)?;
    if LAUNCHES.has(deps.storage, &token_contract) {
        return Err(ContractError::LaunchAlreadyExists {
            token_contract: token_contract.to_string(),
        });
    }

    let pair_contract = deps.api.addr_validate(&pair_contract)?;
    let lp_token = deps.api.addr_validate(&lp_token)?;
    let locker_contract = deps.api.addr_validate(&locker_contract)?;
    let config = CONFIG.load(deps.storage)?;
    if locker_contract != config.locker_contract {
        return Err(ContractError::InvalidLockerContract {});
    }
    let lp_lock_id = normalize_required("lp_lock_id", lp_lock_id, LOCK_ID_MAX)?;
    let parsed_lp_lock_id = lp_lock_id
        .parse::<u64>()
        .map_err(|_| ContractError::InvalidLockId {})?;
    let metadata = validate_metadata(metadata)?;
    let id = NEXT_ID.load(deps.storage)?;
    let now = env.block.time.seconds();

    verify_lp_lock(
        deps.as_ref(),
        &info.sender,
        &locker_contract,
        &pair_contract,
        &lp_token,
        parsed_lp_lock_id,
        lp_unlock_time,
    )?;
    verify_pair(deps.as_ref(), &token_contract, &pair_contract, &lp_token)?;
    verify_token_metadata(deps.as_ref(), &token_contract, &metadata)?;

    let launch = Launch {
        id,
        creator: info.sender.clone(),
        token_contract: token_contract.clone(),
        pair_contract: pair_contract.clone(),
        lp_token: lp_token.clone(),
        locker_contract: locker_contract.clone(),
        lp_lock_id: lp_lock_id.clone(),
        lp_unlock_time,
        metadata,
        status: LaunchStatus::Live,
        created_at: now,
        updated_at: now,
    };

    LAUNCHES.save(deps.storage, &token_contract, &launch)?;
    LAUNCH_INDEX.save(deps.storage, id, &token_contract)?;
    NEXT_ID.save(deps.storage, &(id + 1))?;

    Ok(Response::new()
        .add_attribute("action", "register_launch")
        .add_attribute("launch_id", id.to_string())
        .add_attribute("creator", info.sender.to_string())
        .add_attribute("token_contract", token_contract.to_string())
        .add_attribute("pair_contract", pair_contract.to_string())
        .add_attribute("lp_token", lp_token.to_string())
        .add_attribute("locker_contract", locker_contract.to_string())
        .add_attribute("lp_lock_id", lp_lock_id)
        .add_attribute("lp_unlock_time", lp_unlock_time.to_string()))
}

fn verify_lp_lock(
    deps: Deps,
    creator: &Addr,
    locker_contract: &Addr,
    pair_contract: &Addr,
    lp_token: &Addr,
    lp_lock_id: u64,
    lp_unlock_time: u64,
) -> Result<(), ContractError> {
    let lock: LockerLockResponse = deps.querier.query_wasm_smart(
        locker_contract.to_string(),
        &LockerQueryMsg::Lock {
            lock_id: lp_lock_id,
        },
    )?;

    if lock.id != lp_lock_id {
        return Err(ContractError::InvalidLpLock {
            reason: "lock id mismatch",
        });
    }
    if lock.owner != creator.as_str() {
        return Err(ContractError::InvalidLpLock {
            reason: "lock owner mismatch",
        });
    }
    if lock.lp_token != lp_token.as_str() {
        return Err(ContractError::InvalidLpLock {
            reason: "lp token mismatch",
        });
    }
    if lock.pair_contract != pair_contract.as_str() {
        return Err(ContractError::InvalidLpLock {
            reason: "pair contract mismatch",
        });
    }
    if lock.unlock_time != lp_unlock_time {
        return Err(ContractError::InvalidLpLock {
            reason: "unlock time mismatch",
        });
    }
    if lock.withdrawn {
        return Err(ContractError::InvalidLpLock {
            reason: "lock already withdrawn",
        });
    }
    if lock.amount.is_zero() {
        return Err(ContractError::InvalidLpLock {
            reason: "empty lp amount",
        });
    }

    Ok(())
}

fn verify_pair(
    deps: Deps,
    token_contract: &Addr,
    pair_contract: &Addr,
    lp_token: &Addr,
) -> Result<(), ContractError> {
    let pair: PairInfoResponse = deps
        .querier
        .query_wasm_smart(pair_contract.to_string(), &PairQueryMsg::Pair {})?;

    if pair.liquidity_token != lp_token.as_str() {
        return Err(ContractError::InvalidPair {
            reason: "liquidity token mismatch",
        });
    }

    let contains_token = pair.asset_infos.iter().any(|asset| match asset {
        PairAssetInfo::Token { contract_addr } => contract_addr == token_contract.as_str(),
        PairAssetInfo::NativeToken { .. } => false,
    });
    if !contains_token {
        return Err(ContractError::InvalidPair {
            reason: "pair does not contain launch token",
        });
    }

    Ok(())
}

fn verify_token_metadata(
    deps: Deps,
    token_contract: &Addr,
    metadata: &LaunchMetadata,
) -> Result<(), ContractError> {
    let token_info: Cw20TokenInfoResponse = deps
        .querier
        .query_wasm_smart(token_contract.to_string(), &Cw20QueryMsg::TokenInfo {})?;

    if token_info.name.trim() != metadata.name {
        return Err(ContractError::TokenMetadataMismatch { field: "name" });
    }
    if token_info.symbol.trim().to_uppercase() != metadata.symbol {
        return Err(ContractError::TokenMetadataMismatch { field: "symbol" });
    }

    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn execute_update_launch(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    token_contract: String,
    metadata: Option<LaunchMetadata>,
    status: Option<LaunchStatus>,
    lp_lock_id: Option<String>,
    lp_unlock_time: Option<u64>,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let token_contract = deps.api.addr_validate(&token_contract)?;
    let mut launch = LAUNCHES
        .may_load(deps.storage, &token_contract)?
        .ok_or_else(|| ContractError::LaunchNotFound {
            token_contract: token_contract.to_string(),
        })?;

    if info.sender != launch.creator && info.sender != config.owner {
        return Err(ContractError::Unauthorized {});
    }
    if let Some(metadata) = metadata {
        let metadata = validate_metadata(metadata)?;
        verify_token_metadata(deps.as_ref(), &token_contract, &metadata)?;
        launch.metadata = metadata;
    }
    if let Some(status) = status {
        launch.status = status;
    }
    match (lp_lock_id, lp_unlock_time) {
        (Some(lp_lock_id), Some(lp_unlock_time)) => {
            if lp_unlock_time <= env.block.time.seconds() {
                return Err(ContractError::InvalidUnlockTime {});
            }
            let lp_lock_id = normalize_required("lp_lock_id", lp_lock_id, LOCK_ID_MAX)?;
            let parsed_lp_lock_id = lp_lock_id
                .parse::<u64>()
                .map_err(|_| ContractError::InvalidLockId {})?;
            verify_lp_lock(
                deps.as_ref(),
                &launch.creator,
                &launch.locker_contract,
                &launch.pair_contract,
                &launch.lp_token,
                parsed_lp_lock_id,
                lp_unlock_time,
            )?;
            launch.lp_lock_id = lp_lock_id;
            launch.lp_unlock_time = lp_unlock_time;
        }
        (None, None) => {}
        _ => return Err(ContractError::IncompleteLpLockUpdate {}),
    }
    launch.updated_at = env.block.time.seconds();
    LAUNCHES.save(deps.storage, &token_contract, &launch)?;

    Ok(Response::new()
        .add_attribute("action", "update_launch")
        .add_attribute("token_contract", token_contract.to_string())
        .add_attribute("lp_lock_id", launch.lp_lock_id.clone())
        .add_attribute("lp_unlock_time", launch.lp_unlock_time.to_string()))
}

fn execute_update_config(
    deps: DepsMut,
    info: MessageInfo,
    owner: Option<String>,
    locker_contract: Option<String>,
) -> Result<Response, ContractError> {
    CONFIG.update(deps.storage, |mut config| -> Result<_, ContractError> {
        if info.sender != config.owner {
            return Err(ContractError::Unauthorized {});
        }
        if let Some(owner) = owner {
            config.owner = deps.api.addr_validate(&owner)?;
        }
        if let Some(locker_contract) = locker_contract {
            config.locker_contract = deps.api.addr_validate(&locker_contract)?;
        }
        Ok(config)
    })?;

    let config = CONFIG.load(deps.storage)?;
    Ok(Response::new()
        .add_attribute("action", "update_config")
        .add_attribute("owner", config.owner.to_string())
        .add_attribute("locker_contract", config.locker_contract.to_string()))
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config {} => to_json_binary(&query_config(deps)?),
        QueryMsg::Launch { token_contract } => to_json_binary(&query_launch(deps, token_contract)?),
        QueryMsg::Launches { start_after, limit } => {
            to_json_binary(&query_launches(deps, start_after, limit)?)
        }
    }
}

fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
    let config = CONFIG.load(deps.storage)?;
    Ok(ConfigResponse {
        owner: config.owner.to_string(),
        locker_contract: config.locker_contract.to_string(),
    })
}

fn query_launch(deps: Deps, token_contract: String) -> StdResult<LaunchResponse> {
    let token_contract = deps.api.addr_validate(&token_contract)?;
    let launch = LAUNCHES.load(deps.storage, &token_contract)?;
    Ok(launch_response(launch))
}

fn query_launches(
    deps: Deps,
    start_after: Option<u64>,
    limit: Option<u32>,
) -> StdResult<LaunchesResponse> {
    let limit = limit.unwrap_or(DEFAULT_QUERY_LIMIT).min(MAX_QUERY_LIMIT) as usize;
    let start = start_after.map(cw_storage_plus::Bound::exclusive);
    let launches = LAUNCH_INDEX
        .range(deps.storage, start, None, Order::Ascending)
        .map(|item| match item {
            Ok((_id, token_contract)) => match LAUNCHES.load(deps.storage, &token_contract) {
                Ok(launch) => Ok(launch_response(launch)),
                Err(error) => Err(error),
            },
            Err(error) => Err(error),
        })
        .take(limit)
        .collect::<StdResult<Vec<_>>>()?;

    Ok(LaunchesResponse { launches })
}

fn validate_metadata(metadata: LaunchMetadata) -> Result<LaunchMetadata, ContractError> {
    Ok(LaunchMetadata {
        name: normalize_required("name", metadata.name, NAME_MAX)?,
        symbol: normalize_required("symbol", metadata.symbol, SYMBOL_MAX)?.to_uppercase(),
        website: normalize_optional("website", metadata.website, URL_MAX)?,
        x_profile: normalize_optional("x_profile", metadata.x_profile, URL_MAX)?,
        description: normalize_optional("description", metadata.description, DESCRIPTION_MAX)?,
    })
}

fn normalize_required(
    field: &'static str,
    value: String,
    max: usize,
) -> Result<String, ContractError> {
    let normalized = value.trim().to_string();
    if normalized.is_empty() {
        return Err(ContractError::MissingField { field });
    }
    if normalized.len() > max {
        return Err(ContractError::FieldTooLong { field, max });
    }
    Ok(normalized)
}

fn normalize_optional(
    field: &'static str,
    value: Option<String>,
    max: usize,
) -> Result<Option<String>, ContractError> {
    match value {
        Some(value) => {
            let normalized = value.trim().to_string();
            if normalized.is_empty() {
                Ok(None)
            } else if normalized.len() > max {
                Err(ContractError::FieldTooLong { field, max })
            } else {
                Ok(Some(normalized))
            }
        }
        None => Ok(None),
    }
}

fn launch_response(launch: Launch) -> LaunchResponse {
    LaunchResponse {
        id: launch.id,
        creator: launch.creator.to_string(),
        token_contract: launch.token_contract.to_string(),
        pair_contract: launch.pair_contract.to_string(),
        lp_token: launch.lp_token.to_string(),
        locker_contract: launch.locker_contract.to_string(),
        lp_lock_id: launch.lp_lock_id,
        lp_unlock_time: launch.lp_unlock_time,
        metadata: launch.metadata,
        status: launch.status,
        created_at: launch.created_at,
        updated_at: launch.updated_at,
    }
}

#[cfg(test)]
mod tests {
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use cosmwasm_std::{
        from_json, to_json_binary, ContractResult, QuerierResult, SystemResult, WasmQuery,
    };

    use super::*;

    const CREATOR: &str = "terra1creator000000000000000000000000000000000";
    const TOKEN: &str = "terra1token00000000000000000000000000000000000";
    const PAIR: &str = "terra1pair000000000000000000000000000000000000";
    const LP: &str = "terra1lp0000000000000000000000000000000000000";
    const LOCKER: &str = "terra1lock00000000000000000000000000000000000";

    fn metadata() -> LaunchMetadata {
        LaunchMetadata {
            name: "Taco Token".to_string(),
            symbol: "taco".to_string(),
            website: Some("https://burrito.money".to_string()),
            x_profile: None,
            description: Some("A launch listing".to_string()),
        }
    }

    fn mock_registry_queries(
        unlock_time: u64,
        token_symbol: &'static str,
    ) -> impl Fn(&WasmQuery) -> QuerierResult {
        move |query| match query {
            WasmQuery::Smart { contract_addr, msg } if contract_addr == LOCKER => {
                let request: LockerQueryMsg = from_json(msg).unwrap();
                match request {
                    LockerQueryMsg::Lock { lock_id } => SystemResult::Ok(ContractResult::Ok(
                        to_json_binary(&LockerLockResponse {
                            id: lock_id,
                            owner: CREATOR.to_string(),
                            lp_token: LP.to_string(),
                            pair_contract: PAIR.to_string(),
                            amount: Uint128::new(123),
                            unlock_time,
                            created_at: unlock_time - 10,
                            withdrawn: false,
                        })
                        .unwrap(),
                    )),
                }
            }
            WasmQuery::Smart { contract_addr, msg } if contract_addr == TOKEN => {
                let request: Cw20QueryMsg = from_json(msg).unwrap();
                match request {
                    Cw20QueryMsg::TokenInfo {} => SystemResult::Ok(ContractResult::Ok(
                        to_json_binary(&Cw20TokenInfoResponse {
                            name: "Taco Token".to_string(),
                            symbol: token_symbol.to_string(),
                            decimals: 6,
                            total_supply: Uint128::new(1_000_000_000),
                        })
                        .unwrap(),
                    )),
                }
            }
            WasmQuery::Smart { contract_addr, msg } if contract_addr == PAIR => {
                let _: PairQueryMsg = from_json(msg).unwrap();
                SystemResult::Ok(ContractResult::Ok(
                    to_json_binary(&PairInfoResponse {
                        asset_infos: vec![
                            PairAssetInfo::Token {
                                contract_addr: TOKEN.to_string(),
                            },
                            PairAssetInfo::NativeToken {
                                denom: "uluna".to_string(),
                            },
                        ],
                        liquidity_token: LP.to_string(),
                    })
                    .unwrap(),
                ))
            }
            _ => SystemResult::Ok(ContractResult::Err("unsupported wasm query".to_string())),
        }
    }

    #[test]
    fn registers_launch() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        instantiate(
            deps.as_mut(),
            env.clone(),
            mock_info(CREATOR, &[]),
            InstantiateMsg {
                owner: None,
                locker_contract: LOCKER.to_string(),
            },
        )
        .unwrap();
        let unlock_time = env.block.time.seconds() + 100;
        deps.querier
            .update_wasm(mock_registry_queries(unlock_time, "TACO"));

        execute(
            deps.as_mut(),
            env.clone(),
            mock_info(CREATOR, &[]),
            ExecuteMsg::RegisterLaunch {
                token_contract: TOKEN.to_string(),
                pair_contract: PAIR.to_string(),
                lp_token: LP.to_string(),
                locker_contract: LOCKER.to_string(),
                lp_lock_id: "1".to_string(),
                lp_unlock_time: unlock_time,
                metadata: metadata(),
            },
        )
        .unwrap();

        let response = query(
            deps.as_ref(),
            env,
            QueryMsg::Launch {
                token_contract: TOKEN.to_string(),
            },
        )
        .unwrap();
        let launch: LaunchResponse = from_json(response).unwrap();
        assert_eq!(launch.id, 1);
        assert_eq!(launch.metadata.symbol, "TACO");
    }

    #[test]
    fn rejects_listing_when_metadata_does_not_match_cw20_token_info() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        instantiate(
            deps.as_mut(),
            env.clone(),
            mock_info(CREATOR, &[]),
            InstantiateMsg {
                owner: None,
                locker_contract: LOCKER.to_string(),
            },
        )
        .unwrap();
        let unlock_time = env.block.time.seconds() + 100;
        deps.querier
            .update_wasm(mock_registry_queries(unlock_time, "REAL"));

        let error = execute(
            deps.as_mut(),
            env,
            mock_info(CREATOR, &[]),
            ExecuteMsg::RegisterLaunch {
                token_contract: TOKEN.to_string(),
                pair_contract: PAIR.to_string(),
                lp_token: LP.to_string(),
                locker_contract: LOCKER.to_string(),
                lp_lock_id: "1".to_string(),
                lp_unlock_time: unlock_time,
                metadata: metadata(),
            },
        )
        .unwrap_err();

        match error {
            ContractError::TokenMetadataMismatch { field: "symbol" } => {}
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[test]
    fn creator_can_update_metadata() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        instantiate(
            deps.as_mut(),
            env.clone(),
            mock_info(CREATOR, &[]),
            InstantiateMsg {
                owner: None,
                locker_contract: LOCKER.to_string(),
            },
        )
        .unwrap();
        let unlock_time = env.block.time.seconds() + 100;
        deps.querier
            .update_wasm(mock_registry_queries(unlock_time, "TACO"));

        execute(
            deps.as_mut(),
            env.clone(),
            mock_info(CREATOR, &[]),
            ExecuteMsg::RegisterLaunch {
                token_contract: TOKEN.to_string(),
                pair_contract: PAIR.to_string(),
                lp_token: LP.to_string(),
                locker_contract: LOCKER.to_string(),
                lp_lock_id: "1".to_string(),
                lp_unlock_time: unlock_time,
                metadata: metadata(),
            },
        )
        .unwrap();

        execute(
            deps.as_mut(),
            env.clone(),
            mock_info(CREATOR, &[]),
            ExecuteMsg::UpdateLaunch {
                token_contract: TOKEN.to_string(),
                metadata: Some(LaunchMetadata {
                    name: "Taco Token".to_string(),
                    symbol: "TACO".to_string(),
                    website: None,
                    x_profile: None,
                    description: Some("Updated".to_string()),
                }),
                status: Some(LaunchStatus::Hidden),
                lp_lock_id: None,
                lp_unlock_time: None,
            },
        )
        .unwrap();

        let response = query(
            deps.as_ref(),
            env,
            QueryMsg::Launch {
                token_contract: TOKEN.to_string(),
            },
        )
        .unwrap();
        let launch: LaunchResponse = from_json(response).unwrap();
        assert_eq!(launch.metadata.description, Some("Updated".to_string()));
        assert_eq!(launch.status.as_str(), "hidden");
    }

    #[test]
    fn creator_can_update_lp_lock() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        instantiate(
            deps.as_mut(),
            env.clone(),
            mock_info(CREATOR, &[]),
            InstantiateMsg {
                owner: None,
                locker_contract: LOCKER.to_string(),
            },
        )
        .unwrap();
        let unlock_time = env.block.time.seconds() + 100;
        deps.querier
            .update_wasm(mock_registry_queries(unlock_time, "TACO"));

        execute(
            deps.as_mut(),
            env.clone(),
            mock_info(CREATOR, &[]),
            ExecuteMsg::RegisterLaunch {
                token_contract: TOKEN.to_string(),
                pair_contract: PAIR.to_string(),
                lp_token: LP.to_string(),
                locker_contract: LOCKER.to_string(),
                lp_lock_id: "1".to_string(),
                lp_unlock_time: unlock_time,
                metadata: metadata(),
            },
        )
        .unwrap();

        let next_unlock_time = env.block.time.seconds() + 200;
        deps.querier
            .update_wasm(mock_registry_queries(next_unlock_time, "TACO"));

        execute(
            deps.as_mut(),
            env.clone(),
            mock_info(CREATOR, &[]),
            ExecuteMsg::UpdateLaunch {
                token_contract: TOKEN.to_string(),
                metadata: None,
                status: None,
                lp_lock_id: Some("2".to_string()),
                lp_unlock_time: Some(next_unlock_time),
            },
        )
        .unwrap();

        let response = query(
            deps.as_ref(),
            env,
            QueryMsg::Launch {
                token_contract: TOKEN.to_string(),
            },
        )
        .unwrap();
        let launch: LaunchResponse = from_json(response).unwrap();
        assert_eq!(launch.lp_lock_id, "2");
        assert_eq!(launch.lp_unlock_time, next_unlock_time);
    }

    #[test]
    fn rejects_listing_when_lp_lock_does_not_match_creator() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        instantiate(
            deps.as_mut(),
            env.clone(),
            mock_info(CREATOR, &[]),
            InstantiateMsg {
                owner: None,
                locker_contract: LOCKER.to_string(),
            },
        )
        .unwrap();
        let unlock_time = env.block.time.seconds() + 100;
        deps.querier.update_wasm(move |query| match query {
            WasmQuery::Smart { contract_addr, msg } if contract_addr == LOCKER => {
                let request: LockerQueryMsg = from_json(msg).unwrap();
                match request {
                    LockerQueryMsg::Lock { lock_id } => SystemResult::Ok(ContractResult::Ok(
                        to_json_binary(&LockerLockResponse {
                            id: lock_id,
                            owner: "terra1other0000000000000000000000000000000000".to_string(),
                            lp_token: LP.to_string(),
                            pair_contract: PAIR.to_string(),
                            amount: Uint128::new(123),
                            unlock_time,
                            created_at: unlock_time - 10,
                            withdrawn: false,
                        })
                        .unwrap(),
                    )),
                }
            }
            _ => SystemResult::Ok(ContractResult::Err("unsupported wasm query".to_string())),
        });

        let error = execute(
            deps.as_mut(),
            env,
            mock_info(CREATOR, &[]),
            ExecuteMsg::RegisterLaunch {
                token_contract: TOKEN.to_string(),
                pair_contract: PAIR.to_string(),
                lp_token: LP.to_string(),
                locker_contract: LOCKER.to_string(),
                lp_lock_id: "1".to_string(),
                lp_unlock_time: unlock_time,
                metadata: metadata(),
            },
        )
        .unwrap_err();

        match error {
            ContractError::InvalidLpLock {
                reason: "lock owner mismatch",
            } => {}
            other => panic!("unexpected error: {other:?}"),
        }
    }
}
