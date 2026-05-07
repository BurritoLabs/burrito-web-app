use cosmwasm_std::{StdError, Uint128};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("unauthorized")]
    Unauthorized {},

    #[error("amount must be greater than zero")]
    InvalidAmount {},

    #[error("lock duration must be between {min_seconds} and {max_seconds} seconds")]
    InvalidUnlockTime { min_seconds: u64, max_seconds: u64 },

    #[error("lock {lock_id} was not found")]
    LockNotFound { lock_id: u64 },

    #[error("lock {lock_id} has already been withdrawn")]
    LockAlreadyWithdrawn { lock_id: u64 },

    #[error("lock {lock_id} is still active until {unlock_time}")]
    LockStillActive { lock_id: u64, unlock_time: u64 },

    #[error("withdraw amount is zero for lock {lock_id}")]
    EmptyWithdraw { lock_id: u64 },

    #[error("invalid query limit")]
    InvalidQueryLimit {},

    #[error("cannot lock {amount} LP tokens with an empty hook message")]
    MissingHook { amount: Uint128 },
}
