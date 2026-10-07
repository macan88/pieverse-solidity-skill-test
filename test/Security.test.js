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

      // Current implementation is vulnerable:
      // it performs the ETH transfer before the balance subtraction.
      await expect(
        vault.connect(alice).withdraw(ethers.parseEther("2"))
      ).to.be.reverted;
    });
  });

  describe("tx.origin ownership bypass", function () {
    it("should not allow a contract called by the owner to change ownership", async function () {
      const { vault, owner, attacker } = await deployVault();

      const Relay = await ethers.getContractFactory("OwnerRelay");
      const relay = await Relay.deploy();

      await relay.waitForDeployment();

      // Owner accidentally interacts with the malicious relay.
      // The relay then calls Vault.setOwner().
      //
      // Vulnerable implementation checks tx.origin instead of msg.sender.
      await relay.connect(owner).changeVaultOwner(
        await vault.getAddress(),
        attacker.address
      );

      expect(await vault.owner()).to.equal(attacker.address);
    });
  });

  describe("emergencyWithdraw access control", function () {
    it("currently allows a non-owner to trigger emergencyWithdraw", async function () {
      const { vault, owner, alice } = await deployVault();

      await vault.connect(owner).deposit({
        value: ethers.parseEther("1"),
      });

      const ownerBefore = await ethers.provider.getBalance(owner.address);

      // Current implementation has no access-control check.
      await vault.connect(alice).emergencyWithdraw();

      const vaultBalance = await ethers.provider.getBalance(
        await vault.getAddress()
      );

      expect(vaultBalance).to.equal(0n);

      // Funds went to owner even though Alice triggered the function.
      expect(await vault.owner()).to.equal(owner.address);
    });
  });
});


describe("Vault - Reentrancy Attack", function () {
  it("demonstrates that withdraw performs an external call before updating balance", async function () {
    const [owner, victim, attacker] = await ethers.getSigners();

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

    // Attacker deposits 1 ETH into its own Vault balance.
    await attackerContract.connect(attacker).deposit({
      value: ethers.parseEther("1"),
    });

    const vaultBalanceBefore = await ethers.provider.getBalance(
      await vault.getAddress()
    );

    expect(vaultBalanceBefore).to.equal(ethers.parseEther("6"));

    // Reentrant attack.
    await attackerContract.connect(attacker).attack();

    const vaultBalanceAfter = await ethers.provider.getBalance(
      await vault.getAddress()
    );

    // The vulnerable implementation can be drained beyond the
    // attacker's legitimate 1 ETH balance.
    expect(vaultBalanceAfter).to.be.lessThan(ethers.parseEther("5"));
  });
});
