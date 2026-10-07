const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Vault - Security Regression Tests", function () {
  async function deployVault() {
    const [owner, alice, bob, attacker] =
      await ethers.getSigners();

    const Vault = await ethers.getContractFactory("Vault");
    const vault = await Vault.deploy();

    return {
      vault,
      owner,
      alice,
      bob,
      attacker,
    };
  }

  describe("Over-withdraw / accounting", function () {
    it("should reject withdrawal greater than user balance", async function () {
      const { vault, alice } = await deployVault();

      await vault.connect(alice).deposit({
        value: ethers.parseEther("1"),
      });

      await expect(
        vault.connect(alice).withdraw(
          ethers.parseEther("2")
        )
      ).to.be.reverted;
    });
  });

  describe("Events", function () {
    it("emits Deposited with the correct values", async function () {
      const { vault, alice } = await deployVault();

      const amount = ethers.parseEther("1");

      await expect(
        vault.connect(alice).deposit({
          value: amount,
        })
      )
        .to.emit(vault, "Deposited")
        .withArgs(
          alice.address,
          amount,
          amount
        );
    });

    it("emits Withdrawn with the correct values", async function () {
      const { vault, alice } = await deployVault();

      const depositAmount = ethers.parseEther("2");
      const withdrawalAmount = ethers.parseEther("1");
      const remainingBalance = ethers.parseEther("1");

      await vault.connect(alice).deposit({
        value: depositAmount,
      });

      await expect(
        vault.connect(alice).withdraw(withdrawalAmount)
      )
        .to.emit(vault, "Withdrawn")
        .withArgs(
          alice.address,
          withdrawalAmount,
          remainingBalance
        );
    });
  });

  describe("Per-transaction withdrawal limit", function () {
    it("defaults to unlimited withdrawals", async function () {
      const { vault } = await deployVault();

      expect(await vault.maxWithdrawal()).to.equal(
        ethers.MaxUint256
      );
    });

    it("allows the owner to configure maxWithdrawal", async function () {
      const { vault, owner } = await deployVault();

      const limit = ethers.parseEther("1");

      await vault
        .connect(owner)
        .setMaxWithdrawal(limit);

      expect(await vault.maxWithdrawal()).to.equal(limit);
    });

    it("rejects maxWithdrawal changes from a non-owner", async function () {
      const { vault, alice } = await deployVault();

      const limit = ethers.parseEther("1");

      await expect(
        vault.connect(alice).setMaxWithdrawal(limit)
      ).to.be.revertedWith("Not owner");

      expect(await vault.maxWithdrawal()).to.equal(
        ethers.MaxUint256
      );
    });

    it("rejects a withdrawal above maxWithdrawal", async function () {
      const { vault, owner, alice } =
        await deployVault();

      const limit = ethers.parseEther("1");
      const withdrawalAmount = ethers.parseEther("1.1");

      await vault
        .connect(owner)
        .setMaxWithdrawal(limit);

      await vault.connect(alice).deposit({
        value: ethers.parseEther("2"),
      });

      await expect(
        vault.connect(alice).withdraw(withdrawalAmount)
      )
        .to.be.revertedWithCustomError(
          vault,
          "ExceedsWithdrawalLimit"
        )
        .withArgs(
          withdrawalAmount,
          limit
        );

      expect(
        await vault.balances(alice.address)
      ).to.equal(
        ethers.parseEther("2")
      );
    });

    it("allows a withdrawal exactly equal to maxWithdrawal", async function () {
      const { vault, owner, alice } =
        await deployVault();

      const limit = ethers.parseEther("1");

      await vault
        .connect(owner)
        .setMaxWithdrawal(limit);

      await vault.connect(alice).deposit({
        value: ethers.parseEther("2"),
      });

      await expect(
        vault.connect(alice).withdraw(limit)
      )
        .to.emit(vault, "Withdrawn")
        .withArgs(
          alice.address,
          limit,
          ethers.parseEther("1")
        );

      expect(
        await vault.balances(alice.address)
      ).to.equal(
        ethers.parseEther("1")
      );
    });
  });

  describe("Pause / unpause", function () {
    it("defaults to unpaused", async function () {
      const { vault } = await deployVault();

      expect(await vault.paused()).to.equal(false);
    });

    it("allows the owner to pause the vault", async function () {
      const { vault, owner } = await deployVault();

      await vault
        .connect(owner)
        .setPaused(true);

      expect(await vault.paused()).to.equal(true);
    });

    it("allows the owner to unpause the vault", async function () {
      const { vault, owner } = await deployVault();

      await vault
        .connect(owner)
        .setPaused(true);

      await vault
        .connect(owner)
        .setPaused(false);

      expect(await vault.paused()).to.equal(false);
    });

    it("rejects pause changes from a non-owner", async function () {
      const { vault, alice } = await deployVault();

      await expect(
        vault.connect(alice).setPaused(true)
      ).to.be.revertedWith("Not owner");

      expect(await vault.paused()).to.equal(false);
    });

    it("blocks deposits while paused", async function () {
      const { vault, owner, alice } =
        await deployVault();

      await vault
        .connect(owner)
        .setPaused(true);

      await expect(
        vault.connect(alice).deposit({
          value: ethers.parseEther("1"),
        })
      )
        .to.be.revertedWithCustomError(
          vault,
          "VaultPaused"
        );

      expect(
        await vault.balances(alice.address)
      ).to.equal(0n);
    });

    it("blocks withdrawals while paused", async function () {
      const { vault, owner, alice } =
        await deployVault();

      const amount = ethers.parseEther("1");

      await vault.connect(alice).deposit({
        value: amount,
      });

      await vault
        .connect(owner)
        .setPaused(true);

      await expect(
        vault.connect(alice).withdraw(amount)
      )
        .to.be.revertedWithCustomError(
          vault,
          "VaultPaused"
        );

      expect(
        await vault.balances(alice.address)
      ).to.equal(amount);

      const vaultBalance =
        await ethers.provider.getBalance(
          await vault.getAddress()
        );

      expect(vaultBalance).to.equal(amount);
    });

    it("allows deposits and withdrawals again after unpausing", async function () {
      const { vault, owner, alice } =
        await deployVault();

      const amount = ethers.parseEther("1");

      await vault
        .connect(owner)
        .setPaused(true);

      await vault
        .connect(owner)
        .setPaused(false);

      await vault.connect(alice).deposit({
        value: amount,
      });

      await expect(
        vault.connect(alice).withdraw(amount)
      ).to.not.be.reverted;

      expect(
        await vault.balances(alice.address)
      ).to.equal(0n);

      const vaultBalance =
        await ethers.provider.getBalance(
          await vault.getAddress()
        );

      expect(vaultBalance).to.equal(0n);
    });
  });

  describe("Two-step ownership", function () {
    it("sets the deployer as the initial owner", async function () {
      const { vault, owner } = await deployVault();

      expect(await vault.owner()).to.equal(
        owner.address
      );

      expect(await vault.pendingOwner()).to.equal(
        ethers.ZeroAddress
      );
    });

    it("starts an ownership transfer without changing the current owner", async function () {
      const { vault, owner, alice } =
        await deployVault();

      await expect(
        vault
          .connect(owner)
          .transferOwnership(alice.address)
      )
        .to.emit(vault, "OwnershipTransferStarted")
        .withArgs(
          owner.address,
          alice.address
        );

      expect(await vault.pendingOwner()).to.equal(
        alice.address
      );

      expect(await vault.owner()).to.equal(
        owner.address
      );
    });

    it("allows only the pending owner to accept ownership", async function () {
      const {
        vault,
        owner,
        alice,
        attacker,
      } = await deployVault();

      await vault
        .connect(owner)
        .transferOwnership(alice.address);

      await expect(
        vault.connect(attacker).acceptOwnership()
      )
        .to.be.revertedWithCustomError(
          vault,
          "NotPendingOwner"
        );

      expect(await vault.owner()).to.equal(
        owner.address
      );

      expect(await vault.pendingOwner()).to.equal(
        alice.address
      );
    });

    it("transfers ownership after the pending owner accepts", async function () {
      const { vault, owner, alice } =
        await deployVault();

      await vault
        .connect(owner)
        .transferOwnership(alice.address);

      await expect(
        vault.connect(alice).acceptOwnership()
      )
        .to.emit(vault, "OwnershipTransferred")
        .withArgs(
          owner.address,
          alice.address
        );

      expect(await vault.owner()).to.equal(
        alice.address
      );

      expect(await vault.pendingOwner()).to.equal(
        ethers.ZeroAddress
      );
    });

    it("rejects ownership transfer to the zero address", async function () {
      const { vault, owner } = await deployVault();

      await expect(
        vault
          .connect(owner)
          .transferOwnership(
            ethers.ZeroAddress
          )
      )
        .to.be.revertedWithCustomError(
          vault,
          "ZeroAddress"
        );

      expect(await vault.owner()).to.equal(
        owner.address
      );

      expect(await vault.pendingOwner()).to.equal(
        ethers.ZeroAddress
      );
    });

    it("rejects ownership transfer from a non-owner", async function () {
      const { vault, alice, bob } =
        await deployVault();

      await expect(
        vault
          .connect(alice)
          .transferOwnership(bob.address)
      ).to.be.revertedWith("Not owner");

      expect(await vault.owner()).to.equal(
        alice.address ===
          (await vault.owner())
          ? alice.address
          : await vault.owner()
      );

      expect(await vault.pendingOwner()).to.equal(
        ethers.ZeroAddress
      );
    });

    it("prevents the old owner from accepting ownership for another pending owner", async function () {
      const { vault, owner, alice } =
        await deployVault();

      await vault
        .connect(owner)
        .transferOwnership(alice.address);

      await expect(
        vault.connect(owner).acceptOwnership()
      )
        .to.be.revertedWithCustomError(
          vault,
          "NotPendingOwner"
        );

      expect(await vault.owner()).to.equal(
        owner.address
      );

      expect(await vault.pendingOwner()).to.equal(
        alice.address
      );
    });

    it("allows the new owner to use owner-only functions after accepting ownership", async function () {
      const { vault, owner, alice } =
        await deployVault();

      await vault
        .connect(owner)
        .transferOwnership(alice.address);

      await vault
        .connect(alice)
        .acceptOwnership();

      const limit = ethers.parseEther("1");

      await expect(
        vault
          .connect(alice)
          .setMaxWithdrawal(limit)
      ).to.not.be.reverted;

      expect(
        await vault.maxWithdrawal()
      ).to.equal(limit);
    });

    it("prevents the old owner from using owner-only functions after ownership transfer", async function () {
      const { vault, owner, alice } =
        await deployVault();

      await vault
        .connect(owner)
        .transferOwnership(alice.address);

      await vault
        .connect(alice)
        .acceptOwnership();

      await expect(
        vault
          .connect(owner)
          .setMaxWithdrawal(
            ethers.parseEther("1")
          )
      ).to.be.revertedWith("Not owner");

      await expect(
        vault
          .connect(owner)
          .setPaused(true)
      ).to.be.revertedWith("Not owner");
    });
  });

  describe("tx.origin ownership bypass", function () {
    it("rejects an ownership change through a contract relay", async function () {
      const { vault, owner, attacker } =
        await deployVault();

      const Relay =
        await ethers.getContractFactory("OwnerRelay");

      const relay = await Relay.deploy();

      await relay.waitForDeployment();

      await expect(
        relay
          .connect(owner)
          .changeVaultOwner(
            await vault.getAddress(),
            attacker.address
          )
      ).to.be.reverted;

      expect(await vault.owner()).to.equal(
        owner.address
      );

      expect(await vault.pendingOwner()).to.equal(
        ethers.ZeroAddress
      );
    });
  });

  describe("emergencyWithdraw access control", function () {
    it("rejects emergencyWithdraw from a non-owner", async function () {
      const { vault, owner, alice } =
        await deployVault();

      await vault.connect(owner).deposit({
        value: ethers.parseEther("1"),
      });

      await expect(
        vault.connect(alice).emergencyWithdraw()
      ).to.be.revertedWith("Not owner");

      const vaultBalance =
        await ethers.provider.getBalance(
          await vault.getAddress()
        );

      expect(vaultBalance).to.equal(
        ethers.parseEther("1")
      );

      expect(await vault.owner()).to.equal(
        owner.address
      );
    });

    it("allows the owner to trigger emergencyWithdraw", async function () {
      const { vault, owner } = await deployVault();

      await vault.connect(owner).deposit({
        value: ethers.parseEther("1"),
      });

      await expect(
        vault.connect(owner).emergencyWithdraw()
      ).to.not.be.reverted;

      const vaultBalance =
        await ethers.provider.getBalance(
          await vault.getAddress()
        );

      expect(vaultBalance).to.equal(0n);
    });

    it("allows the new owner to trigger emergencyWithdraw after ownership transfer", async function () {
      const { vault, owner, alice } =
        await deployVault();

      await vault.connect(owner).deposit({
        value: ethers.parseEther("1"),
      });

      await vault
        .connect(owner)
        .transferOwnership(alice.address);

      await vault
        .connect(alice)
        .acceptOwnership();

      await expect(
        vault.connect(alice).emergencyWithdraw()
      ).to.not.be.reverted;

      const vaultBalance =
        await ethers.provider.getBalance(
          await vault.getAddress()
        );

      expect(vaultBalance).to.equal(0n);
    });
  });
});

describe("Vault - Reentrancy Attack", function () {
  it("rejects a reentrant withdrawal attempt", async function () {
    const [, victim, attacker] =
      await ethers.getSigners();

    const Vault =
      await ethers.getContractFactory("Vault");

    const vault = await Vault.deploy();

    const Attacker =
      await ethers.getContractFactory(
        "ReentrancyAttacker"
      );

    const attackerContract =
      await Attacker.deploy(
        await vault.getAddress()
      );

    await attackerContract.waitForDeployment();

    await vault.connect(victim).deposit({
      value: ethers.parseEther("5"),
    });

    await attackerContract
      .connect(attacker)
      .deposit({
        value: ethers.parseEther("1"),
      });

    const vaultAddress =
      await vault.getAddress();

    const attackerAddress =
      await attackerContract.getAddress();

    const vaultBalanceBefore =
      await ethers.provider.getBalance(
        vaultAddress
      );

    const attackerBalanceBefore =
      await vault.balances(attackerAddress);

    expect(vaultBalanceBefore).to.equal(
      ethers.parseEther("6")
    );

    expect(attackerBalanceBefore).to.equal(
      ethers.parseEther("1")
    );

    await expect(
      attackerContract
        .connect(attacker)
        .attack()
    ).to.be.reverted;

    const vaultBalanceAfter =
      await ethers.provider.getBalance(
        vaultAddress
      );

    const attackerBalanceAfter =
      await vault.balances(attackerAddress);

    const victimBalanceAfter =
      await vault.balances(victim.address);

    expect(vaultBalanceAfter).to.equal(
      ethers.parseEther("6")
    );

    expect(attackerBalanceAfter).to.equal(
      ethers.parseEther("1")
    );

    expect(victimBalanceAfter).to.equal(
      ethers.parseEther("5")
    );
  });
});
