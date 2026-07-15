use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("unauthorized")]
    Unauthorized {},

    #[error("launch already exists for token {token_contract}")]
    LaunchAlreadyExists { token_contract: String },

    #[error("launch was not found for token {token_contract}")]
    LaunchNotFound { token_contract: String },

    #[error("{field} is required")]
    MissingField { field: &'static str },

    #[error("{field} is too long, max {max} characters")]
    FieldTooLong { field: &'static str, max: usize },

    #[error("lp unlock time must be in the future")]
    InvalidUnlockTime {},

    #[error("lp lock id must be a positive integer")]
    InvalidLockId {},

    #[error("lp lock id and unlock time must be updated together")]
    IncompleteLpLockUpdate {},

    #[error("lp lock verification failed: {reason}")]
    InvalidLpLock { reason: &'static str },

    #[error("metadata field {field} does not match CW20 token info")]
    TokenMetadataMismatch { field: &'static str },

    #[error("locker contract is not the configured Burrito locker")]
    InvalidLockerContract {},

    #[error("pair verification failed: {reason}")]
    InvalidPair { reason: &'static str },
}
