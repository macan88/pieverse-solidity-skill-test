const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Vault", function () {
  async function deployVault() {
    const [owner, alice, bob] = await ethers.getSigners();
    const Vault = await ethers.getContractFactory("Vault");
    const vault = await Vault.deploy();
    return { vault, owner, alice, bob };
  }

  it("lets a user deposit and see their balance go up", async function () {
    const { vault, alice } = await deployVault();

    await vault.connect(alice).deposit({ value: ethers.parseEther("1") });

    expect(await vault.balances(alice.address)).to.equal(ethers.parseEther("1"));
  });

  // TODO (candidate): add tests covering:
  // - withdraw actually decreases balances[user] and pays out the correct amount
  // - a malicious contract cannot re-enter withdraw() to drain more than its balance
  // - withdraw cannot be called for more than the caller's balance (no silent underflow)
  // - ownership can only be changed by the actual owner (not via tx.origin phishing)
  // - emergencyWithdraw can only be called by the owner
  // - any Part 2 features you implement (events, withdrawal limit, pause, ownership transfer flow, etc.)
});
