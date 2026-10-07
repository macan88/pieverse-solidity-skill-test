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

    address public owner;
    mapping(address => uint256) public balances;

    constructor() {
        owner = msg.sender;
    }

    /// @notice Deposit ETH into the caller's balance.
    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    /// @notice Withdraw `amount` ETH from the caller's balance.
    function withdraw(uint256 amount) external nonReentrant {
        uint256 currentBalance = balances[msg.sender];

        if (amount > currentBalance) {
            revert InsufficientBalance(amount, currentBalance);
        }

        // Effects before interaction.
        balances[msg.sender] = currentBalance - amount;

        // Interaction happens only after the accounting state is updated.
        (bool success, ) = msg.sender.call{value: amount}("");

        if (!success) {
            // Revert restores the balance update atomically.
            revert TransferFailed();
        }
    }

    /// @notice Transfer ownership of the vault to a new address.
    function setOwner(address newOwner) external {
        require(tx.origin == owner, "Not owner");
        owner = newOwner;
    }

    /// @notice Sweep the entire contract balance to the owner. Intended as a
    ///         break-glass recovery mechanism.
    function emergencyWithdraw() external {
        payable(owner).transfer(address(this).balance);
    }
}
