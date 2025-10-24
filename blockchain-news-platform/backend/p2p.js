// p2p.js - Peer-to-Peer Network Implementation with Auto-Discovery
const WebSocket = require('ws');
const EventEmitter = require('events');
const dgram = require('dgram');
const os = require('os');

class P2PNetwork extends EventEmitter {
  constructor(blockchain, port = 6001) {
    super();
    this.blockchain = blockchain;
    this.port = port;
    this.peers = new Map();
    this.server = null;
    this.discoverySocket = null;
    this.knownPeers = new Set();
    this.myAddress = this.getLocalIPAddress();
  }

  getLocalIPAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return 'localhost';
  }

  start() {
    this.server = new WebSocket.Server({ port: this.port });
    
    this.server.on('connection', (socket, req) => {
      const peerId = req.socket.remoteAddress + ':' + req.socket.remotePort;
      console.log(`New peer connected: ${peerId}`);
      this.initConnection(socket, peerId);
    });

    console.log(`P2P Server listening on port ${this.port}`);
    console.log(`My address: ${this.myAddress}:${this.port}`);
    
    // Start auto-discovery
    this.startAutoDiscovery();
  }

  startAutoDiscovery() {
    this.discoverySocket = dgram.createSocket('udp4');
    
    // Listen for discovery broadcasts
    this.discoverySocket.on('message', (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.type === 'PEER_DISCOVERY' && data.port) {
          const peerAddress = `ws://${rinfo.address}:${data.port}`;
          
          // Skip if it's our own broadcast
          if (data.port === this.port && this.isLocalAddress(rinfo.address)) {
            return;
          }
          
          // Skip if we're already connected to this peer
          if (this.knownPeers.has(peerAddress) || this.isPeerConnected(rinfo.address)) {
            return;
          }
          
          // Skip localhost connections to different ports (virtual ports)
          if (rinfo.address === '127.0.0.1' || rinfo.address === 'localhost') {
            return;
          }
          
          console.log(`Discovered peer: ${peerAddress}`);
          this.knownPeers.add(peerAddress);
          setTimeout(() => this.connectToPeer(peerAddress), 1000);
        }
      } catch (error) {
        // Ignore invalid messages
      }
    });

    this.discoverySocket.bind(6002, () => {
      this.discoverySocket.setBroadcast(true);
      console.log('Auto-discovery enabled on UDP port 6002');
    });

    // Broadcast our presence every 10 seconds
    this.discoveryInterval = setInterval(() => {
      this.broadcastPresence();
    }, 10000);

    // Initial broadcast
    this.broadcastPresence();
  }

  isLocalAddress(address) {
    // Check if address is one of our local addresses
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.address === address) {
          return true;
        }
      }
    }
    return address === '127.0.0.1' || address === 'localhost' || address === '::1';
  }

  broadcastPresence() {
    const message = JSON.stringify({
      type: 'PEER_DISCOVERY',
      port: this.port,
      chainLength: this.blockchain.chain.length,
      nodeId: `${this.myAddress}:${this.port}` // Add unique node identifier
    });

    const buffer = Buffer.from(message);
    // Broadcast to local network
    this.discoverySocket.send(buffer, 0, buffer.length, 6002, '255.255.255.255');
  }

  isPeerConnected(address) {
    for (const [peerId] of this.peers) {
      if (peerId.includes(address)) {
        return true;
      }
    }
    return false;
  }

  connectToPeer(peerAddress) {
    // Check if already connected
    if (this.knownPeers.has(peerAddress) && this.isPeerConnected(peerAddress)) {
      return;
    }

    try {
      const socket = new WebSocket(peerAddress);
      
      socket.on('open', () => {
        console.log(`Connected to peer: ${peerAddress}`);
        this.knownPeers.add(peerAddress);
        this.initConnection(socket, peerAddress);
        this.sendMessage(socket, {
          type: 'REQUEST_CHAIN'
        });
      });

      socket.on('error', (error) => {
        console.error(`Connection error with ${peerAddress}:`, error.message);
        this.knownPeers.delete(peerAddress);
      });
    } catch (error) {
      console.error(`Failed to connect to ${peerAddress}:`, error.message);
    }
  }

  initConnection(socket, peerId) {
    this.peers.set(peerId, socket);

    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        this.handleMessage(socket, message, peerId);
      } catch (error) {
        console.error('Invalid message received:', error.message);
      }
    });

    socket.on('close', () => {
      console.log(`Peer disconnected: ${peerId}`);
      this.peers.delete(peerId);
      this.emit('peerDisconnected', peerId);
    });

    socket.on('error', (error) => {
      console.error(`Socket error with ${peerId}:`, error.message);
    });

    this.sendMessage(socket, {
      type: 'HELLO',
      chainLength: this.blockchain.chain.length
    });

    this.emit('peerConnected', peerId);
  }

  handleMessage(socket, message, peerId) {
    switch (message.type) {
      case 'HELLO':
        console.log(`Peer ${peerId} has chain length: ${message.chainLength}`);
        if (message.chainLength > this.blockchain.chain.length) {
          this.sendMessage(socket, { type: 'REQUEST_CHAIN' });
        }
        break;

      case 'REQUEST_CHAIN':
        this.sendMessage(socket, {
          type: 'CHAIN',
          chain: this.blockchain.chain
        });
        break;

      case 'CHAIN':
        this.handleChainUpdate(message.chain, socket);
        break;

      case 'NEW_BLOCK':
        console.log('Received new block from peer');
        const block = message.block;
        if (block && this.isValidNewBlock(block)) {
          this.blockchain.chain.push(block);
          this.blockchain.saveBlockchain();
          this.emit('newBlock', block);
          this.broadcastMessage(message, socket);
        }
        break;

      case 'NEW_ARTICLE':
        console.log('Received new article from peer');
        const article = message.article;
        this.blockchain.addArticle(article);
        this.emit('newArticle', article);
        this.broadcastMessage(message, socket);
        break;

      case 'ARTICLE_VOTE':
        console.log(`Received vote update for article ${message.articleId}`);
        this.handleVoteUpdate(message);
        this.broadcastMessage(message, socket);
        break;

      case 'CHAIN_UPDATE':
        if (message.chainLength > this.blockchain.chain.length) {
          this.sendMessage(socket, { type: 'REQUEST_CHAIN' });
        }
        break;

      default:
        console.log(`Unknown message type: ${message.type}`);
    }
  }

  handleChainUpdate(newChain, socket) {
    // Validate the new chain
    if (!this.blockchain.isValidChain(newChain)) {
      console.log('Received chain is invalid');
      return;
    }

    // If new chain is longer, replace
    if (newChain.length > this.blockchain.chain.length) {
      console.log(`Replacing blockchain with new chain (length: ${newChain.length})`);
      
      // Reconstruct Block objects
      const Block = require('./blockchain').Block || this.blockchain.chain[0].constructor;
      const reconstructedChain = newChain.map(blockData => {
        const block = Object.create(Block.prototype);
        Object.assign(block, blockData);
        return block;
      });
      
      this.blockchain.chain = reconstructedChain;
      this.blockchain.saveBlockchain();
      this.emit('chainUpdated');
      
      // Notify other peers
      this.broadcastMessage({
        type: 'CHAIN_UPDATE',
        chainLength: this.blockchain.chain.length
      }, socket);
    } else if (newChain.length === this.blockchain.chain.length) {
      // Same length - merge unique blocks
      console.log('Chains are equal length, checking for differences');
      this.mergeChains(newChain);
    }
  }

  mergeChains(incomingChain) {
    // Check if chains diverged and try to reconcile
    for (let i = 0; i < incomingChain.length; i++) {
      const myBlock = this.blockchain.chain[i];
      const theirBlock = incomingChain[i];
      
      if (myBlock.hash !== theirBlock.hash) {
        console.log(`Chain divergence detected at block ${i}`);
        // If their block has more votes/data, consider it
        if (theirBlock.timestamp < myBlock.timestamp) {
          console.log('Using peer block (earlier timestamp)');
          this.blockchain.chain[i] = theirBlock;
          this.blockchain.saveBlockchain();
        }
      }
    }
  }

  handleVoteUpdate(message) {
    // Find and update article in blockchain
    for (let i = 0; i < this.blockchain.chain.length; i++) {
      const block = this.blockchain.chain[i];
      if (block.data && block.data.id === message.articleId) {
        if (message.voteType === 'up') {
          block.data.votes = message.votes;
        } else if (message.voteType === 'down') {
          block.data.downvotes = message.downvotes;
        }
        this.blockchain.saveBlockchain();
        this.emit('voteUpdated', block.data);
        break;
      }
    }
  }

  isValidNewBlock(block) {
    const latestBlock = this.blockchain.getLatestBlock();
    if (block.index !== latestBlock.index + 1) {
      return false;
    }
    if (block.previousHash !== latestBlock.hash) {
      return false;
    }
    return true;
  }

  sendMessage(socket, message) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  broadcastMessage(message, excludeSocket = null) {
    this.peers.forEach((socket, peerId) => {
      if (socket !== excludeSocket && socket.readyState === WebSocket.OPEN) {
        this.sendMessage(socket, message);
      }
    });
  }

  broadcastNewArticle(article) {
    this.broadcastMessage({
      type: 'NEW_ARTICLE',
      article: article
    });
  }

  broadcastVoteUpdate(articleId, votes, downvotes, voteType) {
    this.broadcastMessage({
      type: 'ARTICLE_VOTE',
      articleId: articleId,
      votes: votes,
      downvotes: downvotes,
      voteType: voteType
    });
  }

  getPeerCount() {
    return this.peers.size;
  }

  getPeerAddresses() {
    return Array.from(this.peers.keys());
  }

  stop() {
    // Clear discovery interval
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
    }

    // Close discovery socket
    if (this.discoverySocket) {
      this.discoverySocket.close();
    }

    // Close all peer connections
    this.peers.forEach((socket) => {
      socket.close();
    });
    this.peers.clear();
    
    if (this.server) {
      this.server.close();
      console.log('P2P Server stopped');
    }
  }
}

module.exports = P2PNetwork;