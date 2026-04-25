const express = require('express');
const cors = require('cors');
const { createInstance, SepoliaConfig } = require('@zama-fhe/relayer-sdk/node');
const { ethers } = require('ethers');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/encrypt', async (req, res) => {
  const { amount, contractAddress, userAddress } = req.body;
  
  if (!amount || !contractAddress || !userAddress) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    // Checksum addresses - SDK requires EIP-55 checksummed addresses
    const checksumContract = ethers.getAddress(contractAddress);
    const checksumUser = ethers.getAddress(userAddress);

    const instance = await createInstance({
      ...SepoliaConfig,
      network: 'https://ethereum-sepolia-rpc.publicnode.com',
    });

    const encrypted = await instance
      .createEncryptedInput(checksumContract, checksumUser)
      .add64(BigInt(amount))
      .encrypt();

    res.json({
      handle: encrypted.handles[0],
      inputProof: encrypted.inputProof,
      success: true
    });

  } catch (err) {
    res.status(500).json({ error: err.message, success: false });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Veil backend running on port ${PORT}`));
