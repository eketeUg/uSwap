import { Injectable } from '@nestjs/common';
import { Contract, ethers, Provider, Signer } from 'ethers';
import { FACTORY_ABI } from './abis/factory';
import { QUOTER_ABI } from './abis/quoter';
import { SWAP_ROUTER_ABI } from './abis/swaprouter';
import { POOL_ABI } from './abis/pool';
import { ERC20_ABI } from './abis/erc20';
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class DefiService {
  readonly POOL_FACTORY_CONTRACT_ADDRESS =
    '0x0227628f3F023bb0B980b67D528571c95c6DaC1c';
  readonly QUOTER_CONTRACT_ADDRESS =
    '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3';
  readonly SWAP_ROUTER_CONTRACT_ADDRESS =
    '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E';

  private readonly provider: Provider;
  private readonly factoryContract: Contract;
  private readonly quoterContract: Contract;
  private readonly signer: Signer;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    this.factoryContract = new ethers.Contract(
      this.POOL_FACTORY_CONTRACT_ADDRESS,
      FACTORY_ABI,
      this.provider,
    );
    this.quoterContract = new ethers.Contract(
      this.QUOTER_CONTRACT_ADDRESS,
      QUOTER_ABI,
      this.provider,
    );
    this.signer = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
  }

  async wrapETH(amountInEth, wallet) {
    try {
      const wethContract = new ethers.Contract(
        '0xfff9976782d46cc05630d1f6ebab18b2324d6b14',
        ERC20_ABI,
        wallet,
      );

      console.log('value :', amountInEth);

      const tx = await wethContract.deposit({
        value: amountInEth,
      });

      console.log(`Wrapping ETH... TX: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(
        `Wrapped ${amountInEth} ETH to WETH successfully! https://sepolia.etherscan.io/tx/${receipt.hash}`,
      );
    } catch (error) {
      console.error('Failed to wrap ETH to WETH:', error);
      throw new Error('Wrapping ETH failed');
    }
  }

  async checkTokenAllowanceBeforeSwap(tokenAddress, amount, wallet) {
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        wallet,
      );

      const owner = await wallet.getAddress();
      const spender = this.SWAP_ROUTER_CONTRACT_ADDRESS;
      const amountInWei = ethers.parseEther(amount.toString());

      const currentAllowance = await tokenContract.allowance(owner, spender);

      if (currentAllowance >= amountInWei) {
        console.log(
          `Sufficient allowance: ${ethers.formatEther(currentAllowance)} tokens`,
        );
        return;
      }

      console.log(`Insufficient allowance. Approving ${amount} tokens...`);

      await this.approveToken(tokenAddress, amount, wallet);
    } catch (error) {
      console.error(
        'An error occurred while checking/approving allowance:',
        error,
      );
      throw new Error('Allowance check or approval failed');
    }
  }

  async approveToken(tokenAddress, amount, wallet) {
    try {
      const isWeth =
        tokenAddress === '0xfff9976782d46cc05630d1f6ebab18b2324d6b14';
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        wallet,
      );

      const balance = await tokenContract.balanceOf(
        await this.signer.getAddress(),
      );
      console.log('this is balance :', ethers.formatEther(balance));

      if (isWeth && Number(balance) < Number(amount)) {
        await this.wrapETH(amount, wallet);
      }
      const approveTransaction =
        await tokenContract.approve.populateTransaction(
          this.SWAP_ROUTER_CONTRACT_ADDRESS,
          ethers.parseEther(amount.toString()),
        );

      const transactionResponse =
        await wallet.sendTransaction(approveTransaction);

      console.log(`Sending Approval Transaction...`);
      console.log(`Transaction Sent: ${transactionResponse.hash}`);
      const receipt = await transactionResponse.wait();
      console.log(
        `Approval Transaction Confirmed! https://sepolia.etherscan.io/tx/${receipt.hash}`,
      );
    } catch (error) {
      console.error('An error occurred during token approval:', error);
      throw new Error('Token approval failed');
    }
  }

  async getPoolInfo(tokenIn, tokenOut) {
    const poolAddress = await this.factoryContract.getPool(
      tokenIn.address,
      tokenOut.address,
      3000, // this is the fee tier 500 (0.05% For stable or highly correlated pairs), 3000 (0.3% For most standard trading pairs (default)), 10000 (1.0% For exotic or highly volatile trading pairs)
    );
    if (!poolAddress) {
      throw new Error('Failed to get pool address');
    }
    const poolContract = new ethers.Contract(
      poolAddress,
      POOL_ABI,
      this.provider,
    );
    const [token0, token1, fee] = await Promise.all([
      poolContract.token0(),
      poolContract.token1(),
      poolContract.fee(),
    ]);
    return { poolContract, token0, token1, fee };
  }

  async getSwapQuote(fee, signer, amountIn, tokenIn, TokenOut) {
    const quotedAmountOut =
      await this.quoterContract.quoteExactInputSingle.staticCall({
        tokenIn: tokenIn.address,
        tokenOut: TokenOut.address,
        fee: fee,
        recipient: signer.address,
        deadline: Math.floor(new Date().getTime() / 1000 + 60 * 10),
        amountIn: amountIn,
        sqrtPriceLimitX96: 0,
      });

    console.log(
      `Token Swap Quote: ${ethers.formatUnits(quotedAmountOut[0].toString(), TokenOut.decimals)} ${TokenOut.symbol} for ${ethers.formatEther(amountIn)} ${tokenIn.symbol}`,
    );
    const amountOut = ethers.formatUnits(quotedAmountOut[0], TokenOut.decimals);
    return amountOut;
  }

  async prepareSwapParams(
    poolContract,
    signer,
    tokenIn,
    amountIn,
    tokenOut,
    amountOut,
  ) {
    return {
      tokenIn: tokenIn.address,
      tokenOut: tokenOut.address,
      fee: await poolContract.fee(),
      recipient: signer.address,
      amountIn: amountIn,
      amountOutMinimum: amountOut,
      sqrtPriceLimitX96: 0,
    };
  }

  async executeSwap(swapRouter, params, signer) {
    const transaction =
      await swapRouter.exactInputSingle.populateTransaction(params);
    console.log('transaction. :', transaction);
    const receipt = await signer.sendTransaction(transaction);

    console.log(`Receipt: https://sepolia.etherscan.io/tx/${receipt.hash}`);

    return { receipt: 'https://sepolia.etherscan.io/tx/${receipt.hash' };
  }

  async swap(swapAmount, tokenIn, tokenOut) {
    const amountIn = ethers.parseUnits(
      swapAmount.toString(),
      Number(tokenIn.decimals),
    );

    try {
      await this.approveToken(tokenIn.address, amountIn, this.signer);
      const { poolContract, fee } = await this.getPoolInfo(tokenIn, tokenOut);

      console.log(
        `Fetching Quote for: ${tokenIn.symbol} to ${tokenOut.symbol}`,
      );

      console.log(`Swap Amount: ${ethers.formatEther(amountIn)}`);

      const quotedAmountOut = await this.getSwapQuote(
        fee,
        this.signer,
        amountIn,
        tokenIn,
        tokenOut,
      );

      const params = await this.prepareSwapParams(
        poolContract,
        this.signer,
        tokenIn,
        amountIn,
        tokenOut,
        quotedAmountOut[0].toString(),
      );

      const swapRouter = new ethers.Contract(
        this.SWAP_ROUTER_CONTRACT_ADDRESS,
        SWAP_ROUTER_ABI,
        this.signer,
      );

      return await this.executeSwap(swapRouter, params, this.signer);
    } catch (error) {
      console.error('An error occurred:', error.message);
    }
  }
}
