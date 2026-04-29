const express = require('express');
const cors = require('cors');
const { createInstance, SepoliaConfig } = require('@zama-fhe/relayer-sdk/node');
const { ethers } = require('ethers');

const app = express();
app.use(cors());
app.use(express.json());

const CWETH = '0x46208622DA27d91db4f0393733C8BA082ed83158';
const WETH  = '0xff54739b16576FA5402F211D0b938469Ab9A5f3F';
const DRIP_AMOUNT = ethers.parseUnits('0.5', 18);

const dripHistory = new Map();

// Shared instance cache
let _instance = null;
async function getInstance() {
  if (_instance) return _instance;
  _instance = await createInstance({
    ...SepoliaConfig,
    network: 'https://ethereum-sepolia-rpc.publicnode.com',
  });
  return _instance;
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Step 1: Get keypair + EIP712 for user to sign
app.post('/decrypt-prepare', async (req, res) => {
  const { handle, contractAddress, userAddress } = req.body;
  if (!handle || !contractAddress || !userAddress) {
    return res.status(400).json({ error: 'Missing fields', success: false });
  }
  try {
    const instance = await getInstance();
    const keypair = instance.generateKeypair();
    const startTimestamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = '10';
    const eip712 = instance.createEIP712(
      keypair.publicKey,
      [contractAddress],
      startTimestamp,
      durationDays,
    );
    res.json({
      success: true,
      keypair: { publicKey: keypair.publicKey, privateKey: keypair.privateKey },
      eip712,
      startTimestamp,
      durationDays,
    });
  } catch(err) {
    res.status(500).json({ error: err.message, success: false });
  }
});

// Step 2: Decrypt with user signature
app.post('/decrypt-balance', async (req, res) => {
  const { handle, contractAddress, userAddress, signature, keypair, startTimestamp, durationDays } = req.body;
  if (!handle || !contractAddress || !userAddress || !signature || !keypair) {
    return res.status(400).json({ error: 'Missing fields', success: false });
  }
  try {
    const instance = await getInstance();
    const result = await instance.userDecrypt(
      [{ handle, contractAddress }],
      keypair.privateKey,
      keypair.publicKey,
      signature.replace('0x', ''),
      [contractAddress],
      userAddress,
      startTimestamp,
      durationDays,
    );
    const balance = result[handle];
    res.json({ success: true, balance: balance.toString() });
  } catch(err) {
    console.error('Decrypt error:', err);
    res.status(500).json({ error: err.message, success: false });
  }
});

app.post('/encrypt', async (req, res) => {
  const { amount, contractAddress, userAddress } = req.body;
  if (!amount || !contractAddress || !userAddress) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  try {
    const checksumContract = ethers.getAddress(contractAddress);
    const checksumUser = ethers.getAddress(userAddress);
    const instance = await getInstance();
    const encrypted = await instance
      .createEncryptedInput(checksumContract, checksumUser)
      .add64(BigInt(amount))
      .encrypt();
    const toHex = (val) => {
      if (typeof val === 'string' && val.startsWith('0x')) return val;
      return '0x' + Buffer.from(val).toString('hex');
    };
    res.json({
      handle: toHex(encrypted.handles[0]),
      inputProof: toHex(encrypted.inputProof),
      success: true
    });
  } catch(err) {
    console.error('Encrypt error:', err);
    res.status(500).json({ error: err.message, success: false });
  }
});

app.post('/faucet', async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'Missing address', success: false });

  let checksumAddress;
  try { checksumAddress = ethers.getAddress(address); }
  catch(e) { return res.status(400).json({ error: 'Invalid address', success: false }); }

  const lastDrip = dripHistory.get(checksumAddress);
  const now = Date.now();
  if (lastDrip && now - lastDrip < 3600000) {
    const waitMins = Math.ceil((3600000 - (now - lastDrip)) / 60000);
    return res.status(429).json({ error: `Wait ${waitMins} more minutes`, success: false });
  }

  try {
    const provider = new ethers.JsonRpcProvider(
      process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
    );
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    const weth = new ethers.Contract(WETH, [
      'function mint(address to, uint256 amount) external',
      'function approve(address spender, uint256 amount) external returns (bool)',
    ], signer);

    const cweth = new ethers.Contract(CWETH, [
      'function wrap(address to, uint256 amount) external',
    ], signer);

    await (await weth.mint(signer.address, DRIP_AMOUNT)).wait();
    await (await weth.approve(CWETH, DRIP_AMOUNT)).wait();
    await (await cweth.wrap(checksumAddress, DRIP_AMOUNT)).wait();

    dripHistory.set(checksumAddress, now);
    res.json({ success: true, amount: '0.5', token: 'cWETH' });
  } catch(err) {
    console.error('Faucet error:', err);
    res.status(500).json({ error: err.message, success: false });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Veil backend running on port ${PORT}`));
