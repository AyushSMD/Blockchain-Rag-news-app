// rag.js - Retrieval-Augmented Generation System
const fs = require('fs');
const path = require('path');

class RAGProcessor {
  constructor() {
    this.documents = new Map();
    this.embeddings = new Map();
    this.dataDir = path.join(__dirname, 'rag_data');
    
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    
    this.loadData();
  }

  // Simple word embedding using TF-IDF approach
  async generateEmbedding(text) {
    if (!text) return [];

    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2);

    const wordFreq = {};
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    // Create a simple vector representation
    const uniqueWords = Object.keys(wordFreq);
    const vector = uniqueWords.slice(0, 100).map(word => wordFreq[word]);

    return {
      vector: vector,
      vocabulary: uniqueWords.slice(0, 100),
      totalWords: words.length
    };
  }

  // Calculate cosine similarity between two embeddings
  cosineSimilarity(embedding1, embedding2) {
    if (!embedding1.vector || !embedding2.vector) return 0;

    const vec1 = embedding1.vector;
    const vec2 = embedding2.vector;

    // Align vectors by matching vocabulary
    const vocab1 = new Set(embedding1.vocabulary);
    const vocab2 = new Set(embedding2.vocabulary);
    const commonVocab = [...vocab1].filter(w => vocab2.has(w));

    if (commonVocab.length === 0) return 0;

    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    commonVocab.forEach(word => {
      const idx1 = embedding1.vocabulary.indexOf(word);
      const idx2 = embedding2.vocabulary.indexOf(word);
      
      if (idx1 >= 0 && idx2 >= 0) {
        const val1 = vec1[idx1] || 0;
        const val2 = vec2[idx2] || 0;
        dotProduct += val1 * val2;
        mag1 += val1 * val1;
        mag2 += val2 * val2;
      }
    });

    mag1 = Math.sqrt(mag1);
    mag2 = Math.sqrt(mag2);

    return mag1 && mag2 ? dotProduct / (mag1 * mag2) : 0;
  }

  // Add document to RAG system
  async addDocument(id, document) {
    const text = `${document.title} ${document.content || ''}`;
    const embedding = await this.generateEmbedding(text);

    this.documents.set(id, document);
    this.embeddings.set(id, embedding);

    this.saveData();
  }

  // Update existing document
  async updateDocument(id, document) {
    if (this.documents.has(id)) {
      const text = `${document.title} ${document.content || ''}`;
      const embedding = await this.generateEmbedding(text);

      this.documents.set(id, document);
      this.embeddings.set(id, embedding);

      this.saveData();
      return true;
    }
    return false;
  }

  // Semantic search using embeddings
  async search(query, limit = 10) {
    const queryEmbedding = await this.generateEmbedding(query);
    const results = [];

    for (const [id, document] of this.documents.entries()) {
      const docEmbedding = this.embeddings.get(id);
      if (!docEmbedding) continue;

      const similarity = this.cosineSimilarity(queryEmbedding, docEmbedding);
      
      results.push({
        ...document,
        relevance: similarity * 100,
        id: id
      });
    }

    // Sort by relevance and return top results
    return results
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  // Get document by ID
  getDocument(id) {
    return this.documents.get(id);
  }

  // Get all documents
  getAllDocuments() {
    return Array.from(this.documents.values());
  }

  // Extract keywords from text
  extractKeywords(text, topN = 10) {
    if (!text) return [];

    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3);

    // Remove common stop words
    const stopWords = new Set([
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all',
      'can', 'her', 'was', 'one', 'our', 'out', 'day', 'get',
      'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old',
      'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let',
      'put', 'say', 'she', 'too', 'use', 'this', 'that', 'with',
      'have', 'from', 'they', 'been', 'will', 'what', 'when',
      'make', 'like', 'time', 'just', 'know', 'take', 'into',
      'year', 'your', 'some', 'could', 'them', 'than', 'then',
      'about', 'would', 'there', 'their', 'which', 'these'
    ]);

    const filtered = words.filter(w => !stopWords.has(w));

    // Count frequency
    const freq = {};
    filtered.forEach(word => {
      freq[word] = (freq[word] || 0) + 1;
    });

    // Sort by frequency
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([word]) => word);
  }

  // Generate summary using extractive approach
  generateSummary(text, maxSentences = 3) {
    if (!text) return '';

    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    if (sentences.length <= maxSentences) {
      return text;
    }

    // Score sentences based on keyword frequency
    const keywords = this.extractKeywords(text, 20);
    const keywordSet = new Set(keywords);

    const scoredSentences = sentences.map((sentence, index) => {
      const words = sentence.toLowerCase().split(/\s+/);
      const score = words.filter(w => keywordSet.has(w)).length;
      
      return {
        sentence: sentence.trim(),
        score: score,
        position: index
      };
    });

    // Prefer sentences from beginning and high-scoring sentences
    scoredSentences.sort((a, b) => {
      const positionWeight = (sentences.length - a.position) * 0.1;
      const aScore = a.score + positionWeight;
      const bScore = b.score + (sentences.length - b.position) * 0.1;
      return bScore - aScore;
    });

    return scoredSentences
      .slice(0, maxSentences)
      .sort((a, b) => a.position - b.position)
      .map(s => s.sentence)
      .join(' ');
  }

  // Analyze content quality
  analyzeQuality(document) {
    const text = document.content || document.title || '';
    
    const analysis = {
      wordCount: text.split(/\s+/).length,
      sentenceCount: (text.match(/[.!?]+/g) || []).length,
      hasUrl: !!document.url,
      isSecure: document.url ? document.url.startsWith('https') : false,
      keywords: this.extractKeywords(text, 5),
      readabilityScore: this.calculateReadability(text)
    };

    return analysis;
  }

  // Simple readability score (Flesch Reading Ease approximation)
  calculateReadability(text) {
    if (!text) return 0;

    const sentences = (text.match(/[.!?]+/g) || []).length || 1;
    const words = text.split(/\s+/).length;
    const syllables = this.countSyllables(text);

    const avgWordsPerSentence = words / sentences;
    const avgSyllablesPerWord = syllables / words;

    // Simplified Flesch Reading Ease
    const score = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);
    
    return Math.max(0, Math.min(100, score));
  }

  // Approximate syllable count
  countSyllables(text) {
    const words = text.toLowerCase().split(/\s+/);
    let count = 0;

    words.forEach(word => {
      word = word.replace(/[^a-z]/g, '');
      if (word.length <= 3) {
        count += 1;
      } else {
        const vowelGroups = word.match(/[aeiouy]+/g);
        count += vowelGroups ? vowelGroups.length : 1;
      }
    });

    return count;
  }

  // Save data to disk
  saveData() {
    const docsPath = path.join(this.dataDir, 'documents.json');
    const embeddingsPath = path.join(this.dataDir, 'embeddings.json');

    const docsData = Array.from(this.documents.entries());
    const embeddingsData = Array.from(this.embeddings.entries());

    fs.writeFileSync(docsPath, JSON.stringify(docsData, null, 2));
    fs.writeFileSync(embeddingsPath, JSON.stringify(embeddingsData, null, 2));
  }

  // Load data from disk
  loadData() {
    const docsPath = path.join(this.dataDir, 'documents.json');
    const embeddingsPath = path.join(this.dataDir, 'embeddings.json');

    if (fs.existsSync(docsPath)) {
      const docsData = JSON.parse(fs.readFileSync(docsPath, 'utf8'));
      this.documents = new Map(docsData);
      console.log(`Loaded ${this.documents.size} documents`);
    }

    if (fs.existsSync(embeddingsPath)) {
      const embeddingsData = JSON.parse(fs.readFileSync(embeddingsPath, 'utf8'));
      this.embeddings = new Map(embeddingsData);
      console.log(`Loaded ${this.embeddings.size} embeddings`);
    }
  }

  // Clear all data
  clear() {
    this.documents.clear();
    this.embeddings.clear();
    this.saveData();
  }
}

module.exports = RAGProcessor;