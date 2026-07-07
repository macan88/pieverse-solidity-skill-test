# Solidity Skill Test

**Format:** Take-home practical assignment

---

## 🩹 Part 1 — Find and Fix the Bugs

The vault contract has **several real issues** hiding in it — spanning reentrancy, access control, and unsafe arithmetic. We're not going to point out exactly where they are; part of the exercise is finding them the way you would in a real code review or audit.

To guide your investigation, here's what should hold true in a **correct** implementation — if any of these don't, there's a bug to fix:

- [ ] A malicious contract should never be able to re-enter `withdraw()` and drain more ETH than it's actually owed.
- [ ] A user's recorded balance should never go negative or wrap around — withdrawing more than your balance should fail with a clear revert, not corrupt state.
- [ ] Only the real owner should be able to change ownership or trigger `emergencyWithdraw()` — a transaction relayed through another contract shouldn't let an attacker slip through.
- [ ] The contract's actual ETH balance should always be consistent with what `balances` says users are owed.

> 💡 Tip: Writing a test that simulates a malicious/reentrant contract calling into `withdraw()` is a great way to surface one of these issues before you even start reading line by line.

For each bug you find, briefly explain in your `NOTES.md`:
- What was wrong
- Why it was a problem (what an attacker could actually do)
- How you fixed it

---

## ✨ Part 2 — Add Features

Once the contract is correct, extend it with the following:

1. **Events** — emit `Deposited(address indexed user, uint256 amount, uint256 newBalance)` and `Withdrawn(...)` (same shape) on the respective functions.
2. **Per-transaction withdrawal limit** — add an owner-configurable `maxWithdrawal`; `withdraw` should reject any single withdrawal exceeding it, with a clear custom error (`error ExceedsWithdrawalLimit(...)` or similar).
3. **Pause / unpause** — add a `paused` flag, toggleable only by the owner, that blocks both `deposit` and `withdraw` while active.
4. **Safer ownership transfer** — replace the single-step `setOwner` with a two-step pattern (`transferOwnership(address)` + `acceptOwnership()`), so ownership can't be accidentally handed to an unreachable or incorrect address. Also add explicit reentrancy protection to `withdraw` (a `nonReentrant`-style modifier) as defense-in-depth, even after you've fixed the underlying ordering issue in Part 1.

You don't need to gold-plate every feature — working, well-tested, reasonably clean code for all four is the goal. If you run out of time, implement as many as you can and note what's left in `NOTES.md`.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Smart contract | Solidity (^0.8.24) |
| Dev environment | Hardhat |
| Testing | Hardhat + Chai/Mocha (Ethers.js) |

You're welcome to pull in OpenZeppelin contracts (e.g. for `Ownable2Step` or `ReentrancyGuard`) if you'd rather build on audited primitives than hand-roll them — either approach is fine, just note your choice in `NOTES.md`.

---

## ✅ Evaluation Criteria

| Criteria | What we're looking for |
|---|---|
| **Correctness** | Bugs are actually fixed, not just papered over |
| **Security awareness** | You reason about reentrancy, access control, and trust boundaries |
| **Solidity idioms** | Checks-effects-interactions ordering, custom errors over require strings, `msg.sender` not `tx.origin`, appropriate use of `unchecked` |
| **Testing** | Meaningful tests covering both the fixes and the new features, including an adversarial (reentrant) test case |
| **Communication** | Clear `NOTES.md` explaining what you found and why you made the choices you did |

---
