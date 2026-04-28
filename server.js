const express = require('express');
const cors = require('cors');
const { createInstance, SepoliaConfig } = require('@zama-fhe/relayer-sdk/node');
const { ethers } = require('ethers');

const app = express();
app.use(cors());
app.use(express.json());

// ─── CONFIG ───
const CWETH = '0x46208622DA27d91db4f0393733C8BA082ed83158';
const WETH  = '0xff54739b16576FA5402F211D0b938469Ab9A5f3F';
const DRIP_AMOUNT = ethers.parseUnits('0.5', 8); // 0.5 cWETH (8 decimals)
const WRAP_AMOUNT = ethers.parseUnits('0.5', 18); // 0.5 WETH to wrap (18 decimals)

const WETH_ABI = [
  'function mint(address to, uint256 amount) external',
  'function approve(address spender, uint256 amount) external returns (bool)',
];

const CWETH_ABI = [
  'function wrap(address to, uint256 amount) external',
  'function setOperator(address operator, uint48 until) external',
  'function confidentialTransfer(address to, bytes32 encryptedAmount) external',
];

// Rate limiting — one drip per address per hour
const dripHistory = new Map();

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/encrypt', async (req, res) => {
  const { amount, contractAddress, userAddress } = req.body;

  if (!amount || !contractAddress || !userAddress) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
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

    const toHex = (val) => {
      if (typeof val === 'string' && val.startsWith('0x')) return val;
      return '0x' + Buffer.from(val).toString('hex');
    };

    res.json({
      handle: toHex(encrypted.handles[0]),
      inputProof: toHex(encrypted.inputProof),
      success: true
    });

  } catch (err) {
    console.error('Encrypt error:', err);
    res.status(500).json({ error: err.message, success: false });
  }
});

app.post('/faucet', async (req, res) => {
  const { address } = req.body;

  if (!address) {
    return res.status(400).json({ error: 'Missing address', success: false });
  }

  let checksumAddress;
  try {
    checksumAddress = ethers.getAddress(address);
  } catch(e) {
    return res.status(400).json({ error: 'Invalid address', success: false });
  }

  // Rate limit — 1 drip per address per hour
  const lastDrip = dripHistory.get(checksumAddress);
  const now = Date.now();
  if (lastDrip && now - lastDrip < 3600000) {
    const waitMins = Math.ceil((3600000 - (now - lastDrip)) / 60000);
    return res.status(429).json({
      error: `Please wait ${waitMins} more minutes before dripping again`,
      success: false
    });
  }

  try {
    const provider = new ethers.JsonRpcProvider(
      process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
    );
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    console.log(`Faucet drip to ${checksumAddress}`);

    // 1. Mint WETH to backend wallet
    const weth = new ethers.Contract(WETH, WETH_ABI, signer);
    console.log('Minting WETH...');
    await (await weth.mint(signer.address, WRAP_AMOUNT)).wait();

    // 2. Approve cWETHMock to spend WETH
    console.log('Approving...');
    await (await weth.approve(CWETH, WRAP_AMOUNT)).wait();

    // 3. Wrap WETH -> cWETH directly to user
    const cweth = new ethers.Contract(CWETH, CWETH_ABI, signer);
    console.log('Wrapping to user...');
    await (await cweth.wrap(checksumAddress, WRAP_AMOUNT)).wait();

    // Record drip
    dripHistory.set(checksumAddress, now);

    console.log(`Drip complete: 0.5 cWETH -> ${checksumAddress}`);
    res.json({ success: true, amount: '0.5', token: 'cWETH' });

  } catch(err) {
    console.error('Faucet error:', err);
    res.status(500).json({ error: err.message, success: false });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Veil backend running on port ${PORT}`));
