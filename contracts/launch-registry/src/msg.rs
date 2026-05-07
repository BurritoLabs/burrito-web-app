use cosmwasm_schema::cw_serde;

#[cw_serde]
pub struct InstantiateMsg {
    pub owner: Option<String>,
    pub locker_contract: String,
}

#[cw_serde]
pub enum ExecuteMsg {
    RegisterLaunch {
        token_contract: String,
        pair_contract: String,
        lp_token: String,
        locker_contract: String,
        lp_lock_id: String,
        lp_unlock_time: u64,
        metadata: LaunchMetadata,
    },
    UpdateLaunch {
        token_contract: String,
        metadata: Option<LaunchMetadata>,
        status: Option<LaunchStatus>,
    },
    UpdateConfig {
        owner: Option<String>,
        locker_contract: Option<String>,
    },
}

#[cw_serde]
pub enum QueryMsg {
    Config {},
    Launch {
        token_contract: String,
    },
    Launches {
        start_after: Option<u64>,
        limit: Option<u32>,
    },
}

#[cw_serde]
pub struct LaunchMetadata {
    pub name: String,
    pub symbol: String,
    pub website: Option<String>,
    pub x_profile: Option<String>,
    pub description: Option<String>,
}

#[cw_serde]
pub enum LaunchStatus {
    Live,
    Hidden,
}

impl LaunchStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            LaunchStatus::Live => "live",
            LaunchStatus::Hidden => "hidden",
        }
    }
}

#[cw_serde]
pub struct ConfigResponse {
    pub owner: String,
    pub locker_contract: String,
}

#[cw_serde]
pub struct LaunchResponse {
    pub id: u64,
    pub creator: String,
    pub token_contract: String,
    pub pair_contract: String,
    pub lp_token: String,
    pub locker_contract: String,
    pub lp_lock_id: String,
    pub lp_unlock_time: u64,
    pub metadata: LaunchMetadata,
    pub status: LaunchStatus,
    pub created_at: u64,
    pub updated_at: u64,
}

#[cw_serde]
pub struct LaunchesResponse {
    pub launches: Vec<LaunchResponse>,
}
