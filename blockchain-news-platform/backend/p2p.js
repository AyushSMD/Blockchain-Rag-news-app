// p2p.js - Peer-to-Peer Network Implementation
const WebSocket = require('ws');
const EventEmitter = require('events');

class P2PNetwork extends EventEmitter {
  constructor(blockchain, port = 6001) {
    super();
    this.blockchain = blockchain;
    this.port = port;
    this.peers = new Map();
    this.server = null;
  }

  start() {
    this.server = new WebSocket.Server({ port: this.port });
    
    this.server.on('connection', (socket, req) => {
      const peerId = req.socket.remoteAddress + ':' + req.socket.remotePort;
      console.log(`New peer connected: ${peerId}`);
      this.initConnection(socket, peerId);
    });

    console.log(`P2P Server listening on port ${this.port}`);
  }

  connectToPeer(peerAddress) {
    try {
      const socket = new WebSocket(peerAddress);
      
      socket.on('open', () => {
        console.log(`Connected to peer: ${peerAddress}`);
        this.initConnection(socket, peerAddress);
        this.sendMessage(socket, {
          type: 'REQUEST_CHAIN'
        });
      });

      socket.on('error', (error) => {
        console.error(`Connection error with ${peerAddress}:`, error.message);
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
        if (this.blockchain.replaceChain(message.chain)) {
          console.log('Blockchain updated from peer');
          this.emit('chainUpdated');
          this.broadcastMessage({
            type: 'CHAIN_UPDATE',
            chainLength: this.blockchain.chain.length
          }, socket);
        }
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

      case 'CHAIN_UPDATE':
        if (message.chainLength > this.blockchain.chain.length) {
          this.sendMessage(socket, { type: 'REQUEST_CHAIN' });
        }
        break;

      default:
        console.log(`Unknown message type: ${message.type}`);
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

  getPeerCount() {
    return this.peers.size;
  }

  getPeerAddresses() {
    return Array.from(this.peers.keys());
  }

  stop() {
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