# Security Notes

## Overview

This document summarizes the security issues identified in the original `Vault` implementation, the impact of each issue, and the changes made to address them.

The implementation also includes the four requested feature additions:

* Deposit and withdrawal events
* Configurable per-transaction withdrawal limits
* Pause / unpause functionality
* Two-step ownership transfer

OpenZeppelin's `ReentrancyGuard` is used for defense-in-depth protection against reentrant calls.

---

# Part 1 — Bugs Found and Fixes

## 1. Reentrancy in `withdraw()`

### What was wrong

The original withdrawal flow was vulnerable to reentrancy because ETH was sent to the caller while the withdrawal operation was still in progress.

A malicious contract can execute code from its `receive()` or `fallback()` function when it receives ETH. That code can call back into the vault before the original withdrawal finishes.

### Why it was a problem

An attacker-controlled contract could repeatedly re-enter `withdraw()` and potentially withdraw more ETH than its legitimate recorded balance.

This is particularly dangerous for a vault because the attacker is interacting with an external contract during a state-changing operation.

### How it was fixed

The withdrawal implementation follows the Checks-Effects-Interactions (CEI) pattern:

1. Validate that the vault is not paused.
2. Read the caller's current balance.
3. Verify that the requested amount does not exceed the user's balance.
4. Verify that the requested amount does not exceed `maxWithdrawal`.
5. Decrease the user's recorded balance.
6. Emit the withdrawal event.
7. Perform the external ETH transfer.

The function is also protected with OpenZeppelin's `ReentrancyGuard`:

```solidity
function withdraw(uint256 amount) external nonReentrant
```

CEI prevents the external interaction from observing stale accounting, while `nonReentrant` provides an additional defense layer.

---

## 2. Unsafe Withdrawal Accounting / Over-Withdrawal

### What was wrong

The withdrawal path did not explicitly validate that the requested amount was less than or equal to the caller's recorded balance before updating the balance.

### Why it was a problem

A user must never be able to withdraw more ETH than their recorded balance.

Without explicit validation, an over-withdrawal request could result in invalid accounting. In older Solidity versions or unchecked arithmetic, subtracting a larger value could underflow and corrupt the stored balance.

Although Solidity `^0.8.24` provides checked arithmetic and automatically reverts on unsigned integer underflow, relying only on compiler arithmetic protection does not provide the intended business-level validation or a clear error describing why the withdrawal failed.

### How it was fixed

The implementation explicitly validates the requested amount:

```solidity
uint256 currentBalance = balances[msg.sender];

if (amount > currentBalance) {
    revert InsufficientBalance(
        amount,
        currentBalance
    );
}
```

The balance is then updated only after all validation checks pass:

```solidity
balances[msg.sender] = currentBalance - amount;
```

This makes the accounting invariant explicit and produces a meaningful custom error.

---

## 3. `tx.origin` Authorization

### What was wrong

The original ownership authorization relied on transaction-origin based authorization.

Using `tx.origin` for access control is unsafe because it represents the externally owned account that started the entire transaction, rather than the immediate caller.

### Why it was a problem

An attacker-controlled contract could potentially trick the legitimate owner into interacting with it.

If authorization were based on `tx.origin`, the malicious contract could call privileged vault functions while the owner's address remained the transaction origin.

This creates an unintended trust boundary between the owner and intermediary contracts.

### How it was fixed

Administrative authorization now uses:

```solidity
msg.sender
```

instead of:

```solidity
tx.origin
```

`msg.sender` identifies the immediate caller and therefore prevents an intermediary contract from inheriting the owner's authorization merely because the owner initiated the transaction.

The test suite includes a relay-contract scenario to verify that an ownership operation cannot be bypassed through another contract.

---

## 4. Emergency Withdrawal Access Control

### What was wrong

`emergencyWithdraw()` is a highly privileged function because it can transfer the entire ETH balance held by the vault.

The function therefore requires strict owner authorization.

### Why it was a problem

If an unauthorized account could invoke `emergencyWithdraw()`, the attacker could potentially drain all ETH held by the vault.

### How it was fixed

The function explicitly checks the immediate caller:

```solidity
require(msg.sender == owner, "Not owner");
```

Only the current owner can execute the emergency withdrawal.

The test suite verifies:

* A non-owner cannot call `emergencyWithdraw()`.
* The current owner can call it.
* A newly accepted owner can call it after a successful ownership transfer.
* The previous owner loses the privilege after ownership changes.

---

## 5. ETH Balance and User Accounting Consistency

### Security invariant

The vault's ETH should back the ETH owed to users through the `balances` mapping.

A successful withdrawal therefore needs to update accounting and transfer funds atomically.

### How it was handled

The implementation follows this sequence:

```text
Validate
   ↓
Update user accounting
   ↓
Emit event
   ↓
Transfer ETH
```

The balance is decreased before the external call.

If the ETH transfer fails, the transaction reverts. Because the transaction is atomic, the balance update and event are also reverted.

This prevents the vault from ending up with a permanently reduced user balance when the corresponding ETH transfer did not succeed.

The security regression tests cover deposits, withdrawals, failed withdrawals, and reentrancy attempts.

---

# Part 2 — Requested Features

## 1. Deposit and Withdrawal Events

The vault now emits events for successful deposits and withdrawals.

### Deposit

```solidity
event Deposited(
    address indexed user,
    uint256 amount,
    uint256 newBalance
);
```

### Withdrawal

```solidity
event Withdrawn(
    address indexed user,
    uint256 amount,
    uint256 newBalance
);
```

The `user` address is indexed to make event filtering efficient for off-chain applications and monitoring systems.

Both events include the user's balance after the operation.

Tests verify that the emitted values are correct.

---

## 2. Per-Transaction Withdrawal Limit

The vault now supports an owner-configurable withdrawal limit:

```solidity
uint256 public maxWithdrawal;
```

The default value is:

```solidity
type(uint256).max
```

This preserves the original withdrawal behavior until the owner explicitly configures a limit.

The limit applies to each individual withdrawal transaction.

A withdrawal exceeding the configured limit reverts with:

```solidity
error ExceedsWithdrawalLimit(
    uint256 requested,
    uint256 maxAllowed
);
```

The implementation and tests cover:

* Default unlimited behavior
* Owner configuration
* Rejection of non-owner configuration
* Rejection of withdrawals above the limit
* Successful withdrawal exactly equal to the limit

---

## 3. Pause / Unpause

The vault includes an emergency pause mechanism:

```solidity
bool public paused;
```

The owner can change the state through `setPaused()`.

When paused:

* `deposit()` is rejected.
* `withdraw()` is rejected.

The implementation uses a custom error:

```solidity
error VaultPaused();
```

This provides an emergency control that can temporarily stop user fund movement without changing the underlying balances.

Tests cover:

* Default unpaused state
* Owner pause
* Owner unpause
* Unauthorized pause attempts
* Deposits while paused
* Withdrawals while paused
* Normal operation after unpausing

---

## 4. Two-Step Ownership Transfer

The original single-step ownership transfer was replaced with a two-step process:

```solidity
transferOwnership(address newOwner)
acceptOwnership()
```

### Transfer process

The current owner first selects a pending owner:

```text
Current Owner
     │
     │ transferOwnership(newOwner)
     ▼
Pending Owner
     │
     │ acceptOwnership()
     ▼
New Owner
```

Ownership does not change immediately after `transferOwnership()`.

The proposed owner must explicitly call `acceptOwnership()`.

### Security benefits

This reduces the risk of accidentally assigning ownership to an incorrect or unreachable address.

The implementation also rejects the zero address:

```solidity
if (newOwner == address(0)) {
    revert ZeroAddress();
}
```

Only the pending owner can accept the transfer:

```solidity
if (msg.sender != pendingOwner) {
    revert NotPendingOwner();
}
```

After acceptance:

* `owner` becomes the new owner.
* `pendingOwner` is cleared.
* The previous owner loses owner-only privileges.

Tests cover the complete ownership lifecycle and authorization boundaries.

---

# Reentrancy Protection

OpenZeppelin's `ReentrancyGuard` is used rather than implementing a custom reentrancy guard.

The choice was made because `ReentrancyGuard` is a widely used and reviewed security primitive, while the assessment explicitly permits OpenZeppelin dependencies.

The protection is applied directly to `withdraw()`:

```solidity
function withdraw(uint256 amount) external nonReentrant
```

This is intentionally defense-in-depth.

The underlying withdrawal logic is also structured according to CEI, so the security does not depend solely on the modifier.

---

# Access Control Model

The vault uses `msg.sender` for privileged operations.

Owner-only functions include:

* `setMaxWithdrawal()`
* `setPaused()`
* `transferOwnership()`
* `emergencyWithdraw()`

The two-step ownership model additionally protects `acceptOwnership()` by requiring:

```solidity
msg.sender == pendingOwner
```

No privileged operation relies on `tx.origin`.

---

# Error Handling

Custom errors are used where appropriate for security-sensitive validation:

```solidity
error InsufficientBalance(
    uint256 requested,
    uint256 available
);

error TransferFailed();

error ExceedsWithdrawalLimit(
    uint256 requested,
    uint256 maxAllowed
);

error VaultPaused();

error ZeroAddress();

error NotPendingOwner();
```

Custom errors provide explicit failure reasons while avoiding the higher deployment/runtime data overhead associated with revert strings for these cases.

The existing owner checks use the original `require(..., "Not owner")` style where compatibility with the existing assessment behavior was retained.

---

# Arithmetic Safety

The contract uses Solidity:

```solidity
pragma solidity ^0.8.24;
```

Solidity 0.8+ provides checked arithmetic by default.

No `unchecked` blocks were introduced because the arithmetic operations in this vault do not require bypassing Solidity's safety checks for correctness or meaningful optimization.

For withdrawals, the implementation additionally performs an explicit balance validation before subtraction.

This gives both:

1. Business-level validation with `InsufficientBalance`.
2. Compiler-level checked arithmetic as defense-in-depth.

---

# Testing

The security regression suite covers both the original security requirements and all requested features.

Current test coverage includes:

### Security

* Over-withdrawal protection
* Withdrawal accounting
* Reentrancy attack simulation
* `tx.origin` relay attack
* Owner-only emergency withdrawal
* Ownership authorization boundaries

### Events

* `Deposited` event values
* `Withdrawn` event values

### Withdrawal Limits

* Unlimited default behavior
* Owner configuration
* Non-owner rejection
* Above-limit rejection
* Exact-limit withdrawal

### Pause / Unpause

* Default state
* Owner pause
* Owner unpause
* Unauthorized pause attempt
* Deposit blocking
* Withdrawal blocking
* Recovery after unpause

### Two-Step Ownership

* Initial owner
* Starting ownership transfer
* Pending owner state
* Acceptance authorization
* Successful ownership transfer
* Pending owner clearing
* Zero-address rejection
* Non-owner transfer rejection
* Old-owner rejection
* New-owner privileges

The latest test run:

```text
30 passing
```

Additional repository validation:

```text
git diff --check
```

completed without errors.

---

# Summary

The final implementation addresses the security issues identified in the original vault while adding all four requested features.

The main security principles applied are:

* Checks-Effects-Interactions
* Explicit balance validation
* Solidity checked arithmetic
* `msg.sender` instead of `tx.origin`
* Strict owner authorization
* Two-step ownership transfer
* OpenZeppelin `ReentrancyGuard`
* Atomic state changes and external ETH transfers
* Custom errors for security-sensitive validation
* Adversarial regression testing

No additional functionality was added beyond the scope of the assessment.
