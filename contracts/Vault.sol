// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Skill Test — Vault
/// @notice A simple ETH vault. Users deposit and withdraw their own funds;
///         the contract owner can perform a couple of administrative actions.
contract Vault is ReentrancyGuard {
    error InsufficientBalance(uint256 requested, uint256 available);
    error TransferFailed();
    error ExceedsWithdrawalLimit(uint256 requested, uint256 maxAllowed);
    error VaultPaused();

    event Deposited(address indexed user, uint256 amount, uint256 newBalance);

    event Withdrawn(address indexed user, uint256 amount, uint256 newBalance);

    address public owner;
    mapping(address => uint256) public balances;

    // Unlimited by default so adding the feature does not change
    // the original withdrawal behavior until the owner configures a limit.
    uint256 public maxWithdrawal = type(uint256).max;

    bool public paused;

    constructor() {
        owner = msg.sender;
    }

    /// @notice Deposit ETH into the caller's balance.
    function deposit() external payable {
        if (paused) {
            revert VaultPaused();
        }

        balances[msg.sender] += msg.value;

        emit Deposited(msg.sender, msg.value, balances[msg.sender]);
    }

    /// @notice Withdraw ETH from the caller's balance.
    /// @dev Uses CEI and ReentrancyGuard as defense-in-depth.
    function withdraw(uint256 amount) external nonReentrant {
        if (paused) {
            revert VaultPaused();
        }

        uint256 currentBalance = balances[msg.sender];

        if (amount > currentBalance) {
            revert InsufficientBalance(amount, currentBalance);
        }

        if (amount > maxWithdrawal) {
            revert ExceedsWithdrawalLimit(amount, maxWithdrawal);
        }

        balances[msg.sender] = currentBalance - amount;

        emit Withdrawn(msg.sender, amount, balances[msg.sender]);

        (bool success, ) = msg.sender.call{value: amount}("");

        if (!success) {
            revert TransferFailed();
        }
    }

    /// @notice Configure the maximum amount allowed in a single withdrawal.
    function setMaxWithdrawal(uint256 newMaxWithdrawal) external {
        require(msg.sender == owner, "Not owner");

        maxWithdrawal = newMaxWithdrawal;
    }

    /// @notice Pause or unpause deposits and withdrawals.
    function setPaused(bool newPaused) external {
        require(msg.sender == owner, "Not owner");

        paused = newPaused;
    }

    function setOwner(address newOwner) external {
        require(msg.sender == owner, "Not owner");
        owner = newOwner;
    }

    function emergencyWithdraw() external {
        require(msg.sender == owner, "Not owner");
        payable(owner).transfer(address(this).balance);
    }
}
