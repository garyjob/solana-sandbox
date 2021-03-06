/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import {
  Keypair,
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

import * as web3 from "@solana/web3.js";
import * as splToken from "@solana/spl-token";

import fs from 'mz/fs';
import path from 'path';
import * as borsh from 'borsh';

import {getPayer, getRpcUrl, createKeypairFromFile} from './utils';

/**
 * Connection to the network
 */
let connection: Connection;

/**
 * Keypair associated to the fees' payer
 */
let payer: Keypair;

/**
 * Hello world's program id
 */
let programId: PublicKey;

/**
 * The public key of the account we are saying hello to
 */
let greetedPubkey: PublicKey;
let shittedPubkey: PublicKey;

/**
 * Path to program files
 */
const PROGRAM_PATH = path.resolve(__dirname, '../../dist/program');

/**
 * Path to program shared object file which should be deployed on chain.
 * This file is created when running either:
 *   - `npm run build:program-c`
 *   - `npm run build:program-rust`
 */
const PROGRAM_SO_PATH = path.join(PROGRAM_PATH, 'helloworld.so');

/**
 * Path to the keypair of the deployed program.
 * This file is created when running `solana program deploy dist/program/helloworld.so`
 */
const PROGRAM_KEYPAIR_PATH = path.join(PROGRAM_PATH, 'helloworld-keypair.json');


/**
 * The state of a greeting account managed by the hello world program
 */
class GreetingAccount {
  counter = 0;
  shitter = 1;
  constructor(fields: {counter: number, shitter: number} | undefined = undefined) {
    if (fields) {
      this.counter = fields.counter;
      this.shitter = fields.shitter;
    }
  }
}

/**
 * Borsh schema definition for greeting accounts
 */
const GreetingSchema = new Map([
  [GreetingAccount, {
    kind: 'struct', 
    fields: [
      ['counter', 'u32'], 
      ['shitter', 'u32']
    ]
  }],
]);

// export async function tryBor(): Promise<void> {
//   const task = new GreetingAccount({
//     counter: 1,
//     shitter: 'something',
//   });

//   const buf = borsh.serialize(GreetingSchema, task);
//   console.log(buf);

//   const newValue = borsh.deserialize(GreetingSchema, GreetingAccount, buf);
//   console.log(newValue);
// }

/**
 * The expected size of each greeting account.
 */
const GREETING_SIZE = borsh.serialize(
  GreetingSchema,
  new GreetingAccount(),
).length;

/**
 * Establish a connection to the cluster
 */
export async function establishConnection(): Promise<void> {
  const rpcUrl = await getRpcUrl();
  connection = new Connection(rpcUrl, 'confirmed');
  const version = await connection.getVersion();
  console.log('Connection to cluster established:', rpcUrl, version);
}

/**
 * Establish an account to pay for everything
 */
export async function establishPayer(): Promise<void> {
  let fees = 0;
  if (!payer) {
    const {feeCalculator} = await connection.getRecentBlockhash();

    // Calculate the cost to fund the greeter account
    fees += await connection.getMinimumBalanceForRentExemption(GREETING_SIZE);

    // Calculate the cost of sending transactions
    fees += feeCalculator.lamportsPerSignature * 100; // wag

    payer = await getPayer();
  }

  let lamports = await connection.getBalance(payer.publicKey);
  if (lamports < fees) {
    // If current balance is not enough to pay for fees, request an airdrop
    const sig = await connection.requestAirdrop(
      payer.publicKey,
      fees - lamports,
    );
    await connection.confirmTransaction(sig);
    lamports = await connection.getBalance(payer.publicKey);
  }

  console.log(
    'Using account',
    payer.publicKey.toBase58(),
    'containing',
    lamports / LAMPORTS_PER_SOL,
    'SOL to pay for fees',
  );
}

/**
 * Check if the hello world BPF program has been deployed
 */
export async function checkProgram(): Promise<void> {
  // Read program id from keypair file
  try {
    const programKeypair = await createKeypairFromFile(PROGRAM_KEYPAIR_PATH);
    programId = programKeypair.publicKey;
  } catch (err) {
    const errMsg = (err as Error).message;
    throw new Error(
      `Failed to read program keypair at '${PROGRAM_KEYPAIR_PATH}' due to error: ${errMsg}. Program may need to be deployed with \`solana program deploy dist/program/helloworld.so\``,
    );
  }

  // Check if the program has been deployed
  const programInfo = await connection.getAccountInfo(programId);
  if (programInfo === null) {
    if (fs.existsSync(PROGRAM_SO_PATH)) {
      throw new Error(
        'Program needs to be deployed with `solana program deploy dist/program/helloworld.so`',
      );
    } else {
      throw new Error('Program needs to be built and deployed');
    }
  } else if (!programInfo.executable) {
    throw new Error(`Program is not executable`);
  }
  console.log(`Using program ${programId.toBase58()}`);

  // Derive the address (public key) of a greeting account from the program so that it's easy to find later.
  const GREETING_SEED = 'hello2';
  greetedPubkey = await PublicKey.createWithSeed(
    payer.publicKey,
    GREETING_SEED,
    programId,
  );

  // Check if the greeting account has already been created
  const greetedAccount = await connection.getAccountInfo(greetedPubkey);
  if (greetedAccount === null) {
    console.log(
      'Creating account',
      greetedPubkey.toBase58(),
      'to say hello to',
    );
    const lamports = await connection.getMinimumBalanceForRentExemption(
      GREETING_SIZE,
    );

    const transaction = new Transaction().add(
      SystemProgram.createAccountWithSeed({
        fromPubkey: payer.publicKey,
        basePubkey: payer.publicKey,
        seed: GREETING_SEED,
        newAccountPubkey: greetedPubkey,
        lamports,
        space: GREETING_SIZE,
        programId,
      }),
    );
    await sendAndConfirmTransaction(connection, transaction, [payer]);
  }

  const SHITTING_SEED = 'hello4';
  shittedPubkey = await PublicKey.createWithSeed(
    payer.publicKey,
    SHITTING_SEED,
    programId,
  );

  // Check if the greeting account has already been created
  const shittedAccount = await connection.getAccountInfo(shittedPubkey);
  if (shittedAccount === null) {
    console.log(
      'Creating account',
      shittedPubkey.toBase58(),
      'to say hello to',
    );
    const lamports = await connection.getMinimumBalanceForRentExemption(
      GREETING_SIZE,
    );

    const transaction = new Transaction().add(
      SystemProgram.createAccountWithSeed({
        fromPubkey: payer.publicKey,
        basePubkey: payer.publicKey,
        seed: SHITTING_SEED,
        newAccountPubkey: shittedPubkey,
        lamports,
        space: GREETING_SIZE,
        programId,
      }),
    );
    await sendAndConfirmTransaction(connection, transaction, [payer]);
  }
}

/**
 * Say hello
 */
export async function sayHello(): Promise<void> {
  console.log('Saying hello to', greetedPubkey.toBase58());
  const instruction = new TransactionInstruction({
    keys: [
      {pubkey: greetedPubkey, isSigner: false, isWritable: true},
      {pubkey: shittedPubkey, isSigner: false, isWritable: true}
    ],
    programId,
    data: Buffer.alloc(0), // All instructions are hellos
  });
  console.log(instruction)

  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(instruction),
    [payer],
  );
}

/**
 * Report the number of times the greeted account has been said hello to
 */
export async function reportGreetings(): Promise<void> {
  const accountInfo = await connection.getAccountInfo(greetedPubkey);
  if (accountInfo === null) {
    throw 'Error: cannot find the greeted account';
  }
  const greeting = borsh.deserialize(
    GreetingSchema,
    GreetingAccount,
    accountInfo.data,
  );
  console.log(
    greetedPubkey.toBase58(),
    'has been greeted',
    greeting.counter,
    'time(s)',
  );

  console.log(
    greetedPubkey.toBase58(),
    'has been shitted',
    greeting.shitter,
    'time(s)',
  );

  const sAccountInfo = await connection.getAccountInfo(shittedPubkey);
  if (sAccountInfo === null) {
    throw 'Error: cannot find the greeted account';
  }
  const shitting = borsh.deserialize(
    GreetingSchema,
    GreetingAccount,
    sAccountInfo.data,
  );

  console.log(
    shittedPubkey.toBase58(),
    'has been greeted',
    shitting.counter,
    'time(s)',
  );
    
  console.log(
    shittedPubkey.toBase58(),
    'has been shitted on ',
    shitting.shitter,
    'time(s)',
  );
}



export async function transferTrueSightTokens(): Promise<void> {

  // const fromTokenAccount = await mintToken.getOrCreateAssociatedAccountInfo(
  //   wallet.publicKey
  // );

  // var myToken = new splToken.Token(
  //   connection,
  //   myMint,
  //   splToken.TOKEN_PROGRAM_ID,
  //   fromWallet
  // );
  // // Create associated token accounts for my token if they don't exist yet
  // var fromTokenAccount = await myToken.getOrCreateAssociatedAccountInfo(
  //   fromWallet.publicKey
  // )
  // var toTokenAccount = await myToken.getOrCreateAssociatedAccountInfo(
  //   toWallet.publicKey
  // )
  // Add token transfer instructions to transaction
  // const fromWalletPublicKey = "5iSkxWSbBM3nDYg8T85zCVXSD9baRoDRZuweqxDdYmUY";
  // const fromAddress = "5iSkxWSbBM3nDYg8T85zCVXSD9baRoDRZuweqxDdYmUY";
  // const toAddress = "48xsMyMx4nDfgxyB8AspumVaeART3cQWzFwYE82UZsFg";
  
  // var transaction = new web3.Transaction()
  //   .add(
  //     splToken.Token.createTransferInstruction(
  //       splToken.TOKEN_PROGRAM_ID,
  //       fromAddress,
  //       toAddress,
  //       fromWalletPublicKey,
  //       [],
  //       100
  //     )
  //   );
  // // Sign transaction, broadcast, and confirm
  // var signature = await web3.sendAndConfirmTransaction(
  //   connection,
  //   transaction,
  //   [payer]
  // );
  // console.log("SIGNATURE", signature);
  console.log("SUCCESS");  
}

