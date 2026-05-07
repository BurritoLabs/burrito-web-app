use cosmwasm_std::{
    entry_point, from_json, to_json_binary, Addr, Binary, Deps, DepsMut, Env, MessageInfo,
    Order, Response, StdResult, WasmMsg,
};
use cw20::{Cw20ExecuteMsg, Cw20ReceiveMsg};

use crate::error::ContractError;
use crate::msg::{
    ConfigResponse, Cw20HookMsg, ExecuteMsg, InstantiateMsg, LockResponse, LocksResponse,
    QueryMsg,
};
use crate::state::{
    Config, Lock, CONFIG, DEFAULT_QUERY_LIMIT, LOCKS, MAX_LOCK_SECONDS, MAX_QUERY_LIMIT,
    MIN_LOCK_SECONDS, NEXT_LOCK_ID,
};

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

    CONFIG.save(deps.storage, &Config { owner: owner.clone() })?;
    NEXT_LOCK_ID.save(deps.storage, &1)?;

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
    }
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
    let owner = deps.api.addr_validate(&owner)?;
    query_locks(deps, start_after, limit, |lock| lock.owner == owner)
}

fn query_locks_by_lp_token(
    deps: Deps,
    lp_token: String,
    start_after: Option<u64>,
    limit: Option<u32>,
) -> StdResult<LocksResponse> {
    let lp_token = deps.api.addr_validate(&lp_token)?;
    query_locks(deps, start_after, limit, |lock| lock.lp_token == lp_token)
}

fn query_locks<F>(
    deps: Deps,
    start_after: Option<u64>,
    limit: Option<u32>,
    filter: F,
) -> StdResult<LocksResponse>
where
    F: Fn(&Lock) -> bool,
{
    let limit = limit.unwrap_or(DEFAULT_QUERY_LIMIT).min(MAX_QUERY_LIMIT) as usize;
    let start = start_after.map(cw_storage_plus::Bound::exclusive);
    let locks = LOCKS
        .range(deps.storage, start, None, Order::Ascending)
        .filter_map(|item| match item {
            Ok((_id, lock)) if filter(&lock) => Some(Ok(lock_response(lock))),
            Ok(_) => None,
            Err(error) => Some(Err(error)),
        })
        .take(limit)
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
    use cosmwasm_std::{attr, from_json, to_json_binary, Uint128};

    use super::*;
    use crate::msg::LocksResponse;

    const CREATOR: &str = "terra1creator000000000000000000000000000000000";
    const OWNER: &str = "terra1owner00000000000000000000000000000000000";
    const LP_TOKEN: &str = "terra1lp0000000000000000000000000000000000000";
    const PAIR: &str = "terra1pair000000000000000000000000000000000000";

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
}
