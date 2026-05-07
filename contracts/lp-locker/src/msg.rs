use cosmwasm_schema::cw_serde;
use cosmwasm_std::Uint128;
use cw20::Cw20ReceiveMsg;

#[cw_serde]
pub struct InstantiateMsg {
    pub owner: Option<String>,
}

#[cw_serde]
pub enum ExecuteMsg {
    Receive(Cw20ReceiveMsg),
    Withdraw { lock_id: u64 },
    UpdateConfig { owner: String },
}

#[cw_serde]
pub enum Cw20HookMsg {
    Lock {
        owner: Option<String>,
        pair_contract: String,
        unlock_time: u64,
    },
}

#[cw_serde]
pub enum QueryMsg {
    Config {},
    Lock { lock_id: u64 },
    LocksByOwner {
        owner: String,
        start_after: Option<u64>,
        limit: Option<u32>,
    },
    LocksByLpToken {
        lp_token: String,
        start_after: Option<u64>,
        limit: Option<u32>,
    },
}

#[cw_serde]
pub struct ConfigResponse {
    pub owner: String,
    pub min_lock_seconds: u64,
    pub max_lock_seconds: u64,
}

#[cw_serde]
pub struct LockResponse {
    pub id: u64,
    pub owner: String,
    pub lp_token: String,
    pub pair_contract: String,
    pub amount: Uint128,
    pub unlock_time: u64,
    pub created_at: u64,
    pub withdrawn: bool,
}

#[cw_serde]
pub struct LocksResponse {
    pub locks: Vec<LockResponse>,
}
