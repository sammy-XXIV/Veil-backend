const express = require('express');
const cors = require('cors');
const { createInstance } = require('@zama-fhe/relayer-sdk/node');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/encrypt', async (req, res) => {
  const { amount, contractAddress, userAddress } = req.body;
  
  if (!amount || !contractAddress || !userAddress) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    const instance = await createInstance({
      aclContractAddress: '0x687820221192C5B662b25367F70076A37bc79b6c',
      kmsContractAddress: '0x1364cBBf2cDF5032C47d8226a6f6FBD2AFCDacAC',
      inputVerifierContractAddress: '0xbc91f3daD1A5F19F8390c400196e58073B6a0BC4',
      verifyingContractAddressDecryption: '0xb6E160B1ff80D67Bfe90A85eE06Ce0A2613607D1',
      verifyingContractAddressInputVerification: '0x7048C39f048125eDa9d678AEbaDfB22F7900a29F',
      chainId: 11155111,
      gatewayChainId: 55815,
      relayerUrl: 'https://relayer.testnet.zama.cloud',
      network: 'https://ethereum-sepolia-rpc.publicnode.com',
    });

    const encrypted = await instance
      .createEncryptedInput(contractAddress, userAddress)
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
