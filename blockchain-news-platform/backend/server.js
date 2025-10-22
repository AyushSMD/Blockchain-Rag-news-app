// server.js - REST API Server with RAG Implementation
const express = require('express');
const cors = require('cors');
const Blockchain = require('./blockchain');
const P2PNetwork = require('./p2p');
const RAGProcessor = require('./rag');

const app = express();
const HTTP_PORT = process.env.HTTP_PORT || 3001;
const P2P_PORT = process.env.P2P_PORT || 6001;

app.use(cors());
app.use(express.json());

// Initialize blockchain and P2P network
const blockchain = new Blockchain();
const p2pNetwork = new P2PNetwork(blockchain, P2P_PORT);
const ragProcessor = new RAGProcessor();

// P2P Event Handlers
p2pNetwork.on('peerConnected', (peerId) => {
  console.log(`Peer connected: ${peerId} (Total peers: ${p2pNetwork.getPeerCount()})`);
});

p2pNetwork.on('chainUpdated', () => {
  console.log('Blockchain updated from network');
});

p2pNetwork.on('newArticle', (article) => {
  console.log('New article received from network:', article.title);
});

// Start P2P server
p2pNetwork.start();

// Connect to initial peers if provided
if (process.env.PEERS) {
  const peers = process.env.PEERS.split(',');
  peers.forEach(peer => {
    p2pNetwork.connectToPeer(peer.trim());
  });
}

// REST API Endpoints

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    chainLength: blockchain.chain.length,
    peers: p2pNetwork.getPeerCount(),
    valid: blockchain.isChainValid()
  });
});

// Get blockchain info
app.get('/api/blockchain', (req, res) => {
  res.json({
    chain: blockchain.chain,
    length: blockchain.chain.length,
    valid: blockchain.isChainValid()
  });
});

// Get all articles
app.get('/api/articles', (req, res) => {
  const articles = blockchain.getAllArticles();
  res.json({
    articles: articles,
    count: articles.length
  });
});

// Add new article
app.post('/api/articles', async (req, res) => {
  try {
    const { title, url, content } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // URL is now optional - generate a placeholder if not provided
    const articleUrl = url || `#article_${Date.now()}`;

    // Generate embeddings and store in RAG system
    const embedding = await ragProcessor.generateEmbedding(content || title);
    
    const article = {
      id: `article_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title,
      url: articleUrl,
      content,
      embedding,
      timestamp: Date.now(),
      uploader: req.ip || 'unknown',
      votes: 0,
      peerVerifications: p2pNetwork.getPeerCount()
    };

    // Add to blockchain
    const block = blockchain.addArticle(article);
    
    // Store in RAG system
    await ragProcessor.addDocument(article.id, article);

    // Broadcast to network
    p2pNetwork.broadcastNewArticle(article);

    res.json({
      success: true,
      article: article,
      block: {
        index: block.index,
        hash: block.hash
      }
    });
  } catch (error) {
    console.error('Error adding article:', error);
    res.status(500).json({ error: 'Failed to add article' });
  }
});

// Search articles with RAG
app.get('/api/search', async (req, res) => {
  try {
    const { query, limit = 10 } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    // Use RAG for semantic search
    const results = await ragProcessor.search(query, parseInt(limit));

    // Calculate trust scores
    const enrichedResults = results.map(result => ({
      ...result,
      trustScore: calculateTrustScore(result),
      summary: generateSummary(result.content || result.title)
    }));

    res.json({
      query: query,
      results: enrichedResults,
      count: enrichedResults.length
    });
  } catch (error) {
    console.error('Error searching:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Vote on article
app.post('/api/articles/:id/vote', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find article in blockchain
    let foundArticle = null;
    let blockIndex = -1;

    for (let i = 0; i < blockchain.chain.length; i++) {
      const block = blockchain.chain[i];
      if (block.data && block.data.id === id) {
        foundArticle = block.data;
        blockIndex = i;
        break;
      }
    }

    if (!foundArticle) {
      return res.status(404).json({ error: 'Article not found' });
    }

    // Update votes
    foundArticle.votes = (foundArticle.votes || 0) + 1;
    blockchain.chain[blockIndex].data = foundArticle;
    blockchain.saveBlockchain();

    // Update in RAG system
    await ragProcessor.updateDocument(id, foundArticle);

    // Broadcast update
    p2pNetwork.broadcastMessage({
      type: 'ARTICLE_VOTE',
      articleId: id,
      votes: foundArticle.votes
    });

    res.json({
      success: true,
      article: foundArticle
    });
  } catch (error) {
    console.error('Error voting:', error);
    res.status(500).json({ error: 'Failed to vote' });
  }
});

// Get network peers
app.get('/api/peers', (req, res) => {
  res.json({
    peers: p2pNetwork.getPeerAddresses(),
    count: p2pNetwork.getPeerCount()
  });
});

// Add peer
app.post('/api/peers', (req, res) => {
  const { peerAddress } = req.body;
  
  if (!peerAddress) {
    return res.status(400).json({ error: 'Peer address is required' });
  }

  p2pNetwork.connectToPeer(peerAddress);
  res.json({ success: true, message: 'Connecting to peer...' });
});

// Trust score calculation
function calculateTrustScore(article) {
  let score = 50;

  if (article.url && article.url.includes('https')) score += 10;
  if (article.content && article.content.length > 200) score += 10;
  if (article.votes && article.votes > 0) score += Math.min(article.votes * 2, 20);
  if (article.peerVerifications) score += article.peerVerifications * 5;

  const trustedDomains = {
    'reuters.com': 15, 'bbc.com': 15, 'apnews.com': 15,
    'nytimes.com': 12, 'washingtonpost.com': 12, 'theguardian.com': 12
  };

  for (const [domain, bonus] of Object.entries(trustedDomains)) {
    if (article.url && article.url.includes(domain)) {
      score += bonus;
      break;
    }
  }

  return Math.min(100, Math.max(0, score));
}

// Simple summarization
function generateSummary(text, maxLength = 200) {
  if (!text || text.length <= maxLength) return text;

  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  let summary = '';

  for (const sentence of sentences) {
    if (summary.length + sentence.length <= maxLength) {
      summary += sentence;
    } else {
      break;
    }
  }

  return summary || sentences[0].substring(0, maxLength) + '...';
}

// Start server
app.listen(HTTP_PORT, () => {
  console.log(`HTTP Server listening on port ${HTTP_PORT}`);
  console.log(`Blockchain initialized with ${blockchain.chain.length} blocks`);
  console.log('Ready to accept connections!');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  p2pNetwork.stop();
  process.exit(0);
});