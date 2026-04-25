const express = require('express');
const cors = require('cors');
const { createInstance, SepoliaConfig } = require('@zama-fhe/relayer-sdk/node');

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
      ...SepoliaConfig,
      network: 'https://eth-sepolia.public.blastapi.io',
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
