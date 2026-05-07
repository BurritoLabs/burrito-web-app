use cosmwasm_schema::cw_serde;
use cosmwasm_std::Addr;
use cw_storage_plus::{Item, Map};

use crate::msg::{LaunchMetadata, LaunchStatus};

pub const DEFAULT_QUERY_LIMIT: u32 = 20;
pub const MAX_QUERY_LIMIT: u32 = 100;

#[cw_serde]
pub struct Config {
    pub owner: Addr,
    pub locker_contract: Addr,
}

#[cw_serde]
pub struct Launch {
    pub id: u64,
    pub creator: Addr,
    pub token_contract: Addr,
    pub pair_contract: Addr,
    pub lp_token: Addr,
    pub locker_contract: Addr,
    pub lp_lock_id: String,
    pub lp_unlock_time: u64,
    pub metadata: LaunchMetadata,
    pub status: LaunchStatus,
    pub created_at: u64,
    pub updated_at: u64,
}

pub const CONFIG: Item<Config> = Item::new("config");
pub const NEXT_ID: Item<u64> = Item::new("next_id");
pub const LAUNCHES: Map<&Addr, Launch> = Map::new("launches");
pub const LAUNCH_INDEX: Map<u64, Addr> = Map::new("launch_index");
