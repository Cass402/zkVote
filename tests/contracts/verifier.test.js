// This file is for testing the verifier smart contract and its integration with the Groth16 proof system and the circom circuit.
// Import necessary libraries and modules
const { expect } = require("chai"); // Assertion library for testing
const { ethers } = require("hardhat"); // Ethereum development framework
const { execSync } = require("child_process"); // importing the execSync function from the child_process module (for running shell commands)
const fs = require("fs"); // File system module for reading files
const path = require("path"); // Path module for handling file paths
const snarkjs = require("snarkjs"); // Library for zk-SNARKs
const circomlib = require("circomlibjs"); // importing the circomlib module (for the poseidon hash function)
const ffjavascript = require("ffjavascript"); // importing the ffjavascript module (for finite field operations)
const { pid } = require("process");

// describe block for the Verifier initial tests which checks wheter the contract is deployed and if it can invalidate a proof
describe("Verifier: Initial testing", function () {
  let Groth16Verifier, verifier; // Contract factory and instance variables

  // beforeEach block to deploy the contract before each test
  beforeEach(async function () {
    Groth16Verifier = await ethers.getContractFactory("Groth16Verifier"); // Get the contract factory for Verifier
    verifier = await Groth16Verifier.deploy(); // Deploy the contract
    await verifier.waitForDeployment(); // Wait for the contract to be deployed
  });

  // Test case to check the contract deployment
  it("Should deploy the contract", async function () {
    expect(verifier.target).to.be.properAddress; // Check if the contract address is a proper address
  });

  // Test case to check the verification of an invalid proof
  it("Should not verify an invalid proof", async function () {
    // Dummy incorrect proof values to simulate an invalid proof
    const a = ["0x0", "0x0"];
    const b = [
      ["0x0", "0x0"],
      ["0x0", "0x0"],
    ];
    const c = ["0x0", "0x0"];
    const publicInput = ["0x0"];

    const isValid = await verifier.verifyProof(a, b, c, publicInput);
    expect(isValid).to.be.false; // Check if the verification result is false
  });
});

// describe block for the Verifier contract testing with a valid proof obtained from the circom circuit
describe("Integration Test: circuit and smart contract", function () {
  let verifier; // Contract instance variable

  // Paths to the necessary files
  const circomPath = path.join(__dirname, "../../circuits/voting.circom"); // path to the voting.circom circuit
  const inputPath = path.join(__dirname, "voting_input.json"); // path to the input JSON file
  const wasmPath = path.join(__dirname, "../../voting_js/voting.wasm"); // path to the wasm file
  const zkeyPath = path.join(__dirname, "../../keys/voting_0001.zkey"); // path to the zkey file

  before(async function () {
    // Load the verifier contract
    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    verifier = await Verifier.deploy();
    await verifier.waitForDeployment();

    // Compile the circuit
    console.log("Compiling the circuit...");
    execSync(`circom ${circomPath} --r1cs --wasm --sym`, { stdio: "inherit" });

    // Generate the input JSON file
    console.log("Generating the input JSON file...");
    const generatedVoteCommitment = await generateVoteCommitment();
    fs.writeFileSync(
      inputPath,
      JSON.stringify(
        {
          vote: 1,
          randomness: 123456789,
          voteCommitment: generatedVoteCommitment,
        },
        null,
        2
      )
    );
  });
  // Test case to check the verification of a valid proof
  it("Should verify a valid proof generated by the circuit", async function () {
    // Read the input JSON file
    const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));

    // Generate the proof using snarkjs (the groth16 proving system)
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      wasmPath,
      zkeyPath
    );

    // Convert the proof and public signals to the required format for the verifier smart contract
    const a = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
    const b = [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ];

    const c = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];

    // Call the verifyProof function of the verifier contract with the proof and public signals
    const isValid = await verifier.verifyProof(a, b, c, publicSignals);
    expect(isValid).to.be.true;
  });
});

async function generateVoteCommitment() {
  // Initializing the poseidon hash function
  const poseidon = await circomlib.buildPoseidon();
  const F = poseidon.F; // the finite field

  // Compute the hash using the inputs (vote, randomness) = (2, 123456789)
  const hash = poseidon([1, 123456789]);

  // Return the hash
  return F.toString(hash);
}
