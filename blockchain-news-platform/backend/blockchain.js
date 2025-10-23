// blockchain.js - Core Blockchain Implementation
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class Block {
  constructor(index, timestamp, data, previousHash = '') {
    this.index = index;
    this.timestamp = timestamp;
    this.data = data;
    this.previousHash = previousHash;
    this.nonce = 0;
    this.hash = this.calculateHash();
  }

  calculateHash() {
    return crypto
      .createHash('sha256')
      .update(
        this.index +
        this.previousHash +
        this.timestamp +
        JSON.stringify(this.data) +
        this.nonce
      )
      .digest('hex');
  }

  mineBlock(difficulty) {
    while (this.hash.substring(0, difficulty) !== Array(difficulty + 1).join('0')) {
      this.nonce++;
      this.hash = this.calculateHash();
    }
    console.log(`Block mined: ${this.hash}`);
  }
}

class Blockchain {
  constructor() {
    this.chain = [];
    this.difficulty = 2;
    this.pendingTransactions = [];
    this.dataDir = path.join(__dirname, 'blockchain_data');
    
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    
    this.loadBlockchain();
    
    if (this.chain.length === 0) {
      this.chain = [this.createGenesisBlock()];
      this.saveBlockchain();
    }
  }

  createGenesisBlock() {
    return new Block(0, Date.now(), 'Genesis Block', '0');
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  addBlock(data) {
    const newBlock = new Block(
      this.chain.length,
      Date.now(),
      data,
      this.getLatestBlock().hash
    );
    newBlock.mineBlock(this.difficulty);
    this.chain.push(newBlock);
    this.saveBlockchain();
    return newBlock;
  }

  addArticle(article) {
    const articleData = {
      type: 'ARTICLE',
      ...article,
      timestamp: Date.now()
    };
    return this.addBlock(articleData);
  }

  searchArticles(query) {
    const results = [];
    for (const block of this.chain) {
      if (block.data && block.data.type === 'ARTICLE') {
        const article = block.data;
        if (
          article.title?.toLowerCase().includes(query.toLowerCase()) ||
          article.content?.toLowerCase().includes(query.toLowerCase())
        ) {
          results.push({
            ...article,
            blockIndex: block.index,
            blockHash: block.hash
          });
        }
      }
    }
    return results;
  }

  getAllArticles() {
    return this.chain
      .filter(block => block.data && block.data.type === 'ARTICLE')
      .map(block => ({
        ...block.data,
        blockIndex: block.index,
        blockHash: block.hash
      }));
  }

  isChainValid() {
    for (let i = 1; i < this.chain.length; i++) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];

      if (currentBlock.hash !== currentBlock.calculateHash()) {
        return false;
      }

      if (currentBlock.previousHash !== previousBlock.hash) {
        return false;
      }
    }
    return true;
  }

  saveBlockchain() {
    const filePath = path.join(this.dataDir, 'blockchain.json');
    fs.writeFileSync(filePath, JSON.stringify(this.chain, null, 2));
  }

  loadBlockchain() {
    const filePath = path.join(this.dataDir, 'blockchain.json');
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const loadedChain = JSON.parse(data);
      
      // Reconstruct Block objects with methods
      this.chain = loadedChain.map(blockData => {
        const block = new Block(
          blockData.index,
          blockData.timestamp,
          blockData.data,
          blockData.previousHash
        );
        block.nonce = blockData.nonce;
        block.hash = blockData.hash;
        return block;
      });
      
      console.log(`Loaded ${this.chain.length} blocks from disk`);
    }
  }

  replaceChain(newChain) {
    if (newChain.length <= this.chain.length) {
      console.log('Received chain is not longer than current chain');
      return false;
    }

    if (!this.isValidChain(newChain)) {
      console.log('Received chain is invalid');
      return false;
    }

    console.log('Replacing blockchain with new chain');
    this.chain = newChain;
    this.saveBlockchain();
    return true;
  }

  isValidChain(chain) {
    if (JSON.stringify(chain[0]) !== JSON.stringify(this.createGenesisBlock())) {
      return false;
    }

    for (let i = 1; i < chain.length; i++) {
      const block = chain[i];
      const prevBlock = chain[i - 1];

      if (block.previousHash !== prevBlock.hash) {
        return false;
      }

      const testBlock = new Block(
        block.index,
        block.timestamp,
        block.data,
        block.previousHash
      );
      testBlock.nonce = block.nonce;

      if (block.hash !== testBlock.calculateHash()) {
        return false;
      }
    }
    return true;
  }
}

module.exports = Blockchain;