const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Vault - Security Regression Tests", function () {
  async function deployVault() {
    const [owner, alice, bob, attacker] = await ethers.getSigners();

    const Vault = await ethers.getContractFactory("Vault");
    const vault = await Vault.deploy();

    return { vault, owner, alice, bob, attacker };
  }

  describe("Over-withdraw / accounting", function () {
    it("should reject withdrawal greater than user balance", async function () {
      const { vault, alice } = await deployVault();

      await vault.connect(alice).deposit({
        value: ethers.parseEther("1"),
      });

      await expect(
        vault.connect(alice).withdraw(ethers.parseEther("2"))
      ).to.be.reverted;
    });
  });

  describe("tx.origin ownership bypass", function () {
    it("rejects an ownership change through a contract relay", async function () {
      const { vault, owner, attacker } = await deployVault();

      const Relay = await ethers.getContractFactory("OwnerRelay");
      const relay = await Relay.deploy();

      await relay.waitForDeployment();

      await expect(
        relay.connect(owner).changeVaultOwner(
          await vault.getAddress(),
          attacker.address
        )
      ).to.be.revertedWith("Not owner");

      expect(await vault.owner()).to.equal(owner.address);
    });
  });

  describe("emergencyWithdraw access control", function () {
    it("demonstrates that a non-owner can trigger emergencyWithdraw", async function () {
      const { vault, owner, alice } = await deployVault();

      await vault.connect(owner).deposit({
        value: ethers.parseEther("1"),
      });

      await vault.connect(alice).emergencyWithdraw();

      const vaultBalance = await ethers.provider.getBalance(
        await vault.getAddress()
      );

      expect(vaultBalance).to.equal(0n);
      expect(await vault.owner()).to.equal(owner.address);
    });
  });
});

describe("Vault - Reentrancy Attack", function () {
  it("rejects a reentrant withdrawal attempt", async function () {
    const [, victim, attacker] = await ethers.getSigners();

    const Vault = await ethers.getContractFactory("Vault");
    const vault = await Vault.deploy();

    const Attacker = await ethers.getContractFactory("ReentrancyAttacker");

    const attackerContract = await Attacker.deploy(
      await vault.getAddress()
    );

    await attackerContract.waitForDeployment();

    // Victim deposits 5 ETH.
    await vault.connect(victim).deposit({
      value: ethers.parseEther("5"),
    });

    // Attacker legitimately deposits 1 ETH.
    await attackerContract.connect(attacker).deposit({
      value: ethers.parseEther("1"),
    });

    const vaultAddress = await vault.getAddress();
    const attackerAddress = await attackerContract.getAddress();

    const vaultBalanceBefore =
      await ethers.provider.getBalance(vaultAddress);

    const attackerBalanceBefore =
      await vault.balances(attackerAddress);

    expect(vaultBalanceBefore).to.equal(ethers.parseEther("6"));
    expect(attackerBalanceBefore).to.equal(ethers.parseEther("1"));

    // The reentrant attack must fail.
    await expect(
      attackerContract.connect(attacker).attack()
    ).to.be.reverted;

    // The reverted transaction must leave the vault unchanged.
    const vaultBalanceAfter =
      await ethers.provider.getBalance(vaultAddress);

    const attackerBalanceAfter =
      await vault.balances(attackerAddress);

    const victimBalanceAfter =
      await vault.balances(victim.address);

    expect(vaultBalanceAfter).to.equal(ethers.parseEther("6"));
    expect(attackerBalanceAfter).to.equal(ethers.parseEther("1"));
    expect(victimBalanceAfter).to.equal(ethers.parseEther("5"));
  });
});