use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Uint128};
use cw_storage_plus::{Item, Map};

pub const MIN_LOCK_SECONDS: u64 = 30 * 24 * 60 * 60;
pub const MAX_LOCK_SECONDS: u64 = 3650 * 24 * 60 * 60;
pub const DEFAULT_QUERY_LIMIT: u32 = 20;
pub const MAX_QUERY_LIMIT: u32 = 100;

#[cw_serde]
pub struct Config {
    pub owner: Addr,
}

#[cw_serde]
pub struct Lock {
    pub id: u64,
    pub owner: Addr,
    pub lp_token: Addr,
    pub pair_contract: Addr,
    pub amount: Uint128,
    pub unlock_time: u64,
    pub created_at: u64,
    pub withdrawn: bool,
}

pub const CONFIG: Item<Config> = Item::new("config");
pub const NEXT_LOCK_ID: Item<u64> = Item::new("next_lock_id");
pub const LOCKS: Map<u64, Lock> = Map::new("locks");
pub const LOCK_IDS_BY_OWNER: Map<(&Addr, u64), bool> = Map::new("locks_by_owner");
pub const LOCK_IDS_BY_LP_TOKEN: Map<(&Addr, u64), bool> = Map::new("locks_by_lp_token");
