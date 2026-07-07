#Solidity Skill Test — Starter Codebase

This is the starter project for the Solidity smart contract skill test.

It's a small **Vault contract**: users can deposit and withdraw ETH, and the
contract owner can perform a couple of administrative actions.

The contract **compiles**, but it contains real bugs. Your job (Part 1) is to
find and fix them. Part 2 asks you to extend the contract with new features.
See the full task description (shared separately) for details.

## Project structure

```
/
├── contracts/
│   └── Vault.sol          # the contract — this is what you'll be editing
├── test/
│   └── Vault.test.js       # starter test file (incomplete — extend it)
├── hardhat.config.js
├── package.json
└── README.md
```

## Prerequisites

- Node.js 18+
- npm or yarn

## Getting started

```bash
npm install
npx hardhat compile
npx hardhat test
```
